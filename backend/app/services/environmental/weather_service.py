"""Weather data ingestion and persistence service for Drishti-Himalaya."""

from datetime import datetime, timezone
import logging
from typing import List, Optional
import uuid

from sqlalchemy.orm import Session

from backend.app.core.database import db_manager
from backend.app.models.weather_observation import WeatherObservation
from backend.app.services.environmental.weather_provider import (
    BaseWeatherProvider,
    ExternalWeatherProvider,
    HistoricalWeatherProvider,
    OpenMeteoProvider,
    WeatherResult,
)

logger = logging.getLogger(__name__)


class WeatherDataService:
    """Service for managing multi-source weather observations and historical series."""

    def __init__(self, provider: Optional[BaseWeatherProvider] = None) -> None:
        self.provider = provider or OpenMeteoProvider()

    def set_provider(self, provider: BaseWeatherProvider) -> None:
        """Switch active weather provider."""
        self.provider = provider

    def get_weather_for_coordinate(
        self,
        latitude: float,
        longitude: float,
        observation_time: Optional[datetime] = None,
        session: Optional[Session] = None,
        persist: bool = False,
        location_id: Optional[uuid.UUID] = None,
    ) -> WeatherResult:
        """Fetch weather data for geographic coordinate with provenance guarantee."""
        # Validation
        if not (-90.0 <= latitude <= 90.0):
            raise ValueError(f"Latitude out of range [-90, 90]: {latitude}")
        if not (-180.0 <= longitude <= 180.0):
            raise ValueError(f"Longitude out of range [-180, 180]: {longitude}")

        result = self.provider.fetch_weather(latitude, longitude, observation_time)

        # Validate result bounds
        if result.rainfall_mm is not None and result.rainfall_mm < 0.0:
            raise ValueError(f"Invalid negative rainfall: {result.rainfall_mm}")
        if result.temperature_c is not None and not (-60.0 <= result.temperature_c <= 60.0):
            raise ValueError(f"Temperature out of plausible range [-60, 60]: {result.temperature_c}")
        if result.humidity_percent is not None and not (0.0 <= result.humidity_percent <= 100.0):
            raise ValueError(f"Humidity out of range [0, 100]: {result.humidity_percent}")
        if result.wind_speed_kmh is not None and result.wind_speed_kmh < 0.0:
            raise ValueError(f"Invalid negative wind speed: {result.wind_speed_kmh}")

        if persist and session:
            self._persist_observation(session, result, location_id)

        return result

    def _persist_observation(
        self,
        session: Session,
        result: WeatherResult,
        location_id: Optional[uuid.UUID] = None,
    ) -> WeatherObservation:
        """Save observation record to database."""
        w_geom = f"SRID=4326;POINT({result.longitude} {result.latitude})"
        payload = dict(result.raw_payload or {})
        if result.p24_mm is not None:
            payload.setdefault("p24_mm", result.p24_mm)
        if result.p72_mm is not None:
            payload.setdefault("p72_mm", result.p72_mm)
        if result.ari_mm is not None:
            payload.setdefault("ari_mm", result.ari_mm)
        if result.wind_gusts_kmh is not None:
            payload.setdefault("wind_gusts_kmh", result.wind_gusts_kmh)
        if result.weather_code is not None:
            payload.setdefault("weather_code", result.weather_code)
        if result.snowfall_cm is not None:
            payload.setdefault("snowfall_cm", result.snowfall_cm)
        if result.retrieved_at is not None:
            payload.setdefault("retrieved_at", result.retrieved_at.isoformat())

        obs = WeatherObservation(
            location_id=location_id,
            latitude=result.latitude,
            longitude=result.longitude,
            location_geometry=w_geom,
            rainfall_mm=result.rainfall_mm,
            temperature_c=result.temperature_c,
            humidity_percent=result.humidity_percent,
            wind_speed_kmh=result.wind_speed_kmh,
            precipitation_probability=result.precipitation_probability,
            observation_time=result.observation_time,
            forecast_time=result.forecast_time,
            source=result.source,
            source_type=result.source_type,
            raw_payload=payload,
        )
        session.add(obs)
        session.flush()
        return obs

    def get_location_observations(
        self,
        session: Session,
        location_id: uuid.UUID,
        limit: int = 10,
    ) -> List[WeatherObservation]:
        """Query recent weather observations stored for a specific location."""
        return (
            session.query(WeatherObservation)
            .filter(WeatherObservation.location_id == location_id)
            .order_by(WeatherObservation.observation_time.desc())
            .limit(limit)
            .all()
        )


_global_weather_data_service: Optional[WeatherDataService] = None


def get_weather_data_service() -> WeatherDataService:
    """Return singleton instance of WeatherDataService."""
    global _global_weather_data_service
    if _global_weather_data_service is None:
        _global_weather_data_service = WeatherDataService(provider=OpenMeteoProvider())
    return _global_weather_data_service
