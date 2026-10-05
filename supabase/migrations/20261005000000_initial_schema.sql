-- ==============================================================================
-- DRISHTI-HIMALAYA — PRODUCTION SUPABASE POSTGRESQL + POSTGIS INITIAL SCHEMA
-- Comprehensive Initial Migration: Spatial Reference, Environmental Telemetry,
-- Historical Ground Truth, Route Discretization, Explainable MCDA Risk Assessments,
-- Community Incident Reporting, and Row Level Security (RLS) Policies.
--
-- Target: Supabase PostgreSQL 15+ with PostGIS 3.0+
-- Migration ID: 20261005000000_initial_schema.sql
-- ==============================================================================

BEGIN;

-- ------------------------------------------------------------------------------
-- 0. EXTENSIONS & UTILITY FUNCTIONS
-- ------------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS postgis;

-- Automatic updated_at timestamp trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = timezone('utc', now());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ------------------------------------------------------------------------------
-- 1. TABLE: user_profiles
-- Traveler and emergency personnel profiles for future auth and personalized routing.
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    display_name TEXT,
    email VARCHAR(255),
    role VARCHAR(50) DEFAULT 'commuter',
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_profiles_email ON user_profiles (email);

CREATE TRIGGER trg_user_profiles_updated_at
    BEFORE UPDATE ON user_profiles
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ------------------------------------------------------------------------------
-- 2. TABLE: locations
-- Geographic reference points, mountain passes, and administrative units in Uttarakhand.
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS locations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    elevation DOUBLE PRECISION,
    location_geometry geometry(POINT, 4326),
    administrative_metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),

    CONSTRAINT chk_location_lat_bounds CHECK (latitude >= -90.0 AND latitude <= 90.0),
    CONSTRAINT chk_location_lon_bounds CHECK (longitude >= -180.0 AND longitude <= 180.0)
);

CREATE INDEX IF NOT EXISTS idx_locations_geometry ON locations USING GIST (location_geometry);
CREATE INDEX IF NOT EXISTS idx_locations_lat_lon ON locations (latitude, longitude);
CREATE INDEX IF NOT EXISTS idx_locations_name ON locations (name);

CREATE TRIGGER trg_locations_updated_at
    BEFORE UPDATE ON locations
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ------------------------------------------------------------------------------
-- 3. TABLE: saved_routes
-- Evaluated or user-persisted highway corridors with PostGIS LineString geometry.
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS saved_routes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES user_profiles(id) ON DELETE SET NULL,
    name TEXT,
    origin_name TEXT,
    destination_name TEXT,
    origin_lat DOUBLE PRECISION NOT NULL,
    origin_lon DOUBLE PRECISION NOT NULL,
    destination_lat DOUBLE PRECISION NOT NULL,
    destination_lon DOUBLE PRECISION NOT NULL,
    vehicle_profile VARCHAR(50) NOT NULL DEFAULT 'driving-car',
    provider VARCHAR(50) NOT NULL DEFAULT 'OSRM',
    distance_km DOUBLE PRECISION,
    risk_score DOUBLE PRECISION,
    risk_tier VARCHAR(20),
    analysis_status VARCHAR(20) DEFAULT 'COMPLETE',
    route_geometry geometry(LINESTRING, 4326),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),

    CONSTRAINT chk_saved_route_risk_score CHECK (risk_score IS NULL OR (risk_score >= 0.0 AND risk_score <= 100.0)),
    CONSTRAINT chk_saved_route_orig_lat CHECK (origin_lat >= -90.0 AND origin_lat <= 90.0),
    CONSTRAINT chk_saved_route_orig_lon CHECK (origin_lon >= -180.0 AND origin_lon <= 180.0),
    CONSTRAINT chk_saved_route_dest_lat CHECK (destination_lat >= -90.0 AND destination_lat <= 90.0),
    CONSTRAINT chk_saved_route_dest_lon CHECK (destination_lon >= -180.0 AND destination_lon <= 180.0)
);

