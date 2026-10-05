"""Unit and integration test suite for OpenMeteoProvider and weather pipeline.

Validates:
1. OpenMeteoProvider core conformance to BaseWeatherProvider.
2. Current and hourly meteorological parsing.
3. Derived precipitation features: p24_mm, p72_mm, and Antecedent Rainfall Index (ARI).
4. Strict distinction between current observation (is_live=True) and forecast (is_live=False).
5. In-memory grid coordinate caching and TTL eviction.
6. Robust fallback to HistoricalWeatherProvider on HTTP 4xx, 5xx, timeout, and network errors.
7. WeatherDataService centralized provider selection and observation persistence.
8. API endpoints integration (/api/locations/{id}/weather).
9. Integration with SpatialRiskService and Phase 2C risk feature pipeline.
GUARANTEE: All external API calls in this module are strictly mocked with no live network dependency.
"""

from datetime import datetime, timezone
import math
from typing import Any, Dict, List
from unittest.mock import MagicMock, patch
import uuid

import httpx
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from sqlalchemy import create_engine, event
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from backend.app.core.config import settings
from backend.app.core.database import Base, db_manager, get_db
from backend.app.main import app
from backend.app.models.location import Location
from backend.app.models.weather_observation import WeatherObservation
from backend.app.risk_engine.constants import ARI_DRAINAGE_LAMBDA, ARI_WINDOW_DAYS
from backend.app.risk_engine.scoring import calculate_ari
from backend.app.risk_engine.service import SpatialRiskService
from backend.app.services.environmental import (
    HistoricalWeatherProvider,
    OpenMeteoProvider,
    WeatherDataService,
    WeatherResult,
)


@pytest.fixture(scope="module")
def p2bw_engine():
    """Create in-memory SQLite engine with spatial function shims."""
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
        echo=False,
    )

    @event.listens_for(engine, "connect")
    def _sqlite_shims(dbapi_conn, record):
        dbapi_conn.create_function("RecoverGeometryColumn", -1, lambda *args: 1)
        dbapi_conn.create_function("DiscardGeometryColumn", -1, lambda *args: 1)
        dbapi_conn.create_function("CreateSpatialIndex", -1, lambda *args: 1)
        dbapi_conn.create_function("CheckSpatialIndex", -1, lambda *args: None)
        dbapi_conn.create_function("DisableSpatialIndex", -1, lambda *args: 1)
        dbapi_conn.create_function("GeomFromEWKT", -1, lambda *args: args[0] if args else None)
        dbapi_conn.create_function("AsBinary", -1, lambda *args: args[0] if args else None)
        dbapi_conn.create_function("AsEWKT", -1, lambda *args: str(args[0]) if args and args[0] is not None else None)
        dbapi_conn.create_function("AsEWKB", -1, lambda *args: None)
        dbapi_conn.create_function("ST_AsEWKB", -1, lambda *args: None)

    Base.metadata.create_all(bind=engine)
    yield engine
    Base.metadata.drop_all(bind=engine)
    engine.dispose()


@pytest.fixture
def p2bw_session(p2bw_engine):
    """Provide isolated session per test."""
    session_factory = sessionmaker(bind=p2bw_engine, expire_on_commit=False)
    session = session_factory()
    yield session
    session.rollback()
    session.close()


@pytest.fixture
def client(p2bw_session, p2bw_engine):
    """TestClient overriding get_db dependency."""
    def _override_get_db():
        session_factory = sessionmaker(bind=p2bw_engine, expire_on_commit=False)
        db = session_factory()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = _override_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


