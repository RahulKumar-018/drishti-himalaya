"""Monitoring and alert database models for Phase 2 trip monitoring."""

from datetime import datetime
from typing import Optional
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
    UniqueConstraint,
    JSON,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.app.core.database import Base
from backend.app.models.base import GUID, TimestampMixin, utc_now


class MonitoredTrip(Base, TimestampMixin):
    """User-initiated trip monitoring session (MONITOR -> DETECT -> ALERT -> REASSESS)."""

    __tablename__ = "monitored_trips"
    __table_args__ = (
        CheckConstraint(
            "origin_lat >= -90.0 AND origin_lat <= 90.0", name="chk_mt_orig_lat"
        ),
        CheckConstraint(
            "origin_lon >= -180.0 AND origin_lon <= 180.0", name="chk_mt_orig_lon"
        ),
        CheckConstraint(
            "destination_lat >= -90.0 AND destination_lat <= 90.0", name="chk_mt_dest_lat"
        ),
        CheckConstraint(
            "destination_lon >= -180.0 AND destination_lon <= 180.0", name="chk_mt_dest_lon"
        ),
        CheckConstraint(
            "status IN ('ACTIVE', 'PAUSED', 'COMPLETED', 'CANCELLED')", name="chk_mt_status"
        ),
        Index("idx_monitored_trips_user_id", "user_id"),
        Index("idx_monitored_trips_route_id", "route_id"),
        Index("idx_monitored_trips_status", "status"),
        Index("idx_monitored_trips_created_at", "created_at"),
        Index("idx_monitored_trips_origin", "origin_lat", "origin_lon"),
        Index("idx_monitored_trips_destination", "destination_lat", "destination_lon"),
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

    origin_lat: Mapped[float] = mapped_column(Float, nullable=False)
    origin_lon: Mapped[float] = mapped_column(Float, nullable=False)
    destination_lat: Mapped[float] = mapped_column(Float, nullable=False)
    destination_lon: Mapped[float] = mapped_column(Float, nullable=False)

    origin_name: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    destination_name: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    vehicle_profile: Mapped[str] = mapped_column(String(50), default="driving-car", nullable=False)

    status: Mapped[str] = mapped_column(String(20), default="ACTIVE", nullable=False)

    planned_departure: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    actual_departure: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    completed_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    monitoring_config: Mapped[dict] = mapped_column(
        JSONB().with_variant(JSON, "sqlite"), nullable=False, default=lambda: {
            "check_interval_minutes": 30,
            "rain_threshold_mm": 25,
            "risk_delta_threshold": 10,
            "enable_fcm": True,
            "quiet_hours_start": 22,
            "quiet_hours_end": 6,
        }
    )

    # Relationships
    user = relationship("UserProfile", back_populates="monitored_trips")
    route = relationship("SavedRoute", back_populates="monitored_trips")
    risk_snapshots = relationship(
        "TripRiskSnapshot",
        back_populates="trip",
        cascade="all, delete-orphan",
        order_by="TripRiskSnapshot.assessed_at.desc()",
    )
    alerts = relationship(
        "TripAlert",
        back_populates="trip",
        cascade="all, delete-orphan",
        order_by="TripAlert.created_at.desc()",
    )

    def __repr__(self) -> str:
        return f"<MonitoredTrip id={self.id} {self.origin_name}->{self.destination_name} status={self.status}>"


class TripRiskSnapshot(Base):
    """Time-series risk history for each monitored trip (per segment or route aggregate)."""

    __tablename__ = "trip_risk_snapshots"
    __table_args__ = (
        CheckConstraint(
            "risk_score >= 0.0 AND risk_score <= 100.0", name="chk_trs_risk_score"
        ),
        CheckConstraint(
            "risk_tier IN ('LOW', 'MODERATE', 'HIGH', 'SEVERE')", name="chk_trs_risk_tier"
        ),
        CheckConstraint(
            "snapshot_type IN ('ROUTE_AGGREGATE', 'SEGMENT', 'BOTTLENECK')",
            name="chk_trs_snapshot_type",
        ),
        Index("idx_trip_risk_snapshots_trip_id", "trip_id"),
        Index("idx_trip_risk_snapshots_segment_id", "segment_id"),
        Index("idx_trip_risk_snapshots_assessed_at", "assessed_at"),
        Index("idx_trip_risk_snapshots_risk_tier", "risk_tier"),
        Index("idx_trip_risk_snapshots_type", "snapshot_type"),
    )

    id: Mapped[uuid.UUID] = mapped_column(GUID(), primary_key=True, default=uuid.uuid4)
    trip_id: Mapped[uuid.UUID] = mapped_column(
        GUID(),
        ForeignKey("monitored_trips.id", ondelete="CASCADE"),
        nullable=False,
    )
    snapshot_type: Mapped[str] = mapped_column(
        String(20), default="ROUTE_AGGREGATE", nullable=False
    )
    segment_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        GUID(),
        ForeignKey("route_segments.id", ondelete="SET NULL"),
        nullable=True,
    )

    risk_score: Mapped[float] = mapped_column(Float, nullable=False)
    risk_tier: Mapped[str] = mapped_column(String(20), nullable=False)

    slope_score: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    rain_score: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    proximity_score: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    density_score: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    exposure_score: Mapped[Optional[float]] = mapped_column(Float, nullable=True)

    p24_mm: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    p72_mm: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    ari_mm: Mapped[Optional[float]] = mapped_column(Float, nullable=True)

    route_average_risk: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    route_max_risk: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    composite_route_risk: Mapped[Optional[float]] = mapped_column(Float, nullable=True)

    weather_summary: Mapped[dict] = mapped_column(JSONB().with_variant(JSON, "sqlite"), nullable=False, default=dict)
    triggering_factor: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    risk_delta: Mapped[Optional[float]] = mapped_column(Float, nullable=True)

    assessed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, nullable=False
    )

    # Relationships
    trip = relationship("MonitoredTrip", back_populates="risk_snapshots")
    segment = relationship("RouteSegment", back_populates="risk_snapshots")

    def __repr__(self) -> str:
        return f"<TripRiskSnapshot id={self.id} trip_id={self.trip_id} risk={self.risk_score} tier={self.risk_tier}>"


