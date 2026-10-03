"""OpenRouteService (ORS) routing adapter implementation."""

import logging
import math
from typing import Any, Dict, List, Optional, Sequence, Tuple, Union
import httpx

from backend.app.core.config import settings
from backend.app.routing.exceptions import (
    InvalidCoordinateError,
    MissingAPIKeyError,
    NoRouteFoundError,
    RoutingError,
    RoutingNetworkError,
    RoutingProviderError,
    RoutingTimeoutError,
)
from backend.app.routing.models import NormalizedRoute
from backend.app.routing.providers import BaseRoutingProvider, validate_uttarakhand_waypoint
from backend.app.schemas.common import CoordinatePoint

logger = logging.getLogger(__name__)


def decode_polyline(encoded: str) -> List[Tuple[float, float]]:
    """Decode a Google encoded polyline string into a list of (lon, lat) tuples."""
    coords: List[Tuple[float, float]] = []
    index = 0
    lat = 0
    lon = 0
    length = len(encoded)

    while index < length:
        # Latitude delta
        shift = 0
        result = 0
        while True:
            byte = ord(encoded[index]) - 63
            index += 1
            result |= (byte & 0x1F) << shift
            shift += 5
            if byte < 0x20:
                break
        dlat = ~(result >> 1) if (result & 1) else (result >> 1)
        lat += dlat

        # Longitude delta
        shift = 0
        result = 0
        while True:
            byte = ord(encoded[index]) - 63
            index += 1
            result |= (byte & 0x1F) << shift
            shift += 5
            if byte < 0x20:
                break
        dlon = ~(result >> 1) if (result & 1) else (result >> 1)
        lon += dlon

        coords.append((round(lon / 1e5, 6), round(lat / 1e5, 6)))

    return coords


def approximate_distance_meters(lon1: float, lat1: float, lon2: float, lat2: float) -> float:
    """Calculate approximate great-circle distance in meters between two WGS84 points.

    Uses spherical haversine formula to estimate distance before querying HeiGIT/ORS.
    This is route-agnostic and works for arbitrary coordinates across Uttarakhand.
    """
    earth_radius_m = 6371000.0
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlam = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2.0) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlam / 2.0) ** 2
    return 2.0 * earth_radius_m * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))