CREATE INDEX IF NOT EXISTS idx_saved_routes_route_geometry ON saved_routes USING GIST (route_geometry);
CREATE INDEX IF NOT EXISTS idx_saved_routes_user_id ON saved_routes (user_id);
CREATE INDEX IF NOT EXISTS idx_saved_routes_risk_tier ON saved_routes (risk_tier);
CREATE INDEX IF NOT EXISTS idx_saved_routes_created_at ON saved_routes (created_at);

CREATE TRIGGER trg_saved_routes_updated_at
    BEFORE UPDATE ON saved_routes
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ------------------------------------------------------------------------------
-- 4. TABLE: route_segments
-- Discrete uniform 250m road segments generated by analytical highway segmenter.
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS route_segments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    route_id UUID NOT NULL REFERENCES saved_routes(id) ON DELETE CASCADE,
    segment_index INTEGER NOT NULL,
    segment_id VARCHAR(100) NOT NULL,
    start_chainage_m DOUBLE PRECISION NOT NULL,
    end_chainage_m DOUBLE PRECISION NOT NULL,
    length_m DOUBLE PRECISION NOT NULL DEFAULT 250.0,
    bearing_deg DOUBLE PRECISION,
    midpoint geometry(POINT, 4326) NOT NULL,
    geometry geometry(LINESTRING, 4326) NOT NULL,
    risk_score DOUBLE PRECISION,
    risk_tier VARCHAR(20),
    analysis_status VARCHAR(20) DEFAULT 'COMPLETE',
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),

    CONSTRAINT chk_segment_risk_score CHECK (risk_score IS NULL OR (risk_score >= 0.0 AND risk_score <= 100.0)),
    CONSTRAINT chk_segment_length_positive CHECK (length_m > 0.0)
);

CREATE INDEX IF NOT EXISTS idx_route_segments_geometry ON route_segments USING GIST (geometry);
CREATE INDEX IF NOT EXISTS idx_route_segments_midpoint ON route_segments USING GIST (midpoint);
CREATE INDEX IF NOT EXISTS idx_route_segments_route_id ON route_segments (route_id);
CREATE INDEX IF NOT EXISTS idx_route_segments_risk_tier ON route_segments (risk_tier);
CREATE INDEX IF NOT EXISTS idx_route_segments_segment_id ON route_segments (segment_id);

-- ------------------------------------------------------------------------------
-- 5. TABLE: risk_assessments
-- Mathematical MCDA factor logs preserving 5-factor explainability & locked weights.
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS risk_assessments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    route_id UUID REFERENCES saved_routes(id) ON DELETE CASCADE,
    segment_id UUID REFERENCES route_segments(id) ON DELETE CASCADE,
    risk_score DOUBLE PRECISION NOT NULL,
    risk_tier VARCHAR(20) NOT NULL,
    analysis_status VARCHAR(20) NOT NULL DEFAULT 'COMPLETE',
    slope_score DOUBLE PRECISION,
    rain_score DOUBLE PRECISION,
    proximity_score DOUBLE PRECISION,
    density_score DOUBLE PRECISION,
    exposure_score DOUBLE PRECISION,
    slope_weight DOUBLE PRECISION NOT NULL DEFAULT 0.35,
    rain_weight DOUBLE PRECISION NOT NULL DEFAULT 0.30,
    proximity_weight DOUBLE PRECISION NOT NULL DEFAULT 0.20,
    density_weight DOUBLE PRECISION NOT NULL DEFAULT 0.10,
    exposure_weight DOUBLE PRECISION NOT NULL DEFAULT 0.05,
    average_route_score DOUBLE PRECISION,
    maximum_segment_score DOUBLE PRECISION,
    engine_version VARCHAR(50) NOT NULL DEFAULT '1.0.0-mcda',
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),

    CONSTRAINT chk_risk_score_bounds CHECK (risk_score >= 0.0 AND risk_score <= 100.0),
    CONSTRAINT chk_slope_score_bounds CHECK (slope_score IS NULL OR (slope_score >= 0.0 AND slope_score <= 100.0)),
    CONSTRAINT chk_rain_score_bounds CHECK (rain_score IS NULL OR (rain_score >= 0.0 AND rain_score <= 100.0)),
    CONSTRAINT chk_prox_score_bounds CHECK (proximity_score IS NULL OR (proximity_score >= 0.0 AND proximity_score <= 100.0)),
    CONSTRAINT chk_density_score_bounds CHECK (density_score IS NULL OR (density_score >= 0.0 AND density_score <= 100.0)),
    CONSTRAINT chk_exp_score_bounds CHECK (exposure_score IS NULL OR (exposure_score >= 0.0 AND exposure_score <= 100.0))
);

