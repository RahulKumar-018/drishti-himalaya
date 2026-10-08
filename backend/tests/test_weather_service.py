"""Unit and integration tests for meteorological weather ingestion and ARI engine (Phase 7).

Verifies:
- Input coordinate validation
- Extraction and aggregation of 24h, 72h, and 15-day antecedent precipitation
- Antecedent Rainfall Index (ARI) mathematical adherence to lambda=0.82 decay
- Controlled Phase-3 MCDA rainfall score integration
- Deterministic offline DEMO mode execution via weather_baseline.json
- LIVE Open-Meteo parsing via mocked provider responses
- Resilient error handling (timeouts, HTTP errors, malformed payloads)
- In-memory spatial cache efficiency and provenance preservation
"""

import math
import httpx
import pytest

from backend.app.risk_engine.constants import (
    ARI_DRAINAGE_LAMBDA,
    ARI_WINDOW_DAYS,
    THRESHOLD_ARI_MM,
    THRESHOLD_P24_MM,
    THRESHOLD_P72_MM,
    WEIGHT_RAIN_ARI,
    WEIGHT_RAIN_P24,
    WEIGHT_RAIN_P72,
)
from backend.app.risk_engine.scoring import calculate_ari, rainfall_score
from backend.app.routing.models import RouteSegment
from backend.app.services.weather_models import WeatherFeatures, WeatherQueryResult
from backend.app.services.weather_service import WeatherService, get_weather_service


@pytest.fixture
def demo_weather_service():
    """Create a WeatherService instance configured in DEMO mode."""
    return WeatherService(data_mode="DEMO")


@pytest.fixture
def sample_open_meteo_payload():
    """Construct realistic Open-Meteo mock response with 15 days of hourly precipitation (360 hours)."""
    # 360 hours total: 15 days * 24 hours
    # Set known hourly precipitation:
    # - Last 24 hours: 2.0 mm/hr -> 48.0 mm
    # - Prior 48 hours (hours -72 to -24): 1.0 mm/hr -> 48.0 mm
    # Total P72 = 48.0 + 48.0 = 96.0 mm
    # - Remaining earlier hours (hours 0 to 288): 0.5 mm/hr -> 12.0 mm per day
    hourly_precip = [0.5] * 288 + [1.0] * 48 + [2.0] * 24
    assert len(hourly_precip) == 360

    # Daily precipitation sums for 16 days (15 past days + 1 forecast day)
    # Day 0 to 11: 12.0 mm, Day 12: 24.0 mm, Day 13: 24.0 mm, Day 14 (yesterday): 48.0 mm, Day 15 (today): 10.0 mm
    daily_sums = [12.0] * 12 + [24.0, 24.0, 48.0, 10.0]

    return {
        "latitude": 30.15,
        "longitude": 78.45,
        "timezone": "UTC",
        "hourly": {
            "time": [f"2026-10-01T{h:02d}:00" for h in range(len(hourly_precip))],
            "precipitation": hourly_precip,
        },
        "daily": {
            "time": [f"2026-09-{d:02d}" for d in range(15, 31)] + ["2026-10-01"],
            "precipitation_sum": daily_sums,
        },
    }


class TestWeatherServiceCoordinatesAndValidation:
    """Tests for geographic input coordinate validation."""

    def test_valid_coordinate_accepted(self, demo_weather_service):
        """Valid Uttarakhand coordinates must be accepted without error."""
        result = demo_weather_service.query_weather(longitude=78.35, latitude=30.12)
        assert result.is_available is True
        assert result.features is not None
        assert result.features.p24_mm >= 0.0

    def test_invalid_coordinate_rejected_out_of_range_lon(self, demo_weather_service):
        """Longitude outside [-180, 180] must raise ValueError."""
        with pytest.raises(ValueError, match="Longitude.*out of valid range"):
            demo_weather_service.query_weather(longitude=195.0, latitude=30.0)

    def test_invalid_coordinate_rejected_out_of_range_lat(self, demo_weather_service):
        """Latitude outside [-90, 90] must raise ValueError."""
        with pytest.raises(ValueError, match="Latitude.*out of valid range"):
            demo_weather_service.query_weather(longitude=78.0, latitude=95.0)

    def test_invalid_coordinate_rejected_nan(self, demo_weather_service):
        """Non-finite coordinates must raise ValueError."""
        with pytest.raises(ValueError, match="finite real numbers"):
            demo_weather_service.query_weather(longitude=float("nan"), latitude=30.0)


