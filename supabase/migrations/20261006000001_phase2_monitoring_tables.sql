-- ==============================================================================
-- DRISHTI-HIMALAYA — PHASE 2 MONITORING & ALERT SCHEMA
-- Adds: monitored_trips, trip_risk_snapshots, trip_alerts, notification_devices
-- Target: Supabase PostgreSQL 15+ with PostGIS 3.0+
-- Migration ID: 20261006000001_phase2_monitoring_tables.sql
-- ==============================================================================

BEGIN;

-- ------------------------------------------------------------------------------
-- 1. TABLE: monitored_trips
-- User-initiated trip monitoring sessions (MONITOR → DETECT → ALERT → REASSESS)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS monitored_trips (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES user_profiles(id) ON DELETE SET NULL,
    route_id UUID REFERENCES saved_routes(id) ON DELETE SET NULL,
    origin_lat DOUBLE PRECISION NOT NULL,
    origin_lon DOUBLE PRECISION NOT NULL,
    destination_lat DOUBLE PRECISION NOT NULL,
    destination_lon DOUBLE PRECISION NOT NULL,
    origin_name TEXT,
    destination_name TEXT,
    vehicle_profile VARCHAR(50) NOT NULL DEFAULT 'driving-car',
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    planned_departure TIMESTAMPTZ,
    actual_departure TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    monitoring_config JSONB NOT NULL DEFAULT '{
        "check_interval_minutes": 30,
        "rain_threshold_mm": 25,
        "risk_delta_threshold": 10,
        "enable_fcm": true,
        "quiet_hours_start": 22,
        "quiet_hours_end": 6
    }'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),

    CONSTRAINT chk_mt_orig_lat CHECK (origin_lat >= -90.0 AND origin_lat <= 90.0),
    CONSTRAINT chk_mt_orig_lon CHECK (origin_lon >= -180.0 AND origin_lon <= 180.0),
    CONSTRAINT chk_mt_dest_lat CHECK (destination_lat >= -90.0 AND destination_lat <= 90.0),
    CONSTRAINT chk_mt_dest_lon CHECK (destination_lon >= -180.0 AND destination_lon <= 180.0),
    CONSTRAINT chk_mt_status CHECK (status IN ('ACTIVE', 'PAUSED', 'COMPLETED', 'CANCELLED'))
);

CREATE INDEX IF NOT EXISTS idx_monitored_trips_user_id ON monitored_trips (user_id);
CREATE INDEX IF NOT EXISTS idx_monitored_trips_route_id ON monitored_trips (route_id);
CREATE INDEX IF NOT EXISTS idx_monitored_trips_status ON monitored_trips (status);
CREATE INDEX IF NOT EXISTS idx_monitored_trips_created_at ON monitored_trips (created_at);
CREATE INDEX IF NOT EXISTS idx_monitored_trips_origin ON monitored_trips (origin_lat, origin_lon);
CREATE INDEX IF NOT EXISTS idx_monitored_trips_destination ON monitored_trips (destination_lat, destination_lon);

CREATE TRIGGER trg_monitored_trips_updated_at
    BEFORE UPDATE ON monitored_trips
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ------------------------------------------------------------------------------
-- 2. TABLE: trip_risk_snapshots
-- Time-series risk history for each monitored trip (per segment or route aggregate)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS trip_risk_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id UUID NOT NULL REFERENCES monitored_trips(id) ON DELETE CASCADE,
    snapshot_type VARCHAR(20) NOT NULL DEFAULT 'ROUTE_AGGREGATE',
    segment_id UUID REFERENCES route_segments(id) ON DELETE SET NULL,
    risk_score DOUBLE PRECISION NOT NULL,
    risk_tier VARCHAR(20) NOT NULL,
    slope_score DOUBLE PRECISION,
    rain_score DOUBLE PRECISION,
    proximity_score DOUBLE PRECISION,
    density_score DOUBLE PRECISION,
    exposure_score DOUBLE PRECISION,
    p24_mm DOUBLE PRECISION,
    p72_mm DOUBLE PRECISION,
    ari_mm DOUBLE PRECISION,
    route_average_risk DOUBLE PRECISION,
    route_max_risk DOUBLE PRECISION,
    composite_route_risk DOUBLE PRECISION,
    weather_summary JSONB DEFAULT '{}'::jsonb,
    triggering_factor VARCHAR(50),
    risk_delta DOUBLE PRECISION,
    assessed_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),

    CONSTRAINT chk_trs_risk_score CHECK (risk_score >= 0.0 AND risk_score <= 100.0),
    CONSTRAINT chk_trs_risk_tier CHECK (risk_tier IN ('LOW', 'MODERATE', 'HIGH', 'SEVERE')),
    CONSTRAINT chk_trs_snapshot_type CHECK (snapshot_type IN ('ROUTE_AGGREGATE', 'SEGMENT', 'BOTTLENECK'))
);

