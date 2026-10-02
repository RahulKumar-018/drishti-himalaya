"""Route retrieval, polyline segmentation, and alternative path generation."""

from backend.app.routing.exceptions import (
    InvalidCoordinateError,
    MissingAPIKeyError,
    NoRouteFoundError,
    RoutingError,
    RoutingNetworkError,
    RoutingProviderError,
    RoutingTimeoutError,
)
from backend.app.routing.models import (
    NormalizedRoute,
    RouteSegment,
    RouteWithSegments,
    SegmentedRouteResult,
    segments_to_geojson,
)
from backend.app.routing.ors_provider import ORSRoutingProvider
from backend.app.routing.providers import (
    BaseRoutingProvider,
    DemoRoutingProvider,
    validate_uttarakhand_waypoint,
)
from backend.app.routing.segmenter import segment_route_linestring
from backend.app.routing.service import RoutingService, get_routing_service

__all__ = [
    # Models
    "RouteSegment",
    "SegmentedRouteResult",
    "NormalizedRoute",
    "RouteWithSegments",
    "segments_to_geojson",
    # Segmentation
    "segment_route_linestring",
    # Providers
    "BaseRoutingProvider",
    "DemoRoutingProvider",
    "ORSRoutingProvider",
    "validate_uttarakhand_waypoint",
    # Service
    "RoutingService",
    "get_routing_service",
    # Exceptions
    "RoutingError",
    "RoutingProviderError",
    "RoutingTimeoutError",
    "RoutingNetworkError",
    "NoRouteFoundError",
    "InvalidCoordinateError",
    "MissingAPIKeyError",
]
