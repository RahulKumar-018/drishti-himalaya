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
    slope_degrees: number;
    elevation_m: number;
    precipitation_24h_mm: number;
    distance_to_historic_scar_m: number | null;
    scar_density_1km: number | null;
    is_cut_slope: boolean;
    segment_risk_score: number;
    risk_level: RiskLevel;
    primary_hazard_driver: string;
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
  composite_route_risk: number;
  max_bottleneck_risk: number;
  average_segment_risk: number;
  high_risk_segment_count: number;
  severe_risk_segment_count: number;
  recommendation: 'PROCEED_NORMAL' | 'CAUTION_HIGH_RISK' | 'DIVERT_ALTERNATIVE';
  advisory_text: string;
  geojson: {
    type: 'FeatureCollection';
    features: RouteSegmentFeature[];
  };
}

export interface RouteAnalyzeResponse {
  status: 'success' | 'error';
  query_id: string;
  execution_duration_ms: number;
  data_mode: 'LIVE' | 'DEMO';
  corridor: string;
  routes: RouteAlternativeResult[];
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