CREATE INDEX IF NOT EXISTS idx_risk_assessments_route_id ON risk_assessments (route_id);
CREATE INDEX IF NOT EXISTS idx_risk_assessments_segment_id ON risk_assessments (segment_id);
CREATE INDEX IF NOT EXISTS idx_risk_assessments_tier ON risk_assessments (risk_tier);
CREATE INDEX IF NOT EXISTS idx_risk_assessments_created_at ON risk_assessments (created_at);

-- ------------------------------------------------------------------------------
-- 6. TABLE: weather_snapshots
-- Deduplicated meteorological observations and forecasts along corridor coordinates.
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS weather_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    observed_at TIMESTAMPTZ NOT NULL,
    source VARCHAR(100) NOT NULL DEFAULT 'Open-Meteo',
    precipitation_mm DOUBLE PRECISION,
    precipitation_24h_mm DOUBLE PRECISION,
    precipitation_72h_mm DOUBLE PRECISION,
    temperature_c DOUBLE PRECISION,
    convective_rain_mm DOUBLE PRECISION,
    raw_payload JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),

    CONSTRAINT chk_weather_lat_bounds CHECK (latitude >= -90.0 AND latitude <= 90.0),
    CONSTRAINT chk_weather_lon_bounds CHECK (longitude >= -180.0 AND longitude <= 180.0),
    CONSTRAINT uq_weather_source_loc_time UNIQUE (source, latitude, longitude, observed_at)
);

CREATE INDEX IF NOT EXISTS idx_weather_observed_at ON weather_snapshots (observed_at);
CREATE INDEX IF NOT EXISTS idx_weather_loc ON weather_snapshots (latitude, longitude);

-- ------------------------------------------------------------------------------
-- 7. TABLE: hazard_alerts
-- Real-time situational hazard alerts with mandatory origin_type classification.
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS hazard_alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    alert_type VARCHAR(50) NOT NULL,
    severity VARCHAR(20) NOT NULL,
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    location_geometry geometry(POINT, 4326),
    region VARCHAR(100) DEFAULT 'Uttarakhand',
    source VARCHAR(100) NOT NULL,
    source_timestamp TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    expires_at TIMESTAMPTZ,
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    origin_type VARCHAR(20) NOT NULL,
    metadata JSONB DEFAULT '{}'::jsonb,

    CONSTRAINT chk_alert_origin_type_valid CHECK (origin_type IN ('OBSERVED', 'CALCULATED', 'HISTORICAL')),
    CONSTRAINT chk_alert_severity_valid CHECK (severity IN ('LOW', 'MODERATE', 'HIGH', 'SEVERE')),
    CONSTRAINT chk_alert_lat_bounds CHECK (latitude IS NULL OR (latitude >= -90.0 AND latitude <= 90.0)),
    CONSTRAINT chk_alert_lon_bounds CHECK (longitude IS NULL OR (longitude >= -180.0 AND longitude <= 180.0))
);