class ORSRoutingProvider(BaseRoutingProvider):
    """Adapter for the official OpenRouteService (ORS) Directions API."""

    def __init__(
        self,
        api_key: Optional[str] = None,
        base_url: Optional[str] = None,
        profile: Optional[str] = None,
        timeout_seconds: float = 10.0,
        http_client: Optional[httpx.Client] = None,
        max_alternative_distance_m: Optional[float] = None,
    ) -> None:
        resolved_key = api_key if api_key is not None else settings.OPENROUTESERVICE_API_KEY
        self.api_key = resolved_key.strip() if (resolved_key and isinstance(resolved_key, str)) else None
        self.base_url = base_url or settings.ORS_BASE_URL
        self.profile = profile or settings.ORS_PROFILE
        self.timeout_seconds = timeout_seconds
        self._http_client = http_client
        self.max_alternative_distance_m = (
            max_alternative_distance_m
            if max_alternative_distance_m is not None
            else getattr(settings, "ORS_MAX_ALTERNATIVE_DISTANCE_METERS", 100000.0)
        )

    @property
    def provider_name(self) -> str:
        return "OPENROUTESERVICE"

    def _build_url(self) -> str:
        """Construct the complete directions endpoint URL for the active profile."""
        url = self.base_url
        if "{profile}" in url:
            return url.format(profile=self.profile)
        if not url.endswith(("/geojson", "/json")):
            return f"{url.rstrip('/')}/{self.profile}/geojson"
        if self.profile != "driving-car" and "driving-car" in url:
            return url.replace("driving-car", self.profile)
        return url

    @staticmethod
    def _extract_error_message(response: httpx.Response) -> str:
        """Safely extract error message or detail string from upstream response."""
        try:
            err_json = response.json()
            if isinstance(err_json, dict) and "error" in err_json:
                err = err_json["error"]
                if isinstance(err, dict) and "message" in err:
                    return str(err["message"])
                return str(err)
        except Exception:
            pass
        return response.text[:200]

    @staticmethod
    def _is_alternative_route_limit_error(err_msg: str) -> bool:
        """Check if an upstream error message indicates the alternative routes distance limit."""
        msg_lower = err_msg.lower()
        has_alt = "alternative" in msg_lower
        has_limit = any(term in msg_lower for term in ("limit", "100000", "distance", "exceed", "configuration"))
        return has_alt and has_limit

    def get_routes(
        self,
        origin: Union[CoordinatePoint, Tuple[float, float]],
        destination: Union[CoordinatePoint, Tuple[float, float]],
        alternatives: int = 1,
    ) -> List[NormalizedRoute]:
        """Fetch primary and alternative road geometries from OpenRouteService.

        Parameters
        ----------
        origin : Union[CoordinatePoint, Tuple[float, float]]
            Origin waypoint (lon, lat).
        destination : Union[CoordinatePoint, Tuple[float, float]]
            Destination waypoint (lon, lat).
        alternatives : int, optional
            Number of route alternatives requested.

        Returns
        -------
        List[NormalizedRoute]
            List of normalized routes starting with the primary alignment.

        Raises
        ------
        MissingAPIKeyError
            If ORS API key is not configured.
        InvalidCoordinateError
            If origin or destination are invalid or outside Uttarakhand bounds.
        RoutingTimeoutError
            If upstream ORS request times out.
        RoutingNetworkError
            If network transport or connection fails.
        RoutingProviderError
            If upstream returns HTTP error or malformed payload.
        NoRouteFoundError
            If no road connection exists between points.
        """
        if not self.api_key:
            raise MissingAPIKeyError(
                "OpenRouteService API key is missing or not configured. "
                "Set ORS_API_KEY or OPENROUTESERVICE_API_KEY in your environment or .env file."
            )

        orig_lon, orig_lat = validate_uttarakhand_waypoint(origin, label="Origin")
        dest_lon, dest_lat = validate_uttarakhand_waypoint(destination, label="Destination")

        approx_dist_m = approximate_distance_meters(orig_lon, orig_lat, dest_lon, dest_lat)

        payload: Dict[str, Any] = {
            "coordinates": [[orig_lon, orig_lat], [dest_lon, dest_lat]],
        }

        # Request native alternatives only for routes within HeiGIT's supported distance threshold.
        # For longer routes (>100 km), request only the normal primary route to avoid HTTP 400.
        requesting_alternatives = (
            alternatives > 0 and approx_dist_m <= self.max_alternative_distance_m
        )
        if requesting_alternatives:
            payload["alternative_routes"] = {
                "target_count": alternatives + 1,
                "weight_factor": 1.4,
                "share_factor": 0.6,
            }
        elif alternatives > 0:
            logger.info(
                "Route approximated distance (%.1f km) exceeds HeiGIT alternative-routes limit (%.1f km). "
                "Requesting normal primary route.",
                approx_dist_m / 1000.0,
                self.max_alternative_distance_m / 1000.0,
            )

        headers = {
            "Authorization": self.api_key,
            "Content-Type": "application/json",
            "Accept": "application/json, application/geo+json",
        }

        url = self._build_url()

        try:
            client = self._http_client or httpx.Client(timeout=self.timeout_seconds)
            try:
                response = client.post(url, json=payload, headers=headers)

                # Defensive fallback: If upstream HeiGIT rejected native alternative routes
                # due to distance limit (e.g. road distance exceeded 100km despite straight-line estimate),
                # retry requesting only the primary route without alternative_routes.
                if response.status_code == 400 and "alternative_routes" in payload:
                    err_msg = self._extract_error_message(response)
                    if self._is_alternative_route_limit_error(err_msg):
                        logger.warning(
                            "Upstream ORS native alternative route limit exceeded (%s). "
                            "Retrying primary route without alternative_routes.",
                            err_msg,
                        )
                        payload_primary = {k: v for k, v in payload.items() if k != "alternative_routes"}
                        response = client.post(url, json=payload_primary, headers=headers)
            finally:
                if self._http_client is None:
                    client.close()

            if response.status_code == 404:
                raise NoRouteFoundError(f"No route found between ({orig_lon}, {orig_lat}) and ({dest_lon}, {dest_lat})")

            if response.status_code in (401, 403):
                raise RoutingProviderError(
                    f"OpenRouteService authentication failed (HTTP {response.status_code}): Invalid or unauthorized API key.",
                    status_code=response.status_code,
                )

            if response.status_code == 429:
                raise RoutingProviderError(
                    "OpenRouteService rate limit exceeded (HTTP 429).",
                    status_code=429,
                )

            if response.status_code != 200:
                err_detail = self._extract_error_message(response)
                raise RoutingProviderError(
                    f"OpenRouteService returned HTTP {response.status_code}: {err_detail}",
                    status_code=response.status_code,
                )

            try:
                data = response.json()
            except Exception as e:
                raise RoutingProviderError(f"Failed to decode JSON from OpenRouteService response: {e}") from e

            return self.parse_ors_response(data, profile=self.profile)

        except (RoutingError, InvalidCoordinateError):
            raise
        except httpx.TimeoutException as e:
            logger.warning(f"ORS request timed out: {e}")
            raise RoutingTimeoutError(f"OpenRouteService request timed out after {self.timeout_seconds}s") from e
        except httpx.RequestError as e:
            logger.warning(f"ORS network error: {e}")
            raise RoutingNetworkError(f"Network error querying OpenRouteService: {e}") from e

    @staticmethod
    def parse_ors_response(data: Dict[str, Any], profile: str = "driving-car") -> List[NormalizedRoute]:
        """Parse raw OpenRouteService response (GeoJSON FeatureCollection or routes JSON) into NormalizedRoute list."""
        if not isinstance(data, dict):
            raise RoutingProviderError("OpenRouteService payload is not a valid JSON dictionary.")

        # Check for error payload from ORS
        if "error" in data:
            err = data["error"]
            err_msg = err.get("message") if isinstance(err, dict) else str(err)
            raise RoutingProviderError(f"OpenRouteService API error: {err_msg}")

        normalized_routes: List[NormalizedRoute] = []

        # 1. GeoJSON format: features array
        if "features" in data and isinstance(data["features"], list):
            features = data["features"]
            if not features:
                raise NoRouteFoundError("OpenRouteService returned empty features array; no route found.")

            for idx, feat in enumerate(features):
                geom = feat.get("geometry", {})
                if geom.get("type") != "LineString":
                    continue

                raw_coords = geom.get("coordinates", [])
                if len(raw_coords) < 2:
                    continue

                coords: List[Tuple[float, float]] = [(float(c[0]), float(c[1])) for c in raw_coords]
                props = feat.get("properties", {})
                summary = props.get("summary", {})
                segments = props.get("segments", [])

                # OpenRouteService returns distance in meters and duration in seconds
                dist_m = float(summary.get("distance", 0.0))
                if dist_m <= 0.0 and segments:
                    dist_m = sum(float(s.get("distance", 0.0)) for s in segments)

                dur_s = float(summary.get("duration", 0.0))
                if dur_s <= 0.0 and segments:
                    dur_s = sum(float(s.get("duration", 0.0)) for s in segments)

                route_id = "primary_route" if idx == 0 else f"alternative_route_{idx}"
                desc = "Primary Corridor Alignment" if idx == 0 else f"Alternative Route Alignment {idx}"

                normalized_routes.append(
                    NormalizedRoute(
                        route_id=route_id,
                        geometry_coords=coords,
                        total_distance_km=round(dist_m / 1000.0, 3),
                        estimated_time_minutes=round(dur_s / 60.0, 2),
                        provider="OPENROUTESERVICE",
                        profile=profile,
                        summary=desc,
                        metadata=props,
                    )
                )

        # 2. Standard ORS routes format
        elif "routes" in data and isinstance(data["routes"], list):
            routes = data["routes"]
            if not routes:
                raise NoRouteFoundError("OpenRouteService returned empty routes array; no route found.")

            for idx, r in enumerate(routes):
                raw_geom = r.get("geometry")
                if isinstance(raw_geom, str):
                    coords = decode_polyline(raw_geom)
                elif isinstance(raw_geom, list) and len(raw_geom) >= 2:
                    coords = [(float(c[0]), float(c[1])) for c in raw_geom]
                elif isinstance(raw_geom, dict) and "coordinates" in raw_geom:
                    coords = [(float(c[0]), float(c[1])) for c in raw_geom["coordinates"]]
                else:
                    continue

                if len(coords) < 2:
                    continue

                summary = r.get("summary", {})
                segments = r.get("segments", [])
                dist_m = float(summary.get("distance", 0.0))
                if dist_m <= 0.0 and segments:
                    dist_m = sum(float(s.get("distance", 0.0)) for s in segments)

                dur_s = float(summary.get("duration", 0.0))
                if dur_s <= 0.0 and segments:
                    dur_s = sum(float(s.get("duration", 0.0)) for s in segments)

                route_id = "primary_route" if idx == 0 else f"alternative_route_{idx}"
                desc = "Primary Corridor Alignment" if idx == 0 else f"Alternative Route Alignment {idx}"

                normalized_routes.append(
                    NormalizedRoute(
                        route_id=route_id,
                        geometry_coords=coords,
                        total_distance_km=round(dist_m / 1000.0, 3),
                        estimated_time_minutes=round(dur_s / 60.0, 2),
                        provider="OPENROUTESERVICE",
                        profile=profile,
                        summary=desc,
                        metadata=summary,
                    )
                )

        else:
            raise RoutingProviderError("Malformed OpenRouteService payload: neither 'features' nor 'routes' found.")

        if not normalized_routes:
            raise NoRouteFoundError("No feasible driving route could be parsed from OpenRouteService response.")

        return normalized_routes
