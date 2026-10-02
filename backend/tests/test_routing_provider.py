"""Unit and integration tests for routing providers, ORS integration, and Phase-5 bridge (Phase 8).

Verifies:
- Coordinate validation strictly inside Uttarakhand bounds
- Normalized route data representation
- Deterministic DEMO offline routing fixture execution
- OpenRouteService (ORS) request construction and response parsing
- Alternative route normalization and handling of single-route responses
- Robust error handling (missing API key, timeouts, HTTP 4xx, HTTP 5xx, malformed payloads)
- Seamless integration with Phase-5 ~250m route segmentation engine
- Route-agnostic statewide execution
"""

import httpx
import pytest

from backend.app.routing.exceptions import (
    InvalidCoordinateError,
    MissingAPIKeyError,
    NoRouteFoundError,
    RoutingNetworkError,
    RoutingProviderError,
    RoutingTimeoutError,
)
from backend.app.routing.models import NormalizedRoute, RouteWithSegments, SegmentedRouteResult
from backend.app.routing.ors_provider import ORSRoutingProvider
from backend.app.routing.providers import (
    BaseRoutingProvider,
    DemoRoutingProvider,
    validate_uttarakhand_waypoint,
)
from backend.app.routing.service import RoutingService, get_routing_service
from backend.app.schemas.common import CoordinatePoint


@pytest.fixture
def valid_origin():
    return (78.35, 30.12)


@pytest.fixture
def valid_destination():
    return (78.55, 30.28)


@pytest.fixture
def sample_ors_geojson_response():
    """Mocked OpenRouteService directions GeoJSON FeatureCollection with 2 route alternatives."""
    return {
        "type": "FeatureCollection",
        "metadata": {
            "attribution": "openrouteservice.org | OpenStreetMap contributors",
            "service": "routing",
        },
        "features": [
            {
                "type": "Feature",
                "geometry": {
                    "type": "LineString",
                    "coordinates": [
                        [78.3500, 30.1200],
                        [78.4000, 30.1600],
                        [78.4500, 30.2000],
                        [78.5000, 30.2400],
                        [78.5500, 30.2800],
                    ],
                },
                "properties": {
                    "summary": {
                        "distance": 25400.0,  # 25.4 km
                        "duration": 2700.0,   # 45.0 min
                    },
                    "segments": [{"distance": 25400.0, "duration": 2700.0}],
                },
            },
            {
                "type": "Feature",
                "geometry": {
                    "type": "LineString",
                    "coordinates": [
                        [78.3500, 30.1200],
                        [78.3800, 30.1800],
                        [78.4800, 30.2200],
                        [78.5500, 30.2800],
                    ],
                },
                "properties": {
                    "summary": {
                        "distance": 31200.0,  # 31.2 km
                        "duration": 3480.0,   # 58.0 min
                    },
                    "segments": [{"distance": 31200.0, "duration": 3480.0}],
                },
            },
        ],
    }


class TestWaypointCoordinateValidation:
    """Tests for origin and destination coordinate validation."""

    def test_valid_coordinates_accepted(self, valid_origin, valid_destination):
        """Coordinates strictly within Uttarakhand bounding box are accepted."""
        lon1, lat1 = validate_uttarakhand_waypoint(valid_origin, label="Origin")
        assert lon1 == 78.35
        assert lat1 == 30.12

        lon2, lat2 = validate_uttarakhand_waypoint(valid_destination, label="Destination")
        assert lon2 == 78.55
        assert lat2 == 30.28

    def test_coordinate_point_schema_accepted(self):
        """CoordinatePoint instances are accepted directly."""
        pt = CoordinatePoint(longitude=78.5, latitude=30.2)
        lon, lat = validate_uttarakhand_waypoint(pt)
        assert lon == 78.5
        assert lat == 30.2

    def test_invalid_coordinates_rejected_out_of_bounds(self):
        """Coordinates outside Uttarakhand must raise InvalidCoordinateError."""
        # Longitude < 77.5
        with pytest.raises(InvalidCoordinateError, match="outside Uttarakhand"):
            validate_uttarakhand_waypoint((76.5, 30.2), label="Origin")

        # Latitude > 31.5
        with pytest.raises(InvalidCoordinateError, match="outside Uttarakhand"):
            validate_uttarakhand_waypoint((78.5, 32.5), label="Destination")

    def test_invalid_coordinates_rejected_nan(self):
        """Non-finite coordinates must raise InvalidCoordinateError."""
        with pytest.raises(InvalidCoordinateError, match="finite real numbers"):
            validate_uttarakhand_waypoint((float("nan"), 30.2))