class TestRainfallParsingAndARI:
    """Tests for P24, P72, and Antecedent Rainfall Index (ARI) mathematical computation."""

    def test_24h_rainfall_parsed_correctly(self, sample_open_meteo_payload):
        """P24 must equal the sum of the most recent 24 hours of hourly precipitation."""
        result = WeatherService.parse_open_meteo_response(sample_open_meteo_payload)
        assert result.is_available is True
        assert result.features is not None
        # 24 hours * 2.0 mm = 48.0 mm
        assert pytest.approx(result.features.p24_mm, abs=1e-3) == 48.0

    def test_72h_rainfall_parsed_correctly(self, sample_open_meteo_payload):
        """P72 must equal the sum of the most recent 72 hours of precipitation."""
        result = WeatherService.parse_open_meteo_response(sample_open_meteo_payload)
        assert result.is_available is True
        assert result.features is not None
        # 48 hours * 1.0 mm + 24 hours * 2.0 mm = 96.0 mm
        assert pytest.approx(result.features.p72_mm, abs=1e-3) == 96.0

    def test_15_day_rainfall_history_parsed_correctly(self, sample_open_meteo_payload):
        """15-day rainfall history must contain exactly 15 daily precipitation values."""
        result = WeatherService.parse_open_meteo_response(sample_open_meteo_payload)
        assert result.is_available is True
        assert result.features is not None
        assert len(result.features.daily_history_mm) == 15
        # First entry P_{t-1} is yesterday: 48.0 mm
        assert pytest.approx(result.features.daily_history_mm[0], abs=1e-3) == 48.0

    def test_ari_matches_lambda_082_rule(self):
        """ARI must calculate sum_{i=1}^{15} (0.82)^i * P_{t-i}."""
        # Scenario 1: Only 10mm fell yesterday (day 1 prior)
        history_1 = [10.0] + [0.0] * 14
        ari_1 = calculate_ari(history_1, decay_factor=0.82, window_days=15)
        # Expected: 0.82^1 * 10 = 8.20 mm
        assert pytest.approx(ari_1, abs=1e-4) == 8.20

        # Scenario 2: Only 10mm fell 2 days ago (day 2 prior)
        history_2 = [0.0, 10.0] + [0.0] * 13
        ari_2 = calculate_ari(history_2, decay_factor=0.82, window_days=15)
        # Expected: 0.82^2 * 10 = 6.724 mm
        assert pytest.approx(ari_2, abs=1e-4) == 6.724

        # Older rainfall has decayed more
        assert ari_1 > ari_2

    def test_zero_rainfall_gives_zero_ari(self):
        """Zero rainfall across all 15 days must result in 0.0 ARI."""
        zero_history = [0.0] * 15
        ari = calculate_ari(zero_history, decay_factor=ARI_DRAINAGE_LAMBDA, window_days=ARI_WINDOW_DAYS)
        assert ari == 0.0

    def test_increasing_historical_rain_increases_ari(self):
        """Increasing antecedent rainfall amounts strictly increases ARI."""
        history_light = [5.0] * 15
        history_heavy = [25.0] * 15
        ari_light = calculate_ari(history_light)
        ari_heavy = calculate_ari(history_heavy)
        assert ari_heavy > ari_light

    def test_rainfall_score_integration_matches_phase3_formula(self):
        """WeatherFeatures.rainfall_score must match Phase-3 S_rain formula exactly."""
        # Threshold saturation: P24=75, P72=140, ARI=200 -> Score = 100.0
        wf_thresh = WeatherFeatures(
            p24_mm=THRESHOLD_P24_MM,
            p72_mm=THRESHOLD_P72_MM,
            ari_mm=THRESHOLD_ARI_MM,
            daily_history_mm=[0.0] * 15,
            observed_at="2026-10-01T00:00:00Z",
            source="TEST",
        )
        assert pytest.approx(wf_thresh.rainfall_score, abs=1e-4) == 100.0

        # Half saturation:
        wf_half = WeatherFeatures(
            p24_mm=THRESHOLD_P24_MM / 2.0,
            p72_mm=THRESHOLD_P72_MM / 2.0,
            ari_mm=THRESHOLD_ARI_MM / 2.0,
            daily_history_mm=[0.0] * 15,
            observed_at="2026-10-01T00:00:00Z",
            source="TEST",
        )
        assert pytest.approx(wf_half.rainfall_score, abs=1e-4) == 50.0


class TestModesAndMockedLiveIngestion:
    """Tests for DEMO mode offline reliability, LIVE mocked ingestion, and provenance preservation."""

    def test_demo_baseline_works_without_internet(self, demo_weather_service):
        """DEMO mode must load from local baseline fixture without network access."""
        res = demo_weather_service.query_weather(78.5, 30.2)
        assert res.is_available is True
        assert res.features is not None
        assert res.features.source == "DEMO_BASELINE"
        assert res.features.p24_mm > 0.0
        assert res.features.ari_mm > 0.0
        assert len(res.features.daily_history_mm) == 15

    def test_live_response_parsing_works_using_mocked_provider_response(self, sample_open_meteo_payload):
        """LIVE response parsing works when Open-Meteo returns HTTP 200 payload."""

        def handler(request: httpx.Request) -> httpx.Response:
            return httpx.Response(200, json=sample_open_meteo_payload)

        transport = httpx.MockTransport(handler)
        client = httpx.Client(transport=transport)
        service = WeatherService(data_mode="LIVE", http_client=client)

        res = service.query_weather(78.45, 30.15)
        assert res.is_available is True
        assert res.features is not None
        assert res.features.source == "OPEN_METEO"
        assert pytest.approx(res.features.p24_mm, abs=1e-2) == 48.0
        assert pytest.approx(res.features.p72_mm, abs=1e-2) == 96.0

    def test_weather_source_provenance_preserved(self, demo_weather_service, sample_open_meteo_payload):
        """Provenance must distinctly reflect DEMO_BASELINE vs OPEN_METEO."""
        res_demo = demo_weather_service.query_weather(78.5, 30.2)
        assert res_demo.features.source == "DEMO_BASELINE"

        res_live = WeatherService.parse_open_meteo_response(sample_open_meteo_payload)
        assert res_live.features.source == "OPEN_METEO"