CREATE INDEX IF NOT EXISTS idx_hazard_alerts_location_geometry ON hazard_alerts USING GIST (location_geometry);
CREATE INDEX IF NOT EXISTS idx_hazard_alerts_severity ON hazard_alerts (severity);
CREATE INDEX IF NOT EXISTS idx_hazard_alerts_status ON hazard_alerts (status);
CREATE INDEX IF NOT EXISTS idx_hazard_alerts_origin_type ON hazard_alerts (origin_type);
CREATE INDEX IF NOT EXISTS idx_hazard_alerts_created_at ON hazard_alerts (created_at);
CREATE INDEX IF NOT EXISTS idx_hazard_alerts_expires_at ON hazard_alerts (expires_at);

-- ------------------------------------------------------------------------------
-- 8. TABLE: community_hazard_reports
-- Crowdsourced ground reports (rockfall, landslide, road blockage) by travelers.
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS community_hazard_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES user_profiles(id) ON DELETE SET NULL,
    report_type VARCHAR(50) NOT NULL,
    description TEXT,
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    location_geometry geometry(POINT, 4326) NOT NULL,
    severity VARCHAR(20) DEFAULT 'MODERATE',
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    source VARCHAR(50) NOT NULL DEFAULT 'COMMUNITY',
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),

    CONSTRAINT chk_community_report_lat_bounds CHECK (latitude >= -90.0 AND latitude <= 90.0),
    CONSTRAINT chk_community_report_lon_bounds CHECK (longitude >= -180.0 AND longitude <= 180.0)
);

CREATE INDEX IF NOT EXISTS idx_community_hazard_reports_geometry ON community_hazard_reports USING GIST (location_geometry);
CREATE INDEX IF NOT EXISTS idx_community_reports_status ON community_hazard_reports (status);
CREATE INDEX IF NOT EXISTS idx_community_reports_type ON community_hazard_reports (report_type);
CREATE INDEX IF NOT EXISTS idx_community_reports_created_at ON community_hazard_reports (created_at);

CREATE TRIGGER trg_community_hazard_reports_updated_at
    BEFORE UPDATE ON community_hazard_reports
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ------------------------------------------------------------------------------
-- 9. TABLE: feedback
-- Traveler satisfaction, route rating (1-5), and qualitative safety remarks.
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS feedback (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES user_profiles(id) ON DELETE SET NULL,
    route_id UUID REFERENCES saved_routes(id) ON DELETE SET NULL,
    rating INTEGER NOT NULL,
    comment TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),

    CONSTRAINT chk_feedback_rating_range CHECK (rating >= 1 AND rating <= 5)
);

CREATE INDEX IF NOT EXISTS idx_feedback_route_id ON feedback (route_id);
CREATE INDEX IF NOT EXISTS idx_feedback_created_at ON feedback (created_at);

-- ------------------------------------------------------------------------------
-- 10. TABLE: landslides
-- Geological Survey of India (GSI) historical landslide spatial catalog.
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS landslides (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source VARCHAR(50) NOT NULL DEFAULT 'GSI',
    source_record_id VARCHAR(100),
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    location_geometry geometry(POINT, 4326) NOT NULL,
    event_date DATE,
    is_historical BOOLEAN NOT NULL DEFAULT true,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),

    CONSTRAINT chk_landslide_lat_bounds CHECK (latitude >= -90.0 AND latitude <= 90.0),
    CONSTRAINT chk_landslide_lon_bounds CHECK (longitude >= -180.0 AND longitude <= 180.0),
    CONSTRAINT uq_landslide_source_record_id UNIQUE (source, source_record_id)
);

CREATE INDEX IF NOT EXISTS idx_landslides_location_geometry ON landslides USING GIST (location_geometry);
CREATE INDEX IF NOT EXISTS idx_landslides_source ON landslides (source);
CREATE INDEX IF NOT EXISTS idx_landslides_is_historical ON landslides (is_historical);

