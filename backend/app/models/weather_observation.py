"""Extensible weather observation model supporting multi-source meteorological inputs."""

from datetime import datetime
from typing import Any, Dict, Optional, TYPE_CHECKING
import uuid

if TYPE_CHECKING:
    from backend.app.models.location import Location

from geoalchemy2 import Geometry
from sqlalchemy import (
    CheckConstraint,
    DateTime,
    Float,
    ForeignKey,
    Index,
    String,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.types import JSON

from backend.app.core.database import Base
from backend.app.models.base import GUID, utc_now

SUPPORTED_SOURCE_TYPES = (
    "historical_dataset",
    "weather_api",
    "manual",
    "simulated",
)


class WeatherObservation(Base):
    """Extensible meteorological observation or forecast record.

    Explicitly differentiates between historical datasets, live API telemetry,
    manual inputs, and simulated scenarios with strict provenance and domain bounds.
    """

    __tablename__ = "weather_observations"
    __table_args__ = (
        CheckConstraint("latitude >= -90.0 AND latitude <= 90.0", name="chk_wobs_lat_bounds"),
        CheckConstraint("longitude >= -180.0 AND longitude <= 180.0", name="chk_wobs_lon_bounds"),
        CheckConstraint(
            "rainfall_mm IS NULL OR rainfall_mm >= 0.0",
            name="chk_wobs_rainfall_positive",
        ),
        CheckConstraint(
            "temperature_c IS NULL OR (temperature_c >= -60.0 AND temperature_c <= 60.0)",
            name="chk_wobs_temp_bounds",
        ),
        CheckConstraint(
            "humidity_percent IS NULL OR (humidity_percent >= 0.0 AND humidity_percent <= 100.0)",
            name="chk_wobs_humidity_bounds",
        ),
        CheckConstraint(
            "wind_speed_kmh IS NULL OR wind_speed_kmh >= 0.0",
            name="chk_wobs_wind_bounds",
        ),
        CheckConstraint(
            "precipitation_probability IS NULL OR (precipitation_probability >= 0.0 AND precipitation_probability <= 100.0)",
            name="chk_wobs_precip_prob_bounds",
        ),
        CheckConstraint(
            f"source_type IN {SUPPORTED_SOURCE_TYPES}",
            name="chk_wobs_source_type",
        ),
        Index("idx_wobs_location_id", "location_id"),
        Index("idx_wobs_obs_time", "observation_time"),
        Index("idx_wobs_source_type", "source_type"),
        Index("idx_wobs_coords", "latitude", "longitude"),
    )

    id: Mapped[uuid.UUID] = mapped_column(GUID(), primary_key=True, default=uuid.uuid4)
    location_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        GUID(),
        ForeignKey("locations.id", ondelete="SET NULL"),
        nullable=True,
    )

    latitude: Mapped[float] = mapped_column(Float, nullable=False)
    longitude: Mapped[float] = mapped_column(Float, nullable=False)

    # PostGIS Point in EPSG:4326
    location_geometry = mapped_column(
        Geometry(geometry_type="POINT", srid=4326, spatial_index=True),
        nullable=True,
    )

    # Meteorological metrics
    rainfall_mm: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    temperature_c: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    humidity_percent: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    wind_speed_kmh: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    precipitation_probability: Mapped[Optional[float]] = mapped_column(Float, nullable=True)

    # Temporal markers
    observation_time: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    forecast_time: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    # Explicit provenance
    source: Mapped[str] = mapped_column(String(100), nullable=False)
    source_type: Mapped[str] = mapped_column(String(50), nullable=False)

    raw_payload: Mapped[Optional[Dict[str, Any]]] = mapped_column(
        JSONB().with_variant(JSON, "sqlite"),
        nullable=True,
    )

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)

    # Relationship
    location: Mapped[Optional["Location"]] = relationship(
        "Location",
        back_populates="weather_observations",
        foreign_keys=[location_id],
    )

    def __repr__(self) -> str:
        return f"<WeatherObservation id={self.id} type={self.source_type} rain={self.rainfall_mm}mm time={self.observation_time}>"