CREATE INDEX IF NOT EXISTS idx_trip_risk_snapshots_trip_id ON trip_risk_snapshots (trip_id);
CREATE INDEX IF NOT EXISTS idx_trip_risk_snapshots_segment_id ON trip_risk_snapshots (segment_id);
CREATE INDEX IF NOT EXISTS idx_trip_risk_snapshots_assessed_at ON trip_risk_snapshots (assessed_at);
CREATE INDEX IF NOT EXISTS idx_trip_risk_snapshots_risk_tier ON trip_risk_snapshots (risk_tier);
CREATE INDEX IF NOT EXISTS idx_trip_risk_snapshots_type ON trip_risk_snapshots (snapshot_type);

-- ------------------------------------------------------------------------------
-- 3. TABLE: trip_alerts
-- Alert instances generated for specific trips (per trip, per event)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS trip_alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id UUID NOT NULL REFERENCES monitored_trips(id) ON DELETE CASCADE,
    alert_type VARCHAR(50) NOT NULL,
    severity VARCHAR(20) NOT NULL,
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    affected_segment_id UUID REFERENCES route_segments(id) ON DELETE SET NULL,
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    location_geometry geometry(POINT, 4326),
    previous_risk_tier VARCHAR(20),
    current_risk_tier VARCHAR(20),
    risk_delta DOUBLE PRECISION,
    trigger_source VARCHAR(50) NOT NULL,
    trigger_metadata JSONB DEFAULT '{}'::jsonb,
    acknowledged_at TIMESTAMPTZ,
    dismissed_at TIMESTAMPTZ,
    fcm_sent BOOLEAN NOT NULL DEFAULT false,
    fcm_sent_at TIMESTAMPTZ,
    fcm_message_id TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    expires_at TIMESTAMPTZ,

    CONSTRAINT chk_ta_severity CHECK (severity IN ('LOW', 'MODERATE', 'HIGH', 'SEVERE')),
    CONSTRAINT chk_ta_trigger_source CHECK (trigger_source IN ('RAIN_THRESHOLD', 'RISK_ESCALATION', 'NEW_HAZARD', 'ROUTE_DEVIATION', 'SCHEDULED_REASSESSMENT', 'MANUAL')),
    CONSTRAINT chk_ta_lat_bounds CHECK (latitude IS NULL OR (latitude >= -90.0 AND latitude <= 90.0)),
    CONSTRAINT chk_ta_lon_bounds CHECK (longitude IS NULL OR (longitude >= -180.0 AND longitude <= 180.0)),
    CONSTRAINT chk_ta_previous_tier CHECK (previous_risk_tier IS NULL OR previous_risk_tier IN ('LOW', 'MODERATE', 'HIGH', 'SEVERE')),
    CONSTRAINT chk_ta_current_tier CHECK (current_risk_tier IS NULL OR current_risk_tier IN ('LOW', 'MODERATE', 'HIGH', 'SEVERE'))
);

CREATE INDEX IF NOT EXISTS idx_trip_alerts_trip_id ON trip_alerts (trip_id);
CREATE INDEX IF NOT EXISTS idx_trip_alerts_segment_id ON trip_alerts (affected_segment_id);
CREATE INDEX IF NOT EXISTS idx_trip_alerts_severity ON trip_alerts (severity);
CREATE INDEX IF NOT EXISTS idx_trip_alerts_created_at ON trip_alerts (created_at);
CREATE INDEX IF NOT EXISTS idx_trip_alerts_trigger_source ON trip_alerts (trigger_source);
CREATE INDEX IF NOT EXISTS idx_trip_alerts_fcm_sent ON trip_alerts (fcm_sent);
CREATE INDEX IF NOT EXISTS idx_trip_alerts_geometry ON trip_alerts USING GIST (location_geometry);

