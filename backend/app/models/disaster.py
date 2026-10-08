"""Multi-hazard historical and documented disaster observations model."""

from datetime import date, datetime
from typing import Any, Dict, Optional, TYPE_CHECKING
import uuid

if TYPE_CHECKING:
    from backend.app.models.location import Location

from geoalchemy2 import Geometry
from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Index,
    String,
    Text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.types import JSON

from backend.app.core.database import Base
from backend.app.models.base import GUID, utc_now

SUPPORTED_EVENT_TYPES = (
    "landslide",
    "flash_flood",
    "rockfall",
    "avalanche",
    "debris_flow",
    "road_subsidence",
    "other",
)


class DisasterEvent(Base):
    """Historical or recorded disaster event record in the Himalayan region.

    Supports multiple event types (landslide, flash flood, rockfall, avalanche, debris flow),
    with explicit provenance and spatial geometry.
    """

    __tablename__ = "disaster_events"
    __table_args__ = (
        CheckConstraint("latitude >= -90.0 AND latitude <= 90.0", name="chk_disaster_lat_bounds"),
        CheckConstraint("longitude >= -180.0 AND longitude <= 180.0", name="chk_disaster_lon_bounds"),
        CheckConstraint(
            f"event_type IN {SUPPORTED_EVENT_TYPES}",
            name="chk_disaster_event_type",
        ),
        Index("idx_disaster_events_loc_id", "location_id"),
        Index("idx_disaster_events_type", "event_type"),
        Index("idx_disaster_events_date", "event_date"),
        Index("idx_disaster_events_source", "source"),
    )

    id: Mapped[uuid.UUID] = mapped_column(GUID(), primary_key=True, default=uuid.uuid4)
    location_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        GUID(),
        ForeignKey("locations.id", ondelete="SET NULL"),
        nullable=True,
    )

    event_type: Mapped[str] = mapped_column(String(50), nullable=False)
    event_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    severity: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)

    source: Mapped[str] = mapped_column(String(100), nullable=False)
    source_reference: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    latitude: Mapped[float] = mapped_column(Float, nullable=False)
    longitude: Mapped[float] = mapped_column(Float, nullable=False)

    # PostGIS Point in EPSG:4326
    location_geometry = mapped_column(
        Geometry(geometry_type="POINT", srid=4326, spatial_index=True),
        nullable=True,
    )

    # Explicit provenance: historical records are never confused with live sensor feeds
    is_historical: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    extra_metadata: Mapped[Optional[Dict[str, Any]]] = mapped_column(
        "metadata",
        JSONB().with_variant(JSON, "sqlite"),
        nullable=True,
    )

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)

    # Relationship
    location: Mapped[Optional["Location"]] = relationship(
        "Location",
        back_populates="disaster_events",
        foreign_keys=[location_id],
    )

    def __repr__(self) -> str:
        return f"<DisasterEvent id={self.id} type='{self.event_type}' date={self.event_date} src='{self.source}'>"