class TestNormalizedRouteModel:
    """Tests for the provider-independent NormalizedRoute data model."""

    def test_normalized_route_model_works(self):
        """NormalizedRoute can be instantiated and exposes expected attributes."""
        route = NormalizedRoute(
            route_id="test_route_0",
            geometry_coords=[(78.35, 30.12), (78.45, 30.20), (78.55, 30.28)],
            total_distance_km=25.4,
            estimated_time_minutes=45.0,
            provider="OPENROUTESERVICE",
            profile="driving-car",
            summary="Primary Valley Corridor",
            metadata={"test": True},
        )
        assert route.route_id == "test_route_0"
        assert len(route.geometry_coords) == 3
        assert route.total_distance_km == 25.4
        assert route.estimated_time_minutes == 45.0
        assert route.provider == "OPENROUTESERVICE"


class TestDemoRoutingProvider:
    """Tests for the deterministic offline DEMO routing provider."""

    def test_demo_fixture_returns_deterministic_route(self, valid_origin, valid_destination):
        """DEMO provider loads pre-validated routes without network access."""
        provider = DemoRoutingProvider()
        routes = provider.get_routes(valid_origin, valid_destination, alternatives=1)

        assert len(routes) == 2
        r0 = routes[0]
        assert r0.route_id == "primary_route"
        assert r0.provider == "DEMO_FIXTURE"
        assert r0.total_distance_km > 0.0
        assert r0.estimated_time_minutes > 0.0
        assert len(r0.geometry_coords) >= 2

        # Waypoint exact endpoint preservation
        assert r0.geometry_coords[0] == valid_origin
        assert r0.geometry_coords[-1] == valid_destination

    def test_demo_provider_respects_zero_alternatives(self, valid_origin, valid_destination):
        """Requesting alternatives=0 returns only the primary alignment."""
        provider = DemoRoutingProvider()
        routes = provider.get_routes(valid_origin, valid_destination, alternatives=0)
        assert len(routes) == 1
        assert routes[0].route_id == "primary_route"


class TestORSRoutingProviderParsing:
    """Tests for OpenRouteService response parsing and field mapping."""

    def test_ors_response_parsing_works_with_mocked_response(self, sample_ors_geojson_response):
        """ORSRoutingProvider parses GeoJSON FeatureCollection into NormalizedRoute objects."""
        routes = ORSRoutingProvider.parse_ors_response(sample_ors_geojson_response)
        assert len(routes) == 2
        assert routes[0].provider == "OPENROUTESERVICE"
        assert routes[1].provider == "OPENROUTESERVICE"

    def test_distance_parsing_works(self, sample_ors_geojson_response):
        """Distance in meters (25400.0) is converted to kilometers (25.4)."""
        routes = ORSRoutingProvider.parse_ors_response(sample_ors_geojson_response)
        assert pytest.approx(routes[0].total_distance_km, abs=1e-3) == 25.4
        assert pytest.approx(routes[1].total_distance_km, abs=1e-3) == 31.2

    def test_duration_parsing_works(self, sample_ors_geojson_response):
        """Duration in seconds (2700.0) is converted to minutes (45.0)."""
        routes = ORSRoutingProvider.parse_ors_response(sample_ors_geojson_response)
        assert pytest.approx(routes[0].estimated_time_minutes, abs=1e-2) == 45.0
        assert pytest.approx(routes[1].estimated_time_minutes, abs=1e-2) == 58.0

    def test_geometry_parsing_works(self, sample_ors_geojson_response):
        """GeoJSON LineString coordinates are parsed into (lon, lat) tuples."""
        routes = ORSRoutingProvider.parse_ors_response(sample_ors_geojson_response)
        coords = routes[0].geometry_coords
        assert coords[0] == (78.35, 30.12)
        assert coords[-1] == (78.55, 30.28)
        assert len(coords) == 5

    def test_alternative_routes_normalize_correctly_when_present(self, sample_ors_geojson_response):
        """Primary and alternative routes receive sequential route_ids."""
        routes = ORSRoutingProvider.parse_ors_response(sample_ors_geojson_response)
        assert routes[0].route_id == "primary_route"
        assert routes[1].route_id == "alternative_route_1"

    def test_missing_alternatives_handled(self, sample_ors_geojson_response):
        """When provider returns only one route, it is returned cleanly without inventing an alternative."""
        single_route_payload = {
            "type": "FeatureCollection",
            "features": [sample_ors_geojson_response["features"][0]],
        }
        routes = ORSRoutingProvider.parse_ors_response(single_route_payload)
        assert len(routes) == 1
        assert routes[0].route_id == "primary_route"


