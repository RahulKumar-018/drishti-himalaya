BEGIN;

CREATE TABLE alembic_version (
    version_num VARCHAR(32) NOT NULL,
    CONSTRAINT alembic_version_pkc PRIMARY KEY (version_num)
);

-- Running upgrade  -> 001_phase_2a

CREATE EXTENSION IF NOT EXISTS postgis;;

CREATE TABLE user_profiles (
    id CHAR(36) NOT NULL,
    display_name TEXT,
    email VARCHAR(255),
    role VARCHAR(50) DEFAULT 'commuter',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    PRIMARY KEY (id)
);

CREATE UNIQUE INDEX idx_user_profiles_email ON user_profiles (email);

CREATE TABLE saved_routes (
    id CHAR(36) NOT NULL,
    user_id CHAR(36),
    name TEXT,
    origin_name TEXT,
    destination_name TEXT,
    origin_lat FLOAT NOT NULL,
    origin_lon FLOAT NOT NULL,
    destination_lat FLOAT NOT NULL,
    destination_lon FLOAT NOT NULL,
    vehicle_profile VARCHAR(50) DEFAULT 'driving-car' NOT NULL,
    provider VARCHAR(50) DEFAULT 'OSRM' NOT NULL,
    distance_km FLOAT,
    risk_score FLOAT,
    risk_tier VARCHAR(20),
    analysis_status VARCHAR(20) DEFAULT 'COMPLETE',
    route_geometry geometry(LINESTRING,4326),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    PRIMARY KEY (id),
    CONSTRAINT chk_saved_route_risk_score CHECK (risk_score >= 0.0 AND risk_score <= 100.0),
    CONSTRAINT chk_saved_route_orig_lat CHECK (origin_lat >= -90.0 AND origin_lat <= 90.0),
    CONSTRAINT chk_saved_route_orig_lon CHECK (origin_lon >= -180.0 AND origin_lon <= 180.0),
    CONSTRAINT chk_saved_route_dest_lat CHECK (destination_lat >= -90.0 AND destination_lat <= 90.0),
    CONSTRAINT chk_saved_route_dest_lon CHECK (destination_lon >= -180.0 AND destination_lon <= 180.0),
    FOREIGN KEY(user_id) REFERENCES user_profiles (id) ON DELETE SET NULL
);

CREATE INDEX idx_saved_routes_route_geometry ON saved_routes USING gist (route_geometry);

CREATE INDEX idx_saved_routes_user_id ON saved_routes (user_id);

CREATE INDEX idx_saved_routes_risk_tier ON saved_routes (risk_tier);

CREATE INDEX idx_saved_routes_created_at ON saved_routes (created_at);

CREATE TABLE route_segments (
    id CHAR(36) NOT NULL,
    route_id CHAR(36) NOT NULL,
    segment_index INTEGER NOT NULL,
    segment_id VARCHAR(100) NOT NULL,
    start_chainage_m FLOAT NOT NULL,
    end_chainage_m FLOAT NOT NULL,
    length_m FLOAT DEFAULT '250.0' NOT NULL,
    bearing_deg FLOAT,
    midpoint geometry(POINT,4326) NOT NULL,
    geometry geometry(LINESTRING,4326) NOT NULL,
    risk_score FLOAT,
    risk_tier VARCHAR(20),
    analysis_status VARCHAR(20) DEFAULT 'COMPLETE',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    PRIMARY KEY (id),
    CONSTRAINT chk_segment_risk_score CHECK (risk_score >= 0.0 AND risk_score <= 100.0),
    CONSTRAINT chk_segment_length_positive CHECK (length_m > 0.0),
    FOREIGN KEY(route_id) REFERENCES saved_routes (id) ON DELETE CASCADE
);

CREATE INDEX idx_route_segments_geometry ON route_segments USING gist (geometry);

CREATE INDEX idx_route_segments_midpoint ON route_segments USING gist (midpoint);

CREATE INDEX idx_route_segments_route_id ON route_segments (route_id);

CREATE INDEX idx_route_segments_risk_tier ON route_segments (risk_tier);

CREATE INDEX idx_route_segments_segment_id ON route_segments (segment_id);