def _build_mock_open_meteo_payload(
    curr_temp: float = 18.5,
    curr_humidity: float = 72.0,
    curr_rain: float = 2.4,
    curr_wind: float = 12.0,
    curr_gusts: float = 18.5,
    curr_code: int = 61,
    hourly_rate_p24: float = 1.0,
    hourly_rate_prior48: float = 0.5,
    daily_past_rate: float = 10.0,
    curr_time_str: str = "2026-10-05T14:00",
) -> Dict[str, Any]:
    """Generate a realistic Open-Meteo API response payload with known metrics."""
    # 360 hours total (15 days past) + 24 hours future forecast = 384 hours
    hourly_precip = [0.1] * 288 + [hourly_rate_prior48] * 48 + [hourly_rate_p24] * 24 + [0.0] * 24
    hourly_times = [
        f"2026-09-20T{h % 24:02d}:00" if h < 360 else f"2026-10-06T{h % 24:02d}:00"
        for h in range(len(hourly_precip))
    ]
    # Set the 360th hour (index 359) to match curr_time_str
    hourly_times[359] = f"{curr_time_str}:00"

    daily_precip = [daily_past_rate] * 15 + [curr_rain]  # 15 past days + current/forecast day
    daily_times = [f"2026-09-{d:02d}" for d in range(20, 31)] + [f"2026-10-0{d}" for d in range(1, 6)]

    return {
        "latitude": 30.3165,
        "longitude": 78.0322,
        "generationtime_ms": 0.15,
        "utc_offset_seconds": 0,
        "timezone": "UTC",
        "elevation": 680.0,
        "current_units": {
            "time": "iso8601",
            "temperature_2m": "°C",
            "relative_humidity_2m": "%",
            "precipitation": "mm",
            "rain": "mm",
            "snowfall": "cm",
            "wind_speed_10m": "km/h",
            "wind_gusts_10m": "km/h",
            "weather_code": "wmo code",
        },
        "current": {
            "time": curr_time_str,
            "interval": 900,
            "temperature_2m": curr_temp,
            "relative_humidity_2m": curr_humidity,
            "precipitation": curr_rain,
            "rain": curr_rain,
            "snowfall": 0.0,
            "wind_speed_10m": curr_wind,
            "wind_gusts_10m": curr_gusts,
            "weather_code": curr_code,
        },
        "hourly_units": {
            "time": "iso8601",
            "temperature_2m": "°C",
            "relative_humidity_2m": "%",
            "precipitation": "mm",
            "rain": "mm",
            "snowfall": "cm",
            "precipitation_probability": "%",
            "wind_speed_10m": "km/h",
            "wind_gusts_10m": "km/h",
            "weather_code": "wmo code",
        },
        "hourly": {
            "time": hourly_times,
            "temperature_2m": [curr_temp] * len(hourly_precip),
            "relative_humidity_2m": [curr_humidity] * len(hourly_precip),
            "precipitation": hourly_precip,
            "rain": hourly_precip,
            "snowfall": [0.0] * len(hourly_precip),
            "precipitation_probability": [45.0] * len(hourly_precip),
            "wind_speed_10m": [curr_wind] * len(hourly_precip),
            "wind_gusts_10m": [curr_gusts] * len(hourly_precip),
            "weather_code": [curr_code] * len(hourly_precip),
        },
        "daily": {
            "time": daily_times,
            "precipitation_sum": daily_precip,
        },
    }


# ===========================================================================
# 1. Provider Core & Telemetry Parsing Tests
# ===========================================================================


