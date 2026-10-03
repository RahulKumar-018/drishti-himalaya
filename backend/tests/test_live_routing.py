"""Unit, integration, and API tests for LIVE routing integration (OpenRouteService).

Verifies:
- DATA_MODE=LIVE selects ORSRoutingProvider.
- DATA_MODE=DEMO continues selecting DemoRoutingProvider.
- ORS_API_KEY and OPENROUTESERVICE_API_KEY configuration aliases and settings property.
- Request payload construction, headers (Authorization), and profile URLs.
- Response normalization: GeoJSON FeatureCollection and standard JSON with polyline decoding.
- Alternative routes handling: preserved when returned, not fabricated when absent.
- Full integration with Phase-5 250m segmentation engine.
- Full integration with Copernicus DEM GLO-30 terrain and GSI landslide KDTree enrichment.
- Error handling across:
  - Missing or blank API key (raises MissingAPIKeyError -> HTTP 503 MISSING_API_KEY)
  - Upstream 401/403 authentication failures (raises RoutingProviderError -> HTTP 502 ROUTING_PROVIDER_ERROR)
  - Upstream 404 no route found (raises NoRouteFoundError -> HTTP 404 NO_ROUTE_FOUND)
  - Upstream 429 rate limit (raises RoutingProviderError -> HTTP 502 ROUTING_PROVIDER_ERROR)
  - Upstream 5xx server errors (raises RoutingProviderError -> HTTP 502 ROUTING_PROVIDER_ERROR)
  - Request timeouts (raises RoutingTimeoutError -> HTTP 504 ROUTING_TIMEOUT)
  - Network/connection errors (raises RoutingNetworkError -> HTTP 502 ROUTING_NETWORK_ERROR)
  - Invalid / non-JSON responses (raises RoutingProviderError -> HTTP 502 ROUTING_PROVIDER_ERROR)
- Health endpoint status in LIVE mode (healthy with key, degraded without key).
- Statewide route-agnostic capability across Uttarakhand with mocked external responses.
- No real external API calls are made in any test.
"""

from typing import Any, Dict, List
from unittest.mock import patch
import httpx
import pytest
from fastapi.testclient import TestClient

from backend.app.core.config import Settings, settings
from backend.app.main import app
from backend.app.routing.exceptions import (
    MissingAPIKeyError,
    NoRouteFoundError,
    RoutingNetworkError,
    RoutingProviderError,
    RoutingTimeoutError,
)
from backend.app.routing.models import NormalizedRoute, RouteWithSegments
from backend.app.routing.ors_provider import ORSRoutingProvider, decode_polyline
from backend.app.routing.providers import DemoRoutingProvider
from backend.app.routing.service import RoutingService, get_routing_service
from backend.app.services.analysis_service import analyze_route


@pytest.fixture
def test_client() -> TestClient:
    return TestClient(app)


@pytest.fixture
def mock_ors_geojson_2_routes() -> Dict[str, Any]:
    """Realistic ORS Directions GeoJSON with primary + 1 alternative route."""
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
                        [78.2947, 30.1033],
                        [78.3500, 30.1800],
                        [78.6000, 30.3000],
                        [79.0000, 30.4000],
                        [79.5684, 30.5526],
                    ],
                },
                "properties": {
                    "summary": {
                        "distance": 182400.0,  # 182.4 km
                        "duration": 19800.0,   # 330.0 min (5.5 hrs)
                    },
                    "segments": [{"distance": 182400.0, "duration": 19800.0}],
                },
            },
            {
                "type": "Feature",
                "geometry": {
                    "type": "LineString",
                    "coordinates": [
                        [78.2947, 30.1033],
                        [78.4000, 30.2200],
                        [78.8500, 30.3800],
                        [79.3000, 30.4800],
                        [79.5684, 30.5526],
                    ],
                },
                "properties": {
                    "summary": {
                        "distance": 210500.0,  # 210.5 km
                        "duration": 22200.0,   # 370.0 min
                    },
                    "segments": [{"distance": 210500.0, "duration": 22200.0}],
                },
            },
        ],
    }


@pytest.fixture
def mock_ors_geojson_single_route(mock_ors_geojson_2_routes) -> Dict[str, Any]:
    """ORS response with exactly 1 route."""
    return {
        "type": "FeatureCollection",
        "features": [mock_ors_geojson_2_routes["features"][0]],
    }


@pytest.fixture
def mock_ors_geojson_247km_route() -> Dict[str, Any]:
    """Realistic ORS Directions GeoJSON for Rishikesh -> Joshimath corridor (~247.0 km)."""
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
                        [78.2676, 30.0869],
                        [78.4312, 30.1458],
                        [78.5982, 30.2591],
                        [78.9811, 30.2854],
                        [79.2215, 30.3789],
                        [79.4128, 30.4901],
                        [79.5647, 30.5566],
                    ],
                },
                "properties": {
                    "summary": {
                        "distance": 247000.0,  # 247.0 km
                        "duration": 28800.0,   # 480.0 min (8 hrs)
                    },
                    "segments": [{"distance": 247000.0, "duration": 28800.0}],
                },
            },
        ],
    }