CREATE TABLE risk_assessments (
    id CHAR(36) NOT NULL,
    route_id CHAR(36),
    segment_id CHAR(36),
    risk_score FLOAT NOT NULL,
    risk_tier VARCHAR(20) NOT NULL,
    analysis_status VARCHAR(20) DEFAULT 'COMPLETE' NOT NULL,
    slope_score FLOAT,
    rain_score FLOAT,
    proximity_score FLOAT,
    density_score FLOAT,
    exposure_score FLOAT,
    slope_weight FLOAT DEFAULT '0.35' NOT NULL,
    rain_weight FLOAT DEFAULT '0.30' NOT NULL,
    proximity_weight FLOAT DEFAULT '0.20' NOT NULL,
    density_weight FLOAT DEFAULT '0.10' NOT NULL,
    exposure_weight FLOAT DEFAULT '0.05' NOT NULL,
    average_route_score FLOAT,
    maximum_segment_score FLOAT,
    engine_version VARCHAR(50) DEFAULT '1.0.0-mcda' NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    PRIMARY KEY (id),
    CONSTRAINT chk_risk_score_bounds CHECK (risk_score >= 0.0 AND risk_score <= 100.0),
    CONSTRAINT chk_slope_score_bounds CHECK (slope_score IS NULL OR (slope_score >= 0.0 AND slope_score <= 100.0)),
    CONSTRAINT chk_rain_score_bounds CHECK (rain_score IS NULL OR (rain_score >= 0.0 AND rain_score <= 100.0)),
    CONSTRAINT chk_prox_score_bounds CHECK (proximity_score IS NULL OR (proximity_score >= 0.0 AND proximity_score <= 100.0)),
    CONSTRAINT chk_density_score_bounds CHECK (density_score IS NULL OR (density_score >= 0.0 AND density_score <= 100.0)),
    CONSTRAINT chk_exp_score_bounds CHECK (exposure_score IS NULL OR (exposure_score >= 0.0 AND exposure_score <= 100.0)),
    FOREIGN KEY(route_id) REFERENCES saved_routes (id) ON DELETE CASCADE,
    FOREIGN KEY(segment_id) REFERENCES route_segments (id) ON DELETE CASCADE
);

CREATE INDEX idx_risk_assessments_route_id ON risk_assessments (route_id);

CREATE INDEX idx_risk_assessments_segment_id ON risk_assessments (segment_id);

CREATE INDEX idx_risk_assessments_tier ON risk_assessments (risk_tier);

CREATE INDEX idx_risk_assessments_created_at ON risk_assessments (created_at);

CREATE TABLE weather_snapshots (
    id CHAR(36) NOT NULL,
    latitude FLOAT NOT NULL,
    longitude FLOAT NOT NULL,
    observed_at TIMESTAMP WITH TIME ZONE NOT NULL,
    source VARCHAR(100) DEFAULT 'Open-Meteo' NOT NULL,
    precipitation_mm FLOAT,
    precipitation_24h_mm FLOAT,
    precipitation_72h_mm FLOAT,
    temperature_c FLOAT,
    convective_rain_mm FLOAT,
    raw_payload JSONB,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    PRIMARY KEY (id),
    CONSTRAINT chk_weather_lat_bounds CHECK (latitude >= -90.0 AND latitude <= 90.0),
    CONSTRAINT chk_weather_lon_bounds CHECK (longitude >= -180.0 AND longitude <= 180.0),
    CONSTRAINT uq_weather_source_loc_time UNIQUE (source, latitude, longitude, observed_at)
);

CREATE INDEX idx_weather_observed_at ON weather_snapshots (observed_at);

CREATE INDEX idx_weather_loc ON weather_snapshots (latitude, longitude);

CREATE TABLE hazard_alerts (
    id CHAR(36) NOT NULL,
    alert_type VARCHAR(50) NOT NULL,
    severity VARCHAR(20) NOT NULL,
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    latitude FLOAT,
    longitude FLOAT,
    location_geometry geometry(POINT,4326),
    region VARCHAR(100) DEFAULT 'Uttarakhand',
    source VARCHAR(100) NOT NULL,
    source_timestamp TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE,
    status VARCHAR(20) DEFAULT 'ACTIVE' NOT NULL,
    origin_type VARCHAR(20) NOT NULL,
    metadata JSONB,
    PRIMARY KEY (id),
    CONSTRAINT chk_alert_origin_type_valid CHECK (origin_type IN ('OBSERVED', 'CALCULATED', 'HISTORICAL')),
    CONSTRAINT chk_alert_severity_valid CHECK (severity IN ('LOW', 'MODERATE', 'HIGH', 'SEVERE')),
    CONSTRAINT chk_alert_lat_bounds CHECK (latitude IS NULL OR (latitude >= -90.0 AND latitude <= 90.0)),
    CONSTRAINT chk_alert_lon_bounds CHECK (longitude IS NULL OR (longitude >= -180.0 AND longitude <= 180.0))
);

CREATE INDEX idx_hazard_alerts_location_geometry ON hazard_alerts USING gist (location_geometry);

