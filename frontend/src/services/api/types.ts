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

export interface RouteSegmentProperties {
  segment_index: number;
  segment_length_m: number;
  start_km: number;
  end_km: number;
  slope_degrees: number | null;
  elevation_m: number | null;
  precipitation_24h_mm?: number | null;
  distance_to_historic_scar_m: number | null;
  scar_density_1km: number | null;
  is_cut_slope: boolean | null;
  segment_risk_score: number | null;
  risk_level?: RiskLevel;
  risk_category?: string | null;
  color_hex?: string | null;
  midpoint?: [number, number];
  p24_mm?: number | null;
  p72_mm?: number | null;
  ari_mm?: number | null;
  is_risk_complete?: boolean;
  missing_features?: string[];
  primary_hazard_driver?: string;
}

export interface RouteSegmentFeature {
  type: 'Feature';
  id: string;
  properties: RouteSegmentProperties;
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
  composite_route_risk: number;
  max_bottleneck_risk: number;
  average_segment_risk: number;
  high_risk_segment_count: number;
  severe_risk_segment_count: number;
  recommendation: 'PROCEED_NORMAL' | 'CAUTION_HIGH_RISK' | 'DIVERT_ALTERNATIVE' | string;
  advisory_text: string;
  geojson: {
    type: 'FeatureCollection';
    features: RouteSegmentFeature[];
  };
}

export interface RouteAnalyzeResponse {
  status: 'success' | 'error' | 'PARTIAL' | 'COMPLETE' | 'INDETERMINATE' | string;
  query_id: string;
  execution_duration_ms: number;
  data_mode: 'LIVE' | 'DEMO';
  corridor: string;
  routes: RouteAlternativeResult[];
  recommended_route_id?: string | null;
  recommendation_available?: boolean;
  data_availability?: {
    routing?: boolean;
    landslide_inventory?: boolean;
    weather?: boolean;
    terrain?: boolean;
    cut_slope?: boolean;
    missing_features?: string[];
  };
  data_provenance?: {
    routing_source?: string;
    weather_source?: string;
    landslide_source?: string;
    terrain_source?: string;
    cut_slope_source?: string;
  };
  error_message?: string;
}

export interface CorridorWeatherSummaryResponse {
  status: 'success';
  timestamp: string;
  monitoring_nodes_count: number;
  max_precipitation_mm_h: number;
  mean_precipitation_mm_h: number;
  critical_nodes: Array<{
    node_id: string;
    name: string;
    latitude: number;
    longitude: number;
    precipitation_rate_mm_h: number;
    accumulation_24h_mm: number;
    status: 'NORMAL' | 'WARNING' | 'CRITICAL';
  }>;
}

export interface BackendHealthResponse {
  status: 'healthy' | 'degraded';
  version: string;
  runtime_mode: 'DEMO' | 'LIVE';
  dataset_cache: {
    copernicus_dem_loaded: boolean;
    landslide_inventory_loaded: boolean;
    osrm_router_online: boolean;
  };
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