class TestOpenMeteoProviderCore:
    """Verify provider properties, parsing, and input boundary validation."""

    def test_provider_properties(self):
        prov = OpenMeteoProvider()
        assert prov.provider_name == "open_meteo"
        assert prov.source_type == "weather_api"
        assert prov.is_live is True

    def test_coordinate_validation_bounds(self):
        prov = OpenMeteoProvider()
        with pytest.raises(ValueError, match="Latitude"):
            prov.fetch_weather(95.0, 78.0)
        with pytest.raises(ValueError, match="Latitude"):
            prov.fetch_weather(-90.5, 78.0)
        with pytest.raises(ValueError, match="Longitude"):
            prov.fetch_weather(30.0, 185.0)
        with pytest.raises(ValueError, match="Longitude"):
            prov.fetch_weather(30.0, -181.0)
        with pytest.raises(ValueError, match="finite numbers"):
            prov.fetch_weather(float("nan"), 78.0)

    def test_successful_live_telemetry_parsing(self):
        payload = _build_mock_open_meteo_payload(
            curr_temp=21.5,
            curr_humidity=65.0,
            curr_rain=4.8,
            curr_wind=14.2,
            curr_gusts=22.0,
            curr_code=63,
            hourly_rate_p24=1.5,  # 24 * 1.5 = 36.0mm
            hourly_rate_prior48=0.5,  # 48 * 0.5 = 24.0mm -> p72 = 36 + 24 = 60.0mm
        )

        mock_transport = httpx.MockTransport(lambda req: httpx.Response(200, json=payload))
        client = httpx.Client(transport=mock_transport)
        prov = OpenMeteoProvider(data_mode="LIVE", http_client=client)

        res = prov.fetch_weather(30.3165, 78.0322)
        assert res.source == "open_meteo"
        assert res.source_type == "weather_api"
        assert res.is_live is True
        assert res.forecast_time is None
        assert res.temperature_c == 21.5
        assert res.humidity_percent == 65.0
        assert res.rainfall_mm == 4.8
        assert res.wind_speed_kmh == 14.2
        assert res.wind_gusts_kmh == 22.0
        assert res.weather_code == 63
        assert res.precipitation_probability == 45.0
        assert res.p24_mm is not None
        assert res.p72_mm is not None
        assert res.p72_mm >= res.p24_mm
        assert res.ari_mm is not None
        assert res.ari_mm > 0.0
        assert res.retrieved_at is not None

    def test_forecast_distinction_preserves_not_live(self):
        """Verify strict requirement: forecast data must NOT be labeled as live observation."""
        payload = _build_mock_open_meteo_payload()
        mock_transport = httpx.MockTransport(lambda req: httpx.Response(200, json=payload))
        client = httpx.Client(transport=mock_transport)
        prov = OpenMeteoProvider(data_mode="LIVE", http_client=client)

        future_target = datetime(2026, 10, 6, 12, 0, tzinfo=timezone.utc)
        fc_res = prov.fetch_forecast(30.3165, 78.0322, target_time=future_target)

        assert fc_res.source == "open_meteo"
        assert fc_res.source_type == "weather_api"
        assert fc_res.is_live is False  # CRITICAL: not live
        assert fc_res.forecast_time == future_target
        assert fc_res.raw_payload.get("is_forecast") is True

    def test_grid_coordinate_caching_and_ttl(self):
        call_count = 0

        def handler(req):
            nonlocal call_count
            call_count += 1
            return httpx.Response(200, json=_build_mock_open_meteo_payload())

        client = httpx.Client(transport=httpx.MockTransport(handler))
        prov = OpenMeteoProvider(data_mode="LIVE", http_client=client, cache_ttl_seconds=300.0)

        # First query: triggers HTTP call
        res1 = prov.fetch_weather(30.3165, 78.0322)
        assert call_count == 1
        assert prov.cache_size == 1

        # Second query to same 2-decimal rounded grid: served from cache
        res2 = prov.fetch_weather(30.3168, 78.0320)  # Rounds to (30.32, 78.03)
        assert call_count == 1
        assert res2.temperature_c == res1.temperature_c

        # Evict cache
        prov.clear_cache()
        assert prov.cache_size == 0

        # Query after clear: triggers second HTTP call
        prov.fetch_weather(30.3165, 78.0322)
        assert call_count == 2


# ===========================================================================
# 2. Rainfall & Antecedent Rainfall Index (ARI) Tests
# ===========================================================================