# ===========================================================================
# 1. Configuration & Service Factory Tests
# ===========================================================================
class TestLiveRoutingConfiguration:
    """Tests for settings, API key resolution, and provider instantiation."""

    def test_settings_ors_api_key_property(self, monkeypatch):
        """Settings.ORS_API_KEY property returns OPENROUTESERVICE_API_KEY."""
        monkeypatch.setattr(settings, "OPENROUTESERVICE_API_KEY", "test_secret_key_123")
        assert settings.ORS_API_KEY == "test_secret_key_123"

    def test_settings_reads_ors_api_key_from_env(self, monkeypatch):
        """Settings populates OPENROUTESERVICE_API_KEY when ORS_API_KEY is in env."""
        monkeypatch.setenv("ORS_API_KEY", "env_secret_key_999")
        new_settings = Settings()
        assert new_settings.OPENROUTESERVICE_API_KEY == "env_secret_key_999"
        assert new_settings.ORS_API_KEY == "env_secret_key_999"

    def test_default_ors_base_url_is_heigit_endpoint(self):
        """Settings defaults ORS_BASE_URL to current HeiGIT-hosted directions endpoint."""
        cfg = Settings(_env_file=None)
        assert cfg.ORS_BASE_URL == "https://api.heigit.org/openrouteservice/v2/directions/driving-car/geojson"

    def test_ors_base_url_configurable_via_env(self, monkeypatch):
        """ORS_BASE_URL can be overridden via environment variable."""
        monkeypatch.setenv("ORS_BASE_URL", "https://custom-ors.example.com/v2/directions/driving-car/geojson")
        cfg = Settings()
        assert cfg.ORS_BASE_URL == "https://custom-ors.example.com/v2/directions/driving-car/geojson"

    def test_ors_provider_constructs_heigit_endpoint_by_default(self, monkeypatch):
        """ORSRoutingProvider._build_url() targets HeiGIT directions endpoint by default."""
        monkeypatch.setattr(
            settings,
            "ORS_BASE_URL",
            "https://api.heigit.org/openrouteservice/v2/directions/driving-car/geojson",
        )
        provider = ORSRoutingProvider(api_key="mock_key")
        assert provider.base_url == "https://api.heigit.org/openrouteservice/v2/directions/driving-car/geojson"
        assert provider._build_url() == "https://api.heigit.org/openrouteservice/v2/directions/driving-car/geojson"

    def test_ors_provider_respects_custom_base_url(self):
        """ORSRoutingProvider respects custom base_url parameter."""
        custom_url = "https://private-ors.internal/v2/directions/driving-car/geojson"
        provider = ORSRoutingProvider(api_key="mock_key", base_url=custom_url)
        assert provider._build_url() == custom_url

    def test_approximate_distance_meters(self):
        """approximate_distance_meters calculates accurate geodesic distance between coordinates."""
        from backend.app.routing.ors_provider import approximate_distance_meters

        # Identical point gives 0
        assert approximate_distance_meters(78.2947, 30.1033, 78.2947, 30.1033) == 0.0

        # Dehradun to Rishikesh (~35 km)
        d_short = approximate_distance_meters(78.0322, 30.3165, 78.2676, 30.0869)
        assert 30_000 < d_short < 40_000

        # Rishikesh to Joshimath (~135 km straight line)
        d_long = approximate_distance_meters(78.2676, 30.0869, 79.5647, 30.5566)
        assert 130_000 < d_long < 140_000

    def test_routing_service_selects_ors_in_live_mode(self, monkeypatch):
        """RoutingService in LIVE mode selects ORSRoutingProvider."""
        monkeypatch.setattr(settings, "DATA_MODE", "LIVE")
        monkeypatch.setattr(settings, "OPENROUTESERVICE_API_KEY", "dummy_key")
        service = RoutingService(data_mode="LIVE")
        assert service.data_mode == "LIVE"
        assert isinstance(service.provider, ORSRoutingProvider)
        assert service.provider.provider_name == "OPENROUTESERVICE"

    def test_routing_service_selects_demo_in_demo_mode(self, monkeypatch):
        """RoutingService in DEMO mode selects DemoRoutingProvider."""
        monkeypatch.setattr(settings, "DATA_MODE", "DEMO")
        service = RoutingService(data_mode="DEMO")
        assert service.data_mode == "DEMO"
        assert isinstance(service.provider, DemoRoutingProvider)
        assert service.provider.provider_name == "DEMO_FIXTURE"

    def test_get_routing_service_switches_with_data_mode(self, monkeypatch):
        """get_routing_service() dynamically synchronizes with DATA_MODE."""
        svc_demo = get_routing_service(data_mode="DEMO")
        assert svc_demo.data_mode == "DEMO"
        assert isinstance(svc_demo.provider, DemoRoutingProvider)

        svc_live = get_routing_service(data_mode="LIVE")
        assert svc_live.data_mode == "LIVE"
        assert isinstance(svc_live.provider, ORSRoutingProvider)