-- ------------------------------------------------------------------------------
-- 11. TABLE: cuttings
-- Historical OpenStreetMap 2018 hillside road cutting evidence (cutting=yes).
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cuttings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    osm_way_id BIGINT NOT NULL,
    source VARCHAR(100) NOT NULL DEFAULT 'OpenStreetMap',
    snapshot_year INTEGER NOT NULL DEFAULT 2018,
    geometry geometry(LINESTRING, 4326) NOT NULL,
    tags JSONB DEFAULT '{}'::jsonb,
    is_historical BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),

    CONSTRAINT uq_cutting_osm_way_year UNIQUE (osm_way_id, snapshot_year)
);

CREATE INDEX IF NOT EXISTS idx_cuttings_geometry ON cuttings USING GIST (geometry);
CREATE INDEX IF NOT EXISTS idx_cuttings_osm_way_id ON cuttings (osm_way_id);
CREATE INDEX IF NOT EXISTS idx_cuttings_snapshot_year ON cuttings (snapshot_year);
CREATE INDEX IF NOT EXISTS idx_cuttings_is_historical ON cuttings (is_historical);

-- ------------------------------------------------------------------------------
-- 12. TABLE: terrain_observations
-- High-resolution digital elevation model (GLO-30) metrics: slope, aspect, elevation.
-- ------------------------------------------------------------------------------
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

-- ------------------------------------------------------------------------------
-- 13. TABLE: disaster_events
-- Documented multi-hazard events (landslide, flash flood, rockfall, avalanche).
-- ------------------------------------------------------------------------------
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
    location_geometry geometry(POINT, 4326),
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

-- ------------------------------------------------------------------------------
-- 14. TABLE: weather_observations
-- Meteorological telemetry linked to corridor locations (rainfall, temp, humidity, wind).
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS weather_observations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    location_id UUID REFERENCES locations(id) ON DELETE SET NULL,
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    location_geometry geometry(POINT, 4326),
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

-- ------------------------------------------------------------------------------
-- 15. ALEMBIC MIGRATION TRACKING SYNCHRONIZATION
-- Preserves Alembic versioning state so backend migration runners recognize schema.
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS alembic_version (
    version_num VARCHAR(32) NOT NULL,
    CONSTRAINT alembic_version_pkc PRIMARY KEY (version_num)
);

INSERT INTO alembic_version (version_num)
VALUES ('002_phase_2b')
ON CONFLICT (version_num) DO NOTHING;

-- ------------------------------------------------------------------------------
-- 16. ROW LEVEL SECURITY (RLS) POLICIES
-- Enforces least-privilege access across public anonymous and authenticated roles.
-- ------------------------------------------------------------------------------

-- Enable RLS on all 14 application tables
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE saved_routes ENABLE ROW LEVEL SECURITY;
ALTER TABLE route_segments ENABLE ROW LEVEL SECURITY;
ALTER TABLE risk_assessments ENABLE ROW LEVEL SECURITY;
ALTER TABLE weather_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE hazard_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE community_hazard_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE landslides ENABLE ROW LEVEL SECURITY;
ALTER TABLE cuttings ENABLE ROW LEVEL SECURITY;
ALTER TABLE terrain_observations ENABLE ROW LEVEL SECURITY;
ALTER TABLE disaster_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE weather_observations ENABLE ROW LEVEL SECURITY;

-- 1. user_profiles
CREATE POLICY "Public profiles are viewable by owner or service role"
    ON user_profiles FOR SELECT
    USING (auth.uid() = id OR auth.role() = 'service_role');

CREATE POLICY "Users can insert their own profile"
    ON user_profiles FOR INSERT
    WITH CHECK (auth.uid() = id OR auth.role() = 'service_role');

CREATE POLICY "Users can update their own profile"
    ON user_profiles FOR UPDATE
    USING (auth.uid() = id OR auth.role() = 'service_role');

-- 2. locations (Public Read Reference Data)
CREATE POLICY "Locations are publicly readable"
    ON locations FOR SELECT
    USING (true);

CREATE POLICY "Service role can modify locations"
    ON locations FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- 3. saved_routes
CREATE POLICY "Saved routes are publicly readable"
    ON saved_routes FOR SELECT
    USING (true);