-- ------------------------------------------------------------------------------
-- 4. TABLE: notification_devices
-- FCM device tokens for push notification delivery
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS notification_devices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
    fcm_token TEXT NOT NULL,
    platform VARCHAR(20) NOT NULL,
    app_version VARCHAR(50),
    device_model VARCHAR(100),
    is_active BOOLEAN NOT NULL DEFAULT true,
    last_used_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),

    CONSTRAINT chk_nd_platform CHECK (platform IN ('ios', 'android', 'web')),
    CONSTRAINT uq_nd_user_token UNIQUE (user_id, fcm_token)
);

CREATE INDEX IF NOT EXISTS idx_notification_devices_user_id ON notification_devices (user_id);
CREATE INDEX IF NOT EXISTS idx_notification_devices_active ON notification_devices (is_active);
CREATE INDEX IF NOT EXISTS idx_notification_devices_last_used ON notification_devices (last_used_at);

CREATE TRIGGER trg_notification_devices_updated_at
    BEFORE UPDATE ON notification_devices
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ------------------------------------------------------------------------------
-- 5. ROW LEVEL SECURITY (RLS) POLICIES FOR PHASE 2 TABLES
-- ------------------------------------------------------------------------------

-- monitored_trips
ALTER TABLE monitored_trips ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own monitored trips"
    ON monitored_trips FOR SELECT
    USING (auth.uid() = user_id OR auth.role() = 'service_role');

CREATE POLICY "Users can insert their own monitored trips"
    ON monitored_trips FOR INSERT
    WITH CHECK (auth.uid() = user_id OR auth.role() = 'service_role');

CREATE POLICY "Users can update their own monitored trips"
    ON monitored_trips FOR UPDATE
    USING (auth.uid() = user_id OR auth.role() = 'service_role');

CREATE POLICY "Users can delete their own monitored trips"
    ON monitored_trips FOR DELETE
    USING (auth.uid() = user_id OR auth.role() = 'service_role');

-- trip_risk_snapshots
ALTER TABLE trip_risk_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view snapshots for their trips"
    ON trip_risk_snapshots FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM monitored_trips mt
            WHERE mt.id = trip_risk_snapshots.trip_id
            AND (mt.user_id = auth.uid() OR auth.role() = 'service_role')
        )
    );

CREATE POLICY "Service role can insert risk snapshots"
    ON trip_risk_snapshots FOR INSERT
    WITH CHECK (auth.role() = 'service_role');

-- trip_alerts
ALTER TABLE trip_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view alerts for their trips"
    ON trip_alerts FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM monitored_trips mt
            WHERE mt.id = trip_alerts.trip_id
            AND (mt.user_id = auth.uid() OR auth.role() = 'service_role')
        )
    );

CREATE POLICY "Users can acknowledge/dismiss their alerts"
    ON trip_alerts FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM monitored_trips mt
            WHERE mt.id = trip_alerts.trip_id
            AND (mt.user_id = auth.uid() OR auth.role() = 'service_role')
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM monitored_trips mt
            WHERE mt.id = trip_alerts.trip_id
            AND (mt.user_id = auth.uid() OR auth.role() = 'service_role')
        )
    );

CREATE POLICY "Service role can insert trip alerts"
    ON trip_alerts FOR INSERT
    WITH CHECK (auth.role() = 'service_role');

-- notification_devices
ALTER TABLE notification_devices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own devices"
    ON notification_devices FOR SELECT
    USING (auth.uid() = user_id OR auth.role() = 'service_role');

CREATE POLICY "Users can register their own devices"
    ON notification_devices FOR INSERT
    WITH CHECK (auth.uid() = user_id OR auth.role() = 'service_role');

CREATE POLICY "Users can update their own devices"
    ON notification_devices FOR UPDATE
    USING (auth.uid() = user_id OR auth.role() = 'service_role');

CREATE POLICY "Users can delete their own devices"
    ON notification_devices FOR DELETE
    USING (auth.uid() = user_id OR auth.role() = 'service_role');

-- ------------------------------------------------------------------------------
-- 6. ALEMBIC VERSION SYNC
-- ------------------------------------------------------------------------------
INSERT INTO alembic_version (version_num)
VALUES ('003_phase_2_monitoring')
ON CONFLICT (version_num) DO NOTHING;

COMMIT;