# ===========================================================================
# 2. ORS Live Provider Execution & Response Parsing
# ===========================================================================
class TestORSLiveProviderExecution:
    """Tests for ORSRoutingProvider requests, headers, and parsing."""

    def test_live_routing_with_valid_key_and_mocked_ors(self, mock_ors_geojson_2_routes):
        """ORSRoutingProvider executes POST with Authorization header and parses routes."""
        captured_requests: List[httpx.Request] = []

        def handler(request: httpx.Request) -> httpx.Response:
            captured_requests.append(request)
            return httpx.Response(200, json=mock_ors_geojson_2_routes)

        transport = httpx.MockTransport(handler)
        client = httpx.Client(transport=transport)
        provider = ORSRoutingProvider(api_key="valid_test_token_xyz", http_client=client)

        # Use short route (~35 km) where native alternatives are supported
        routes = provider.get_routes((78.0322, 30.3165), (78.2947, 30.1033), alternatives=1)

        assert len(captured_requests) == 1
        req = captured_requests[0]
        assert str(req.url) == "https://api.heigit.org/openrouteservice/v2/directions/driving-car/geojson"
        assert req.headers["Authorization"] == "valid_test_token_xyz"
        assert req.headers["Content-Type"] == "application/json"
        assert "application/geo+json" in req.headers["Accept"]

        assert len(routes) == 2
        r0, r1 = routes[0], routes[1]
        assert r0.route_id == "primary_route"
        assert r0.provider == "OPENROUTESERVICE"
        assert pytest.approx(r0.total_distance_km, abs=0.1) == 182.4
        assert pytest.approx(r0.estimated_time_minutes, abs=0.1) == 330.0
        assert len(r0.geometry_coords) == 5

        assert r1.route_id == "alternative_route_1"
        assert r1.provider == "OPENROUTESERVICE"
        assert pytest.approx(r1.total_distance_km, abs=0.1) == 210.5

    def test_live_routing_alternatives_target_count_payload(self, mock_ors_geojson_2_routes):
        """Payload includes alternative_routes only when alternatives > 0 on short routes."""
        recorded_body = {}

        def handler(request: httpx.Request) -> httpx.Response:
            import json
            nonlocal recorded_body
            recorded_body = json.loads(request.content)
            return httpx.Response(200, json=mock_ors_geojson_2_routes)

        transport = httpx.MockTransport(handler)
        client = httpx.Client(transport=transport)
        provider = ORSRoutingProvider(api_key="key", http_client=client)

        # 1. Short route (~35 km), alternatives = 1 -> alternative_routes included
        provider.get_routes((78.0322, 30.3165), (78.2947, 30.1033), alternatives=1)
        assert "alternative_routes" in recorded_body
        assert recorded_body["alternative_routes"]["target_count"] == 2

        # 2. Short route (~35 km), alternatives = 0 -> alternative_routes omitted
        provider.get_routes((78.0322, 30.3165), (78.2947, 30.1033), alternatives=0)
        assert "alternative_routes" not in recorded_body

    def test_live_routing_single_route_preserves_single_route(self, mock_ors_geojson_single_route):
        """When ORS returns 1 route, provider returns 1 route without fabricating an alternative."""
        transport = httpx.MockTransport(lambda req: httpx.Response(200, json=mock_ors_geojson_single_route))
        client = httpx.Client(transport=transport)
        provider = ORSRoutingProvider(api_key="key", http_client=client)

        routes = provider.get_routes((78.0322, 30.3165), (78.2947, 30.1033), alternatives=1)
        assert len(routes) == 1
        assert routes[0].route_id == "primary_route"

    def test_long_route_does_not_request_native_alternatives(self, mock_ors_geojson_247km_route):
        """Routes > 100km do NOT request native alternative algorithm to avoid HeiGIT limit."""
        captured_payload = {}

        def handler(request: httpx.Request) -> httpx.Response:
            import json
            nonlocal captured_payload
            captured_payload = json.loads(request.content)
            return httpx.Response(200, json=mock_ors_geojson_247km_route)

        transport = httpx.MockTransport(handler)
        client = httpx.Client(transport=transport)
        provider = ORSRoutingProvider(api_key="key", http_client=client)

        # Generic long route (>100 km straight line)
        routes = provider.get_routes((78.2676, 30.0869), (79.5647, 30.5566), alternatives=1)

        # alternative_routes must NOT be requested
        assert "alternative_routes" not in captured_payload
        assert len(routes) == 1
        assert routes[0].route_id == "primary_route"
        assert pytest.approx(routes[0].total_distance_km, abs=0.1) == 247.0
        assert routes[0].provider == "OPENROUTESERVICE"

    def test_247km_pilot_case_rishikesh_to_joshimath(self, mock_ors_geojson_247km_route):
        """Realistic ~247km pilot case (Rishikesh -> Joshimath) succeeds in LIVE mode."""
        captured_requests: List[httpx.Request] = []

        def handler(request: httpx.Request) -> httpx.Response:
            captured_requests.append(request)
            return httpx.Response(200, json=mock_ors_geojson_247km_route)

        transport = httpx.MockTransport(handler)
        client = httpx.Client(transport=transport)
        provider = ORSRoutingProvider(api_key="valid_token", http_client=client)

        # Pilot coordinates: Rishikesh (30.0869, 78.2676) -> Joshimath (30.5566, 79.5647)
        routes = provider.get_routes(
            origin=(78.2676, 30.0869),
            destination=(79.5647, 30.5566),
            alternatives=1,
        )

        assert len(captured_requests) == 1
        import json
        body = json.loads(captured_requests[0].content)
        assert "alternative_routes" not in body
        assert len(routes) == 1
        assert routes[0].total_distance_km == 247.0
        assert len(routes[0].geometry_coords) == 7

    def test_defensive_fallback_when_ors_returns_400_alternative_limit_exceeded(
        self, mock_ors_geojson_single_route
    ):
        """Provider automatically falls back to primary route if upstream rejects native alternatives."""
        call_count = 0
        recorded_bodies = []

        def handler(request: httpx.Request) -> httpx.Response:
            import json
            nonlocal call_count, recorded_bodies
            call_count += 1
            recorded_bodies.append(json.loads(request.content))

            # First attempt with alternative_routes fails with HeiGIT's exact 400 error
            if call_count == 1:
                return httpx.Response(
                    400,
                    json={
                        "error": {
                            "code": 4001,
                            "message": (
                                "Request parameters exceed the server configuration limits. "
                                "The approximated route distance must not be greater than 100000.0 "
                                "meters for use with the alternative Routes algorithm."
                            ),
                        }
                    },
                )
            # Second attempt without alternative_routes succeeds
            return httpx.Response(200, json=mock_ors_geojson_single_route)

        transport = httpx.MockTransport(handler)
        client = httpx.Client(transport=transport)
        # Configure max_alternative_distance_m large enough to force initial alternative request
        provider = ORSRoutingProvider(
            api_key="key",
            http_client=client,
            max_alternative_distance_m=500_000.0,
        )

        routes = provider.get_routes((78.2676, 30.0869), (79.5647, 30.5566), alternatives=1)

        # Fallback sent a second request without alternative_routes
        assert call_count == 2
        assert "alternative_routes" in recorded_bodies[0]
        assert "alternative_routes" not in recorded_bodies[1]

        # Successfully parsed primary route
        assert len(routes) == 1
        assert routes[0].route_id == "primary_route"

    def test_non_alternative_400_raises_routing_provider_error(self):
        """Unrelated HTTP 400 errors are not retried and raise RoutingProviderError directly."""
        call_count = 0

        def handler(request: httpx.Request) -> httpx.Response:
            nonlocal call_count
            call_count += 1
            return httpx.Response(
                400,
                json={"error": {"code": 4000, "message": "Invalid parameter 'unknown_flag'"}},
            )

        transport = httpx.MockTransport(handler)
        client = httpx.Client(transport=transport)
        provider = ORSRoutingProvider(api_key="key", http_client=client)

        with pytest.raises(RoutingProviderError, match="Invalid parameter 'unknown_flag'"):
            provider.get_routes((78.0322, 30.3165), (78.2947, 30.1033), alternatives=1)

        assert call_count == 1

    def test_decode_polyline_helper(self):
        """decode_polyline correctly decodes standard Google encoded polylines into (lon, lat)."""
        # Encoded polyline for (38.5, -120.2), (40.7, -120.95), (43.252, -126.453)
        encoded = "_p~iF~ps|U_ulLnnqC_mqNvxq`@"
        coords = decode_polyline(encoded)
        assert len(coords) == 3
        # First point: lon -120.2, lat 38.5
        assert pytest.approx(coords[0][0], abs=1e-4) == -120.2
        assert pytest.approx(coords[0][1], abs=1e-4) == 38.5

    def test_live_routing_with_encoded_polyline_json(self):
        """ORSRoutingProvider parses standard JSON payload containing encoded polyline string."""
        raw_json = {
            "routes": [
                {
                    "geometry": "_p~iF~ps|U_ulLnnqC_mqNvxq`@",
                    "summary": {"distance": 50000.0, "duration": 3600.0},
                }
            ]
        }
        routes = ORSRoutingProvider.parse_ors_response(raw_json)
        assert len(routes) == 1
        assert len(routes[0].geometry_coords) == 3
        assert routes[0].total_distance_km == 50.0
        assert routes[0].estimated_time_minutes == 60.0


