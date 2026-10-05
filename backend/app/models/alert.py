"""Hazard alert database model establishing the future alert engine persistence boundary."""

from datetime import datetime
from typing import Any, Dict, Optional
import uuid

from geoalchemy2 import Geometry
from sqlalchemy import (
    CheckConstraint,
    DateTime,
    Float,
    Index,
    String,
    Text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.types import JSON

from backend.app.core.database import Base
from backend.app.models.base import GUID, utc_now


class HazardAlert(Base):
    """Hazard alert record strictly distinguishing OBSERVED events, CALCULATED risks, and HISTORICAL data."""

    __tablename__ = "hazard_alerts"
    __table_args__ = (
        CheckConstraint(
            "origin_type IN ('OBSERVED', 'CALCULATED', 'HISTORICAL')",
            name="chk_alert_origin_type_valid",
        ),
        CheckConstraint(
            "severity IN ('LOW', 'MODERATE', 'HIGH', 'SEVERE')",
            name="chk_alert_severity_valid",
        ),
        CheckConstraint(
            "latitude IS NULL OR (latitude >= -90.0 AND latitude <= 90.0)",
            name="chk_alert_lat_bounds",
        ),
        CheckConstraint(
            "longitude IS NULL OR (longitude >= -180.0 AND longitude <= 180.0)",
            name="chk_alert_lon_bounds",
        ),
        Index("idx_hazard_alerts_severity", "severity"),
        Index("idx_hazard_alerts_status", "status"),
        Index("idx_hazard_alerts_origin_type", "origin_type"),
        Index("idx_hazard_alerts_created_at", "created_at"),
        Index("idx_hazard_alerts_expires_at", "expires_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(GUID(), primary_key=True, default=uuid.uuid4)
    alert_type: Mapped[str] = mapped_column(String(50), nullable=False)
    severity: Mapped[str] = mapped_column(String(20), nullable=False)

    title: Mapped[str] = mapped_column(String(255), nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)

    latitude: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    longitude: Mapped[Optional[float]] = mapped_column(Float, nullable=True)

    # PostGIS Point in EPSG:4326 for spatial intersection and geofencing
    location_geometry = mapped_column(
        Geometry(geometry_type="POINT", srid=4326, spatial_index=True),
        nullable=True,
    )

    region: Mapped[Optional[str]] = mapped_column(String(100), default="Uttarakhand", nullable=True)
    source: Mapped[str] = mapped_column(String(100), nullable=False)
    source_timestamp: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)
    expires_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    status: Mapped[str] = mapped_column(String(20), default="ACTIVE", nullable=False)

    # CRITICAL: Mandatory distinction between OBSERVED, CALCULATED, and HISTORICAL alerts
    origin_type: Mapped[str] = mapped_column(String(20), nullable=False)

    extra_metadata: Mapped[Optional[Dict[str, Any]]] = mapped_column(
        "metadata",
        JSONB().with_variant(JSON, "sqlite"),
        nullable=True,
    )

    def __repr__(self) -> str:
        return f"<HazardAlert id={self.id} type={self.alert_type} origin={self.origin_type} sev={self.severity}>"