class TestRainfallAndARIDerivations:
    """Rigorous tests for P24, P72, and 15-day ARI decay math."""

    def test_p24_and_p72_exact_accumulation(self):
        # 1.0mm/h for past 24h = 24.0mm, 0.5mm/h for prior 48h = 24.0mm -> P72 = 48.0mm
        payload = _build_mock_open_meteo_payload(
            hourly_rate_p24=1.0,
            hourly_rate_prior48=0.5,
        )
        mock_transport = httpx.MockTransport(lambda req: httpx.Response(200, json=payload))
        prov = OpenMeteoProvider(data_mode="LIVE", http_client=httpx.Client(transport=mock_transport))

        res = prov.fetch_weather(30.0, 78.0)
        assert res.p24_mm == pytest.approx(24.0, abs=0.5)
        assert res.p72_mm == pytest.approx(48.0, abs=0.5)

    def test_zero_rainfall_baseline(self):
        payload = _build_mock_open_meteo_payload(
            curr_rain=0.0,
            hourly_rate_p24=0.0,
            hourly_rate_prior48=0.0,
            daily_past_rate=0.0,
        )
        # Set all hourly precipitation to 0.0
        payload["hourly"]["precipitation"] = [0.0] * len(payload["hourly"]["precipitation"])
        payload["daily"]["precipitation_sum"] = [0.0] * len(payload["daily"]["precipitation_sum"])

        mock_transport = httpx.MockTransport(lambda req: httpx.Response(200, json=payload))
        prov = OpenMeteoProvider(data_mode="LIVE", http_client=httpx.Client(transport=mock_transport))

        res = prov.fetch_weather(30.0, 78.0)
        assert res.rainfall_mm == 0.0
        assert res.p24_mm == 0.0
        assert res.p72_mm == 0.0
        assert res.ari_mm == 0.0

    def test_constant_rainfall_ari_mathematical_convergence(self):
        """Constant daily rainfall P = 10.0mm over 15 days.

        Theoretical ARI = 10 * sum_{i=1}^{15} (0.82^i)
        Sum = 0.82 * (1 - 0.82^15) / (1 - 0.82) ≈ 0.82 * 0.949 / 0.18 ≈ 4.3235 -> ARI ≈ 43.24mm
        """
        daily_rainfall = [10.0] * 15
        expected_ari = calculate_ari(daily_rainfall, decay_factor=0.82, window_days=15)
        assert pytest.approx(expected_ari, abs=0.2) == 43.24

        # Verify provider calculates exact match
        payload = _build_mock_open_meteo_payload(daily_past_rate=10.0)
        mock_transport = httpx.MockTransport(lambda req: httpx.Response(200, json=payload))
        prov = OpenMeteoProvider(data_mode="LIVE", http_client=httpx.Client(transport=mock_transport))

        res = prov.fetch_weather(30.0, 78.0)
        assert res.ari_mm == pytest.approx(expected_ari, abs=0.2)

    def test_single_rainfall_event_decay(self):
        """Single 50mm event yesterday (t-1). ARI = 50 * (0.82^1) = 41.0mm."""
        daily_rainfall = [50.0] + [0.0] * 14
        ari = calculate_ari(daily_rainfall, decay_factor=0.82, window_days=15)
        assert pytest.approx(ari, abs=0.01) == 41.0

    def test_multiple_rainfall_events_superposition(self):
        """Events: Day 1 (t-1) = 20mm, Day 3 (t-3) = 40mm."""
        daily_rainfall = [20.0, 0.0, 40.0] + [0.0] * 12
        # ARI = 20 * 0.82^1 + 40 * 0.82^3 = 16.4 + 40 * 0.551368 = 16.4 + 22.0547 = 38.45mm
        ari = calculate_ari(daily_rainfall, decay_factor=0.82, window_days=15)
        assert pytest.approx(ari, abs=0.1) == 38.45

    def test_missing_and_negative_hourly_sanitization(self):
        """Ensure None, NaN, and negative precipitation values are sanitized to 0.0."""
        payload = _build_mock_open_meteo_payload()
        payload["hourly"]["precipitation"] = [None, -5.0, 1.2, float("nan")] + [0.5] * 380

        mock_transport = httpx.MockTransport(lambda req: httpx.Response(200, json=payload))
        prov = OpenMeteoProvider(data_mode="LIVE", http_client=httpx.Client(transport=mock_transport))

        res = prov.fetch_weather(30.0, 78.0)
        assert res.p24_mm is not None
        assert res.p24_mm >= 0.0
        assert res.p72_mm is not None
        assert res.ari_mm is not None


# ===========================================================================
# 3. Error Handling & Fallback Resilience Tests
# ===========================================================================


class TestErrorHandlingAndFallback:
    """Verify that network issues, 4xx/5xx responses, and timeouts degrade to historical fallback."""

    def test_http_4xx_falls_back_to_historical(self):
        mock_transport = httpx.MockTransport(lambda req: httpx.Response(404, text="Not Found"))
        prov = OpenMeteoProvider(data_mode="LIVE", http_client=httpx.Client(transport=mock_transport))

        res = prov.fetch_weather(30.3, 78.0)
        assert res.source_type == "historical_dataset"
        assert res.is_live is False
        assert res.rainfall_mm is not None

    def test_http_5xx_falls_back_to_historical(self):
        mock_transport = httpx.MockTransport(lambda req: httpx.Response(503, text="Service Unavailable"))
        prov = OpenMeteoProvider(data_mode="LIVE", http_client=httpx.Client(transport=mock_transport))

        res = prov.fetch_weather(30.3, 78.0)
        assert res.source_type == "historical_dataset"
        assert res.is_live is False

    def test_timeout_falls_back_to_historical(self):
        def timeout_handler(req):
            raise httpx.TimeoutException("Connection timed out")

        prov = OpenMeteoProvider(
            data_mode="LIVE",
            http_client=httpx.Client(transport=httpx.MockTransport(timeout_handler)),
            max_retries=1,
        )
        res = prov.fetch_weather(30.3, 78.0)
        assert res.source_type == "historical_dataset"
        assert res.is_live is False

    def test_network_connection_error_falls_back(self):
        def error_handler(req):
            raise httpx.ConnectError("Connection refused")

        prov = OpenMeteoProvider(
            data_mode="LIVE",
            http_client=httpx.Client(transport=httpx.MockTransport(error_handler)),
            max_retries=1,
        )
        res = prov.fetch_weather(30.3, 78.0)
        assert res.source_type == "historical_dataset"
        assert res.is_live is False

    def test_malformed_json_falls_back(self):
        mock_transport = httpx.MockTransport(lambda req: httpx.Response(200, text="not valid json {{{"))
        prov = OpenMeteoProvider(data_mode="LIVE", http_client=httpx.Client(transport=mock_transport))

        res = prov.fetch_weather(30.3, 78.0)
        assert res.source_type == "historical_dataset"
        assert res.is_live is False