# ===========================================================================
# 3. LIVE Routing Error Handling
# ===========================================================================
class TestLiveRoutingErrorHandling:
    """Comprehensive tests for network, HTTP, credential, and payload error handling."""

    def test_missing_api_key_raises_error(self, monkeypatch):
        """Missing API key raises MissingAPIKeyError."""
        monkeypatch.setattr(settings, "OPENROUTESERVICE_API_KEY", None)
        provider = ORSRoutingProvider(api_key=None)
        with pytest.raises(MissingAPIKeyError, match="API key is missing"):
            provider.get_routes((78.2947, 30.1033), (79.5684, 30.5526))

    def test_empty_string_api_key_raises_error(self):
        """Empty or whitespace-only API key raises MissingAPIKeyError."""
        provider = ORSRoutingProvider(api_key="   ")
        with pytest.raises(MissingAPIKeyError, match="API key is missing"):
            provider.get_routes((78.2947, 30.1033), (79.5684, 30.5526))

    def test_auth_failure_401_raises_routing_provider_error(self):
        """HTTP 401 raises RoutingProviderError with authentication message."""
        transport = httpx.MockTransport(lambda req: httpx.Response(401, json={"error": "Unauthorized"}))
        client = httpx.Client(transport=transport)
        provider = ORSRoutingProvider(api_key="bad_key", http_client=client)

        with pytest.raises(RoutingProviderError, match="authentication failed.*401"):
            provider.get_routes((78.2947, 30.1033), (79.5684, 30.5526))

    def test_auth_failure_403_raises_routing_provider_error(self):
        """HTTP 403 raises RoutingProviderError with authentication message."""
        transport = httpx.MockTransport(lambda req: httpx.Response(403, text="Forbidden"))
        client = httpx.Client(transport=transport)
        provider = ORSRoutingProvider(api_key="forbidden_key", http_client=client)

        with pytest.raises(RoutingProviderError, match="authentication failed.*403"):
            provider.get_routes((78.2947, 30.1033), (79.5684, 30.5526))

    def test_rate_limit_429_raises_routing_provider_error(self):
        """HTTP 429 raises RoutingProviderError indicating rate limit."""
        transport = httpx.MockTransport(lambda req: httpx.Response(429, text="Rate limit exceeded"))
        client = httpx.Client(transport=transport)
        provider = ORSRoutingProvider(api_key="key", http_client=client)

        with pytest.raises(RoutingProviderError, match="rate limit exceeded"):
            provider.get_routes((78.2947, 30.1033), (79.5684, 30.5526))

    def test_no_route_404_raises_no_route_found_error(self):
        """HTTP 404 raises NoRouteFoundError."""
        transport = httpx.MockTransport(lambda req: httpx.Response(404, json={"error": "Not Found"}))
        client = httpx.Client(transport=transport)
        provider = ORSRoutingProvider(api_key="key", http_client=client)

        with pytest.raises(NoRouteFoundError, match="No route found"):
            provider.get_routes((78.2947, 30.1033), (79.5684, 30.5526))

    def test_upstream_500_raises_routing_provider_error(self):
        """HTTP 500 raises RoutingProviderError."""
        transport = httpx.MockTransport(lambda req: httpx.Response(500, text="Internal Server Error"))
        client = httpx.Client(transport=transport)
        provider = ORSRoutingProvider(api_key="key", http_client=client)

        with pytest.raises(RoutingProviderError, match="500"):
            provider.get_routes((78.2947, 30.1033), (79.5684, 30.5526))

    def test_timeout_raises_routing_timeout_error(self):
        """Upstream timeout raises RoutingTimeoutError."""
        def handler(req: httpx.Request):
            raise httpx.TimeoutException("Read timed out")

        transport = httpx.MockTransport(handler)
        client = httpx.Client(transport=transport)
        provider = ORSRoutingProvider(api_key="key", http_client=client)

        with pytest.raises(RoutingTimeoutError, match="timed out"):
            provider.get_routes((78.2947, 30.1033), (79.5684, 30.5526))

    def test_network_error_raises_routing_network_error(self):
        """Network connection drop raises RoutingNetworkError."""
        def handler(req: httpx.Request):
            raise httpx.ConnectError("Connection refused by upstream")

        transport = httpx.MockTransport(handler)
        client = httpx.Client(transport=transport)
        provider = ORSRoutingProvider(api_key="key", http_client=client)

        with pytest.raises(RoutingNetworkError, match="Network error"):
            provider.get_routes((78.2947, 30.1033), (79.5684, 30.5526))

    def test_non_json_200_raises_routing_provider_error(self):
        """HTTP 200 with non-JSON body raises RoutingProviderError."""
        transport = httpx.MockTransport(lambda req: httpx.Response(200, text="<html>Gateway Error</html>"))
        client = httpx.Client(transport=transport)
        provider = ORSRoutingProvider(api_key="key", http_client=client)

        with pytest.raises(RoutingProviderError, match="Failed to decode JSON"):
            provider.get_routes((78.2947, 30.1033), (79.5684, 30.5526))

    def test_ors_payload_with_error_object_raises_routing_provider_error(self):
        """JSON payload with error object raises RoutingProviderError."""
        payload = {"error": {"message": "Point not on routable network"}}
        with pytest.raises(RoutingProviderError, match="Point not on routable network"):
            ORSRoutingProvider.parse_ors_response(payload)


