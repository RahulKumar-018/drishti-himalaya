"""Tests for LIVE weather integration, simulated rainfall overrides, and missing weather resilience.

Verifies:
1. LIVE weather path:
   - Open-Meteo provides actual P24, P72, and ARI precipitation data.
   - Provenance explicitly reports weather_source="OPEN_METEO" (not SIMULATED).
   - DataAvailability reports weather=True with no precipitation missing features.
   - Route and segment risk scores are computed using actual Open-Meteo data.
2. Simulated rainfall override path:
   - simulated_rainfall_mm overrides P24 while preserving P72 and ARI.
   - Provenance explicitly reports weather_source="SIMULATED({N}mm)".
   - Dynamic Pareto heavy rain alerts trigger when simulated_rainfall_mm > 50mm.
3. Missing/unavailable weather behavior:
   - When weather telemetry is unavailable, P24, P72, ARI are None.
   - DataAvailability reports weather=False, missing_features includes rainfall factors.
   - Risk engine strictly refuses to fabricate scores without weather (route_risk is None).
   - API advisory text clearly warns that meteorological telemetry is unavailable.
"""

from typing import Any, Dict
from unittest.mock import patch
import httpx
import pytest
from fastapi.testclient import TestClient

from backend.app.core.config import settings
from backend.app.main import app
from backend.app.risk_engine.constants import (
    PARETO_ALERT_ALPHA,
    PARETO_ALERT_BETA,
    PARETO_CLEAR_ALPHA,
    PARETO_CLEAR_BETA,
)
from backend.app.routing.ors_provider import ORSRoutingProvider
from backend.app.routing.service import RoutingService
from backend.app.services.analysis_models import AnalysisStatus
from backend.app.services.analysis_service import analyze_route
from backend.app.services.weather_models import WeatherQueryResult
from backend.app.services.weather_service import WeatherService


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)


def _mock_open_meteo_json(p24: float = 12.5, p72: float = 28.0) -> Dict[str, Any]:
    """Generate realistic Open-Meteo API response."""
    # 360 hours total (15 days * 24h)
    prior_48_rate = max(0.0, (p72 - p24) / 48.0)
    p24_rate = p24 / 24.0
    hourly_precip = [0.2] * 288 + [prior_48_rate] * 48 + [p24_rate] * 24
    daily_precip = [5.0] * 14 + [p24, 0.0]
    return {
        "latitude": 29.58,
        "longitude": 80.22,
        "timezone": "UTC",
        "hourly": {
            "time": [f"2026-10-01T{h:02d}:00" for h in range(len(hourly_precip))],
            "precipitation": hourly_precip,
        },
        "daily": {
            "time": [f"2026-09-{d:02d}" for d in range(15, 31)],
            "precipitation_sum": daily_precip,
        },
    }


def _mock_geojson_route(start: tuple[float, float], end: tuple[float, float]) -> Dict[str, Any]:
    """Generate minimal valid ORS GeoJSON route."""
    return {
        "type": "FeatureCollection",
        "metadata": {"service": "routing"},
        "features": [
            {
                "type": "Feature",
                "geometry": {
                    "type": "LineString",
                    "coordinates": [
                        [start[0], start[1]],
                        [(start[0] + end[0]) / 2, (start[1] + end[1]) / 2],
                        [end[0], end[1]],
                    ],
                },
                "properties": {
                    "summary": {"distance": 5000.0, "duration": 600.0},
                    "segments": [{"distance": 5000.0, "duration": 600.0, "steps": []}],
                },
            }
        ],
    }