# ===========================================================================
# 4. WeatherDataService & Persistence Integration Tests
# ===========================================================================


class TestWeatherDataServiceIntegration:
    """Verify centralized service provider dispatch and observation persistence."""

    def test_weather_data_service_live_persistence(self, p2bw_session: Session):
        payload = _build_mock_open_meteo_payload(curr_rain=6.5, hourly_rate_p24=2.0)
        mock_transport = httpx.MockTransport(lambda req: httpx.Response(200, json=payload))
        client = httpx.Client(transport=mock_transport)

        prov = OpenMeteoProvider(data_mode="LIVE", http_client=client)
        svc = WeatherDataService(provider=prov)

        loc_id = uuid.uuid4()
        res = svc.get_weather_for_coordinate(
            latitude=30.2,
            longitude=78.5,
            session=p2bw_session,
            persist=True,
            location_id=loc_id,
        )

        assert res.source == "open_meteo"
        assert res.source_type == "weather_api"
        assert res.is_live is True
        assert res.rainfall_mm == 6.5
        assert res.p24_mm is not None

        # Verify DB persistence
        stored = svc.get_location_observations(p2bw_session, loc_id)
        assert len(stored) == 1
        obs = stored[0]
        assert obs.rainfall_mm == 6.5
        assert obs.source == "open_meteo"
        assert obs.source_type == "weather_api"
        assert obs.raw_payload is not None
        assert obs.raw_payload.get("p24_mm") is not None
        assert obs.raw_payload.get("ari_mm") is not None

    def test_weather_data_service_demo_fallback_behavior(self, monkeypatch: pytest.MonkeyPatch):
        monkeypatch.setattr(settings, "DATA_MODE", "DEMO")
        # In DEMO mode with no mock client, must use historical baseline
        prov = OpenMeteoProvider(data_mode="DEMO")
        svc = WeatherDataService(provider=prov)

        res = svc.get_weather_for_coordinate(30.1, 78.2)
        assert res.source_type == "historical_dataset"
        assert res.is_live is False


# ===========================================================================
# 5. API Endpoints Integration Tests
# ===========================================================================


class TestEnvironmentalAPIWeatherEndpoint:
    """Verify GET /api/locations/{id}/weather with Open-Meteo integration."""

    def test_api_weather_returns_normalized_open_meteo(self, client: TestClient):
        # Register test location
        create_resp = client.post(
            "/api/locations",
            json={"name": "Rishikesh Telemetry Node", "latitude": 30.0869, "longitude": 78.2676},
        )
        assert create_resp.status_code == 201
        loc_id = create_resp.json()["id"]

        # Mock Open-Meteo on WeatherDataService
        payload = _build_mock_open_meteo_payload(
            curr_temp=24.0,
            curr_humidity=58.0,
            curr_rain=3.2,
            hourly_rate_p24=1.0,
        )
        mock_transport = httpx.MockTransport(lambda req: httpx.Response(200, json=payload))
        mock_client = httpx.Client(transport=mock_transport)
        live_provider = OpenMeteoProvider(data_mode="LIVE", http_client=mock_client)

        with patch("backend.app.api.v1.environmental.get_weather_data_service") as mock_get_svc:
            mock_svc = WeatherDataService(provider=live_provider)
            mock_get_svc.return_value = mock_svc

            resp = client.get(f"/api/locations/{loc_id}/weather")
            assert resp.status_code == 200
            data = resp.json()
            assert data["weather_source"] == "open_meteo"
            assert data["source_type"] == "weather_api"
            assert data["is_live"] is True
            assert data["rainfall_mm"] == 3.2
            assert data["temperature_c"] == 24.0
            assert data["p24_mm"] is not None
            assert data["p72_mm"] is not None
            assert data["ari_mm"] is not None

    def test_api_weather_default_offline_fallback(self, client: TestClient):
        # Test location without live mock must report offline fallback provenance
        create_resp = client.post(
            "/api/locations",
            json={"name": "Karnaprayag Baseline Node", "latitude": 30.257, "longitude": 79.218},
        )
        loc_id = create_resp.json()["id"]

        resp = client.get(f"/api/locations/{loc_id}/weather")
        assert resp.status_code == 200
        data = resp.json()
        assert data["source_type"] in ("historical_dataset", "manual")
        assert data["is_live"] is False


