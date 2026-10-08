/**
 * ==============================================================================
 * DRISHTI-HIMALAYA - BACKEND API CLIENT CONTRACTS
 * Strict interface definitions aligned with API_SPEC.md (v1)
 * ==============================================================================
 */

import { RiskLevel } from '../risk/types';

export interface RouteAnalyzeRequest {
  origin: {
    latitude: number;
    longitude: number;
    name?: string;
  };
  destination: {
    latitude: number;
    longitude: number;
    name?: string;
  };
  preference_weight_safety?: number;
  simulated_rainfall_mm?: number | null;
}

export interface RouteSegmentFeature {
  type: 'Feature';
  id: string;
  properties: {
    segment_index: number;
    segment_length_m: number;
    start_km: number;
    end_km: number;
    slope_degrees: number | null;
    elevation_m: number | null;
    precipitation_24h_mm: number | null;
    distance_to_historic_scar_m: number | null;
    scar_density_1km: number | null;
    is_cut_slope: boolean;
    segment_risk_score: number | null;
    risk_category: RiskLevel | null;
    color_hex?: string | null;
    primary_hazard_driver?: string | null;
    is_risk_complete?: boolean;
  };
  geometry: {
    type: 'LineString';
    coordinates: [number, number][]; // [lon, lat]
  };
}

export interface RouteAlternativeResult {
  route_id: string;
  summary: string;
  is_recommended: boolean;
  total_distance_km: number;
  estimated_time_minutes: number;
  composite_route_risk: number | null;
  max_bottleneck_risk: number | null;
  average_segment_risk: number | null;
  high_risk_segment_count: number;
  severe_risk_segment_count: number;
  recommendation: string;
  advisory_text: string;
  geojson: {
    type: 'FeatureCollection';
    features: RouteSegmentFeature[];
  };
  requested_origin?: [number, number] | null;
  requested_destination?: [number, number] | null;
  snapped_origin?: [number, number] | null;
  snapped_destination?: [number, number] | null;
  snapping_distance_origin_m?: number;
  snapping_distance_destination_m?: number;
  is_origin_snapped?: boolean;
  is_destination_snapped?: boolean;
}

export interface RouteAnalyzeResponse {
  status: string;
  query_id: string;
  execution_duration_ms: number;
  data_mode: string;
  corridor: string;
  routes: RouteAlternativeResult[];
  recommended_route_id?: string | null;
  recommendation_available?: boolean;
  data_availability?: Record<string, unknown> | null;
  data_provenance?: Record<string, unknown> | null;
  error_message?: string;
}

export interface FactorAttributionDetail {
  value_degrees?: number;
  precipitation_24h_mm?: number;
  precipitation_72h_mm?: number;
  antecedent_rain_index?: number;
  distance_meters?: number;
  scars_per_sq_km?: number;
  sub_score: number;
  weight: number;
  weighted_contribution: number;
  status: string;
  description: string;
}

export interface SegmentAttributionApiResponse {
  segment_id: string;
  corridor: string;
  start_chainage_km: number;
  end_chainage_km: number;
  start_point: { latitude: number; longitude: number };
  end_point: { latitude: number; longitude: number };
  composite_risk_score: number | null;
  risk_tier: 'LOW' | 'WATCH' | 'ELEVATED' | 'HIGH' | 'CRITICAL' | 'INDETERMINATE' | string;
  slope: FactorAttributionDetail;
  rainfall: FactorAttributionDetail;
  proximity: FactorAttributionDetail;
  density: FactorAttributionDetail;
  dominant_factors: string[];
  geotechnical_advisory: string;
}

export interface CorridorWeatherMonitoringNode {
  node_name: string;
  latitude: number;
  longitude: number;
  rain_24h_mm: number | null;
  status: 'GREEN' | 'YELLOW' | 'ORANGE' | 'RED' | 'UNKNOWN';
}