class TestORSRoutingProviderErrors:
    """Tests for error handling during ORS interaction."""

    def test_missing_ors_api_key_handled(self, valid_origin, valid_destination):
        """Missing API key raises MissingAPIKeyError with diagnostic guidance."""
        provider = ORSRoutingProvider(api_key=None)
        with pytest.raises(MissingAPIKeyError, match="API key is missing"):
            provider.get_routes(valid_origin, valid_destination)

    def test_timeout_handled(self, valid_origin, valid_destination):
        """Upstream timeout raises RoutingTimeoutError."""
        def handler(request: httpx.Request) -> httpx.Response:
            raise httpx.TimeoutException("Connection timed out after 10.0s")

        transport = httpx.MockTransport(handler)
        client = httpx.Client(transport=transport)
        provider = ORSRoutingProvider(api_key="mock_key", http_client=client)

        with pytest.raises(RoutingTimeoutError, match="timed out"):
            provider.get_routes(valid_origin, valid_destination)

    def test_http_4xx_handled_no_route(self, valid_origin, valid_destination):
        """HTTP 404 from ORS raises NoRouteFoundError."""
        def handler(request: httpx.Request) -> httpx.Response:
            return httpx.Response(404, json={"error": {"message": "Could not find point"}})

        transport = httpx.MockTransport(handler)
        client = httpx.Client(transport=transport)
        provider = ORSRoutingProvider(api_key="mock_key", http_client=client)

        with pytest.raises(NoRouteFoundError, match="No route found"):
            provider.get_routes(valid_origin, valid_destination)

    def test_http_5xx_handled(self, valid_origin, valid_destination):
        """HTTP 500 or 503 from ORS raises RoutingProviderError."""
        def handler(request: httpx.Request) -> httpx.Response:
            return httpx.Response(503, text="Service Unavailable")

        transport = httpx.MockTransport(handler)
        client = httpx.Client(transport=transport)
        provider = ORSRoutingProvider(api_key="mock_key", http_client=client)

        with pytest.raises(RoutingProviderError, match="503"):
            provider.get_routes(valid_origin, valid_destination)

    def test_malformed_response_handled(self):
        """Non-dictionary or invalid JSON raises RoutingProviderError."""
        with pytest.raises(RoutingProviderError, match="not a valid JSON"):
            ORSRoutingProvider.parse_ors_response("invalid text")  # type: ignore

        with pytest.raises(RoutingProviderError, match="Malformed"):
            ORSRoutingProvider.parse_ors_response({"unexpected": "structure"})


class TestRoutingSegmentationBridge:
    """Tests integrating the RoutingService with Phase-5 250m route segmentation."""

    def test_phase5_segmenter_receives_route_geometry(self, valid_origin, valid_destination):
        """RoutingService fetches routes and disaggregates each into Phase-5 ~250m segments."""
        service = RoutingService(provider=DemoRoutingProvider())
        results = service.get_segmented_routes(valid_origin, valid_destination, alternatives=1)

        assert len(results) == 2
        for r_seg in results:
            assert isinstance(r_seg, RouteWithSegments)
            assert isinstance(r_seg.route, NormalizedRoute)
            assert isinstance(r_seg.segmented_route, SegmentedRouteResult)

            # Validate Phase-5 segmentation integrity
            seg_res = r_seg.segmented_route
            assert len(seg_res.segments) > 0
            assert seg_res.total_length_m > 0
            # Every segment has valid chainage and geometric midpoints
            for seg in seg_res.segments:
                assert seg.segment_length_m > 0
                assert seg.end_chainage_km > seg.start_chainage_km
                assert len(seg.midpoint) == 2


class TestStatewideRouteAgnosticRouting:
    """Verifies that routing operates on arbitrary coordinates across Uttarakhand."""

    def test_western_uttarakhand_routing(self):
        """Western corridor between arbitrary coordinates."""
        service = RoutingService(provider=DemoRoutingProvider())
        routes = service.get_routes((77.80, 30.30), (78.05, 30.45))
        assert len(routes) >= 1

    def test_central_uttarakhand_routing(self):
        """Central corridor between arbitrary coordinates."""
        service = RoutingService(provider=DemoRoutingProvider())
        routes = service.get_routes((78.80, 30.20), (79.20, 30.35))
        assert len(routes) >= 1

    def test_eastern_uttarakhand_routing(self):
        """Eastern corridor between arbitrary coordinates."""
        service = RoutingService(provider=DemoRoutingProvider())
        routes = service.get_routes((79.80, 29.80), (80.15, 30.05))
        assert len(routes) >= 1