class TestLiveWeatherPath:
    """Verifies LIVE weather integration with Open-Meteo when simulated_rainfall_mm is omitted."""

    def test_live_weather_path_uses_actual_open_meteo_telemetry(self) -> None:
        """Requirement 4 & 5: When simulated_rainfall_mm is omitted in LIVE mode, actual Open-Meteo data is used."""
        req_origin = (80.218185, 29.582861)
        req_dest = (80.250000, 29.600000)

        # Mock ORS routing response
        mock_route = _mock_geojson_route(req_origin, req_dest)
        ors_client = httpx.Client(transport=httpx.MockTransport(lambda req: httpx.Response(200, json=mock_route)))
        ors_provider = ORSRoutingProvider(api_key="mock-key", http_client=ors_client)
        routing_svc = RoutingService(provider=ors_provider, data_mode="LIVE")

        # Mock Open-Meteo response with known rainfall (P24=14.4mm, P72=36.0mm)
        weather_payload = _mock_open_meteo_json(p24=14.4, p72=36.0)
        weather_client = httpx.Client(transport=httpx.MockTransport(lambda req: httpx.Response(200, json=weather_payload)))
        weather_svc = WeatherService(data_mode="LIVE", http_client=weather_client)

        result = analyze_route(
            origin=req_origin,
            destination=req_dest,
            simulated_rainfall_mm=None,  # OMITTED
            routing_service=routing_svc,
            weather_service=weather_svc,
            data_mode="LIVE",
        )

        # 1. Provenance: must report OPEN_METEO, not SIMULATED
        assert result.data_provenance.weather_source == "OPEN_METEO"
        assert "SIMULATED" not in result.data_provenance.weather_source

        # 2. Availability: weather is True
        assert result.data_availability.weather is True
        assert "p24_mm" not in result.data_availability.missing_features
        assert "p72_mm" not in result.data_availability.missing_features
        assert "ari_mm" not in result.data_availability.missing_features

        # 3. Segments: populated with actual Open-Meteo values
        route = result.routes[0]
        assert len(route.segments) > 0
        seg0 = route.segments[0]
        assert seg0.p24_mm is not None
        assert pytest.approx(seg0.p24_mm, abs=0.5) == 14.4
        assert seg0.p72_mm is not None
        assert pytest.approx(seg0.p72_mm, abs=0.5) == 36.0
        assert seg0.ari_mm is not None
        assert seg0.ari_mm > 0.0

        # 4. Route risk is calculated (numeric, not None)
        assert route.route_risk is not None
        assert 0.0 <= route.route_risk.composite_route_risk <= 100.0

    def test_live_weather_api_endpoint_response_identifies_open_meteo(self, client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
        """Requirement 5: HTTP API response identifies weather source as OPEN_METEO when simulated_rainfall_mm is omitted."""
        monkeypatch.setattr(settings, "DATA_MODE", "LIVE")
        monkeypatch.setattr(settings, "OPENROUTESERVICE_API_KEY", "test_key")

        req_origin = (80.218185, 29.582861)
        req_dest = (80.250000, 29.600000)

        mock_route = _mock_geojson_route(req_origin, req_dest)
        ors_client = httpx.Client(transport=httpx.MockTransport(lambda req: httpx.Response(200, json=mock_route)))
        ors_provider = ORSRoutingProvider(api_key="mock-key", http_client=ors_client)
        mock_routing = RoutingService(provider=ors_provider, data_mode="LIVE")

        weather_payload = _mock_open_meteo_json(p24=8.0, p72=20.0)
        weather_client = httpx.Client(transport=httpx.MockTransport(lambda req: httpx.Response(200, json=weather_payload)))
        mock_weather = WeatherService(data_mode="LIVE", http_client=weather_client)

        with patch("backend.app.api.v1.route_analysis.analyze_route") as mock_analyze:
            from backend.app.services.analysis_service import analyze_route as real_analyze
            mock_analyze.side_effect = lambda *args, **kwargs: real_analyze(
                *args, **{**kwargs, "routing_service": mock_routing, "weather_service": mock_weather, "data_mode": "LIVE"}
            )

            res = client.post(
                "/api/v1/route/analyze",
                json={
                    "origin": {"latitude": req_origin[1], "longitude": req_origin[0]},
                    "destination": {"latitude": req_dest[1], "longitude": req_dest[0]},
                    # simulated_rainfall_mm is omitted
                },
            )

            assert res.status_code == 200
            data = res.json()
            assert data["data_provenance"]["weather_source"] == "OPEN_METEO"
            assert data["data_availability"]["weather"] is True


class TestSimulatedRainfallOverridePath:
    """Verifies that simulated_rainfall_mm overrides P24 while preserving background weather."""

    def test_simulated_rainfall_override_precedence_in_live_mode(self) -> None:
        """Requirement 3: simulated_rainfall_mm overrides P24 and updates weather_source."""
        req_origin = (80.218185, 29.582861)
        req_dest = (80.250000, 29.600000)

        mock_route = _mock_geojson_route(req_origin, req_dest)
        ors_client = httpx.Client(transport=httpx.MockTransport(lambda req: httpx.Response(200, json=mock_route)))
        ors_provider = ORSRoutingProvider(api_key="mock-key", http_client=ors_client)
        routing_svc = RoutingService(provider=ors_provider, data_mode="LIVE")

        weather_payload = _mock_open_meteo_json(p24=5.0, p72=18.0)
        weather_client = httpx.Client(transport=httpx.MockTransport(lambda req: httpx.Response(200, json=weather_payload)))
        weather_svc = WeatherService(data_mode="LIVE", http_client=weather_client)

        result = analyze_route(
            origin=req_origin,
            destination=req_dest,
            simulated_rainfall_mm=75.0,  # Explicit override
            routing_service=routing_svc,
            weather_service=weather_svc,
            data_mode="LIVE",
        )

        assert result.data_provenance.weather_source == "SIMULATED(75.0mm)"
        seg0 = result.routes[0].segments[0]
        # P24 must equal the simulated override
        assert seg0.p24_mm == 75.0
        # P72 and ARI must be preserved from the underlying weather service
        assert seg0.p72_mm is not None
        assert pytest.approx(seg0.p72_mm, abs=0.5) == 18.0
        assert seg0.ari_mm is not None

        # Heavy rain Pareto weights activated because 75.0 > 50.0mm
        route0 = result.routes[0]
        assert route0.objective is not None
        assert route0.objective.alpha == PARETO_ALERT_ALPHA
        assert route0.objective.beta == PARETO_ALERT_BETA
        assert route0.objective.is_heavy_rain_mode is True


class TestMissingWeatherBehavior:
    """Verifies system resilience when meteorological telemetry is unavailable."""

    def test_missing_weather_marks_availability_false_and_refuses_to_fabricate_risk(self) -> None:
        """Requirement 7: When weather telemetry is unavailable, weather=False, features are None, risk is None."""
        req_origin = (80.218185, 29.582861)
        req_dest = (80.250000, 29.600000)

        mock_route = _mock_geojson_route(req_origin, req_dest)
        ors_client = httpx.Client(transport=httpx.MockTransport(lambda req: httpx.Response(200, json=mock_route)))
        ors_provider = ORSRoutingProvider(api_key="mock-key", http_client=ors_client)
        routing_svc = RoutingService(provider=ors_provider, data_mode="LIVE")

        # Mock failing weather service (e.g. Open-Meteo returns 500)
        failing_weather_client = httpx.Client(
            transport=httpx.MockTransport(lambda req: httpx.Response(500, text="Internal Server Error"))
        )
        failing_weather_svc = WeatherService(data_mode="LIVE", http_client=failing_weather_client)

        result = analyze_route(
            origin=req_origin,
            destination=req_dest,
            simulated_rainfall_mm=None,
            routing_service=routing_svc,
            weather_service=failing_weather_svc,
            data_mode="LIVE",
        )

        # 1. Availability: weather is False
        assert result.data_availability.weather is False
        assert "p24_mm" in result.data_availability.missing_features
        assert "p72_mm" in result.data_availability.missing_features
        assert "ari_mm" in result.data_availability.missing_features

        # 2. Segments: rainfall fields are None
        route = result.routes[0]
        for seg in route.segments:
            assert seg.p24_mm is None
            assert seg.p72_mm is None
            assert seg.ari_mm is None
            assert seg.is_risk_complete is False
            assert seg.risk_result is None

        # 3. Route-level risk is NOT fabricated
        assert route.route_risk is None
        assert route.objective is None
        assert route.status == AnalysisStatus.PARTIAL
        assert route.recommendation_available is False
        assert route.recommendation_text == "PARTIAL_ASSESSMENT_MISSING_DATA"

    def test_missing_weather_api_advisory_text(self, client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
        """Requirement 7: API endpoint outputs transparent advisory when weather is unavailable."""
        monkeypatch.setattr(settings, "DATA_MODE", "LIVE")
        monkeypatch.setattr(settings, "OPENROUTESERVICE_API_KEY", "test_key")

        req_origin = (80.218185, 29.582861)
        req_dest = (80.250000, 29.600000)

        mock_route = _mock_geojson_route(req_origin, req_dest)
        ors_client = httpx.Client(transport=httpx.MockTransport(lambda req: httpx.Response(200, json=mock_route)))
        ors_provider = ORSRoutingProvider(api_key="mock-key", http_client=ors_client)
        mock_routing = RoutingService(provider=ors_provider, data_mode="LIVE")

        failing_weather_client = httpx.Client(
            transport=httpx.MockTransport(lambda req: httpx.Response(503, text="Service Unavailable"))
        )
        failing_weather_svc = WeatherService(data_mode="LIVE", http_client=failing_weather_client)

        with patch("backend.app.api.v1.route_analysis.analyze_route") as mock_analyze:
            from backend.app.services.analysis_service import analyze_route as real_analyze
            mock_analyze.side_effect = lambda *args, **kwargs: real_analyze(
                *args, **{**kwargs, "routing_service": mock_routing, "weather_service": failing_weather_svc, "data_mode": "LIVE"}
            )

            res = client.post(
                "/api/v1/route/analyze",
                json={
                    "origin": {"latitude": req_origin[1], "longitude": req_origin[0]},
                    "destination": {"latitude": req_dest[1], "longitude": req_dest[0]},
                },
            )

            assert res.status_code == 200
            data = res.json()
            assert data["status"] == "PARTIAL"
            assert data["data_availability"]["weather"] is False
            route0 = data["routes"][0]
            assert "precipitation telemetry is unavailable" in route0["advisory_text"].lower()
            assert "Risk engine scores are not fabricated" in route0["advisory_text"]