export interface CorridorWeatherSummaryResponse {
  corridor: string;
  data_mode: string;
  last_updated: string;
  average_rainfall_24h_mm: number | null;
  max_rainfall_24h_mm: number | null;
  average_rainfall_72h_mm?: number | null;
  active_alert_level: 'GREEN' | 'YELLOW' | 'ORANGE' | 'RED' | 'UNKNOWN';
  weather_status?: 'available' | 'degraded' | 'unavailable';
  monitoring_nodes: CorridorWeatherMonitoringNode[];
}

export interface BackendHealthResponse {
  status: 'healthy' | 'degraded' | string;
  service?: string;
  version: string;
  data_mode?: 'DEMO' | 'LIVE' | string;
  runtime_mode?: 'DEMO' | 'LIVE';
  database?: string;
  weather_api?: string;
  routing_engine?: string;
  cached_landslide_scars?: number;
  corridor_length_km?: number;
  dataset_cache?: {
    copernicus_dem_loaded?: boolean;
    landslide_inventory_loaded?: boolean;
    osrm_router_online?: boolean;
  };
}

export interface TripAlertApiResponse {
  id: string;
  trip_id: string;
  alert_type: string;
  severity: 'LOW' | 'MODERATE' | 'HIGH' | 'SEVERE' | string;
  title: string;
  message: string;
  previous_risk_tier?: string | null;
  current_risk_tier?: string | null;
  risk_delta?: number | null;
  trigger_source: string;
  fcm_sent: boolean;
  acknowledged_at?: string | null;
  created_at: string;
}

export interface MonitoringTripApiResponse {
  id: string;
  user_id?: string | null;
  origin: { latitude: number; longitude: number; name?: string | null };
  destination: { latitude: number; longitude: number; name?: string | null };
  vehicle_profile: string;
  status: 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'CANCELLED' | string;
  planned_departure?: string | null;
  actual_departure?: string | null;
  completed_at?: string | null;
  monitoring_config: {
    check_interval_minutes: number;
    rain_threshold_mm: number;
    risk_delta_threshold: number;
    enable_fcm: boolean;
    quiet_hours_start: number;
    quiet_hours_end: number;
  };
  created_at: string;
  updated_at: string;
}

export interface ReassessmentApiResponse {
  snapshot: {
    id: string;
    trip_id: string;
    risk_score: number;
    risk_tier: string;
    risk_delta?: number | null;
    p24_mm?: number | null;
    assessed_at: string;
  };
  alert?: TripAlertApiResponse | null;
  data_mode: 'DEMO' | 'LIVE' | string;
  route_id: string;
}

export interface RiskPredictApiRequest {
  latitude: number;
  longitude: number;
  timestamp?: string;
  rainfall_mm?: number;
  slope_deg?: number;
  weather_source?: string;
  model_type?: 'heuristic' | 'ml';
}

export interface RiskPredictApiResponse {
  location: {
    latitude: number;
    longitude: number;
  };
  risk_score: number;
  risk_level: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  factors: {
    rainfall: number;
    slope: number;
    terrain: number;
    historical: number;
    details?: Record<string, any>;
  };
  explanation: string;
  contributing_factors: string[];
  weather_source: string;
  model_type: string;
  model_version: string;
  data_quality: 'HIGH' | 'MEDIUM' | 'LOW';
  data_caveats?: string[];
  generated_at: string;
}

export interface RiskZonesApiResponse {
  type: 'FeatureCollection';
  features: Array<{
    type: 'Feature';
    id: string;
    geometry: {
      type: 'Polygon';
      coordinates: number[][][];
    };
    properties: {
      zone_id: string;
      zone_name: string;
      risk_score: number;
      risk_level: string;
      color_hex: string;
      factors: Record<string, number>;
      model_version: string;
      generated_at: string;
      disclaimer: string;
    };
  }>;
  total_zones: number;
  generated_at: string;
  model_version: string;
}
