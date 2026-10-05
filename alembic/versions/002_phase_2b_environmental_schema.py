"""Phase 2B environmental and geospatial data pipeline schema migration for Drishti-Himalaya.

Revision ID: 002_phase_2b
Revises: 001_phase_2a
Create Date: 2026-10-05 16:15:00

Creates:
1. locations (Point 4326, administrative metadata, elevation)
2. terrain_observations (elevation, slope degrees, aspect degrees, terrain class, provenance)
3. disaster_events (Point 4326, multi-hazard: landslide, flash_flood, rockfall, avalanche, debris_flow)
4. weather_observations (Point 4326, rainfall, temp, humidity, wind, prob, extensible source_type)
"""

from typing import Sequence, Union

from alembic import op
import geoalchemy2
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "002_phase_2b"
down_revision: Union[str, None] = "001_phase_2a"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Table: locations
    op.create_table(
        "locations",
        sa.Column("id", sa.CHAR(36), primary_key=True),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("latitude", sa.Float(), nullable=False),
        sa.Column("longitude", sa.Float(), nullable=False),
        sa.Column("elevation", sa.Float(), nullable=True),
        sa.Column(
            "location_geometry",
            geoalchemy2.Geometry(geometry_type="POINT", srid=4326, spatial_index=True),
            nullable=True,
        ),
        sa.Column(
            "administrative_metadata",
            postgresql.JSONB(astext_type=sa.Text()).with_variant(sa.JSON(), "sqlite"),
            nullable=True,
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("latitude >= -90.0 AND latitude <= 90.0", name="chk_location_lat_bounds"),
        sa.CheckConstraint("longitude >= -180.0 AND longitude <= 180.0", name="chk_location_lon_bounds"),
    )
    op.create_index("idx_locations_lat_lon", "locations", ["latitude", "longitude"])
    op.create_index("idx_locations_name", "locations", ["name"])

    # 2. Table: terrain_observations
    op.create_table(
        "terrain_observations",
        sa.Column("id", sa.CHAR(36), primary_key=True),
        sa.Column("location_id", sa.CHAR(36), sa.ForeignKey("locations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("elevation", sa.Float(), nullable=False),
        sa.Column("slope", sa.Float(), nullable=False),
        sa.Column("aspect", sa.Float(), nullable=True),
        sa.Column("terrain_class", sa.String(length=50), nullable=True),
        sa.Column("source", sa.String(length=100), nullable=False, server_default="Copernicus DEM GLO-30"),
        sa.Column("source_reference", sa.String(length=255), nullable=True),
        sa.Column("observation_time", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("slope >= 0.0 AND slope <= 90.0", name="chk_terrain_slope_bounds"),
        sa.CheckConstraint(
            "aspect IS NULL OR (aspect >= 0.0 AND aspect <= 360.0)",
            name="chk_terrain_aspect_bounds",
        ),
    )
    op.create_index("idx_terrain_obs_location_id", "terrain_observations", ["location_id"])
    op.create_index("idx_terrain_obs_created_at", "terrain_observations", ["created_at"])

    # 3. Table: disaster_events
    op.create_table(
        "disaster_events",
        sa.Column("id", sa.CHAR(36), primary_key=True),
        sa.Column("location_id", sa.CHAR(36), sa.ForeignKey("locations.id", ondelete="SET NULL"), nullable=True),
        sa.Column("event_type", sa.String(length=50), nullable=False),
        sa.Column("event_date", sa.Date(), nullable=True),
        sa.Column("severity", sa.String(length=50), nullable=True),
        sa.Column("source", sa.String(length=100), nullable=False),
        sa.Column("source_reference", sa.String(length=255), nullable=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("latitude", sa.Float(), nullable=False),
        sa.Column("longitude", sa.Float(), nullable=False),
        sa.Column(
            "location_geometry",
            geoalchemy2.Geometry(geometry_type="POINT", srid=4326, spatial_index=True),
            nullable=True,
        ),
        sa.Column("is_historical", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column(
            "metadata",
            postgresql.JSONB(astext_type=sa.Text()).with_variant(sa.JSON(), "sqlite"),
            nullable=True,
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("latitude >= -90.0 AND latitude <= 90.0", name="chk_disaster_lat_bounds"),
        sa.CheckConstraint("longitude >= -180.0 AND longitude <= 180.0", name="chk_disaster_lon_bounds"),
        sa.CheckConstraint(
            "event_type IN ('landslide', 'flash_flood', 'rockfall', 'avalanche', 'debris_flow', 'road_subsidence', 'other')",
            name="chk_disaster_event_type",
        ),
    )
    op.create_index("idx_disaster_events_loc_id", "disaster_events", ["location_id"])
    op.create_index("idx_disaster_events_type", "disaster_events", ["event_type"])
    op.create_index("idx_disaster_events_date", "disaster_events", ["event_date"])
    op.create_index("idx_disaster_events_source", "disaster_events", ["source"])

    # 4. Table: weather_observations
    op.create_table(
        "weather_observations",
        sa.Column("id", sa.CHAR(36), primary_key=True),
        sa.Column("location_id", sa.CHAR(36), sa.ForeignKey("locations.id", ondelete="SET NULL"), nullable=True),
        sa.Column("latitude", sa.Float(), nullable=False),
        sa.Column("longitude", sa.Float(), nullable=False),
        sa.Column(
            "location_geometry",
            geoalchemy2.Geometry(geometry_type="POINT", srid=4326, spatial_index=True),
            nullable=True,
        ),
        sa.Column("rainfall_mm", sa.Float(), nullable=True),
        sa.Column("temperature_c", sa.Float(), nullable=True),
        sa.Column("humidity_percent", sa.Float(), nullable=True),
        sa.Column("wind_speed_kmh", sa.Float(), nullable=True),
        sa.Column("precipitation_probability", sa.Float(), nullable=True),
        sa.Column("observation_time", sa.DateTime(timezone=True), nullable=False),
        sa.Column("forecast_time", sa.DateTime(timezone=True), nullable=True),
        sa.Column("source", sa.String(length=100), nullable=False),
        sa.Column("source_type", sa.String(length=50), nullable=False),
        sa.Column(
            "raw_payload",
            postgresql.JSONB(astext_type=sa.Text()).with_variant(sa.JSON(), "sqlite"),
            nullable=True,
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("latitude >= -90.0 AND latitude <= 90.0", name="chk_wobs_lat_bounds"),
        sa.CheckConstraint("longitude >= -180.0 AND longitude <= 180.0", name="chk_wobs_lon_bounds"),
        sa.CheckConstraint(
            "rainfall_mm IS NULL OR rainfall_mm >= 0.0",
            name="chk_wobs_rainfall_positive",
        ),
        sa.CheckConstraint(
            "temperature_c IS NULL OR (temperature_c >= -60.0 AND temperature_c <= 60.0)",
            name="chk_wobs_temp_bounds",
        ),
        sa.CheckConstraint(
            "humidity_percent IS NULL OR (humidity_percent >= 0.0 AND humidity_percent <= 100.0)",
            name="chk_wobs_humidity_bounds",
        ),
        sa.CheckConstraint(
            "wind_speed_kmh IS NULL OR wind_speed_kmh >= 0.0",
            name="chk_wobs_wind_bounds",
        ),
        sa.CheckConstraint(
            "precipitation_probability IS NULL OR (precipitation_probability >= 0.0 AND precipitation_probability <= 100.0)",
            name="chk_wobs_precip_prob_bounds",
        ),
        sa.CheckConstraint(
            "source_type IN ('historical_dataset', 'weather_api', 'manual', 'simulated')",
            name="chk_wobs_source_type",
        ),
    )
    op.create_index("idx_wobs_location_id", "weather_observations", ["location_id"])
    op.create_index("idx_wobs_obs_time", "weather_observations", ["observation_time"])
    op.create_index("idx_wobs_source_type", "weather_observations", ["source_type"])
    op.create_index("idx_wobs_coords", "weather_observations", ["latitude", "longitude"])


def downgrade() -> None:
    op.drop_table("weather_observations")
    op.drop_table("disaster_events")
    op.drop_table("terrain_observations")
    op.drop_table("locations")