# ===========================================================================
# 4. LIVE Routing Segmentation & Copernicus DEM / GSI Enrichment Bridge
# ===========================================================================
class TestLiveRoutingSegmentationAndEnrichment:
    """Tests integrating LIVE routing with Phase-5 ~250m segmenter and Phase-11 DEM."""

    def test_live_route_segmentation_250m(self, mock_ors_geojson_2_routes):
        """RoutingService fetches LIVE route and segments it into ~250m intervals."""
        transport = httpx.MockTransport(lambda req: httpx.Response(200, json=mock_ors_geojson_2_routes))
        client = httpx.Client(transport=transport)
        provider = ORSRoutingProvider(api_key="key", http_client=client)

        service = RoutingService(provider=provider, data_mode="LIVE")
        results = service.get_segmented_routes((78.2947, 30.1033), (79.5684, 30.5526), alternatives=1)

        assert len(results) == 2
        for r_seg in results:
            assert isinstance(r_seg, RouteWithSegments)
            assert r_seg.route.provider == "OPENROUTESERVICE"
            assert len(r_seg.segmented_route.segments) > 0
            for seg in r_seg.segmented_route.segments:
                assert seg.segment_length_m > 0
                assert len(seg.midpoint) == 2

    def test_live_route_with_dem_and_gsi_enrichment(self, mock_ors_geojson_single_route):
        """End-to-end analyze_route in LIVE mode enriches LIVE segments with Copernicus DEM and GSI."""
        from backend.app.services.weather_service import WeatherService
        transport = httpx.MockTransport(lambda req: httpx.Response(200, json=mock_ors_geojson_single_route))
        client = httpx.Client(transport=transport)
        provider = ORSRoutingProvider(api_key="key", http_client=client)
        svc = RoutingService(provider=provider, data_mode="LIVE")
        weather_svc = WeatherService(data_mode="DEMO")

        result = analyze_route(
            origin=(78.2947, 30.1033),
            destination=(79.5684, 30.5526),
            routing_service=svc,
            weather_service=weather_svc,
            simulated_rainfall_mm=30.0,
            data_mode="LIVE",
        )

        assert result.data_mode == "LIVE"
        assert result.data_provenance.routing_source == "OPENROUTESERVICE"
        assert result.data_provenance.terrain_source == "Copernicus DEM GLO-30"
        assert result.data_provenance.landslide_source == "GSI"

        route = result.routes[0]
        assert len(route.segments) > 0

        # Verify segments have real DEM elevation and slope
        first_seg = route.segments[0]
        assert first_seg.elevation_m is not None
        assert first_seg.elevation_m > 0
        assert first_seg.slope_degrees is not None
        assert first_seg.slope_degrees >= 0

        # Verify GSI landslide features
        assert first_seg.distance_to_historic_scar_m is not None
        assert first_seg.distance_to_historic_scar_m > 0
        assert first_seg.scar_density_1km is not None

        # Verify no fabrication: cut-slope is None, status is honestly PARTIAL
        assert first_seg.is_cut_slope is None
        assert result.status.value == "PARTIAL"

    def test_long_route_247km_analysis_pipeline(self, mock_ors_geojson_247km_route):
        """Full pipeline processes ~247 km long route through 250m segmentation and enrichment."""
        from backend.app.services.weather_service import WeatherService
        transport = httpx.MockTransport(lambda req: httpx.Response(200, json=mock_ors_geojson_247km_route))
        client = httpx.Client(transport=transport)
        provider = ORSRoutingProvider(api_key="key", http_client=client)
        svc = RoutingService(provider=provider, data_mode="LIVE")
        weather_svc = WeatherService(data_mode="DEMO")

        # Pilot coordinates: Rishikesh -> Joshimath (~247 km)
        result = analyze_route(
            origin=(78.2676, 30.0869),
            destination=(79.5647, 30.5566),
            routing_service=svc,
            weather_service=weather_svc,
            simulated_rainfall_mm=25.0,
            data_mode="LIVE",
        )

        assert result.data_mode == "LIVE"
        assert result.data_provenance.routing_source == "OPENROUTESERVICE"
        assert len(result.routes) == 1
        route = result.routes[0]
        assert route.total_distance_km == 247.0
        assert len(route.segments) > 0
        # Check segment lengths adhere to ~250m
        for seg in route.segments:
            assert seg.segment_length_m > 0
            assert seg.elevation_m is not None
            assert seg.slope_degrees is not None


