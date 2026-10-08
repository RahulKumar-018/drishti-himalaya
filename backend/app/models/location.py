"""Location database model for geographic reference points and administrative units."""

from datetime import datetime
from typing import Any, Dict, List, Optional, TYPE_CHECKING
import uuid

if TYPE_CHECKING:
    from backend.app.models.terrain import TerrainObservation
    from backend.app.models.disaster import DisasterEvent
    from backend.app.models.weather_observation import WeatherObservation

from geoalchemy2 import Geometry
from sqlalchemy import (
    CheckConstraint,
    DateTime,
    Float,
    Index,
    String,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.types import JSON

from backend.app.core.database import Base
from backend.app.models.base import GUID, TimestampMixin, utc_now


class Location(Base, TimestampMixin):
    """Geographic reference point or administrative location in the Himalayan corridor.

    Stores verified point geometry (EPSG:4326), elevation, administrative metadata,
    and acts as an anchor for environmental observations.
    """

    __tablename__ = "locations"
    __table_args__ = (
        CheckConstraint("latitude >= -90.0 AND latitude <= 90.0", name="chk_location_lat_bounds"),
        CheckConstraint("longitude >= -180.0 AND longitude <= 180.0", name="chk_location_lon_bounds"),
        Index("idx_locations_lat_lon", "latitude", "longitude"),
        Index("idx_locations_name", "name"),
    )

    id: Mapped[uuid.UUID] = mapped_column(GUID(), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    latitude: Mapped[float] = mapped_column(Float, nullable=False)
    longitude: Mapped[float] = mapped_column(Float, nullable=False)
    elevation: Mapped[Optional[float]] = mapped_column(Float, nullable=True)

    # PostGIS Point in EPSG:4326
    location_geometry = mapped_column(
        Geometry(geometry_type="POINT", srid=4326, spatial_index=True),
        nullable=True,
    )

    # Administrative metadata (district, state, tehsil, corridor, tags)
    administrative_metadata: Mapped[Optional[Dict[str, Any]]] = mapped_column(
        JSONB().with_variant(JSON, "sqlite"),
        nullable=True,
    )

    # Relationships
    terrain_observations: Mapped[List["TerrainObservation"]] = relationship(
        "TerrainObservation",
        back_populates="location",
        cascade="all, delete-orphan",
        order_by="desc(TerrainObservation.created_at)",
    )
    disaster_events: Mapped[List["DisasterEvent"]] = relationship(
        "DisasterEvent",
        back_populates="location",
        foreign_keys="[DisasterEvent.location_id]",
        order_by="desc(DisasterEvent.created_at)",
    )
    weather_observations: Mapped[List["WeatherObservation"]] = relationship(
        "WeatherObservation",
        back_populates="location",
        foreign_keys="[WeatherObservation.location_id]",
        order_by="desc(WeatherObservation.observation_time)",
    )

    def __repr__(self) -> str:
        return f"<Location id={self.id} name='{self.name}' coords=({self.latitude}, {self.longitude})>"
