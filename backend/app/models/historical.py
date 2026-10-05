"""Historical ground evidence models: GSI landslide inventory and 2018 OSM road cuttings."""

from datetime import date, datetime
from typing import Any, Dict, Optional
import uuid

from geoalchemy2 import Geometry
from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    Float,
    Index,
    Integer,
    String,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.types import JSON

from backend.app.core.database import Base
from backend.app.models.base import GUID, utc_now


class LandslideRecord(Base):
    """Historical Geological Survey of India (GSI) landslide inventory feature.

    CRITICAL: Represents verified historical landslide evidence; NEVER treated as a live incident feed.
    """

    __tablename__ = "landslides"
    __table_args__ = (
        CheckConstraint("latitude >= -90.0 AND latitude <= 90.0", name="chk_landslide_lat_bounds"),
        CheckConstraint("longitude >= -180.0 AND longitude <= 180.0", name="chk_landslide_lon_bounds"),
        UniqueConstraint("source", "source_record_id", name="uq_landslide_source_record_id"),
        Index("idx_landslides_source", "source"),
        Index("idx_landslides_is_historical", "is_historical"),
    )

    id: Mapped[uuid.UUID] = mapped_column(GUID(), primary_key=True, default=uuid.uuid4)
    source: Mapped[str] = mapped_column(String(50), default="GSI", nullable=False)
    source_record_id: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)

    latitude: Mapped[float] = mapped_column(Float, nullable=False)
    longitude: Mapped[float] = mapped_column(Float, nullable=False)

    # PostGIS Point in EPSG:4326
    location_geometry = mapped_column(
        Geometry(geometry_type="POINT", srid=4326, spatial_index=True),
        nullable=True,
    )

    event_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)

    # Explicit scientific provenance: must always be labeled historical
    is_historical: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    extra_metadata: Mapped[Optional[Dict[str, Any]]] = mapped_column(
        "metadata",
        JSONB().with_variant(JSON, "sqlite"),
        nullable=True,
    )

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)

    def __repr__(self) -> str:
        return f"<LandslideRecord id={self.id} src={self.source} rec_id={self.source_record_id} hist={self.is_historical}>"


class RoadCutting(Base):
    """Historical OpenStreetMap hillside cutting feature (2018 snapshot).

    CRITICAL: Represents historical 2018 road-cutting evidence (cutting=yes); NEVER labeled as current active landslide.
    """

    __tablename__ = "cuttings"
    __table_args__ = (
        UniqueConstraint("osm_way_id", "snapshot_year", name="uq_cutting_osm_way_year"),
        Index("idx_cuttings_osm_way_id", "osm_way_id"),
        Index("idx_cuttings_snapshot_year", "snapshot_year"),
        Index("idx_cuttings_is_historical", "is_historical"),
    )

    id: Mapped[uuid.UUID] = mapped_column(GUID(), primary_key=True, default=uuid.uuid4)
    osm_way_id: Mapped[int] = mapped_column(BigInteger, nullable=False)
    source: Mapped[str] = mapped_column(String(100), default="OpenStreetMap", nullable=False)
    snapshot_year: Mapped[int] = mapped_column(Integer, default=2018, nullable=False)

    # PostGIS LineString in EPSG:4326
    geometry = mapped_column(
        Geometry(geometry_type="LINESTRING", srid=4326, spatial_index=True),
        nullable=True,
    )

    tags: Mapped[Optional[Dict[str, Any]]] = mapped_column(
        JSONB().with_variant(JSON, "sqlite"),
        nullable=True,
    )

    # Explicit scientific provenance: must always be labeled historical
    is_historical: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)

    def __repr__(self) -> str:
        return f"<RoadCutting id={self.id} way={self.osm_way_id} year={self.snapshot_year} hist={self.is_historical}>"
