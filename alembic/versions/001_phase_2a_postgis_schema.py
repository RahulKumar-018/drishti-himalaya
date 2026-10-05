"""Phase 2A initial PostGIS schema migration for Drishti-Himalaya.

Revision ID: 001_phase_2a
Revises: None
Create Date: 2026-10-05 15:30:00

Creates:
1. postgis extension
2. user_profiles
3. saved_routes (LineString 4326)
4. route_segments (Point 4326, LineString 4326)
5. risk_assessments (5 explainable factor scores + weights)
6. weather_snapshots (deduplicated by source/coords/time)
7. hazard_alerts (Point 4326, origin_type: OBSERVED/CALCULATED/HISTORICAL)
8. community_hazard_reports (Point 4326)
9. feedback (rating 1-5)
10. landslides (GSI historical inventory, Point 4326)
11. cuttings (OSM 2018 historical 2 ways, LineString 4326)
"""

from typing import Sequence, Union

from alembic import op
import geoalchemy2
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "001_phase_2a"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Enable PostGIS extension on PostgreSQL
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        op.execute("CREATE EXTENSION IF NOT EXISTS postgis;")

    # 2. Table: user_profiles
    op.create_table(
        "user_profiles",
        sa.Column("id", sa.CHAR(36), primary_key=True),
        sa.Column("display_name", sa.Text(), nullable=True),
        sa.Column("email", sa.String(length=255), nullable=True),
        sa.Column("role", sa.String(length=50), nullable=True, server_default="commuter"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("idx_user_profiles_email", "user_profiles", ["email"], unique=True)

    # 3. Table: saved_routes
    op.create_table(
        "saved_routes",
        sa.Column("id", sa.CHAR(36), primary_key=True),
        sa.Column("user_id", sa.CHAR(36), sa.ForeignKey("user_profiles.id", ondelete="SET NULL"), nullable=True),
        sa.Column("name", sa.Text(), nullable=True),
        sa.Column("origin_name", sa.Text(), nullable=True),
        sa.Column("destination_name", sa.Text(), nullable=True),
        sa.Column("origin_lat", sa.Float(), nullable=False),
        sa.Column("origin_lon", sa.Float(), nullable=False),
        sa.Column("destination_lat", sa.Float(), nullable=False),
        sa.Column("destination_lon", sa.Float(), nullable=False),
        sa.Column("vehicle_profile", sa.String(length=50), nullable=False, server_default="driving-car"),
        sa.Column("provider", sa.String(length=50), nullable=False, server_default="OSRM"),
        sa.Column("distance_km", sa.Float(), nullable=True),
        sa.Column("risk_score", sa.Float(), nullable=True),
        sa.Column("risk_tier", sa.String(length=20), nullable=True),
        sa.Column("analysis_status", sa.String(length=20), nullable=True, server_default="COMPLETE"),
        sa.Column(
            "route_geometry",
            geoalchemy2.Geometry(geometry_type="LINESTRING", srid=4326, spatial_index=True),
            nullable=True,
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("risk_score >= 0.0 AND risk_score <= 100.0", name="chk_saved_route_risk_score"),
        sa.CheckConstraint("origin_lat >= -90.0 AND origin_lat <= 90.0", name="chk_saved_route_orig_lat"),
        sa.CheckConstraint("origin_lon >= -180.0 AND origin_lon <= 180.0", name="chk_saved_route_orig_lon"),
        sa.CheckConstraint("destination_lat >= -90.0 AND destination_lat <= 90.0", name="chk_saved_route_dest_lat"),
        sa.CheckConstraint("destination_lon >= -180.0 AND destination_lon <= 180.0", name="chk_saved_route_dest_lon"),
    )
    op.create_index("idx_saved_routes_user_id", "saved_routes", ["user_id"])
    op.create_index("idx_saved_routes_risk_tier", "saved_routes", ["risk_tier"])
    op.create_index("idx_saved_routes_created_at", "saved_routes", ["created_at"])

    # 4. Table: route_segments
    op.create_table(
        "route_segments",
        sa.Column("id", sa.CHAR(36), primary_key=True),
        sa.Column("route_id", sa.CHAR(36), sa.ForeignKey("saved_routes.id", ondelete="CASCADE"), nullable=False),
        sa.Column("segment_index", sa.Integer(), nullable=False),
        sa.Column("segment_id", sa.String(length=100), nullable=False),
        sa.Column("start_chainage_m", sa.Float(), nullable=False),
        sa.Column("end_chainage_m", sa.Float(), nullable=False),
        sa.Column("length_m", sa.Float(), nullable=False, server_default="250.0"),
        sa.Column("bearing_deg", sa.Float(), nullable=True),
        sa.Column(
            "midpoint",
            geoalchemy2.Geometry(geometry_type="POINT", srid=4326, spatial_index=True),
            nullable=False,
        ),
        sa.Column(
            "geometry",
            geoalchemy2.Geometry(geometry_type="LINESTRING", srid=4326, spatial_index=True),
            nullable=False,
        ),
        sa.Column("risk_score", sa.Float(), nullable=True),
        sa.Column("risk_tier", sa.String(length=20), nullable=True),
        sa.Column("analysis_status", sa.String(length=20), nullable=True, server_default="COMPLETE"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("risk_score >= 0.0 AND risk_score <= 100.0", name="chk_segment_risk_score"),
        sa.CheckConstraint("length_m > 0.0", name="chk_segment_length_positive"),
    )
    op.create_index("idx_route_segments_route_id", "route_segments", ["route_id"])
    op.create_index("idx_route_segments_risk_tier", "route_segments", ["risk_tier"])
    op.create_index("idx_route_segments_segment_id", "route_segments", ["segment_id"])

    # 5. Table: risk_assessments
    op.create_table(
        "risk_assessments",
        sa.Column("id", sa.CHAR(36), primary_key=True),
        sa.Column("route_id", sa.CHAR(36), sa.ForeignKey("saved_routes.id", ondelete="CASCADE"), nullable=True),
        sa.Column("segment_id", sa.CHAR(36), sa.ForeignKey("route_segments.id", ondelete="CASCADE"), nullable=True),
        sa.Column("risk_score", sa.Float(), nullable=False),
        sa.Column("risk_tier", sa.String(length=20), nullable=False),
        sa.Column("analysis_status", sa.String(length=20), nullable=False, server_default="COMPLETE"),
        sa.Column("slope_score", sa.Float(), nullable=True),
        sa.Column("rain_score", sa.Float(), nullable=True),
        sa.Column("proximity_score", sa.Float(), nullable=True),
        sa.Column("density_score", sa.Float(), nullable=True),
        sa.Column("exposure_score", sa.Float(), nullable=True),
        sa.Column("slope_weight", sa.Float(), nullable=False, server_default="0.35"),
        sa.Column("rain_weight", sa.Float(), nullable=False, server_default="0.30"),
        sa.Column("proximity_weight", sa.Float(), nullable=False, server_default="0.20"),
        sa.Column("density_weight", sa.Float(), nullable=False, server_default="0.10"),
        sa.Column("exposure_weight", sa.Float(), nullable=False, server_default="0.05"),
        sa.Column("average_route_score", sa.Float(), nullable=True),
        sa.Column("maximum_segment_score", sa.Float(), nullable=True),
        sa.Column("engine_version", sa.String(length=50), nullable=False, server_default="1.0.0-mcda"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("risk_score >= 0.0 AND risk_score <= 100.0", name="chk_risk_score_bounds"),
        sa.CheckConstraint("slope_score IS NULL OR (slope_score >= 0.0 AND slope_score <= 100.0)", name="chk_slope_score_bounds"),
        sa.CheckConstraint("rain_score IS NULL OR (rain_score >= 0.0 AND rain_score <= 100.0)", name="chk_rain_score_bounds"),
        sa.CheckConstraint("proximity_score IS NULL OR (proximity_score >= 0.0 AND proximity_score <= 100.0)", name="chk_prox_score_bounds"),
        sa.CheckConstraint("density_score IS NULL OR (density_score >= 0.0 AND density_score <= 100.0)", name="chk_density_score_bounds"),
        sa.CheckConstraint("exposure_score IS NULL OR (exposure_score >= 0.0 AND exposure_score <= 100.0)", name="chk_exp_score_bounds"),
    )
    op.create_index("idx_risk_assessments_route_id", "risk_assessments", ["route_id"])
    op.create_index("idx_risk_assessments_segment_id", "risk_assessments", ["segment_id"])
    op.create_index("idx_risk_assessments_tier", "risk_assessments", ["risk_tier"])
    op.create_index("idx_risk_assessments_created_at", "risk_assessments", ["created_at"])

    # 6. Table: weather_snapshots
    op.create_table(
        "weather_snapshots",
        sa.Column("id", sa.CHAR(36), primary_key=True),
        sa.Column("latitude", sa.Float(), nullable=False),
        sa.Column("longitude", sa.Float(), nullable=False),
        sa.Column("observed_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("source", sa.String(length=100), nullable=False, server_default="Open-Meteo"),
        sa.Column("precipitation_mm", sa.Float(), nullable=True),
        sa.Column("precipitation_24h_mm", sa.Float(), nullable=True),
        sa.Column("precipitation_72h_mm", sa.Float(), nullable=True),
        sa.Column("temperature_c", sa.Float(), nullable=True),
        sa.Column("convective_rain_mm", sa.Float(), nullable=True),
        sa.Column(
            "raw_payload",
            postgresql.JSONB(astext_type=sa.Text()).with_variant(sa.JSON(), "sqlite"),
            nullable=True,
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("latitude >= -90.0 AND latitude <= 90.0", name="chk_weather_lat_bounds"),
        sa.CheckConstraint("longitude >= -180.0 AND longitude <= 180.0", name="chk_weather_lon_bounds"),
        sa.UniqueConstraint("source", "latitude", "longitude", "observed_at", name="uq_weather_source_loc_time"),
    )
    op.create_index("idx_weather_observed_at", "weather_snapshots", ["observed_at"])
    op.create_index("idx_weather_loc", "weather_snapshots", ["latitude", "longitude"])

    # 7. Table: hazard_alerts
    op.create_table(
        "hazard_alerts",
        sa.Column("id", sa.CHAR(36), primary_key=True),
        sa.Column("alert_type", sa.String(length=50), nullable=False),
        sa.Column("severity", sa.String(length=20), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column("latitude", sa.Float(), nullable=True),
        sa.Column("longitude", sa.Float(), nullable=True),
        sa.Column(
            "location_geometry",
            geoalchemy2.Geometry(geometry_type="POINT", srid=4326, spatial_index=True),
            nullable=True,
        ),
        sa.Column("region", sa.String(length=100), nullable=True, server_default="Uttarakhand"),
        sa.Column("source", sa.String(length=100), nullable=False),
        sa.Column("source_timestamp", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="ACTIVE"),
        sa.Column("origin_type", sa.String(length=20), nullable=False),
        sa.Column(
            "metadata",
            postgresql.JSONB(astext_type=sa.Text()).with_variant(sa.JSON(), "sqlite"),
            nullable=True,
        ),
        sa.CheckConstraint(
            "origin_type IN ('OBSERVED', 'CALCULATED', 'HISTORICAL')",
            name="chk_alert_origin_type_valid",
        ),
        sa.CheckConstraint(
            "severity IN ('LOW', 'MODERATE', 'HIGH', 'SEVERE')",
            name="chk_alert_severity_valid",
        ),
        sa.CheckConstraint(
            "latitude IS NULL OR (latitude >= -90.0 AND latitude <= 90.0)",
            name="chk_alert_lat_bounds",
        ),
        sa.CheckConstraint(
            "longitude IS NULL OR (longitude >= -180.0 AND longitude <= 180.0)",
            name="chk_alert_lon_bounds",
        ),
    )
    op.create_index("idx_hazard_alerts_severity", "hazard_alerts", ["severity"])
    op.create_index("idx_hazard_alerts_status", "hazard_alerts", ["status"])
    op.create_index("idx_hazard_alerts_origin_type", "hazard_alerts", ["origin_type"])
    op.create_index("idx_hazard_alerts_created_at", "hazard_alerts", ["created_at"])
    op.create_index("idx_hazard_alerts_expires_at", "hazard_alerts", ["expires_at"])

    # 8. Table: community_hazard_reports
    op.create_table(
        "community_hazard_reports",
        sa.Column("id", sa.CHAR(36), primary_key=True),
        sa.Column("user_id", sa.CHAR(36), sa.ForeignKey("user_profiles.id", ondelete="SET NULL"), nullable=True),
        sa.Column("report_type", sa.String(length=50), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("latitude", sa.Float(), nullable=False),
        sa.Column("longitude", sa.Float(), nullable=False),
        sa.Column(
            "location_geometry",
            geoalchemy2.Geometry(geometry_type="POINT", srid=4326, spatial_index=True),
            nullable=False,
        ),
        sa.Column("severity", sa.String(length=20), nullable=True, server_default="MODERATE"),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="PENDING"),
        sa.Column("source", sa.String(length=50), nullable=False, server_default="COMMUNITY"),
        sa.Column(
            "metadata",
            postgresql.JSONB(astext_type=sa.Text()).with_variant(sa.JSON(), "sqlite"),
            nullable=True,
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("latitude >= -90.0 AND latitude <= 90.0", name="chk_community_report_lat_bounds"),
        sa.CheckConstraint("longitude >= -180.0 AND longitude <= 180.0", name="chk_community_report_lon_bounds"),
    )
    op.create_index("idx_community_reports_status", "community_hazard_reports", ["status"])
    op.create_index("idx_community_reports_type", "community_hazard_reports", ["report_type"])
    op.create_index("idx_community_reports_created_at", "community_hazard_reports", ["created_at"])

    # 9. Table: feedback
    op.create_table(
        "feedback",
        sa.Column("id", sa.CHAR(36), primary_key=True),
        sa.Column("user_id", sa.CHAR(36), sa.ForeignKey("user_profiles.id", ondelete="SET NULL"), nullable=True),
        sa.Column("route_id", sa.CHAR(36), sa.ForeignKey("saved_routes.id", ondelete="SET NULL"), nullable=True),
        sa.Column("rating", sa.Integer(), nullable=False),
        sa.Column("comment", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("rating >= 1 AND rating <= 5", name="chk_feedback_rating_range"),
    )
    op.create_index("idx_feedback_route_id", "feedback", ["route_id"])
    op.create_index("idx_feedback_created_at", "feedback", ["created_at"])

    # 10. Table: landslides
    op.create_table(
        "landslides",
        sa.Column("id", sa.CHAR(36), primary_key=True),
        sa.Column("source", sa.String(length=50), nullable=False, server_default="GSI"),
        sa.Column("source_record_id", sa.String(length=100), nullable=True),
        sa.Column("latitude", sa.Float(), nullable=False),
        sa.Column("longitude", sa.Float(), nullable=False),
        sa.Column(
            "location_geometry",
            geoalchemy2.Geometry(geometry_type="POINT", srid=4326, spatial_index=True),
            nullable=False,
        ),
        sa.Column("event_date", sa.Date(), nullable=True),
        sa.Column("is_historical", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column(
            "metadata",
            postgresql.JSONB(astext_type=sa.Text()).with_variant(sa.JSON(), "sqlite"),
            nullable=True,
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("latitude >= -90.0 AND latitude <= 90.0", name="chk_landslide_lat_bounds"),
        sa.CheckConstraint("longitude >= -180.0 AND longitude <= 180.0", name="chk_landslide_lon_bounds"),
        sa.UniqueConstraint("source", "source_record_id", name="uq_landslide_source_record_id"),
    )
    op.create_index("idx_landslides_source", "landslides", ["source"])
    op.create_index("idx_landslides_is_historical", "landslides", ["is_historical"])

    # 11. Table: cuttings
    op.create_table(
        "cuttings",
        sa.Column("id", sa.CHAR(36), primary_key=True),
        sa.Column("osm_way_id", sa.BigInteger(), nullable=False),
        sa.Column("source", sa.String(length=100), nullable=False, server_default="OpenStreetMap"),
        sa.Column("snapshot_year", sa.Integer(), nullable=False, server_default="2018"),
        sa.Column(
            "geometry",
            geoalchemy2.Geometry(geometry_type="LINESTRING", srid=4326, spatial_index=True),
            nullable=False,
        ),
        sa.Column(
            "tags",
            postgresql.JSONB(astext_type=sa.Text()).with_variant(sa.JSON(), "sqlite"),
            nullable=True,
        ),
        sa.Column("is_historical", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("osm_way_id", "snapshot_year", name="uq_cutting_osm_way_year"),
    )
    op.create_index("idx_cuttings_osm_way_id", "cuttings", ["osm_way_id"])
    op.create_index("idx_cuttings_snapshot_year", "cuttings", ["snapshot_year"])
    op.create_index("idx_cuttings_is_historical", "cuttings", ["is_historical"])


def downgrade() -> None:
    op.drop_table("cuttings")
    op.drop_table("landslides")
    op.drop_table("feedback")
    op.drop_table("community_hazard_reports")
    op.drop_table("hazard_alerts")
    op.drop_table("weather_snapshots")
    op.drop_table("risk_assessments")
    op.drop_table("route_segments")
    op.drop_table("saved_routes")
    op.drop_table("user_profiles")
