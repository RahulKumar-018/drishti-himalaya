"""Automated tests for progressive mountain road snapping in ORS routing.

Verifies:
A. Normal road-accessible coordinate -> no expanded retry.
B. Coordinate within 350m -> normal ORS routing succeeds.
C. Coordinate requiring ~1km snapping -> retry succeeds.
D. Coordinate requiring ~1.1km snapping -> Pithoragarh -> Dharchula case succeeds.
E. Coordinate requiring >3km -> controlled failure with 3000m message.
F. ORS error other than 2010 -> no snapping retry.
G. Original requested coordinates are never overwritten.
H. Snapping metadata is correctly populated.
I. Existing long-route behavior (>100km) continues to work.
J. Existing partial-risk scoring behavior remains unchanged.
"""

from typing import Any, Dict
import httpx
import pytest
from fastapi.testclient import TestClient

from backend.app.core.config import settings
from backend.app.main import app
from backend.app.routing.exceptions import NoRouteFoundError, RoutingProviderError
from backend.app.routing.ors_provider import ORSRoutingProvider, approximate_distance_meters
from backend.app.schemas.common import CoordinatePoint
from backend.app.schemas.route import AnalyzeRouteRequest
from backend.app.services.analysis_service import analyze_route


@pytest.fixture
def test_client() -> TestClient:
    return TestClient(app)


def _make_geojson_feature_route(
    start_coord: tuple[float, float],
    end_coord: tuple[float, float],
    distance_m: float = 91000.0,
    duration_s: float = 7200.0,
) -> Dict[str, Any]:
    """Generate realistic ORS FeatureCollection response."""
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
                        [start_coord[0], start_coord[1]],
                        [(start_coord[0] + end_coord[0]) / 2, (start_coord[1] + end_coord[1]) / 2],
                        [end_coord[0], end_coord[1]],
                    ],
                },
                "properties": {
                    "summary": {
                        "distance": distance_m,
                        "duration": duration_s,
                    },
                    "segments": [
                        {
                            "distance": distance_m,
                            "duration": duration_s,
                            "steps": [],
                        }
                    ],
                },
            }
        ],
    }