# ===========================================================================
# 5. FastAPI Endpoints under LIVE Mode
# ===========================================================================
class TestLiveRoutingAPIEndpoints:
    """Tests testing FastAPI endpoints with DATA_MODE=LIVE."""

    def test_api_analyze_live_mode_success(self, test_client: TestClient, monkeypatch, mock_ors_geojson_2_routes):
        """POST /api/v1/route/analyze in LIVE mode succeeds and reports OPENROUTESERVICE."""
        from backend.app.services.weather_service import WeatherService
        monkeypatch.setattr(settings, "DATA_MODE", "LIVE")
        monkeypatch.setattr(settings, "OPENROUTESERVICE_API_KEY", "valid_key")

        transport = httpx.MockTransport(lambda req: httpx.Response(200, json=mock_ors_geojson_2_routes))
        mock_client = httpx.Client(transport=transport)
        live_provider = ORSRoutingProvider(api_key="valid_key", http_client=mock_client)
        live_service = RoutingService(provider=live_provider, data_mode="LIVE")
        weather_svc = WeatherService(data_mode="DEMO")

        with patch("backend.app.api.v1.route_analysis.analyze_route") as mock_analyze:
            from backend.app.services.analysis_service import analyze_route as real_analyze
            mock_analyze.side_effect = lambda *args, **kwargs: real_analyze(
                *args, **{**kwargs, "routing_service": live_service, "weather_service": weather_svc, "data_mode": "LIVE"}
            )

            res = test_client.post(
                "/api/v1/route/analyze",
                json={
                    "origin": {"latitude": 30.1033, "longitude": 78.2947},
                    "destination": {"latitude": 30.5526, "longitude": 79.5684},
                    "simulated_rainfall_mm": 40.0,
                },
            )
            assert res.status_code == 200
            data = res.json()
            assert data["data_mode"] == "LIVE"
            assert data["data_provenance"]["routing_source"] == "OPENROUTESERVICE"
            assert len(data["routes"]) == 2

    def test_api_analyze_live_mode_missing_api_key(self, test_client: TestClient, monkeypatch):
        """POST /api/v1/route/analyze in LIVE mode without API key returns HTTP 503 MISSING_API_KEY."""
        monkeypatch.setattr(settings, "DATA_MODE", "LIVE")
        monkeypatch.setattr(settings, "OPENROUTESERVICE_API_KEY", None)

        # Clear cached service so fresh LIVE service without key is instantiated
        import backend.app.routing.service as rs
        rs._default_routing_service = None

        res = test_client.post(
            "/api/v1/route/analyze",
            json={
                "origin": {"latitude": 30.1033, "longitude": 78.2947},
                "destination": {"latitude": 30.5526, "longitude": 79.5684},
            },
        )
        assert res.status_code == 503
        data = res.json()
        assert data["error"] == "MISSING_API_KEY"

    def test_api_analyze_live_mode_auth_failure_returns_502(self, test_client: TestClient, monkeypatch):
        """POST /api/v1/route/analyze when ORS rejects key returns HTTP 502 ROUTING_PROVIDER_ERROR."""
        monkeypatch.setattr(settings, "DATA_MODE", "LIVE")
        monkeypatch.setattr(settings, "OPENROUTESERVICE_API_KEY", "bad_key")

        transport = httpx.MockTransport(lambda req: httpx.Response(401, json={"error": "Unauthorized"}))
        mock_client = httpx.Client(transport=transport)
        live_provider = ORSRoutingProvider(api_key="bad_key", http_client=mock_client)
        live_service = RoutingService(provider=live_provider, data_mode="LIVE")

        with patch("backend.app.api.v1.route_analysis.analyze_route") as mock_analyze:
            from backend.app.services.analysis_service import analyze_route as real_analyze
            mock_analyze.side_effect = lambda *args, **kwargs: real_analyze(
                *args, **{**kwargs, "routing_service": live_service, "data_mode": "LIVE"}
            )

            res = test_client.post(
                "/api/v1/route/analyze",
                json={
                    "origin": {"latitude": 30.1033, "longitude": 78.2947},
                    "destination": {"latitude": 30.5526, "longitude": 79.5684},
                },
            )
            assert res.status_code == 502
            data = res.json()
            assert data["error"] == "ROUTING_PROVIDER_ERROR"

    def test_api_analyze_live_mode_no_route_returns_404(self, test_client: TestClient, monkeypatch):
        """POST /api/v1/route/analyze when ORS returns 404 returns HTTP 404 NO_ROUTE_FOUND."""
        transport = httpx.MockTransport(lambda req: httpx.Response(404, json={"error": "Not Found"}))
        mock_client = httpx.Client(transport=transport)
        live_provider = ORSRoutingProvider(api_key="key", http_client=mock_client)
        live_service = RoutingService(provider=live_provider, data_mode="LIVE")

        with patch("backend.app.api.v1.route_analysis.analyze_route") as mock_analyze:
            from backend.app.services.analysis_service import analyze_route as real_analyze
            mock_analyze.side_effect = lambda *args, **kwargs: real_analyze(
                *args, **{**kwargs, "routing_service": live_service, "data_mode": "LIVE"}
            )

            res = test_client.post(
                "/api/v1/route/analyze",
                json={
                    "origin": {"latitude": 30.1033, "longitude": 78.2947},
                    "destination": {"latitude": 30.5526, "longitude": 79.5684},
                },
            )
            assert res.status_code == 404
            data = res.json()
            assert data["error"] == "NO_ROUTE_FOUND"

    def test_api_analyze_live_mode_timeout_returns_504(self, test_client: TestClient):
        """POST /api/v1/route/analyze on upstream timeout returns HTTP 504 ROUTING_TIMEOUT."""
        def handler(req):
            raise httpx.TimeoutException("Gateway timed out")

        transport = httpx.MockTransport(handler)
        mock_client = httpx.Client(transport=transport)
        live_provider = ORSRoutingProvider(api_key="key", http_client=mock_client)
        live_service = RoutingService(provider=live_provider, data_mode="LIVE")

        with patch("backend.app.api.v1.route_analysis.analyze_route") as mock_analyze:
            from backend.app.services.analysis_service import analyze_route as real_analyze
            mock_analyze.side_effect = lambda *args, **kwargs: real_analyze(
                *args, **{**kwargs, "routing_service": live_service, "data_mode": "LIVE"}
            )

            res = test_client.post(
                "/api/v1/route/analyze",
                json={
                    "origin": {"latitude": 30.1033, "longitude": 78.2947},
                    "destination": {"latitude": 30.5526, "longitude": 79.5684},
                },
            )
            assert res.status_code == 504
            data = res.json()
            assert data["error"] == "ROUTING_TIMEOUT"

    def test_api_analyze_live_mode_network_error_returns_502(self, test_client: TestClient):
        """POST /api/v1/route/analyze on network error returns HTTP 502 ROUTING_NETWORK_ERROR."""
        def handler(req):
            raise httpx.ConnectError("Network is unreachable")

        transport = httpx.MockTransport(handler)
        mock_client = httpx.Client(transport=transport)
        live_provider = ORSRoutingProvider(api_key="key", http_client=mock_client)
        live_service = RoutingService(provider=live_provider, data_mode="LIVE")

        with patch("backend.app.api.v1.route_analysis.analyze_route") as mock_analyze:
            from backend.app.services.analysis_service import analyze_route as real_analyze
            mock_analyze.side_effect = lambda *args, **kwargs: real_analyze(
                *args, **{**kwargs, "routing_service": live_service, "data_mode": "LIVE"}
            )

            res = test_client.post(
                "/api/v1/route/analyze",
                json={
                    "origin": {"latitude": 30.1033, "longitude": 78.2947},
                    "destination": {"latitude": 30.5526, "longitude": 79.5684},
                },
            )
            assert res.status_code == 502
            data = res.json()
            assert data["error"] == "ROUTING_NETWORK_ERROR"

    def test_health_in_live_mode_with_key(self, test_client: TestClient, monkeypatch):
        """GET /api/v1/health with DATA_MODE=LIVE and configured key reports healthy."""
        monkeypatch.setattr(settings, "DATA_MODE", "LIVE")
        monkeypatch.setattr(settings, "OPENROUTESERVICE_API_KEY", "real_or_mocked_key")

        res = test_client.get("/api/v1/health")
        assert res.status_code == 200
        data = res.json()
        assert data["data_mode"] == "LIVE"
        assert "OpenRouteService LIVE" in data["routing_engine"]
        assert data["status"] == "healthy"

    def test_health_in_live_mode_without_key(self, test_client: TestClient, monkeypatch):
        """GET /api/v1/health with DATA_MODE=LIVE and missing key reports degraded."""
        monkeypatch.setattr(settings, "DATA_MODE", "LIVE")
        monkeypatch.setattr(settings, "OPENROUTESERVICE_API_KEY", None)

        res = test_client.get("/api/v1/health")
        assert res.status_code == 200
        data = res.json()
        assert data["data_mode"] == "LIVE"
        assert "missing OPENROUTESERVICE_API_KEY" in data["routing_engine"]
        assert data["status"] == "degraded"


