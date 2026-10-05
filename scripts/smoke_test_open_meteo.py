"""LIVE SMOKE TEST for Open-Meteo Weather Integration.

Coordinates: Uttarakhand (Dehradun / Garhwal baseline: Lat 30.3165, Lon 78.0322)
Purpose: Verify live HTTP query, payload parsing, derived rainfall calculations,
         and provenance preservation against the live Open-Meteo forecast API.

THIS IS EXCLUSIVELY A LIVE SMOKE TEST — NOT A UNIT TEST.
DO NOT RUN IN AUTOMATED CI ENVIRONMENTS WITHOUT INTERNET CONNECTIVITY.
"""

from datetime import datetime, timezone
import json
import logging
from pathlib import Path
import sys

# Ensure repository root is on sys.path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
logger = logging.getLogger("LIVE_SMOKE_TEST")


def run_live_smoke_test() -> bool:
    print("=" * 70)
    print("      DRISHTI HIMALAYA — PHASE 2B-W: OPEN-METEO LIVE SMOKE TEST")
    print("=" * 70)

    from backend.app.services.environmental.weather_provider import OpenMeteoProvider, WeatherResult

    # Test coordinates: Dehradun, Uttarakhand (smoke test only)
    smoke_lat = 30.3165
    smoke_lon = 78.0322

    print(f"\n[1/7] Target Coordinate: Latitude {smoke_lat}, Longitude {smoke_lon}")
    print("      Endpoint: https://api.open-meteo.com/v1/forecast")

    # Instantiate provider in LIVE mode with standard timeouts
    provider = OpenMeteoProvider(data_mode="LIVE", timeout_seconds=10.0)

    # 1. Fetch live weather
    print("\n[2/7] Dispatching live HTTP request to Open-Meteo API...")
    try:
        result: WeatherResult = provider.fetch_weather(smoke_lat, smoke_lon)
    except Exception as exc:
        print(f"FAILED: Unexpected exception querying Open-Meteo: {exc}")
        return False

    print("      HTTP Request: SUCCESS")

    # 2. Check current weather metrics
    print("\n[3/7] Current Weather Telemetry:")
    print(f"      Temperature:               {result.temperature_c} °C")
    print(f"      Relative Humidity:         {result.humidity_percent} %")
    print(f"      Current Rainfall:          {result.rainfall_mm} mm")
    print(f"      Wind Speed (10m):          {result.wind_speed_kmh} km/h")
    print(f"      Wind Gusts (10m):          {result.wind_gusts_kmh} km/h")
    print(f"      Weather Code (WMO):        {result.weather_code}")
    print(f"      Snowfall:                  {result.snowfall_cm} cm")
    print(f"      Precipitation Probability: {result.precipitation_probability} %")

    # 3. Check derived precipitation metrics
    print("\n[4/7] Derived Hydro-Meteorological Features:")
    print(f"      P24 (24h cumulative):      {result.p24_mm} mm")
    print(f"      P72 (72h cumulative):      {result.p72_mm} mm")
    print(f"      ARI (15-day Antecedent):   {result.ari_mm} mm")

    # 4. Check data provenance
    print("\n[5/7] Provenance & Integrity Audit:")
    print(f"      Source:                    {result.source}")
    print(f"      Source Type:               {result.source_type}")
    print(f"      Is Live Telemetry:         {result.is_live}")
    print(f"      Observation Time:          {result.observation_time.isoformat()}")
    print(f"      Retrieved At:              {result.retrieved_at.isoformat() if result.retrieved_at else None}")

    # 5. Check forecast vs current distinction
    print("\n[6/7] Forecast vs Current Verification:")
    future_time = datetime(2026, 10, 6, 12, 0, tzinfo=timezone.utc)
    fc_result = provider.fetch_forecast(smoke_lat, smoke_lon, target_time=future_time)
    print(f"      Forecast Is Live:          {fc_result.is_live} (Expected: False)")
    print(f"      Forecast Time:             {fc_result.forecast_time.isoformat() if fc_result.forecast_time else None}")

    # 6. Check caching
    print("\n[7/7] In-Memory Cache Verification:")
    print(f"      Cache entries before query: {provider.cache_size}")
    cached_result = provider.fetch_weather(smoke_lat, smoke_lon)
    print(f"      Cache entries after query:  {provider.cache_size} (Expected: 1)")
    print(f"      Cached temp equals live:   {cached_result.temperature_c == result.temperature_c}")

    # Validations
    assert result.is_live is True, "Live observation must have is_live = True"
    assert result.source == "open_meteo", "Source must be 'open_meteo'"
    assert result.source_type == "weather_api", "Source type must be 'weather_api'"
    assert result.temperature_c is not None, "Temperature must not be None"
    assert result.p24_mm is not None and result.p24_mm >= 0.0, "p24_mm must be valid"
    assert result.p72_mm is not None and result.p72_mm >= result.p24_mm, "p72_mm must be >= p24_mm"
    assert result.ari_mm is not None and result.ari_mm >= 0.0, "ari_mm must be non-negative"
    assert fc_result.is_live is False, "Forecast must not claim live observation"

    print("\n" + "=" * 70)
    print("      LIVE SMOKE TEST RESULT: ALL 8 VERIFICATIONS PASSED SUCCESSFULLY")
    print("=" * 70 + "\n")
    return True


if __name__ == "__main__":
    success = run_live_smoke_test()
    sys.exit(0 if success else 1)