class TripAlert(Base):
    """Alert instances generated for specific trips (per trip, per event)."""

    __tablename__ = "trip_alerts"
    __table_args__ = (
        CheckConstraint(
            "severity IN ('LOW', 'MODERATE', 'HIGH', 'SEVERE')", name="chk_ta_severity"
        ),
        CheckConstraint(
            "trigger_source IN ('RAIN_THRESHOLD', 'RISK_ESCALATION', 'NEW_HAZARD', 'ROUTE_DEVIATION', 'SCHEDULED_REASSESSMENT', 'MANUAL')",
            name="chk_ta_trigger_source",
        ),
        CheckConstraint(
            "latitude IS NULL OR (latitude >= -90.0 AND latitude <= 90.0)",
            name="chk_ta_lat_bounds",
        ),
        CheckConstraint(
            "longitude IS NULL OR (longitude >= -180.0 AND longitude <= 180.0)",
            name="chk_ta_lon_bounds",
        ),
        CheckConstraint(
            "previous_risk_tier IS NULL OR previous_risk_tier IN ('LOW', 'MODERATE', 'HIGH', 'SEVERE')",
            name="chk_ta_previous_tier",
        ),
        CheckConstraint(
            "current_risk_tier IS NULL OR current_risk_tier IN ('LOW', 'MODERATE', 'HIGH', 'SEVERE')",
            name="chk_ta_current_tier",
        ),
        Index("idx_trip_alerts_trip_id", "trip_id"),
        Index("idx_trip_alerts_segment_id", "affected_segment_id"),
        Index("idx_trip_alerts_severity", "severity"),
        Index("idx_trip_alerts_created_at", "created_at"),
        Index("idx_trip_alerts_trigger_source", "trigger_source"),
        Index("idx_trip_alerts_fcm_sent", "fcm_sent"),
        Index("idx_trip_alerts_geometry", "location_geometry", postgresql_using="gist"),
    )

    id: Mapped[uuid.UUID] = mapped_column(GUID(), primary_key=True, default=uuid.uuid4)
    trip_id: Mapped[uuid.UUID] = mapped_column(
        GUID(),
        ForeignKey("monitored_trips.id", ondelete="CASCADE"),
        nullable=False,
    )

    alert_type: Mapped[str] = mapped_column(String(50), nullable=False)
    severity: Mapped[str] = mapped_column(String(20), nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)

    affected_segment_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        GUID(),
        ForeignKey("route_segments.id", ondelete="SET NULL"),
        nullable=True,
    )

    latitude: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    longitude: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    location_geometry = mapped_column(
        Geometry(geometry_type="POINT", srid=4326, spatial_index=True),
        nullable=True,
    )

    previous_risk_tier: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    current_risk_tier: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    risk_delta: Mapped[Optional[float]] = mapped_column(Float, nullable=True)

    trigger_source: Mapped[str] = mapped_column(String(50), nullable=False)
    trigger_metadata: Mapped[dict] = mapped_column(JSONB().with_variant(JSON, "sqlite"), nullable=False, default=dict)

    acknowledged_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    dismissed_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    fcm_sent: Mapped[bool] = mapped_column(default=False, nullable=False)
    fcm_sent_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    fcm_message_id: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, nullable=False
    )
    expires_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # Relationships
    trip = relationship("MonitoredTrip", back_populates="alerts")
    affected_segment = relationship("RouteSegment", back_populates="trip_alerts")

    def __repr__(self) -> str:
        return f"<TripAlert id={self.id} trip_id={self.trip_id} severity={self.severity} type={self.alert_type}>"


class NotificationDevice(Base, TimestampMixin):
    """FCM device tokens for push notification delivery."""

    __tablename__ = "notification_devices"
    __table_args__ = (
        CheckConstraint(
            "platform IN ('ios', 'android', 'web')", name="chk_nd_platform"
        ),
        UniqueConstraint("user_id", "fcm_token", name="uq_nd_user_token"),
        Index("idx_notification_devices_user_id", "user_id"),
        Index("idx_notification_devices_active", "is_active"),
        Index("idx_notification_devices_last_used", "last_used_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(GUID(), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        GUID(),
        ForeignKey("user_profiles.id", ondelete="CASCADE"),
        nullable=False,
    )
    fcm_token: Mapped[str] = mapped_column(Text, nullable=False)
    platform: Mapped[str] = mapped_column(String(20), nullable=False)
    app_version: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    device_model: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    is_active: Mapped[bool] = mapped_column(default=True, nullable=False)
    last_used_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, nullable=False
    )

    # Relationships
    user = relationship("UserProfile", back_populates="notification_devices")

    def __repr__(self) -> str:
        return f"<NotificationDevice id={self.id} user_id={self.user_id} platform={self.platform}>"