class TestRoadSnappingRetryLogic:
    """Test suite covering scenarios A through J for controlled road snapping."""

    # Scenario A & B: Normal road-accessible coordinate within 350m
    def test_normal_road_accessible_coordinate_no_expanded_retry(self) -> None:
        """Requirement A & B: Coordinate within 350m succeeds on attempt 1 without retry."""
        req_origin = (80.218185, 29.582861)
        req_dest = (80.529327, 29.841805)
        # Snapped coords within ~15m
        snapped_origin = (80.218150, 29.582980)
        snapped_dest = (80.529300, 29.841820)

        mock_payload = _make_geojson_feature_route(snapped_origin, snapped_dest)
        request_count = 0

        def mock_handler(request: httpx.Request) -> httpx.Response:
            nonlocal request_count
            request_count += 1
            return httpx.Response(200, json=mock_payload)

        transport = httpx.MockTransport(mock_handler)
        client = httpx.Client(transport=transport)

        provider = ORSRoutingProvider(
            api_key="test-key",
            http_client=client,
            default_snapping_radius_m=350.0,
            snapping_retry_radii_m=[1000.0, 2000.0, 3000.0],
            max_snapping_radius_m=3000.0,
        )

        routes = provider.get_routes(origin=req_origin, destination=req_dest, alternatives=0)

        assert len(routes) == 1
        assert request_count == 1  # No retries
        r = routes[0]
        meta = r.metadata

        # Requirements G & H
        assert meta["requested_origin"] == [req_origin[0], req_origin[1]]
        assert meta["requested_destination"] == [req_dest[0], req_dest[1]]
        assert meta["snapped_origin"] == [round(snapped_origin[0], 6), round(snapped_origin[1], 6)]
        assert meta["snapped_destination"] == [round(snapped_dest[0], 6), round(snapped_dest[1], 6)]
        assert meta["is_origin_snapped"] is False
        assert meta["is_destination_snapped"] is False
        assert meta["snapping_distance_origin_m"] < 350.0
        assert meta["snapping_distance_destination_m"] < 350.0

    # Scenario C: Coordinate requiring ~1km snapping -> retry succeeds at 1000m
    def test_coordinate_requiring_1km_snapping_succeeds_on_first_retry(self) -> None:
        """Requirement C: Initial attempt 404 (2010) followed by 1000m retry succeeds."""
        req_origin = (80.218185, 29.582861)
        req_dest = (80.525000, 29.845000)
        snapped_origin = (80.218150, 29.582980)
        snapped_dest = (80.533000, 29.842000)  # ~850m away

        requests_received: list[dict[str, Any]] = []

        def mock_handler(request: httpx.Request) -> httpx.Response:
            import json
            body = json.loads(request.content.decode("utf-8"))
            requests_received.append(body)

            if "radiuses" not in body:
                # Initial attempt at default 350m fails for destination (coordinate 1)
                return httpx.Response(
                    404,
                    json={
                        "error": {
                            "code": 2010,
                            "message": "Could not find routable point within a radius of 350.0 meters of specified coordinate 1: 80.5250000 29.8450000.",
                        }
                    },
                )
            radii = body["radiuses"]
            if radii[1] == 1000.0:
                mock_payload = _make_geojson_feature_route(snapped_origin, snapped_dest)
                return httpx.Response(200, json=mock_payload)

            return httpx.Response(404, json={"error": {"code": 2010, "message": "Failed"}})

        transport = httpx.MockTransport(mock_handler)
        client = httpx.Client(transport=transport)

        provider = ORSRoutingProvider(
            api_key="test-key",
            http_client=client,
            default_snapping_radius_m=350.0,
            snapping_retry_radii_m=[1000.0, 2000.0, 3000.0],
            max_snapping_radius_m=3000.0,
        )

        routes = provider.get_routes(origin=req_origin, destination=req_dest, alternatives=0)

        assert len(routes) == 1
        assert len(requests_received) == 2  # 1 initial + 1 retry
        assert requests_received[1]["radiuses"] == [350.0, 1000.0]

        r = routes[0]
        assert r.metadata["is_destination_snapped"] is True
        assert r.metadata["is_origin_snapped"] is False
        assert r.metadata["snapping_distance_destination_m"] > 350.0

    # Scenario D: Pithoragarh -> Dharchula case (~1.1km snapping)
    def test_pithoragarh_to_dharchula_1115m_snapping_case(self) -> None:
        """Requirement D: Real pilot case where Dharchula requires ~1.115km snapping.

        Initial (350m) -> 404 (2010)
        Retry 1 (1000m) -> 404 (2010)
        Retry 2 (2000m) -> 200 OK
        """
        req_origin = (80.218185, 29.582861)  # Pithoragarh
        req_dest = (80.519514, 29.847071)    # Dharchula settlement (~1.115km from road)
        snapped_origin = (80.21815, 29.58298)
        snapped_dest = (80.529327, 29.841805)  # Exact road vertex ~1115m from requested

        requests_received: list[dict[str, Any]] = []

        def mock_handler(request: httpx.Request) -> httpx.Response:
            import json
            body = json.loads(request.content.decode("utf-8"))
            requests_received.append(body)

            if "radiuses" not in body:
                return httpx.Response(
                    404,
                    json={
                        "error": {
                            "code": 2010,
                            "message": "Could not find routable point within a radius of 350.0 meters of specified coordinate 1: 80.5195140 29.8470710.",
                        }
                    },
                )
            radii = body["radiuses"]
            if radii[1] == 1000.0:
                return httpx.Response(
                    404,
                    json={
                        "error": {
                            "code": 2010,
                            "message": "Could not find routable point within a radius of 1000.0 meters of specified coordinate 1: 80.5195140 29.8470710.",
                        }
                    },
                )
            if radii[1] == 2000.0:
                mock_payload = _make_geojson_feature_route(snapped_origin, snapped_dest, distance_m=91000.0)
                return httpx.Response(200, json=mock_payload)

            return httpx.Response(404, json={"error": {"code": 2010, "message": "Unexpected"}})

        transport = httpx.MockTransport(mock_handler)
        client = httpx.Client(transport=transport)

        provider = ORSRoutingProvider(
            api_key="test-key",
            http_client=client,
            default_snapping_radius_m=350.0,
            snapping_retry_radii_m=[1000.0, 2000.0, 3000.0],
            max_snapping_radius_m=3000.0,
        )

        routes = provider.get_routes(origin=req_origin, destination=req_dest, alternatives=0)

        assert len(routes) == 1
        assert len(requests_received) == 3
        assert requests_received[0].get("radiuses") is None
        assert requests_received[1]["radiuses"] == [350.0, 1000.0]
        assert requests_received[2]["radiuses"] == [350.0, 2000.0]

        r = routes[0]
        assert r.metadata["requested_destination"] == [req_dest[0], req_dest[1]]
        assert r.metadata["snapped_destination"] == [snapped_dest[0], snapped_dest[1]]
        assert 1100.0 <= r.metadata["snapping_distance_destination_m"] <= 1130.0
        assert r.metadata["is_destination_snapped"] is True
        assert r.metadata["is_origin_snapped"] is False

    # Scenario E: Coordinate requiring >3km -> controlled failure
    def test_coordinate_exceeding_max_snapping_radius_raises_controlled_error(self) -> None:
        """Requirement E: When road distance exceeds 3000m max, fails with explicit structured error."""
        req_origin = (80.218185, 29.582861)
        req_dest = (80.600000, 29.900000)

        requests_received: list[dict[str, Any]] = []

        def mock_handler(request: httpx.Request) -> httpx.Response:
            import json
            body = json.loads(request.content.decode("utf-8"))
            requests_received.append(body)
            rad = body.get("radiuses", [350.0, 350.0])[1]
            return httpx.Response(
                404,
                json={
                    "error": {
                        "code": 2010,
                        "message": f"Could not find routable point within a radius of {rad} meters of specified coordinate 1: 80.6000000 29.9000000.",
                    }
                },
            )

        transport = httpx.MockTransport(mock_handler)
        client = httpx.Client(transport=transport)

        provider = ORSRoutingProvider(
            api_key="test-key",
            http_client=client,
            default_snapping_radius_m=350.0,
            snapping_retry_radii_m=[1000.0, 2000.0, 3000.0],
            max_snapping_radius_m=3000.0,
        )

        with pytest.raises(NoRouteFoundError) as exc_info:
            provider.get_routes(origin=req_origin, destination=req_dest, alternatives=0)

        # Total 4 calls: 350m, 1000m, 2000m, 3000m
        assert len(requests_received) == 4
        err_msg = str(exc_info.value)
        assert "within the maximum allowed access distance of 3000m" in err_msg
        assert "Please select a location closer to an accessible road." in err_msg

    # Scenario F: ORS error other than 2010 -> no snapping retry
    def test_non_2010_error_does_not_retry_snapping(self) -> None:
        """Requirement F: Non-2010 errors (e.g. 404 disconnected island, 500) do NOT trigger retries."""
        req_origin = (80.218185, 29.582861)
        req_dest = (80.529327, 29.841805)
        call_count = 0

        def mock_handler(request: httpx.Request) -> httpx.Response:
            nonlocal call_count
            call_count += 1
            return httpx.Response(
                404,
                json={
                    "error": {
                        "code": 2099,
                        "message": "Connection between points not found.",
                    }
                },
            )

        transport = httpx.MockTransport(mock_handler)
        client = httpx.Client(transport=transport)

        provider = ORSRoutingProvider(
            api_key="test-key",
            http_client=client,
        )

        with pytest.raises(NoRouteFoundError) as exc_info:
            provider.get_routes(origin=req_origin, destination=req_dest, alternatives=0)

        assert call_count == 1  # Exactly 1 call, no snapping retry
        assert "No route found between" in str(exc_info.value)

    # Scenario G & H: Original coordinates preserved and snapping metadata complete in API
    def test_snapping_metadata_and_advisory_in_api_response(self, test_client: TestClient) -> None:
        """Requirement G, H & Advisory: Check API response schema and advisory notes."""
        req_origin = (80.218185, 29.582861)
        req_dest = (80.519514, 29.847071)
        snapped_origin = (80.21815, 29.58298)
        snapped_dest = (80.529327, 29.841805)

        def mock_handler(request: httpx.Request) -> httpx.Response:
            import json
            body = json.loads(request.content.decode("utf-8"))
            if "radiuses" not in body:
                return httpx.Response(
                    404,
                    json={
                        "error": {
                            "code": 2010,
                            "message": "Could not find routable point within a radius of 350.0 meters of specified coordinate 1: 80.5195140 29.8470710.",
                        }
                    },
                )
            radii = body["radiuses"]
            if radii[1] >= 2000.0:
                mock_payload = _make_geojson_feature_route(snapped_origin, snapped_dest, distance_m=91000.0)
                return httpx.Response(200, json=mock_payload)
            return httpx.Response(404, json={"error": {"code": 2010, "message": "Retry"}})

        mock_client = httpx.Client(transport=httpx.MockTransport(mock_handler))
        mock_provider = ORSRoutingProvider(api_key="mock-key", http_client=mock_client)

        from backend.app.routing.service import RoutingService
        custom_routing = RoutingService(provider=mock_provider)

        result = analyze_route(
            origin=req_origin,
            destination=req_dest,
            routing_service=custom_routing,
            data_mode="LIVE",
        )

        assert len(result.routes) == 1
        route = result.routes[0]

        # Requirement G & H
        assert route.requested_origin == [req_origin[0], req_origin[1]]
        assert route.requested_destination == [req_dest[0], req_dest[1]]
        assert route.snapped_origin == [snapped_origin[0], snapped_origin[1]]
        assert route.snapped_destination == [snapped_dest[0], snapped_dest[1]]
        assert route.is_origin_snapped is False
        assert route.is_destination_snapped is True
        assert 1100.0 <= route.snapping_distance_destination_m <= 1130.0

    # Scenario I: Long-route (>100km) continues to work
    def test_long_route_over_100km_continues_to_work(self) -> None:
        """Requirement I: Routes >100km (e.g. 247km Rishikesh->Joshimath) bypass alternatives and snap safely."""
        req_origin = (78.2676, 30.0869)  # Rishikesh
        req_dest = (79.5647, 30.5566)    # Joshimath (~150km straight line, 247km road)
        snapped_origin = (78.2677, 30.0870)
        snapped_dest = (79.5646, 30.5565)

        request_bodies: list[dict[str, Any]] = []

        def mock_handler(request: httpx.Request) -> httpx.Response:
            import json
            body = json.loads(request.content.decode("utf-8"))
            request_bodies.append(body)
            mock_payload = _make_geojson_feature_route(snapped_origin, snapped_dest, distance_m=247000.0)
            return httpx.Response(200, json=mock_payload)

        transport = httpx.MockTransport(mock_handler)
        client = httpx.Client(transport=transport)

        provider = ORSRoutingProvider(
            api_key="test-key",
            http_client=client,
            max_alternative_distance_m=100000.0,
        )

        routes = provider.get_routes(origin=req_origin, destination=req_dest, alternatives=1)

        assert len(routes) == 1
        assert "alternative_routes" not in request_bodies[0]  # Skipped because >100km
        assert routes[0].total_distance_km == 247.0

    # Scenario J: Existing partial-risk scoring remains unchanged
    def test_partial_risk_scoring_remains_unchanged_with_snapped_route(self) -> None:
        """Requirement J: MCDA risk scoring works identically with snapped routes in partial mode."""
        req_origin = (80.218185, 29.582861)
        req_dest = (80.519514, 29.847071)
        snapped_origin = (80.21815, 29.58298)
        snapped_dest = (80.529327, 29.841805)

        def mock_handler(request: httpx.Request) -> httpx.Response:
            mock_payload = _make_geojson_feature_route(snapped_origin, snapped_dest, distance_m=5000.0)
            return httpx.Response(200, json=mock_payload)

        mock_client = httpx.Client(transport=httpx.MockTransport(mock_handler))
        mock_provider = ORSRoutingProvider(api_key="mock-key", http_client=mock_client)

        from backend.app.routing.service import RoutingService
        custom_routing = RoutingService(provider=mock_provider)

        result = analyze_route(
            origin=req_origin,
            destination=req_dest,
            routing_service=custom_routing,
            data_mode="DEMO",
        )

        assert result.status.value in ("COMPLETE", "PARTIAL")
        assert len(result.routes) == 1
        route = result.routes[0]
        assert route.requested_origin == [req_origin[0], req_origin[1]]
        assert route.requested_destination == [req_dest[0], req_dest[1]]
        if route.route_risk:
            assert 0.0 <= route.route_risk.composite_route_risk <= 100.0

    def test_api_endpoint_advisory_text_when_snapped(self, test_client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
        """Requirement 10 & 13: Test HTTP POST /api/v1/route/analyze returns snapping metadata and advisory."""
        from unittest.mock import patch
        from backend.app.routing.service import RoutingService
        from backend.app.services.weather_service import WeatherService
        from backend.app.services.analysis_service import analyze_route as real_analyze

        req_origin = (80.218185, 29.582861)
        req_dest = (80.519514, 29.847071)
        snapped_origin = (80.21815, 29.58298)
        snapped_dest = (80.529327, 29.841805)

        def mock_handler(request: httpx.Request) -> httpx.Response:
            import json
            body = json.loads(request.content.decode("utf-8"))
            if "radiuses" not in body:
                return httpx.Response(
                    404,
                    json={
                        "error": {
                            "code": 2010,
                            "message": "Could not find routable point within a radius of 350.0 meters of specified coordinate 1: 80.5195140 29.8470710.",
                        }
                    },
                )
            radii = body["radiuses"]
            if radii[1] >= 2000.0:
                mock_payload = _make_geojson_feature_route(snapped_origin, snapped_dest, distance_m=91000.0)
                return httpx.Response(200, json=mock_payload)
            return httpx.Response(404, json={"error": {"code": 2010, "message": "Could not find routable point"}})

        mock_client = httpx.Client(transport=httpx.MockTransport(mock_handler))
        mock_provider = ORSRoutingProvider(api_key="mock-key", http_client=mock_client)
        mock_routing = RoutingService(provider=mock_provider, data_mode="LIVE")
        weather_svc = WeatherService(data_mode="DEMO")

        with patch("backend.app.api.v1.route_analysis.analyze_route") as mock_analyze:
            mock_analyze.side_effect = lambda *args, **kwargs: real_analyze(
                *args, **{**kwargs, "routing_service": mock_routing, "weather_service": weather_svc, "data_mode": "LIVE"}
            )

            res = test_client.post(
                "/api/v1/route/analyze",
                json={
                    "origin": {"latitude": req_origin[1], "longitude": req_origin[0]},
                    "destination": {"latitude": req_dest[1], "longitude": req_dest[0]},
                },
            )

            assert res.status_code == 200
            data = res.json()
            routes = data["routes"]
            assert len(routes) == 1
            r0 = routes[0]

            assert r0["requested_origin"] == [req_origin[0], req_origin[1]]
            assert r0["requested_destination"] == [req_dest[0], req_dest[1]]
            assert r0["snapped_origin"] == [snapped_origin[0], snapped_origin[1]]
            assert r0["snapped_destination"] == [snapped_dest[0], snapped_dest[1]]
            assert r0["is_destination_snapped"] is True
            assert r0["is_origin_snapped"] is False
            assert "Destination was approximately 1113m from the nearest drivable road. Routing was calculated from the nearest accessible road point." in r0["advisory_text"]

    def test_api_endpoint_controlled_failure_over_3km(self, test_client: TestClient) -> None:
        """Requirement 11: When >3000m road snapping fails, API returns HTTP 404 structured error."""
        from unittest.mock import patch
        from backend.app.routing.service import RoutingService

        def mock_handler(request: httpx.Request) -> httpx.Response:
            return httpx.Response(
                404,
                json={
                    "error": {
                        "code": 2010,
                        "message": "Could not find routable point within a radius of 3000.0 meters of specified coordinate 1: 80.6000000 29.9000000.",
                    }
                },
            )

        mock_client = httpx.Client(transport=httpx.MockTransport(mock_handler))
        mock_provider = ORSRoutingProvider(api_key="mock-key", http_client=mock_client)
        mock_routing = RoutingService(provider=mock_provider, data_mode="LIVE")

        with patch("backend.app.api.v1.route_analysis.analyze_route") as mock_analyze:
            from backend.app.services.analysis_service import analyze_route as real_analyze
            mock_analyze.side_effect = lambda *args, **kwargs: real_analyze(
                *args, **{**kwargs, "routing_service": mock_routing, "data_mode": "LIVE"}
            )

            res = test_client.post(
                "/api/v1/route/analyze",
                json={
                    "origin": {"latitude": 29.582861, "longitude": 80.218185},
                    "destination": {"latitude": 29.900000, "longitude": 80.600000},
                },
            )

            assert res.status_code == 404
            err = res.json()
            assert err["error"] == "NO_ROUTE_FOUND"
            assert "within the maximum allowed access distance of 3000m" in err["message"]
            assert "Please select a location closer to an accessible road." in err["message"]

