"""Meteorological weather ingestion service and Antecedent Rainfall Index (ARI) engine.

Supports:
- DEMO mode: Deterministic local weather baseline fixtures (no internet calls).
- LIVE mode: Real-time telemetry ingestion from the Open-Meteo API.
- 24h, 72h, and 15-day antecedent precipitation accounting with lambda=0.82 drainage decay.
- Thread-safe, grid-based in-memory caching to minimize redundant network traffic.
"""

from datetime import datetime, timezone
import json
import logging
import math
from pathlib import Path
import time
from typing import Any, Dict, List, Optional, Sequence, Tuple
import httpx

from backend.app.core.config import settings
from backend.app.risk_engine.constants import ARI_DRAINAGE_LAMBDA, ARI_WINDOW_DAYS
from backend.app.risk_engine.scoring import calculate_ari
from backend.app.routing.models import RouteSegment
from backend.app.services.weather_models import WeatherFeatures, WeatherQueryResult

logger = logging.getLogger(__name__)

DEFAULT_FIXTURE_PATH = Path("data/fixtures/weather_baseline.json")


class WeatherService:
    """Service client for ingesting precipitation observations and deriving saturation indices."""

    def __init__(
        self,
        data_mode: Optional[str] = None,
        base_url: Optional[str] = None,
        cache_ttl_hours: Optional[int] = None,
        fixture_path: Optional[Path | str] = None,
        timeout_seconds: float = 5.0,
        http_client: Optional[httpx.Client] = None,
    ) -> None:
        self.data_mode = (data_mode or settings.DATA_MODE).upper()
        self.base_url = base_url or settings.OPEN_METEO_BASE_URL
        self.cache_ttl_seconds = (cache_ttl_hours or settings.WEATHER_CACHE_TTL_HOURS) * 3600
        self.fixture_path = Path(fixture_path) if fixture_path is not None else DEFAULT_FIXTURE_PATH
        self.timeout_seconds = timeout_seconds
        self._http_client = http_client

        # In-memory spatial cache: key=(round(lon, 2), round(lat, 2)), value=(WeatherFeatures, expire_timestamp)
        self._cache: Dict[Tuple[float, float], Tuple[WeatherFeatures, float]] = {}

    @property
    def cache_size(self) -> int:
        """Current number of items stored in in-memory cache."""
        return len(self._cache)

    def clear_cache(self) -> None:
        """Evict all cached meteorological entries."""
        self._cache.clear()

    def _validate_coordinates(self, longitude: float, latitude: float) -> None:
        """Validate geographic coordinate sanity."""
        if not (math.isfinite(longitude) and math.isfinite(latitude)):
            raise ValueError(f"Coordinates must be finite real numbers, got lon={longitude}, lat={latitude}")
        if not (-180.0 <= longitude <= 180.0):
            raise ValueError(f"Longitude out of valid range [-180, 180]: {longitude}")
        if not (-90.0 <= latitude <= 90.0):
            raise ValueError(f"Latitude out of valid range [-90, 90]: {latitude}")

    def query_weather(self, longitude: float, latitude: float) -> WeatherQueryResult:
        """Retrieve weather observations and compute P24, P72, and ARI for a given coordinate."""
        self._validate_coordinates(longitude, latitude)

        # Check local in-memory cache
        cache_key = (round(longitude, 2), round(latitude, 2))
        now = time.time()
        if cache_key in self._cache:
            features, expire_at = self._cache[cache_key]
            if now < expire_at:
                return WeatherQueryResult(is_available=True, features=features, cached=True)

        # Dispatch based on operating mode
        if self.data_mode == "DEMO":
            result = self._fetch_demo_weather(longitude, latitude)
        else:
            result = self._fetch_live_open_meteo(longitude, latitude)

        # Cache on successful retrieval
        if result.is_available and result.features is not None:
            self._cache[cache_key] = (result.features, now + self.cache_ttl_seconds)

        return result

    def get_weather_features(self, longitude: float, latitude: float) -> Optional[WeatherFeatures]:
        """Convenience method returning WeatherFeatures directly, or None if unavailable."""
        res = self.query_weather(longitude, latitude)
        return res.features if res.is_available else None

    def get_weather_for_segment(self, segment: RouteSegment) -> Optional[WeatherFeatures]:
        """Retrieve meteorological features for a single route segment's geometric midpoint."""
        lon, lat = segment.midpoint
        return self.get_weather_features(lon, lat)

    def get_weather_for_segments(
        self,
        segments: Sequence[RouteSegment],
    ) -> Dict[int, Optional[WeatherFeatures]]:
        """Retrieve meteorological features for all segments along a route, utilizing cache across nearby midpoints."""
        results: Dict[int, Optional[WeatherFeatures]] = {}
        for seg in segments:
            results[seg.segment_index] = self.get_weather_for_segment(seg)
        return results

    def _fetch_demo_weather(self, longitude: float, latitude: float) -> WeatherQueryResult:
        """Load deterministic baseline weather observation from offline fixture file."""
        if not self.fixture_path.exists():
            return WeatherQueryResult(
                is_available=False,
                error_message=f"DEMO weather baseline fixture not found at {self.fixture_path}",
            )

        try:
            with open(self.fixture_path, "r", encoding="utf-8") as f:
                data = json.load(f)

            default_data = data.get("default", {})
            p24 = float(default_data.get("p24_mm", 0.0))
            p72 = float(default_data.get("p72_mm", 0.0))
            raw_history = default_data.get("daily_history_mm", [])
            daily_history = [float(x) for x in raw_history[:ARI_WINDOW_DAYS]]

            # Ensure exactly 15 days
            while len(daily_history) < ARI_WINDOW_DAYS:
                daily_history.append(0.0)

            # Calculate ARI using the documented 0.82 lambda decay rule
            ari = calculate_ari(
                daily_history,
                decay_factor=ARI_DRAINAGE_LAMBDA,
                window_days=ARI_WINDOW_DAYS,
            )

            features = WeatherFeatures(
                p24_mm=p24,
                p72_mm=p72,
                ari_mm=ari,
                daily_history_mm=daily_history,
                observed_at=data.get("generated_at", datetime.now(timezone.utc).isoformat()),
                source="DEMO_BASELINE",
            )
            return WeatherQueryResult(is_available=True, features=features, cached=False)

        except Exception as e:
            logger.error(f"Failed to parse DEMO weather fixture: {e}")
            return WeatherQueryResult(
                is_available=False,
                error_message=f"Failed to read DEMO fixture: {e}",
            )

    def _fetch_live_open_meteo(self, longitude: float, latitude: float) -> WeatherQueryResult:
        """Fetch observational precipitation data from Open-Meteo API and compute P24, P72, and ARI."""
        params = {
            "latitude": latitude,
            "longitude": longitude,
            "hourly": "precipitation",
            "daily": "precipitation_sum",
            "past_days": 15,
            "forecast_days": 1,
            "timezone": "UTC",
        }

        try:
            client = self._http_client or httpx.Client(timeout=self.timeout_seconds)
            try:
                response = client.get(self.base_url, params=params)
            finally:
                if self._http_client is None:
                    client.close()

            if response.status_code != 200:
                return WeatherQueryResult(
                    is_available=False,
                    error_message=f"Open-Meteo returned HTTP {response.status_code}: {response.text[:100]}",
                )

            data = response.json()
            return self.parse_open_meteo_response(data)

        except httpx.TimeoutException:
            logger.warning(f"Open-Meteo request timed out for ({longitude}, {latitude})")
            return WeatherQueryResult(
                is_available=False,
                error_message=f"Open-Meteo request timed out after {self.timeout_seconds}s",
            )
        except httpx.RequestError as e:
            logger.warning(f"Network error querying Open-Meteo: {e}")
            return WeatherQueryResult(
                is_available=False,
                error_message=f"Network error querying Open-Meteo: {e}",
            )
        except Exception as e:
            logger.error(f"Unexpected error querying Open-Meteo: {e}")
            return WeatherQueryResult(
                is_available=False,
                error_message=f"Unexpected weather ingestion error: {e}",
            )

    @staticmethod
    def parse_open_meteo_response(data: dict[str, Any]) -> WeatherQueryResult:
        """Parse raw Open-Meteo JSON response into normalized WeatherFeatures."""
        if not isinstance(data, dict):
            return WeatherQueryResult(is_available=False, error_message="Response payload is not a valid JSON object.")

        hourly = data.get("hourly")
        daily = data.get("daily")

        if not hourly or not isinstance(hourly, dict) or "precipitation" not in hourly:
            return WeatherQueryResult(
                is_available=False,
                error_message="Missing required 'hourly.precipitation' in Open-Meteo payload.",
            )

        hourly_precip = hourly.get("precipitation")
        if not isinstance(hourly_precip, list) or len(hourly_precip) == 0:
            return WeatherQueryResult(
                is_available=False,
                error_message="'hourly.precipitation' is empty or invalid.",
            )

        # Filter and sanitize precipitation values
        clean_hourly: List[float] = []
        for val in hourly_precip:
            if val is None or not math.isfinite(val) or val < 0.0:
                clean_hourly.append(0.0)
            else:
                clean_hourly.append(float(val))

        # 24-hour and 72-hour cumulative precipitation
        p24 = float(sum(clean_hourly[-24:])) if len(clean_hourly) >= 24 else float(sum(clean_hourly))
        p72 = float(sum(clean_hourly[-72:])) if len(clean_hourly) >= 72 else float(sum(clean_hourly))

        # 15-day daily precipitation history for ARI calculation:
        # P_{t-1} is yesterday, P_{t-2} is 2 days ago, ..., P_{t-15} is 15 days ago.
        daily_history: List[float] = []

        if daily and isinstance(daily, dict) and "precipitation_sum" in daily:
            daily_precip = daily.get("precipitation_sum", [])
            # In Open-Meteo with forecast_days=1, last element [-1] is today's forecast/partial.
            # Day t-1 (yesterday) is [-2], Day t-2 is [-3], etc.
            if len(daily_precip) >= 2:
                past_days = daily_precip[:-1]  # exclude today
                # Reverse to get [yesterday, 2 days ago, ...]
                rev_days = list(reversed(past_days))
                for val in rev_days[:ARI_WINDOW_DAYS]:
                    if val is not None and math.isfinite(val) and val >= 0.0:
                        daily_history.append(float(val))
                    else:
                        daily_history.append(0.0)

        # Fallback: compute 24-hour daily chunks backwards from hourly if daily is absent
        if len(daily_history) < ARI_WINDOW_DAYS:
            daily_history = []
            for day_i in range(ARI_WINDOW_DAYS):
                end_idx = len(clean_hourly) - day_i * 24
                start_idx = len(clean_hourly) - (day_i + 1) * 24
                if start_idx >= 0:
                    chunk = clean_hourly[start_idx:end_idx]
                    daily_history.append(float(sum(chunk)))
                else:
                    daily_history.append(0.0)

        # Ensure exactly 15 days length
        while len(daily_history) < ARI_WINDOW_DAYS:
            daily_history.append(0.0)

        # Derive Antecedent Rainfall Index
        ari = calculate_ari(
            daily_history,
            decay_factor=ARI_DRAINAGE_LAMBDA,
            window_days=ARI_WINDOW_DAYS,
        )

        observed_at = datetime.now(timezone.utc).isoformat()

        features = WeatherFeatures(
            p24_mm=p24,
            p72_mm=p72,
            ari_mm=ari,
            daily_history_mm=daily_history,
            observed_at=observed_at,
            source="OPEN_METEO",
        )
        return WeatherQueryResult(is_available=True, features=features, cached=False)


# Default singleton instance
_default_weather_service: Optional[WeatherService] = None


def get_weather_service() -> WeatherService:
    """Return application-wide weather service singleton."""
    global _default_weather_service
    if _default_weather_service is None:
        _default_weather_service = WeatherService()
    return _default_weather_service
