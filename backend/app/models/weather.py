"""Weather snapshot database model for meteorological observations and forecasts."""

from datetime import datetime
from typing import Any, Dict, Optional
import uuid

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    Float,
    Index,
    String,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.types import JSON

from backend.app.core.database import Base
from backend.app.models.base import GUID, utc_now


class WeatherSnapshot(Base):
    """Timestamped meteorological observation or forecast record at corridor coordinate."""

    __tablename__ = "weather_snapshots"
    __table_args__ = (
        CheckConstraint("latitude >= -90.0 AND latitude <= 90.0", name="chk_weather_lat_bounds"),
        CheckConstraint("longitude >= -180.0 AND longitude <= 180.0", name="chk_weather_lon_bounds"),
        UniqueConstraint("source", "latitude", "longitude", "observed_at", name="uq_weather_source_loc_time"),
        Index("idx_weather_observed_at", "observed_at"),
        Index("idx_weather_loc", "latitude", "longitude"),
    )

    id: Mapped[uuid.UUID] = mapped_column(GUID(), primary_key=True, default=uuid.uuid4)
    latitude: Mapped[float] = mapped_column(Float, nullable=False)
    longitude: Mapped[float] = mapped_column(Float, nullable=False)
    observed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    source: Mapped[str] = mapped_column(String(100), default="Open-Meteo", nullable=False)
    precipitation_mm: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    precipitation_24h_mm: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    precipitation_72h_mm: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    temperature_c: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    convective_rain_mm: Mapped[Optional[float]] = mapped_column(Float, nullable=True)

    # Raw telemetry payload (JSONB on PostgreSQL, standard JSON on SQLite)
    raw_payload: Mapped[Optional[Dict[str, Any]]] = mapped_column(
        JSONB().with_variant(JSON, "sqlite"),
        nullable=True,
    )

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)

    def __repr__(self) -> str:
        return f"<WeatherSnapshot id={self.id} src={self.source} p24={self.precipitation_24h_mm} time={self.observed_at}>"