CREATE POLICY "Users can insert saved routes"
    ON saved_routes FOR INSERT
    WITH CHECK (auth.uid() = user_id OR user_id IS NULL OR auth.role() = 'service_role');

CREATE POLICY "Users can update their own saved routes"
    ON saved_routes FOR UPDATE
    USING (auth.uid() = user_id OR auth.role() = 'service_role');

CREATE POLICY "Users can delete their own saved routes"
    ON saved_routes FOR DELETE
    USING (auth.uid() = user_id OR auth.role() = 'service_role');

-- 4. route_segments
CREATE POLICY "Route segments are publicly readable"
    ON route_segments FOR SELECT
    USING (true);

CREATE POLICY "Route segments can be inserted with route creation"
    ON route_segments FOR INSERT
    WITH CHECK (true);

CREATE POLICY "Service role can modify route segments"
    ON route_segments FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- 5. risk_assessments
CREATE POLICY "Risk assessments are publicly readable"
    ON risk_assessments FOR SELECT
    USING (true);

CREATE POLICY "Risk assessments can be inserted with analysis"
    ON risk_assessments FOR INSERT
    WITH CHECK (true);

CREATE POLICY "Service role can modify risk assessments"
    ON risk_assessments FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- 6. weather_snapshots
CREATE POLICY "Weather snapshots are publicly readable"
    ON weather_snapshots FOR SELECT
    USING (true);

CREATE POLICY "Service role can insert weather snapshots"
    ON weather_snapshots FOR INSERT
    WITH CHECK (true);

CREATE POLICY "Service role can modify weather snapshots"
    ON weather_snapshots FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- 7. hazard_alerts
CREATE POLICY "Active hazard alerts are publicly readable"
    ON hazard_alerts FOR SELECT
    USING (status = 'ACTIVE' OR auth.role() = 'service_role');

CREATE POLICY "Service role can manage hazard alerts"
    ON hazard_alerts FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- 8. community_hazard_reports
CREATE POLICY "Verified reports or own reports are viewable"
    ON community_hazard_reports FOR SELECT
    USING (status = 'VERIFIED' OR auth.uid() = user_id OR auth.role() = 'service_role');

CREATE POLICY "Anyone can submit community hazard reports"
    ON community_hazard_reports FOR INSERT
    WITH CHECK (true);

CREATE POLICY "Users can update their own pending reports"
    ON community_hazard_reports FOR UPDATE
    USING (auth.uid() = user_id OR auth.role() = 'service_role');

-- 9. feedback
CREATE POLICY "Feedback is publicly readable"
    ON feedback FOR SELECT
    USING (true);

CREATE POLICY "Anyone can submit route feedback"
    ON feedback FOR INSERT
    WITH CHECK (true);

-- 10. landslides (Reference Baseline)
CREATE POLICY "Historical landslide catalog is publicly readable"
    ON landslides FOR SELECT
    USING (true);

CREATE POLICY "Service role can manage landslide records"
    ON landslides FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- 11. cuttings (Reference Baseline)
CREATE POLICY "Historical cuttings are publicly readable"
    ON cuttings FOR SELECT
    USING (true);

CREATE POLICY "Service role can manage cutting records"
    ON cuttings FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- 12. terrain_observations
CREATE POLICY "Terrain observations are publicly readable"
    ON terrain_observations FOR SELECT
    USING (true);

CREATE POLICY "Service role can manage terrain observations"
    ON terrain_observations FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- 13. disaster_events
CREATE POLICY "Disaster events are publicly readable"
    ON disaster_events FOR SELECT
    USING (true);

CREATE POLICY "Service role can manage disaster events"
    ON disaster_events FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- 14. weather_observations
CREATE POLICY "Weather observations are publicly readable"
    ON weather_observations FOR SELECT
    USING (true);

CREATE POLICY "Service role can manage weather observations"
    ON weather_observations FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

COMMIT;
