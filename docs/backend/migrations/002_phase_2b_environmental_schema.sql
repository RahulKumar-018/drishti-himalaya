-- ============================================================================
-- DRISHTI HIMALAYA — PHASE 2B DATABASE MIGRATION SCRIPT
-- Environmental & Geospatial Data Pipeline Schema
--
-- Target: PostgreSQL 15+ with PostGIS 3.0+
-- Migration Revision: 002_phase_2b
-- Down Revision: 001_phase_2a
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. Table: locations (Geographic Reference Points and Administrative Units)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS locations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    elevation DOUBLE PRECISION,
    location_geometry geometry(Point, 4326),
    administrative_metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),

    CONSTRAINT chk_location_lat_bounds CHECK (latitude >= -90.0 AND latitude <= 90.0),
    CONSTRAINT chk_location_lon_bounds CHECK (longitude >= -180.0 AND longitude <= 180.0)
);

CREATE INDEX IF NOT EXISTS idx_locations_geometry ON locations USING GIST (location_geometry);
CREATE INDEX IF NOT EXISTS idx_locations_lat_lon ON locations (latitude, longitude);
CREATE INDEX IF NOT EXISTS idx_locations_name ON locations (name);

-- ----------------------------------------------------------------------------
-- 2. Table: terrain_observations (Topographic & Geomorphological Metrics)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS terrain_observations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    location_id UUID NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
    elevation DOUBLE PRECISION NOT NULL,
    slope DOUBLE PRECISION NOT NULL,
    aspect DOUBLE PRECISION,
    terrain_class VARCHAR(50),
    source VARCHAR(100) NOT NULL DEFAULT 'Copernicus DEM GLO-30',
    source_reference VARCHAR(255),
    observation_time TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),

    CONSTRAINT chk_terrain_slope_bounds CHECK (slope >= 0.0 AND slope <= 90.0),
    CONSTRAINT chk_terrain_aspect_bounds CHECK (aspect IS NULL OR (aspect >= 0.0 AND aspect <= 360.0))
);

CREATE INDEX IF NOT EXISTS idx_terrain_obs_location_id ON terrain_observations (location_id);
CREATE INDEX IF NOT EXISTS idx_terrain_obs_created_at ON terrain_observations (created_at);

-- ----------------------------------------------------------------------------
-- 3. Table: disaster_events (Multi-Hazard Historical & Documented Events)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS disaster_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    location_id UUID REFERENCES locations(id) ON DELETE SET NULL,
    event_type VARCHAR(50) NOT NULL,
    event_date DATE,
    severity VARCHAR(50),
    source VARCHAR(100) NOT NULL,
    source_reference VARCHAR(255),
    description TEXT,
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    location_geometry geometry(Point, 4326),
    is_historical BOOLEAN NOT NULL DEFAULT true,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),

    CONSTRAINT chk_disaster_lat_bounds CHECK (latitude >= -90.0 AND latitude <= 90.0),
    CONSTRAINT chk_disaster_lon_bounds CHECK (longitude >= -180.0 AND longitude <= 180.0),
    CONSTRAINT chk_disaster_event_type CHECK (
        event_type IN ('landslide', 'flash_flood', 'rockfall', 'avalanche', 'debris_flow', 'road_subsidence', 'other')
    )
);

CREATE INDEX IF NOT EXISTS idx_disaster_events_geometry ON disaster_events USING GIST (location_geometry);
CREATE INDEX IF NOT EXISTS idx_disaster_events_loc_id ON disaster_events (location_id);
CREATE INDEX IF NOT EXISTS idx_disaster_events_type ON disaster_events (event_type);
CREATE INDEX IF NOT EXISTS idx_disaster_events_date ON disaster_events (event_date);
CREATE INDEX IF NOT EXISTS idx_disaster_events_source ON disaster_events (source);

-- ----------------------------------------------------------------------------
-- 4. Table: weather_observations (Extensible Multi-Source Weather Telemetry)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS weather_observations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    location_id UUID REFERENCES locations(id) ON DELETE SET NULL,
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    location_geometry geometry(Point, 4326),
    rainfall_mm DOUBLE PRECISION,
    temperature_c DOUBLE PRECISION,
    humidity_percent DOUBLE PRECISION,
    wind_speed_kmh DOUBLE PRECISION,
    precipitation_probability DOUBLE PRECISION,
    observation_time TIMESTAMPTZ NOT NULL,
    forecast_time TIMESTAMPTZ,
    source VARCHAR(100) NOT NULL,
    source_type VARCHAR(50) NOT NULL,
    raw_payload JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),

    CONSTRAINT chk_wobs_lat_bounds CHECK (latitude >= -90.0 AND latitude <= 90.0),
    CONSTRAINT chk_wobs_lon_bounds CHECK (longitude >= -180.0 AND longitude <= 180.0),
    CONSTRAINT chk_wobs_rainfall_positive CHECK (rainfall_mm IS NULL OR rainfall_mm >= 0.0),
    CONSTRAINT chk_wobs_temp_bounds CHECK (temperature_c IS NULL OR (temperature_c >= -60.0 AND temperature_c <= 60.0)),
    CONSTRAINT chk_wobs_humidity_bounds CHECK (humidity_percent IS NULL OR (humidity_percent >= 0.0 AND humidity_percent <= 100.0)),
    CONSTRAINT chk_wobs_wind_bounds CHECK (wind_speed_kmh IS NULL OR wind_speed_kmh >= 0.0),
    CONSTRAINT chk_wobs_precip_prob_bounds CHECK (precipitation_probability IS NULL OR (precipitation_probability >= 0.0 AND precipitation_probability <= 100.0)),
    CONSTRAINT chk_wobs_source_type CHECK (
        source_type IN ('historical_dataset', 'weather_api', 'manual', 'simulated')
    )
);

CREATE INDEX IF NOT EXISTS idx_weather_obs_geometry ON weather_observations USING GIST (location_geometry);
CREATE INDEX IF NOT EXISTS idx_weather_obs_location_id ON weather_observations (location_id);
CREATE INDEX IF NOT EXISTS idx_weather_obs_time ON weather_observations (observation_time);
CREATE INDEX IF NOT EXISTS idx_weather_obs_source_type ON weather_observations (source_type);
CREATE INDEX IF NOT EXISTS idx_weather_obs_coords ON weather_observations (latitude, longitude);

COMMIT;
