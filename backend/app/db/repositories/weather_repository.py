"""Repository implementation for meteorological weather snapshots."""

from datetime import datetime
from typing import Any, Dict, List, Optional
import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.app.db.repositories.base import BaseRepository
from backend.app.models.weather import WeatherSnapshot


class WeatherSnapshotRepository(BaseRepository[WeatherSnapshot]):
    """Data access repository for WeatherSnapshot records."""

    def __init__(self, session: Session) -> None:
        super().__init__(WeatherSnapshot, session)

    def get_exact(
        self,
        source: str,
        latitude: float,
        longitude: float,
        observed_at: datetime,
    ) -> Optional[WeatherSnapshot]:
        """Fetch exact snapshot by source, coordinates, and observation time."""
        stmt = (
            select(WeatherSnapshot)
            .where(
                WeatherSnapshot.source == source,
                WeatherSnapshot.latitude == latitude,
                WeatherSnapshot.longitude == longitude,
                WeatherSnapshot.observed_at == observed_at,
            )
        )
        return self.session.scalars(stmt).first()

    def record_snapshot(
        self,
        latitude: float,
        longitude: float,
        observed_at: datetime,
        source: str = "Open-Meteo",
        precipitation_mm: Optional[float] = None,
        precipitation_24h_mm: Optional[float] = None,
        precipitation_72h_mm: Optional[float] = None,
        temperature_c: Optional[float] = None,
        convective_rain_mm: Optional[float] = None,
        raw_payload: Optional[Dict[str, Any]] = None,
    ) -> WeatherSnapshot:
        """Create or update a weather observation record idempotently."""
        existing = self.get_exact(source, latitude, longitude, observed_at)
        if existing is not None:
            existing.precipitation_mm = precipitation_mm
            existing.precipitation_24h_mm = precipitation_24h_mm
            existing.precipitation_72h_mm = precipitation_72h_mm
            existing.temperature_c = temperature_c
            existing.convective_rain_mm = convective_rain_mm
            existing.raw_payload = raw_payload
            return existing

        snapshot = WeatherSnapshot(
            latitude=latitude,
            longitude=longitude,
            observed_at=observed_at,
            source=source,
            precipitation_mm=precipitation_mm,
            precipitation_24h_mm=precipitation_24h_mm,
            precipitation_72h_mm=precipitation_72h_mm,
            temperature_c=temperature_c,
            convective_rain_mm=convective_rain_mm,
            raw_payload=raw_payload,
        )
        return self.add(snapshot)

    def list_history_for_point(
        self,
        latitude: float,
        longitude: float,
        tolerance_deg: float = 0.05,
        limit: int = 100,
    ) -> List[WeatherSnapshot]:
        """Fetch historical snapshots near coordinate ordered by observation time descending."""
        stmt = (
            select(WeatherSnapshot)
            .where(
                WeatherSnapshot.latitude.between(latitude - tolerance_deg, latitude + tolerance_deg),
                WeatherSnapshot.longitude.between(longitude - tolerance_deg, longitude + tolerance_deg),
            )
            .order_by(WeatherSnapshot.observed_at.desc())
            .limit(limit)
        )
        return list(self.session.scalars(stmt).all())