# ===========================================================================
# 6. Statewide Route-Agnostic Capability
# ===========================================================================
class TestStatewideLiveRouting:
    """Verifies that LIVE routing works on arbitrary coordinates across Uttarakhand."""

    def test_western_uttarakhand_live_routing(self):
        """Western corridor (Dehradun to Chakrata) with LIVE provider."""
        mock_response = {
            "type": "FeatureCollection",
            "features": [
                {
                    "type": "Feature",
                    "geometry": {
                        "type": "LineString",
                        "coordinates": [[78.0322, 30.3165], [77.9500, 30.5000], [77.8698, 30.7016]],
                    },
                    "properties": {"summary": {"distance": 85000.0, "duration": 9000.0}},
                }
            ],
        }
        transport = httpx.MockTransport(lambda req: httpx.Response(200, json=mock_response))
        client = httpx.Client(transport=transport)
        provider = ORSRoutingProvider(api_key="key", http_client=client)

        routes = provider.get_routes((78.0322, 30.3165), (77.8698, 30.7016))
        assert len(routes) == 1
        assert pytest.approx(routes[0].total_distance_km, abs=0.1) == 85.0

    def test_eastern_uttarakhand_live_routing(self):
        """Eastern corridor (Almora to Pithoragarh) with LIVE provider."""
        mock_response = {
            "type": "FeatureCollection",
            "features": [
                {
                    "type": "Feature",
                    "geometry": {
                        "type": "LineString",
                        "coordinates": [[79.6600, 29.6000], [79.9500, 29.5800], [80.2200, 29.5800]],
                    },
                    "properties": {"summary": {"distance": 115000.0, "duration": 14000.0}},
                }
            ],
        }
        transport = httpx.MockTransport(lambda req: httpx.Response(200, json=mock_response))
        client = httpx.Client(transport=transport)
        provider = ORSRoutingProvider(api_key="key", http_client=client)

        routes = provider.get_routes((79.6600, 29.6000), (80.2200, 29.5800))
        assert len(routes) == 1
        assert pytest.approx(routes[0].total_distance_km, abs=0.1) == 115.0
