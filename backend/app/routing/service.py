"""Routing orchestration service integrating providers and Phase-5 segmentation."""

import logging
from typing import List, Optional, Sequence, Tuple, Union

from backend.app.core.config import settings
from backend.app.routing.models import NormalizedRoute, RouteWithSegments, SegmentedRouteResult
from backend.app.routing.ors_provider import ORSRoutingProvider
from backend.app.routing.providers import BaseRoutingProvider, DemoRoutingProvider
from backend.app.routing.segmenter import segment_route_linestring
from backend.app.schemas.common import CoordinatePoint

logger = logging.getLogger(__name__)


class RoutingService:
    """Service orchestrating waypoint routing and discrete ~250m segmentation."""

    def __init__(
        self,
        provider: Optional[BaseRoutingProvider] = None,
        data_mode: Optional[str] = None,
    ) -> None:
        self.data_mode = (data_mode or settings.DATA_MODE).upper()
        if provider is not None:
            self.provider = provider
        elif self.data_mode == "LIVE":
            self.provider = ORSRoutingProvider()
        else:
            self.provider = DemoRoutingProvider()

    def get_routes(
        self,
        origin: Union[CoordinatePoint, Tuple[float, float]],
        destination: Union[CoordinatePoint, Tuple[float, float]],
        alternatives: int = 1,
    ) -> List[NormalizedRoute]:
        """Query raw normalized route alignments from the configured provider."""
        return self.provider.get_routes(origin, destination, alternatives=alternatives)

    def get_segmented_routes(
        self,
        origin: Union[CoordinatePoint, Tuple[float, float]],
        destination: Union[CoordinatePoint, Tuple[float, float]],
        alternatives: int = 1,
        segment_length_m: Optional[float] = None,
    ) -> List[RouteWithSegments]:
        """Fetch routes and disaggregate each into ~250m discrete intervals using Phase-5 segmenter.

        Pipeline:
        origin + destination
                ↓
        Routing provider (ORS / Demo)
                ↓
        NormalizedRoute(s)
                ↓
        Phase-5 250m segment_route_linestring
                ↓
        RouteWithSegments
        """
        routes = self.get_routes(origin, destination, alternatives=alternatives)
        results: List[RouteWithSegments] = []

        for r in routes:
            segmented_res = segment_route_linestring(
                coordinates=r.geometry_coords,
                segment_length_m=segment_length_m,
            )
            results.append(
                RouteWithSegments(
                    route=r,
                    segmented_route=segmented_res,
                )
            )

        return results


# Default singleton instance
_default_routing_service: Optional[RoutingService] = None


def get_routing_service() -> RoutingService:
    """Return application-wide routing service singleton."""
    global _default_routing_service
    if _default_routing_service is None:
        _default_routing_service = RoutingService()
    return _default_routing_service
