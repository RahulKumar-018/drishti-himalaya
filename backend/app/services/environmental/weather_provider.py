"""Pluggable weather provider abstraction for Drishti-Himalaya.

Decouples weather acquisition from vendor APIs and enforces explicit source provenance.
GUARANTEE: Never claims "live" data unless a verified live provider successfully responds.
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass
from datetime import datetime, timezone
import json
import logging
import math
from pathlib import Path
import threading
import time
from typing import Any, Dict, List, Optional, Tuple

import httpx

logger = logging.getLogger(__name__)


@dataclass
class WeatherResult:
    """Standardized meteorological telemetry payload."""

    latitude: float
    longitude: float
    observation_time: datetime
    rainfall_mm: Optional[float] = None
    temperature_c: Optional[float] = None
    humidity_percent: Optional[float] = None
    wind_speed_kmh: Optional[float] = None
    precipitation_probability: Optional[float] = None
    forecast_time: Optional[datetime] = None
    source: str = "Unknown"
    source_type: str = "historical_dataset"  # historical_dataset | weather_api | manual | simulated
    is_live: bool = False
    raw_payload: Optional[Dict[str, Any]] = None
    p24_mm: Optional[float] = None
    p72_mm: Optional[float] = None
    ari_mm: Optional[float] = None
    wind_gusts_kmh: Optional[float] = None
    weather_code: Optional[int] = None
    snowfall_cm: Optional[float] = None
    retrieved_at: Optional[datetime] = None

    def to_dict(self) -> Dict[str, Any]:
        """Serialize to dictionary representation."""
        return {
            "latitude": self.latitude,
            "longitude": self.longitude,
            "observation_time": self.observation_time.isoformat(),
            "forecast_time": self.forecast_time.isoformat() if self.forecast_time else None,
            "rainfall_mm": self.rainfall_mm,
            "temperature_c": self.temperature_c,
            "humidity_percent": self.humidity_percent,
            "wind_speed_kmh": self.wind_speed_kmh,
            "precipitation_probability": self.precipitation_probability,
            "source": self.source,
            "source_type": self.source_type,
            "is_live": self.is_live,
            "p24_mm": self.p24_mm,
            "p72_mm": self.p72_mm,
            "ari_mm": self.ari_mm,
            "wind_gusts_kmh": self.wind_gusts_kmh,
            "weather_code": self.weather_code,
            "snowfall_cm": self.snowfall_cm,
            "retrieved_at": self.retrieved_at.isoformat() if self.retrieved_at else None,
        }


class BaseWeatherProvider(ABC):
    """Abstract base class for all weather providers."""

    @property
    @abstractmethod
    def provider_name(self) -> str:
        """Vendor or dataset identifier."""
        pass

    @property
    @abstractmethod
    def source_type(self) -> str:
        """Must be one of: 'historical_dataset', 'weather_api', 'manual', 'simulated'."""
        pass

    @property
    @abstractmethod
    def is_live(self) -> bool:
        """Whether this provider emits real-time verified sensor/satellite telemetry."""
        pass

    @abstractmethod
    def fetch_weather(
        self,
        latitude: float,
        longitude: float,
        observation_time: Optional[datetime] = None,
    ) -> WeatherResult:
        """Fetch meteorological metrics for given coordinates."""
        pass


class HistoricalWeatherProvider(BaseWeatherProvider):
    """Offline historical baseline provider using verified Himalayan meteorological records.

    Used when no external network connection is available or for reproducible backtesting.
    CRITICAL: source_type is strictly 'historical_dataset' and is_live is False.
    """

    def __init__(self, fixture_path: Optional[Path | str] = None) -> None:
        repo_root = Path(__file__).resolve().parents[4]
        default_path = repo_root / "data" / "fixtures" / "weather_baseline_uttarakhand.json"
        self._path = Path(fixture_path) if fixture_path else default_path
        self._data: Dict[str, Any] = {}
        self._load_data()

    def _load_data(self) -> None:
        if self._path.exists():
            try:
                with open(self._path, "r", encoding="utf-8") as f:
                    self._data = json.load(f)
            except Exception as exc:
                logger.warning("Failed to load historical weather fixture %s: %s", self._path, exc)
                self._data = {}

    @property
    def provider_name(self) -> str:
        return "Historical Uttarakhand Meteorological Baseline"

    @property
    def source_type(self) -> str:
        return "historical_dataset"

    @property
    def is_live(self) -> bool:
        return False

    def fetch_weather(
        self,
        latitude: float,
        longitude: float,
        observation_time: Optional[datetime] = None,
    ) -> WeatherResult:
        obs_time = observation_time or datetime.now(timezone.utc)
        # Baseline representative values from historical fixture or regional climate normal
        hist_rain = float(self._data.get("mean_daily_rainfall_mm", 4.2))
        hist_temp = float(self._data.get("mean_temperature_c", 16.5))
        hist_humidity = float(self._data.get("mean_humidity_percent", 62.0))
        hist_wind = float(self._data.get("mean_wind_speed_kmh", 8.5))
        hist_prob = float(self._data.get("mean_precipitation_probability_percent", 20.0))

        # Approximate baseline historical antecedent conditions
        p24 = hist_rain
        p72 = round(hist_rain * 3.0, 2)
        # 15-day baseline geometric decay for ARI
        daily_hist = [hist_rain] * 15
        from backend.app.risk_engine.constants import ARI_DRAINAGE_LAMBDA, ARI_WINDOW_DAYS
        from backend.app.risk_engine.scoring import calculate_ari

        ari = round(calculate_ari(daily_hist, decay_factor=ARI_DRAINAGE_LAMBDA, window_days=ARI_WINDOW_DAYS), 2)

        return WeatherResult(
            latitude=latitude,
            longitude=longitude,
            observation_time=obs_time,
            forecast_time=None,
            rainfall_mm=hist_rain,
            temperature_c=hist_temp,
            humidity_percent=hist_humidity,
            wind_speed_kmh=hist_wind,
            precipitation_probability=hist_prob,
            p24_mm=p24,
            p72_mm=p72,
            ari_mm=ari,
            source=self.provider_name,
            source_type=self.source_type,
            is_live=self.is_live,
            retrieved_at=datetime.now(timezone.utc),
            raw_payload={"dataset": "historical_baseline", "fixture": str(self._path.name)},
        )


class ManualWeatherProvider(BaseWeatherProvider):
    """Operator-provided field observation or emergency station report provider.

    Used when ground emergency responders provide verified local rain gauge / thermometer readings.
    CRITICAL: source_type is strictly 'manual' and is_live is False.
    """

    def __init__(
        self,
        rainfall_mm: Optional[float] = None,
        temperature_c: Optional[float] = None,
        humidity_percent: Optional[float] = None,
        wind_speed_kmh: Optional[float] = None,
        operator_note: Optional[str] = None,
    ) -> None:
        self.rainfall_mm = rainfall_mm
        self.temperature_c = temperature_c
        self.humidity_percent = humidity_percent
        self.wind_speed_kmh = wind_speed_kmh
        self.operator_note = operator_note or "Manual field station report"

    @property
    def provider_name(self) -> str:
        return "Manual Ground Station Report"

    @property
    def source_type(self) -> str:
        return "manual"

    @property
    def is_live(self) -> bool:
        return False

    def fetch_weather(
        self,
        latitude: float,
        longitude: float,
        observation_time: Optional[datetime] = None,
    ) -> WeatherResult:
        obs_time = observation_time or datetime.now(timezone.utc)
        p24 = self.rainfall_mm
        p72 = (self.rainfall_mm * 3.0) if self.rainfall_mm is not None else None
        ari = (self.rainfall_mm * 0.82) if self.rainfall_mm is not None else None
        return WeatherResult(
            latitude=latitude,
            longitude=longitude,
            observation_time=obs_time,
            forecast_time=None,
            rainfall_mm=self.rainfall_mm,
            temperature_c=self.temperature_c,
            humidity_percent=self.humidity_percent,
            wind_speed_kmh=self.wind_speed_kmh,
            precipitation_probability=None,
            p24_mm=p24,
            p72_mm=p72,
            ari_mm=ari,
            source=self.provider_name,
            source_type=self.source_type,
            is_live=self.is_live,
            retrieved_at=datetime.now(timezone.utc),
            raw_payload={"note": self.operator_note},
        )


class OpenMeteoProvider(BaseWeatherProvider):
    """Production-grade weather provider adapter for Open-Meteo API.

    Conforms to the BaseWeatherProvider abstraction and supports:
    - Current meteorological variables: temperature, humidity, precipitation, rain, snowfall, wind speed, gusts, weather code.
    - Hourly meteorological variables: precipitation, rain, snowfall, probability, etc.
    - Derived precipitation features: p24_mm (24h accumulation), p72_mm (72h accumulation), ari_mm (15-day Antecedent Rainfall Index).
    - Grid-based in-memory spatial caching with configurable TTL.
    - Strict provenance: source='open_meteo', source_type='weather_api', is_live=True (only when live response verified).
    - Graceful fallback to HistoricalWeatherProvider on network/HTTP error, timeout, or malformed response with downgraded provenance.
    """

    def __init__(
        self,
        base_url: Optional[str] = None,
        data_mode: Optional[str] = None,
        cache_ttl_seconds: Optional[float] = None,
        timeout_seconds: float = 5.0,
        max_retries: int = 2,
        http_client: Optional[httpx.Client] = None,
        fallback_provider: Optional[BaseWeatherProvider] = None,
    ) -> None:
        from backend.app.core.config import settings

        self.base_url = base_url or settings.OPEN_METEO_BASE_URL
        self.data_mode = (data_mode or settings.DATA_MODE).upper()
        self.cache_ttl_seconds = (
            cache_ttl_seconds
            if cache_ttl_seconds is not None
            else (settings.WEATHER_CACHE_TTL_HOURS * 3600.0)
        )
        self.timeout_seconds = timeout_seconds
        self.max_retries = max_retries
        self._http_client = http_client
        self._owned_client: Optional[httpx.Client] = None
        self._fallback = fallback_provider or HistoricalWeatherProvider()

        # Thread-safe in-memory cache: (round(lat, 2), round(lon, 2)) -> (WeatherResult, expire_ts)
        self._cache: Dict[Tuple[float, float], Tuple[WeatherResult, float]] = {}
        self._lock = threading.Lock()

    @property
    def provider_name(self) -> str:
        return "open_meteo"

    @property
    def source_type(self) -> str:
        return "weather_api"

    @property
    def is_live(self) -> bool:
        return True

    @property
    def cache_size(self) -> int:
        """Current number of active cached coordinates."""
        with self._lock:
            return len(self._cache)

    def clear_cache(self) -> None:
        """Evict all cached meteorological entries."""
        with self._lock:
            self._cache.clear()

    def _get_client(self) -> httpx.Client:
        if self._http_client is not None:
            return self._http_client
        if self._owned_client is None or self._owned_client.is_closed:
            self._owned_client = httpx.Client(timeout=self.timeout_seconds)
        return self._owned_client

    def close(self) -> None:
        """Close internally managed HTTP client."""
        if self._owned_client is not None and not self._owned_client.is_closed:
            self._owned_client.close()

    def __del__(self) -> None:
        try:
            self.close()
        except Exception:
            pass

    def _validate_coordinates(self, latitude: float, longitude: float) -> None:
        """Validate geographic coordinates."""
        if not (math.isfinite(latitude) and math.isfinite(longitude)):
            raise ValueError(f"Coordinates must be finite numbers, got lat={latitude}, lon={longitude}")
        if not (-90.0 <= latitude <= 90.0):
            raise ValueError(f"Latitude out of valid range [-90, 90]: {latitude}")
        if not (-180.0 <= longitude <= 180.0):
            raise ValueError(f"Longitude out of valid range [-180, 180]: {longitude}")

    def fetch_weather(
        self,
        latitude: float,
        longitude: float,
        observation_time: Optional[datetime] = None,
    ) -> WeatherResult:
        """Fetch normalized weather observation for coordinates with caching and historical fallback."""
        self._validate_coordinates(latitude, longitude)

        # Check in-memory coordinate cache
        cache_key = (round(latitude, 2), round(longitude, 2))
        now = time.time()
        with self._lock:
            if cache_key in self._cache:
                cached_res, expire_at = self._cache[cache_key]
                if now < expire_at:
                    return cached_res

        # If running in DEMO mode without an injected test client, use offline baseline fallback
        if self.data_mode == "DEMO" and self._http_client is None:
            logger.info("OpenMeteoProvider operating in DEMO mode; utilizing historical baseline fallback.")
            return self._fallback.fetch_weather(latitude, longitude, observation_time)

        # Query live Open-Meteo API
        params = {
            "latitude": latitude,
            "longitude": longitude,
            "current": "temperature_2m,relative_humidity_2m,precipitation,rain,snowfall,wind_speed_10m,wind_gusts_10m,weather_code",
            "hourly": "temperature_2m,relative_humidity_2m,precipitation,rain,snowfall,precipitation_probability,wind_speed_10m,wind_gusts_10m,weather_code",
            "past_days": 15,
            "forecast_days": 1,
            "timezone": "auto",
        }

        retries_remaining = self.max_retries
        for attempt in range(retries_remaining + 1):
            try:
                client = self._get_client()
                response = client.get(self.base_url, params=params)

                if response.status_code == 429 and attempt < retries_remaining:
                    time.sleep(0.3 * (attempt + 1))
                    continue

                if response.status_code != 200:
                    logger.warning(
                        "Open-Meteo API returned HTTP %s for (%s, %s); falling back to historical provider.",
                        response.status_code,
                        latitude,
                        longitude,
                    )
                    return self._fallback.fetch_weather(latitude, longitude, observation_time)

                data = response.json()
                result = self.parse_open_meteo_response(
                    data=data,
                    latitude=latitude,
                    longitude=longitude,
                    observation_time=observation_time,
                )

                # Store in coordinate cache on success
                with self._lock:
                    self._cache[cache_key] = (result, now + self.cache_ttl_seconds)

                return result

            except httpx.TimeoutException as exc:
                if attempt < retries_remaining:
                    time.sleep(0.2 * (attempt + 1))
                    continue
                logger.warning("Open-Meteo timed out for (%s, %s): %s; falling back to historical.", latitude, longitude, exc)
                return self._fallback.fetch_weather(latitude, longitude, observation_time)

            except httpx.RequestError as exc:
                if attempt < retries_remaining:
                    time.sleep(0.2 * (attempt + 1))
                    continue
                logger.warning("Network error querying Open-Meteo for (%s, %s): %s; falling back to historical.", latitude, longitude, exc)
                return self._fallback.fetch_weather(latitude, longitude, observation_time)

            except Exception as exc:
                logger.error("Unexpected error in OpenMeteoProvider for (%s, %s): %s; falling back to historical.", latitude, longitude, exc)
                return self._fallback.fetch_weather(latitude, longitude, observation_time)

        # Fallback if retry loop finishes without success
        return self._fallback.fetch_weather(latitude, longitude, observation_time)

    def fetch_forecast(
        self,
        latitude: float,
        longitude: float,
        target_time: datetime,
    ) -> WeatherResult:
        """Fetch forecast conditions for a future time, explicitly distinguishing from live observations.

        Preserves strict distinction: is_live=False, forecast_time=target_time.
        """
        current_res = self.fetch_weather(latitude, longitude)
        return WeatherResult(
            latitude=current_res.latitude,
            longitude=current_res.longitude,
            observation_time=current_res.retrieved_at or datetime.now(timezone.utc),
            forecast_time=target_time,
            rainfall_mm=current_res.rainfall_mm,
            temperature_c=current_res.temperature_c,
            humidity_percent=current_res.humidity_percent,
            wind_speed_kmh=current_res.wind_speed_kmh,
            precipitation_probability=current_res.precipitation_probability,
            p24_mm=current_res.p24_mm,
            p72_mm=current_res.p72_mm,
            ari_mm=current_res.ari_mm,
            wind_gusts_kmh=current_res.wind_gusts_kmh,
            weather_code=current_res.weather_code,
            snowfall_cm=current_res.snowfall_cm,
            source=current_res.source,
            source_type=current_res.source_type,
            is_live=False,  # Strict: forecast is NOT live observation
            retrieved_at=current_res.retrieved_at,
            raw_payload={**(current_res.raw_payload or {}), "is_forecast": True, "target_time": target_time.isoformat()},
        )

    def parse_open_meteo_response(
        self,
        data: Dict[str, Any],
        latitude: float,
        longitude: float,
        observation_time: Optional[datetime] = None,
    ) -> WeatherResult:
        """Parse raw Open-Meteo JSON into a standardized WeatherResult with derived rainfall features."""
        from backend.app.risk_engine.constants import ARI_DRAINAGE_LAMBDA, ARI_WINDOW_DAYS
        from backend.app.risk_engine.scoring import calculate_ari

        if not isinstance(data, dict):
            raise ValueError("Open-Meteo response payload must be a JSON dictionary.")

        curr = data.get("current") or {}
        hourly = data.get("hourly") or {}
        hourly_times: List[str] = hourly.get("time") or []
        hourly_precip = hourly.get("precipitation") or []
        hourly_probs = hourly.get("precipitation_probability") or []

        # Parse current values
        temp_c = curr.get("temperature_2m")
        humidity_pct = curr.get("relative_humidity_2m")
        rain_val = curr.get("rain", curr.get("precipitation"))
        snow_val = curr.get("snowfall")
        wind_kmh = curr.get("wind_speed_10m")
        gusts_kmh = curr.get("wind_gusts_10m")
        code_val = curr.get("weather_code")
        curr_time_str = curr.get("time")

        # Resolve observation time
        if observation_time is not None:
            obs_time = observation_time
        elif curr_time_str:
            try:
                obs_time = datetime.fromisoformat(curr_time_str).replace(tzinfo=timezone.utc)
            except Exception:
                obs_time = datetime.now(timezone.utc)
        else:
            obs_time = datetime.now(timezone.utc)

        # Sanitize hourly precipitation
        clean_hourly: List[float] = []
        for val in hourly_precip:
            if val is None or not math.isfinite(val) or val < 0.0:
                clean_hourly.append(0.0)
            else:
                clean_hourly.append(float(val))

        # Match current hour index in hourly series
        curr_idx = -1
        if curr_time_str and hourly_times:
            prefix = curr_time_str[:13]  # e.g., '2026-10-05T19'
            for idx, t_str in enumerate(hourly_times):
                if t_str.startswith(prefix):
                    curr_idx = idx
                    break

        if curr_idx == -1 and clean_hourly:
            # If forecast_days=1 (24 hours future), current hour is approximately len - 24
            curr_idx = max(0, len(clean_hourly) - 24) if len(clean_hourly) >= 24 else (len(clean_hourly) - 1)

        # Compute P24 (cumulative precipitation over previous 24 hours)
        p24_mm: float = 0.0
        if clean_hourly:
            if curr_idx >= 0:
                p24_chunk = clean_hourly[max(0, curr_idx - 23) : curr_idx + 1]
            else:
                p24_chunk = clean_hourly[-24:]
            p24_mm = round(float(sum(p24_chunk)), 2)

        # Compute P72 (cumulative precipitation over previous 72 hours)
        p72_mm: float = 0.0
        if clean_hourly:
            if curr_idx >= 0:
                p72_chunk = clean_hourly[max(0, curr_idx - 71) : curr_idx + 1]
            else:
                p72_chunk = clean_hourly[-72:]
            p72_mm = round(float(sum(p72_chunk)), 2)

        # Compute 15-day daily precipitation history for ARI
        daily_history_mm: List[float] = []
        daily = data.get("daily") or {}
        daily_precip = daily.get("precipitation_sum") or []

        if len(daily_precip) >= 2:
            # Exclude current/forecast day at index -1
            past_days = daily_precip[:-1]
            rev_days = list(reversed(past_days))
            for val in rev_days[:ARI_WINDOW_DAYS]:
                if val is not None and math.isfinite(val) and val >= 0.0:
                    daily_history_mm.append(round(float(val), 2))
                else:
                    daily_history_mm.append(0.0)

        # Fallback to hourly chunking backwards from curr_idx
        if len(daily_history_mm) < ARI_WINDOW_DAYS and clean_hourly:
            daily_history_mm = []
            ref_idx = curr_idx if curr_idx >= 0 else len(clean_hourly)
            for i in range(ARI_WINDOW_DAYS):
                end_idx = ref_idx - i * 24
                start_idx = ref_idx - (i + 1) * 24
                if start_idx >= 0:
                    chunk = clean_hourly[start_idx:end_idx]
                    daily_history_mm.append(round(float(sum(chunk)), 2))
                elif end_idx > 0:
                    chunk = clean_hourly[0:end_idx]
                    daily_history_mm.append(round(float(sum(chunk)), 2))
                else:
                    daily_history_mm.append(0.0)

        # Pad with 0.0 to ensure exactly ARI_WINDOW_DAYS (15 days)
        while len(daily_history_mm) < ARI_WINDOW_DAYS:
            daily_history_mm.append(0.0)

        ari_mm = round(
            calculate_ari(
                daily_history_mm,
                decay_factor=ARI_DRAINAGE_LAMBDA,
                window_days=ARI_WINDOW_DAYS,
            ),
            2,
        )

        # Resolve precipitation probability
        precip_prob: Optional[float] = None
        if hourly_probs:
            if curr_idx >= 0 and curr_idx < len(hourly_probs) and hourly_probs[curr_idx] is not None:
                precip_prob = float(hourly_probs[curr_idx])
            else:
                valid_probs = [float(p) for p in hourly_probs if p is not None and math.isfinite(p)]
                if valid_probs:
                    precip_prob = float(valid_probs[-1])

        retrieved_at = datetime.now(timezone.utc)

        return WeatherResult(
            latitude=latitude,
            longitude=longitude,
            observation_time=obs_time,
            forecast_time=None,  # Verified live current observation
            rainfall_mm=float(rain_val) if rain_val is not None else 0.0,
            temperature_c=float(temp_c) if temp_c is not None else None,
            humidity_percent=float(humidity_pct) if humidity_pct is not None else None,
            wind_speed_kmh=float(wind_kmh) if wind_kmh is not None else None,
            wind_gusts_kmh=float(gusts_kmh) if gusts_kmh is not None else None,
            precipitation_probability=precip_prob,
            weather_code=int(code_val) if code_val is not None else None,
            snowfall_cm=float(snow_val) if snow_val is not None else None,
            p24_mm=p24_mm,
            p72_mm=p72_mm,
            ari_mm=ari_mm,
            source="open_meteo",
            source_type="weather_api",
            is_live=True,
            retrieved_at=retrieved_at,
            raw_payload={
                "current": curr,
                "p24_mm": p24_mm,
                "p72_mm": p72_mm,
                "ari_mm": ari_mm,
                "daily_history_mm": daily_history_mm,
                "timezone": data.get("timezone", "auto"),
                "elevation": data.get("elevation"),
            },
        )


class ExternalWeatherProvider(BaseWeatherProvider):
    """Real external Weather API adapter preserving backward compatibility.

    Delegates to OpenMeteoProvider with identical fallback semantics.
    """

    def __init__(self, fallback_provider: Optional[BaseWeatherProvider] = None) -> None:
        self._provider = OpenMeteoProvider(fallback_provider=fallback_provider)

    @property
    def provider_name(self) -> str:
        return "Open-Meteo Weather API"

    @property
    def source_type(self) -> str:
        return "weather_api"

    @property
    def is_live(self) -> bool:
        return True

    def fetch_weather(
        self,
        latitude: float,
        longitude: float,
        observation_time: Optional[datetime] = None,
    ) -> WeatherResult:
        res = self._provider.fetch_weather(latitude, longitude, observation_time)
        return res
