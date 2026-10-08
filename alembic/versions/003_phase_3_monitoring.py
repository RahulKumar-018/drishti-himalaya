"""Add Phase 3 monitored trips, snapshots, alerts, and notification devices.

Revision ID: 003_phase_3_monitoring
Revises: 002_phase_2b
"""

from typing import Sequence, Union

from alembic import op
import geoalchemy2
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from backend.app.models.base import GUID

revision: str = "003_phase_3_monitoring"
down_revision: Union[str, None] = "002_phase_2b"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _json_type():
    return postgresql.JSONB(astext_type=sa.Text()).with_variant(sa.JSON(), "sqlite")


def upgrade() -> None:
    op.create_table(
        "monitored_trips",
        sa.Column("id", GUID(), primary_key=True),
        sa.Column("user_id", GUID(), sa.ForeignKey("user_profiles.id", ondelete="SET NULL"), nullable=True),
        sa.Column("route_id", GUID(), sa.ForeignKey("saved_routes.id", ondelete="SET NULL"), nullable=True),
        sa.Column("origin_lat", sa.Float(), nullable=False),
        sa.Column("origin_lon", sa.Float(), nullable=False),
        sa.Column("destination_lat", sa.Float(), nullable=False),
        sa.Column("destination_lon", sa.Float(), nullable=False),
        sa.Column("origin_name", sa.Text(), nullable=True),
        sa.Column("destination_name", sa.Text(), nullable=True),
        sa.Column("vehicle_profile", sa.String(50), nullable=False, server_default="driving-car"),
        sa.Column("status", sa.String(20), nullable=False, server_default="ACTIVE"),
        sa.Column("planned_departure", sa.DateTime(timezone=True), nullable=True),
        sa.Column("actual_departure", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("monitoring_config", _json_type(), nullable=False, server_default=sa.text("'{}'")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("origin_lat >= -90 AND origin_lat <= 90", name="chk_mt_orig_lat"),
        sa.CheckConstraint("origin_lon >= -180 AND origin_lon <= 180", name="chk_mt_orig_lon"),
        sa.CheckConstraint("destination_lat >= -90 AND destination_lat <= 90", name="chk_mt_dest_lat"),
        sa.CheckConstraint("destination_lon >= -180 AND destination_lon <= 180", name="chk_mt_dest_lon"),
        sa.CheckConstraint("status IN ('ACTIVE', 'PAUSED', 'COMPLETED', 'CANCELLED')", name="chk_mt_status"),
    )
    op.create_index("idx_monitored_trips_user_id", "monitored_trips", ["user_id"])
    op.create_index("idx_monitored_trips_status", "monitored_trips", ["status"])

    op.create_table(
        "trip_risk_snapshots",
        sa.Column("id", GUID(), primary_key=True),
        sa.Column("trip_id", GUID(), sa.ForeignKey("monitored_trips.id", ondelete="CASCADE"), nullable=False),
        sa.Column("snapshot_type", sa.String(20), nullable=False, server_default="ROUTE_AGGREGATE"),
        sa.Column("segment_id", GUID(), sa.ForeignKey("route_segments.id", ondelete="SET NULL"), nullable=True),
        sa.Column("risk_score", sa.Float(), nullable=False),
        sa.Column("risk_tier", sa.String(20), nullable=False),
        sa.Column("slope_score", sa.Float(), nullable=True),
        sa.Column("rain_score", sa.Float(), nullable=True),
        sa.Column("proximity_score", sa.Float(), nullable=True),
        sa.Column("density_score", sa.Float(), nullable=True),
        sa.Column("exposure_score", sa.Float(), nullable=True),
        sa.Column("p24_mm", sa.Float(), nullable=True),
        sa.Column("p72_mm", sa.Float(), nullable=True),
        sa.Column("ari_mm", sa.Float(), nullable=True),
        sa.Column("route_average_risk", sa.Float(), nullable=True),
        sa.Column("route_max_risk", sa.Float(), nullable=True),
        sa.Column("composite_route_risk", sa.Float(), nullable=True),
        sa.Column("weather_summary", _json_type(), nullable=False, server_default=sa.text("'{}'")),
        sa.Column("triggering_factor", sa.String(50), nullable=True),
        sa.Column("risk_delta", sa.Float(), nullable=True),
        sa.Column("assessed_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("risk_score >= 0 AND risk_score <= 100", name="chk_trs_risk_score"),
        sa.CheckConstraint("risk_tier IN ('LOW', 'MODERATE', 'HIGH', 'SEVERE')", name="chk_trs_risk_tier"),
        sa.CheckConstraint("snapshot_type IN ('ROUTE_AGGREGATE', 'SEGMENT', 'BOTTLENECK')", name="chk_trs_snapshot_type"),
    )
    op.create_index("idx_trip_risk_snapshots_trip_id", "trip_risk_snapshots", ["trip_id"])
    op.create_index("idx_trip_risk_snapshots_assessed_at", "trip_risk_snapshots", ["assessed_at"])

    op.create_table(
        "trip_alerts",
        sa.Column("id", GUID(), primary_key=True),
        sa.Column("trip_id", GUID(), sa.ForeignKey("monitored_trips.id", ondelete="CASCADE"), nullable=False),
        sa.Column("alert_type", sa.String(50), nullable=False),
        sa.Column("severity", sa.String(20), nullable=False),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column("affected_segment_id", GUID(), sa.ForeignKey("route_segments.id", ondelete="SET NULL"), nullable=True),
        sa.Column("latitude", sa.Float(), nullable=True),
        sa.Column("longitude", sa.Float(), nullable=True),
        sa.Column("location_geometry", geoalchemy2.Geometry(geometry_type="POINT", srid=4326, spatial_index=True), nullable=True),
        sa.Column("previous_risk_tier", sa.String(20), nullable=True),
        sa.Column("current_risk_tier", sa.String(20), nullable=True),
        sa.Column("risk_delta", sa.Float(), nullable=True),
        sa.Column("trigger_source", sa.String(50), nullable=False),
        sa.Column("trigger_metadata", _json_type(), nullable=False, server_default=sa.text("'{}'")),
        sa.Column("acknowledged_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("dismissed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("fcm_sent", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("fcm_sent_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("fcm_message_id", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint("severity IN ('LOW', 'MODERATE', 'HIGH', 'SEVERE')", name="chk_ta_severity"),
        sa.CheckConstraint("latitude IS NULL OR (latitude >= -90 AND latitude <= 90)", name="chk_ta_lat_bounds"),
        sa.CheckConstraint("longitude IS NULL OR (longitude >= -180 AND longitude <= 180)", name="chk_ta_lon_bounds"),
    )
    op.create_index("idx_trip_alerts_trip_id", "trip_alerts", ["trip_id"])
    op.create_index("idx_trip_alerts_created_at", "trip_alerts", ["created_at"])
    op.create_index("idx_trip_alerts_fcm_sent", "trip_alerts", ["fcm_sent"])

    op.create_table(
        "notification_devices",
        sa.Column("id", GUID(), primary_key=True),
        sa.Column("user_id", GUID(), sa.ForeignKey("user_profiles.id", ondelete="CASCADE"), nullable=False),
        sa.Column("fcm_token", sa.Text(), nullable=False),
        sa.Column("platform", sa.String(20), nullable=False),
        sa.Column("app_version", sa.String(50), nullable=True),
        sa.Column("device_model", sa.String(100), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("last_used_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("user_id", "fcm_token", name="uq_nd_user_token"),
        sa.CheckConstraint("platform IN ('ios', 'android', 'web')", name="chk_nd_platform"),
    )
    op.create_index("idx_notification_devices_user_id", "notification_devices", ["user_id"])
    op.create_index("idx_notification_devices_active", "notification_devices", ["is_active"])

    if op.get_bind().dialect.name == "postgresql":
        op.execute("ALTER TABLE monitored_trips ENABLE ROW LEVEL SECURITY")
        op.execute("ALTER TABLE trip_risk_snapshots ENABLE ROW LEVEL SECURITY")
        op.execute("ALTER TABLE trip_alerts ENABLE ROW LEVEL SECURITY")
        op.execute("ALTER TABLE notification_devices ENABLE ROW LEVEL SECURITY")
        op.execute("CREATE POLICY monitored_trips_owner_select ON monitored_trips FOR SELECT TO authenticated USING (user_id = (select auth.uid()))")
        op.execute("CREATE POLICY monitored_trips_owner_write ON monitored_trips FOR ALL TO authenticated USING (user_id = (select auth.uid())) WITH CHECK (user_id = (select auth.uid()))")
        op.execute("CREATE POLICY trip_snapshots_owner_select ON trip_risk_snapshots FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM monitored_trips t WHERE t.id = trip_id AND t.user_id = (select auth.uid())))")
        op.execute("CREATE POLICY trip_alerts_owner_select ON trip_alerts FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM monitored_trips t WHERE t.id = trip_id AND t.user_id = (select auth.uid())))")
        op.execute("CREATE POLICY trip_alerts_owner_update ON trip_alerts FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM monitored_trips t WHERE t.id = trip_id AND t.user_id = (select auth.uid()))) WITH CHECK (EXISTS (SELECT 1 FROM monitored_trips t WHERE t.id = trip_id AND t.user_id = (select auth.uid())))")
        op.execute("CREATE POLICY notification_devices_owner_all ON notification_devices FOR ALL TO authenticated USING (user_id = (select auth.uid())) WITH CHECK (user_id = (select auth.uid()))")


def downgrade() -> None:
    if op.get_bind().dialect.name == "postgresql":
        op.execute("DROP POLICY IF EXISTS notification_devices_owner_all ON notification_devices")
        op.execute("DROP POLICY IF EXISTS trip_alerts_owner_update ON trip_alerts")
        op.execute("DROP POLICY IF EXISTS trip_alerts_owner_select ON trip_alerts")
        op.execute("DROP POLICY IF EXISTS trip_snapshots_owner_select ON trip_risk_snapshots")
        op.execute("DROP POLICY IF EXISTS monitored_trips_owner_write ON monitored_trips")
        op.execute("DROP POLICY IF EXISTS monitored_trips_owner_select ON monitored_trips")
    op.drop_table("notification_devices")
    op.drop_table("trip_alerts")
    op.drop_table("trip_risk_snapshots")
    op.drop_table("monitored_trips")