class TestErrorHandlingAndResilience:
    """Tests verifying robust handling of network timeouts, HTTP errors, and malformed payloads."""

    def test_timeout_handled(self):
        """Network timeout must return is_available=False with clear error rather than crashing."""

        def handler(request: httpx.Request) -> httpx.Response:
            raise httpx.TimeoutException("Connection timed out after 5.0s")

        transport = httpx.MockTransport(handler)
        client = httpx.Client(transport=transport)
        service = WeatherService(data_mode="LIVE", http_client=client)

        res = service.query_weather(78.5, 30.2)
        assert res.is_available is False
        assert res.features is None
        assert "timed out" in (res.error_message or "").lower()

    def test_http_error_handled(self):
        """HTTP 500 or 429 status code must return is_available=False with diagnostic message."""

        def handler(request: httpx.Request) -> httpx.Response:
            return httpx.Response(503, text="Service Unavailable")

        transport = httpx.MockTransport(handler)
        client = httpx.Client(transport=transport)
        service = WeatherService(data_mode="LIVE", http_client=client)

        res = service.query_weather(78.5, 30.2)
        assert res.is_available is False
        assert "503" in (res.error_message or "")

    def test_malformed_provider_response_handled_missing_hourly(self):
        """Payload missing 'hourly.precipitation' must be gracefully rejected without crashing."""
        malformed = {"latitude": 30.0, "longitude": 78.0, "timezone": "UTC"}
        res = WeatherService.parse_open_meteo_response(malformed)
        assert res.is_available is False
        assert "missing" in (res.error_message or "").lower()

    def test_malformed_provider_response_handled_non_dict(self):
        """Non-dictionary payload must return is_available=False."""
        res = WeatherService.parse_open_meteo_response("not a dict")  # type: ignore
        assert res.is_available is False


class TestCachingAndSegmentIntegration:
    """Tests for in-memory spatial grid caching and route segment integration."""

    def test_repeated_requests_use_local_cache(self, demo_weather_service):
        """Subsequent queries for nearby coordinates must hit the local in-memory cache."""
        demo_weather_service.clear_cache()
        assert demo_weather_service.cache_size == 0

        # First query: populates cache
        res1 = demo_weather_service.query_weather(78.451, 30.152)
        assert res1.is_available is True
        assert res1.cached is False
        assert demo_weather_service.cache_size == 1

        # Second query (same 0.01 grid bucket): served from cache
        res2 = demo_weather_service.query_weather(78.452, 30.154)
        assert res2.is_available is True
        assert res2.cached is True

    def test_route_segment_weather_retrieval(self, demo_weather_service):
        """Weather can be queried directly for a Phase-5 RouteSegment instance."""
        seg = RouteSegment(
            segment_index=0,
            start_chainage_km=0.0,
            end_chainage_km=0.25,
            segment_length_m=250.0,
            start_coord=(78.45, 30.15),
            end_coord=(78.452, 30.152),
            midpoint=(78.451, 30.151),
            geometry_coords=[(78.45, 30.15), (78.452, 30.152)],
        )

        wf = demo_weather_service.get_weather_for_segment(seg)
        assert wf is not None
        assert isinstance(wf, WeatherFeatures)
        assert wf.p24_mm >= 0.0
        assert wf.ari_mm >= 0.0


class TestWeatherAlertThresholdsAndAvailability:
    """Verify deterministic meteorological alert thresholds and missing telemetry handling."""

    def test_rainfall_alert_threshold_boundaries(self):
        """Verify strict classification of boundary values: 24.9, 25.0, 49.9, 50.0, 74.9, 75.0."""
        from backend.app.api.v1.weather import _determine_alert_level
        from backend.app.schemas.common import AlertLevel

        assert _determine_alert_level(0.0) == AlertLevel.GREEN
        assert _determine_alert_level(24.9) == AlertLevel.GREEN
        assert _determine_alert_level(25.0) == AlertLevel.YELLOW
        assert _determine_alert_level(49.9) == AlertLevel.YELLOW
        assert _determine_alert_level(50.0) == AlertLevel.ORANGE
        assert _determine_alert_level(74.9) == AlertLevel.ORANGE
        assert _determine_alert_level(75.0) == AlertLevel.RED
        assert _determine_alert_level(120.0) == AlertLevel.RED

    def test_missing_weather_is_unknown_never_green(self):
        """Critical safety invariant: missing weather telemetry must NEVER default to 0.0 mm or GREEN."""
        from backend.app.api.v1.weather import _determine_alert_level
        from backend.app.schemas.common import AlertLevel

        assert _determine_alert_level(None) == AlertLevel.UNKNOWN
        assert _determine_alert_level(None) != AlertLevel.GREEN