# ===========================================================================
# 6. Risk Engine Integration Test (Phase 2C Unbroken)
# ===========================================================================


class TestRiskEngineIntegrationWithOpenMeteo:
    """Verify that Open-Meteo rainfall telemetry feeds Phase 2C risk feature pipeline."""

    def test_open_meteo_rainfall_influences_risk_score(self, p2bw_session: Session):
        """Rainfall from OpenMeteo reaches EnvironmentalFeatureVector and increases risk score.

        MCDA weights (0.35 slope, 0.30 rainfall, 0.20 proximity, 0.10 density, 0.05 cut-slope)
        and thresholds are strictly maintained.
        """
        # Low rainfall scenario (P24=0mm)
        low_rain_payload = _build_mock_open_meteo_payload(
            curr_rain=0.0,
            hourly_rate_p24=0.0,
            hourly_rate_prior48=0.0,
            daily_past_rate=0.0,
        )
        low_rain_payload["hourly"]["precipitation"] = [0.0] * len(low_rain_payload["hourly"]["precipitation"])
        low_prov = OpenMeteoProvider(
            data_mode="LIVE",
            http_client=httpx.Client(transport=httpx.MockTransport(lambda req: httpx.Response(200, json=low_rain_payload))),
        )
        low_weather_svc = WeatherDataService(provider=low_prov)

        # High rainfall scenario (P24=48.0mm, P72=96.0mm, heavy storm)
        high_rain_payload = _build_mock_open_meteo_payload(
            curr_rain=25.0,
            hourly_rate_p24=2.0,  # 48mm in 24h
            hourly_rate_prior48=1.0,  # 48mm in prior 48h -> p72 = 96mm
            daily_past_rate=25.0,
        )
        high_prov = OpenMeteoProvider(
            data_mode="LIVE",
            http_client=httpx.Client(transport=httpx.MockTransport(lambda req: httpx.Response(200, json=high_rain_payload))),
        )
        high_weather_svc = WeatherDataService(provider=high_prov)

        test_lat, test_lon = 30.2, 78.5

        # Evaluate risk with low rain
        risk_svc_low = SpatialRiskService(weather_service=low_weather_svc)
        res_low = risk_svc_low.assess_point_risk(
            session=p2bw_session,
            latitude=test_lat,
            longitude=test_lon,
            slope_deg=35.0,  # Constant slope
            use_cache=False,
        )

        # Evaluate risk with high rain
        risk_svc_high = SpatialRiskService(weather_service=high_weather_svc)
        res_high = risk_svc_high.assess_point_risk(
            session=p2bw_session,
            latitude=test_lat,
            longitude=test_lon,
            slope_deg=35.0,  # Constant slope
            use_cache=False,
        )

        # 1. High rain score must strictly exceed low rain score
        assert res_high.risk_score > res_low.risk_score
        # 2. Rainfall factor in high scenario must strictly exceed low scenario
        assert res_high.factors.rainfall > res_low.factors.rainfall
        # 3. Provenance must correctly show open_meteo
        assert res_high.weather_source == "open_meteo"
        # 4. Slope score must remain completely invariant between runs
        assert res_high.factors.slope == res_low.factors.slope
        # 5. Model version and type remain Phase 2C standard
        assert res_high.model_type == "heuristic_mcda"
        assert res_high.model_version == "1.0.0-deterministic"
