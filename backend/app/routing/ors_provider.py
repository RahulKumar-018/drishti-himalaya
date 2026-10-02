"""OpenRouteService (ORS) routing adapter implementation."""

import logging
from typing import Any, Dict, List, Optional, Sequence, Tuple, Union
import httpx

from backend.app.core.config import settings
from backend.app.routing.exceptions import (
    MissingAPIKeyError,
    NoRouteFoundError,
    RoutingNetworkError,
    RoutingProviderError,
    RoutingTimeoutError,
)
from backend.app.routing.models import NormalizedRoute
from backend.app.routing.providers import BaseRoutingProvider, validate_uttarakhand_waypoint
from backend.app.schemas.common import CoordinatePoint

logger = logging.getLogger(__name__)


class ORSRoutingProvider(BaseRoutingProvider):
    """Adapter for the official OpenRouteService (ORS) Directions API."""

    def __init__(
        self,
        api_key: Optional[str] = None,
        base_url: Optional[str] = None,
        profile: Optional[str] = None,
        timeout_seconds: float = 10.0,
        http_client: Optional[httpx.Client] = None,
    ) -> None:
        self.api_key = api_key if api_key is not None else settings.OPENROUTESERVICE_API_KEY
        self.base_url = base_url or settings.ORS_BASE_URL
        self.profile = profile or settings.ORS_PROFILE
        self.timeout_seconds = timeout_seconds
        self._http_client = http_client

    @property
    def provider_name(self) -> str:
        return "OPENROUTESERVICE"

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
        RoutingProviderError
            If upstream returns HTTP error or malformed payload.
        NoRouteFoundError
            If no road connection exists between points.
        """
        if not self.api_key:
            raise MissingAPIKeyError(
                "OpenRouteService API key is missing or not configured. Set OPENROUTESERVICE_API_KEY or ORS_API_KEY."
            )

        orig_lon, orig_lat = validate_uttarakhand_waypoint(origin, label="Origin")
        dest_lon, dest_lat = validate_uttarakhand_waypoint(destination, label="Destination")

        payload: Dict[str, Any] = {
            "coordinates": [[orig_lon, orig_lat], [dest_lon, dest_lat]],
        }
        if alternatives > 0:
            payload["alternative_routes"] = {
                "target_count": alternatives + 1,
                "weight_factor": 1.4,
                "share_factor": 0.6,
            }

        headers = {
            "Authorization": self.api_key,
            "Content-Type": "application/json",
            "Accept": "application/json, application/geo+json",
        }

        try:
            client = self._http_client or httpx.Client(timeout=self.timeout_seconds)
            try:
                response = client.post(self.base_url, json=payload, headers=headers)
            finally:
                if self._http_client is None:
                    client.close()

            if response.status_code == 404:
                raise NoRouteFoundError(f"No route found between ({orig_lon}, {orig_lat}) and ({dest_lon}, {dest_lat})")

            if response.status_code != 200:
                raise RoutingProviderError(
                    f"OpenRouteService returned HTTP {response.status_code}: {response.text[:200]}",
                    status_code=response.status_code,
                )

            data = response.json()
            return self.parse_ors_response(data, profile=self.profile)

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

                # OpenRouteService returns distance in meters and duration in seconds
                dist_m = float(summary.get("distance", 0.0))
                dur_s = float(summary.get("duration", 0.0))

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
                # When coordinates are list of pairs
                if isinstance(raw_geom, list) and len(raw_geom) >= 2:
                    coords = [(float(c[0]), float(c[1])) for c in raw_geom]
                elif isinstance(raw_geom, dict) and "coordinates" in raw_geom:
                    coords = [(float(c[0]), float(c[1])) for c in raw_geom["coordinates"]]
                else:
                    continue

                summary = r.get("summary", {})
                dist_m = float(summary.get("distance", 0.0))
                dur_s = float(summary.get("duration", 0.0))

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
