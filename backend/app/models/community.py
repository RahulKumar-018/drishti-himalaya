"""Community hazard reporting and traveler feedback models."""

from datetime import datetime
from typing import Any, Dict, Optional
import uuid

from geoalchemy2 import Geometry
from sqlalchemy import (
    CheckConstraint,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.types import JSON

from backend.app.core.database import Base
from backend.app.models.base import GUID, TimestampMixin, utc_now


class CommunityHazardReport(Base, TimestampMixin):
    """User-submitted or field-reported ground hazard incident."""

    __tablename__ = "community_hazard_reports"
    __table_args__ = (
        CheckConstraint("latitude >= -90.0 AND latitude <= 90.0", name="chk_community_report_lat_bounds"),
        CheckConstraint("longitude >= -180.0 AND longitude <= 180.0", name="chk_community_report_lon_bounds"),
        Index("idx_community_reports_status", "status"),
        Index("idx_community_reports_type", "report_type"),
        Index("idx_community_reports_created_at", "created_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(GUID(), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        GUID(),
        ForeignKey("user_profiles.id", ondelete="SET NULL"),
        nullable=True,
    )

    report_type: Mapped[str] = mapped_column(String(50), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    latitude: Mapped[float] = mapped_column(Float, nullable=False)
    longitude: Mapped[float] = mapped_column(Float, nullable=False)

    # PostGIS Point in EPSG:4326
    location_geometry = mapped_column(
        Geometry(geometry_type="POINT", srid=4326, spatial_index=True),
        nullable=True,
    )

    severity: Mapped[Optional[str]] = mapped_column(String(20), default="MODERATE", nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="PENDING", nullable=False)
    source: Mapped[str] = mapped_column(String(50), default="COMMUNITY", nullable=False)

    extra_metadata: Mapped[Optional[Dict[str, Any]]] = mapped_column(
        "metadata",
        JSONB().with_variant(JSON, "sqlite"),
        nullable=True,
    )

    # Relationships
    user = relationship("UserProfile", back_populates="community_reports")

    def __repr__(self) -> str:
        return f"<CommunityHazardReport id={self.id} type={self.report_type} status={self.status}>"


class Feedback(Base):
    """Traveler feedback on evaluated safety routes."""

    __tablename__ = "feedback"
    __table_args__ = (
        CheckConstraint("rating >= 1 AND rating <= 5", name="chk_feedback_rating_range"),
        Index("idx_feedback_route_id", "route_id"),
        Index("idx_feedback_created_at", "created_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(GUID(), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        GUID(),
        ForeignKey("user_profiles.id", ondelete="SET NULL"),
        nullable=True,
    )
    route_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        GUID(),
        ForeignKey("saved_routes.id", ondelete="SET NULL"),
        nullable=True,
    )

    rating: Mapped[int] = mapped_column(Integer, nullable=False)
    comment: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)

    # Relationships
    user = relationship("UserProfile", back_populates="feedback")
    route = relationship("SavedRoute", back_populates="feedback")

    def __repr__(self) -> str:
        return f"<Feedback id={self.id} rating={self.rating}>"
