"""Routing provider abstraction and offline deterministic demo provider."""

from abc import ABC, abstractmethod
import json
import logging
import math
from pathlib import Path
from typing import Any, List, Optional, Sequence, Tuple, Union

from backend.app.routing.exceptions import InvalidCoordinateError, NoRouteFoundError, RoutingError
from backend.app.routing.models import NormalizedRoute
from backend.app.schemas.common import CoordinatePoint

logger = logging.getLogger(__name__)

DEFAULT_ROUTING_FIXTURE_PATH = Path("data/fixtures/routing_baseline.json")


def validate_uttarakhand_waypoint(
    point: Union[CoordinatePoint, Tuple[float, float], Sequence[float]],
    label: str = "Waypoint",
) -> Tuple[float, float]:
    """Validate geographic coordinate against the project's Uttarakhand bounding box.

    Parameters
    ----------
    point : Union[CoordinatePoint, Tuple[float, float], Sequence[float]]
        Coordinate as CoordinatePoint or (lon, lat) / (lat, lon) sequence.
    label : str, optional
        Diagnostic label ('Origin' or 'Destination').

    Returns
    -------
    Tuple[float, float]
        Validated (longitude, latitude) tuple.

    Raises
    ------
    InvalidCoordinateError
        If coordinate values are non-finite or fall outside the configured Uttarakhand boundary.
    """
    if isinstance(point, CoordinatePoint):
        return (point.longitude, point.latitude)

    if not isinstance(point, (list, tuple)) or len(point) < 2:
        raise InvalidCoordinateError(f"{label} must have at least 2 coordinate components (lon, lat), got {point}")

    lon = float(point[0])
    lat = float(point[1])

    if not (math.isfinite(lon) and math.isfinite(lat)):
        raise InvalidCoordinateError(f"{label} coordinates must be finite real numbers: lon={lon}, lat={lat}")

    # Leverage CoordinatePoint Pydantic model for centralized bounds validation
    try:
        coord = CoordinatePoint(longitude=lon, latitude=lat)
        return (coord.longitude, coord.latitude)
    except Exception as e:
        raise InvalidCoordinateError(f"{label} outside Uttarakhand bounds: {e}") from e


class BaseRoutingProvider(ABC):
    """Abstract interface for highway corridor routing providers."""

    @property
    @abstractmethod
    def provider_name(self) -> str:
        """Name of the routing engine (e.g. 'OPENROUTESERVICE', 'DEMO_FIXTURE')."""
        pass

    @abstractmethod
    def get_routes(
        self,
        origin: Union[CoordinatePoint, Tuple[float, float]],
        destination: Union[CoordinatePoint, Tuple[float, float]],
        alternatives: int = 1,
    ) -> List[NormalizedRoute]:
        """Generate one or more route alignments between origin and destination.

        Parameters
        ----------
        origin : Union[CoordinatePoint, Tuple[float, float]]
            Origin waypoint (lon, lat).
        destination : Union[CoordinatePoint, Tuple[float, float]]
            Destination waypoint (lon, lat).
        alternatives : int, optional
            Number of route alternatives requested (0 = primary only, 1 = primary + 1 alternative).

        Returns
        -------
        List[NormalizedRoute]
            List of normalized route alignments. The first element is always the primary route.
        """
        pass


class DemoRoutingProvider(BaseRoutingProvider):
    """Deterministic offline demo routing provider loading local pre-validated routes."""

    def __init__(self, fixture_path: Optional[Path | str] = None) -> None:
        self.fixture_path = Path(fixture_path) if fixture_path is not None else DEFAULT_ROUTING_FIXTURE_PATH

    @property
    def provider_name(self) -> str:
        return "DEMO_FIXTURE"

    def get_routes(
        self,
        origin: Union[CoordinatePoint, Tuple[float, float]],
        destination: Union[CoordinatePoint, Tuple[float, float]],
        alternatives: int = 1,
    ) -> List[NormalizedRoute]:
        """Return deterministic routes from local fixture."""
        orig_lon, orig_lat = validate_uttarakhand_waypoint(origin, label="Origin")
        dest_lon, dest_lat = validate_uttarakhand_waypoint(destination, label="Destination")

        if not self.fixture_path.exists():
            raise NoRouteFoundError(f"DEMO routing fixture not found at {self.fixture_path}")

        try:
            with open(self.fixture_path, "r", encoding="utf-8") as f:
                data = json.load(f)

            raw_routes = data.get("routes", [])
            if not raw_routes:
                raise NoRouteFoundError("DEMO routing fixture contains no routes.")

            # Filter requested count: 1 primary + alternatives
            target_count = max(1, alternatives + 1)
            selected_raw = raw_routes[:target_count]

            normalized_routes: List[NormalizedRoute] = []
            for r in selected_raw:
                raw_coords = r.get("geometry_coords", [])
                if len(raw_coords) < 2:
                    continue

                # Ensure exact match at endpoints for requested origin/destination
                coords: List[Tuple[float, float]] = [(float(c[0]), float(c[1])) for c in raw_coords]
                coords[0] = (orig_lon, orig_lat)
                coords[-1] = (dest_lon, dest_lat)

                normalized_routes.append(
                    NormalizedRoute(
                        route_id=r.get("route_id", "primary_route"),
                        geometry_coords=coords,
                        total_distance_km=float(r.get("total_distance_km", 25.0)),
                        estimated_time_minutes=float(r.get("estimated_time_minutes", 40.0)),
                        provider=self.provider_name,
                        profile=data.get("profile", "driving-car"),
                        summary=r.get("summary", "DEMO Highway Alignment"),
                        metadata={
                            "source": "DEMO_FIXTURE",
                            "fixture_path": str(self.fixture_path),
                            "requested_origin": [orig_lon, orig_lat],
                            "requested_destination": [dest_lon, dest_lat],
                            "snapped_origin": [orig_lon, orig_lat],
                            "snapped_destination": [dest_lon, dest_lat],
                            "snapping_distance_origin_m": 0.0,
                            "snapping_distance_destination_m": 0.0,
                            "is_origin_snapped": False,
                            "is_destination_snapped": False,
                        },
                    )
                )

            if not normalized_routes:
                raise NoRouteFoundError("Failed to normalize any valid routes from DEMO fixture.")

            return normalized_routes

        except (RoutingError, InvalidCoordinateError):
            raise
        except Exception as e:
            logger.error(f"Error loading DEMO routing fixture: {e}")
            raise NoRouteFoundError(f"Error reading DEMO routing fixture: {e}") from e