CREATE INDEX idx_hazard_alerts_severity ON hazard_alerts (severity);

CREATE INDEX idx_hazard_alerts_status ON hazard_alerts (status);

CREATE INDEX idx_hazard_alerts_origin_type ON hazard_alerts (origin_type);

CREATE INDEX idx_hazard_alerts_created_at ON hazard_alerts (created_at);

CREATE INDEX idx_hazard_alerts_expires_at ON hazard_alerts (expires_at);

CREATE TABLE community_hazard_reports (
    id CHAR(36) NOT NULL,
    user_id CHAR(36),
    report_type VARCHAR(50) NOT NULL,
    description TEXT,
    latitude FLOAT NOT NULL,
    longitude FLOAT NOT NULL,
    location_geometry geometry(POINT,4326) NOT NULL,
    severity VARCHAR(20) DEFAULT 'MODERATE',
    status VARCHAR(20) DEFAULT 'PENDING' NOT NULL,
    source VARCHAR(50) DEFAULT 'COMMUNITY' NOT NULL,
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    PRIMARY KEY (id),
    CONSTRAINT chk_community_report_lat_bounds CHECK (latitude >= -90.0 AND latitude <= 90.0),
    CONSTRAINT chk_community_report_lon_bounds CHECK (longitude >= -180.0 AND longitude <= 180.0),
    FOREIGN KEY(user_id) REFERENCES user_profiles (id) ON DELETE SET NULL
);

CREATE INDEX idx_community_hazard_reports_location_geometry ON community_hazard_reports USING gist (location_geometry);

CREATE INDEX idx_community_reports_status ON community_hazard_reports (status);

CREATE INDEX idx_community_reports_type ON community_hazard_reports (report_type);

CREATE INDEX idx_community_reports_created_at ON community_hazard_reports (created_at);

CREATE TABLE feedback (
    id CHAR(36) NOT NULL,
    user_id CHAR(36),
    route_id CHAR(36),
    rating INTEGER NOT NULL,
    comment TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    PRIMARY KEY (id),
    CONSTRAINT chk_feedback_rating_range CHECK (rating >= 1 AND rating <= 5),
    FOREIGN KEY(user_id) REFERENCES user_profiles (id) ON DELETE SET NULL,
    FOREIGN KEY(route_id) REFERENCES saved_routes (id) ON DELETE SET NULL
);

CREATE INDEX idx_feedback_route_id ON feedback (route_id);

CREATE INDEX idx_feedback_created_at ON feedback (created_at);

CREATE TABLE landslides (
    id CHAR(36) NOT NULL,
    source VARCHAR(50) DEFAULT 'GSI' NOT NULL,
    source_record_id VARCHAR(100),
    latitude FLOAT NOT NULL,
    longitude FLOAT NOT NULL,
    location_geometry geometry(POINT,4326) NOT NULL,
    event_date DATE,
    is_historical BOOLEAN DEFAULT 'true' NOT NULL,
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    PRIMARY KEY (id),
    CONSTRAINT chk_landslide_lat_bounds CHECK (latitude >= -90.0 AND latitude <= 90.0),
    CONSTRAINT chk_landslide_lon_bounds CHECK (longitude >= -180.0 AND longitude <= 180.0),
    CONSTRAINT uq_landslide_source_record_id UNIQUE (source, source_record_id)
);

CREATE INDEX idx_landslides_location_geometry ON landslides USING gist (location_geometry);

CREATE INDEX idx_landslides_source ON landslides (source);

CREATE INDEX idx_landslides_is_historical ON landslides (is_historical);

CREATE TABLE cuttings (
    id CHAR(36) NOT NULL,
    osm_way_id BIGINT NOT NULL,
    source VARCHAR(100) DEFAULT 'OpenStreetMap' NOT NULL,
    snapshot_year INTEGER DEFAULT '2018' NOT NULL,
    geometry geometry(LINESTRING,4326) NOT NULL,
    tags JSONB,
    is_historical BOOLEAN DEFAULT 'true' NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    PRIMARY KEY (id),
    CONSTRAINT uq_cutting_osm_way_year UNIQUE (osm_way_id, snapshot_year)
);

CREATE INDEX idx_cuttings_geometry ON cuttings USING gist (geometry);

CREATE INDEX idx_cuttings_osm_way_id ON cuttings (osm_way_id);

CREATE INDEX idx_cuttings_snapshot_year ON cuttings (snapshot_year);

CREATE INDEX idx_cuttings_is_historical ON cuttings (is_historical);

INSERT INTO alembic_version (version_num) VALUES ('001_phase_2a') RETURNING alembic_version.version_num;

COMMIT;
