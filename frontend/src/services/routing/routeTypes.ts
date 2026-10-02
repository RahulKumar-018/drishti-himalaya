/**
 * ==============================================================================
 * DRISHTI-HIMALAYA - ROUTING DOMAIN TYPES
 * Phase 2: Real Road Routing + Dynamic Route Geometry
 * ==============================================================================
 */

import { LocationPoint } from '../../types/location';

export type RouteProfile = 'driving' | 'walking';

export interface RouteRequest {
  origin: LocationPoint;
  destination: LocationPoint;
  profile?: RouteProfile;
  overview?: 'full' | 'simplified' | 'false';
  targetSampleIntervalM?: number;
}

/**
 * A discrete sample point along the true road geometry.
 * Forms the bedrock for elevation sampling, precipitation queries,
 * and terrain gradient calculation.
 */
export interface RouteSample {
  id: string;
  index: number;
  lat: number;
  lng: number;
  distanceFromOriginMeters: number;
  routeFraction: number; // 0.0 at origin, 1.0 at destination
  elevationM?: number | null;
  elevationSource?: string;
}

/**
 * A road segment bounded by two consecutive RouteSamples.
 * Contains its own sub-geometry and localized slope/terrain metrics.
 */
export interface RouteSegment {
  id: string;
  index: number;
  startPoint: RouteSample;
  endPoint: RouteSample;
  midpoint: { lat: number; lng: number };
  startDistanceMeters: number;
  endDistanceMeters: number;
  lengthMeters: number;
  geometry: Array<[number, number]>; // Leaflet [latitude, longitude] pairs
  startElevationM?: number | null;
  endElevationM?: number | null;
  elevationChangeM?: number | null;
  gradientPercent?: number | null;
  gradientDegrees?: number | null;
}

/**
 * Aggregate summary metrics computed along the real road route.
 */
export interface RouteMetrics {
  totalDistanceMeters: number;
  totalDistanceKm: number;
  totalDurationSeconds: number;
  formattedDistance: string; // e.g. "~255.3 km"
  formattedDuration: string; // e.g. "6h 18m"
  sampleCount: number;
  segmentCount: number;
  elevationMin?: number | null;
  elevationMax?: number | null;
  elevationGain?: number | null;
  elevationLoss?: number | null;
  averageElevation?: number | null;
  peakGradientPercent?: number | null;
  peakGradientDegrees?: number | null;
  elevationCoverageRatio?: string; // e.g. "508/511 Samples"
}

export type RouteStatus = 'idle' | 'loading' | 'success' | 'no_route' | 'error';

/**
 * Complete result of a road routing request.
 */
export interface RouteResult {
  status: RouteStatus;
  provider: string; // e.g. 'OSRM (OpenStreetMap)'
  origin: LocationPoint;
  destination: LocationPoint;
  geometry: Array<[number, number]>; // High-resolution Leaflet [latitude, longitude] coordinates
  distanceMeters: number;
  durationSeconds: number;
  bounds: [[number, number], [number, number]]; // Leaflet LatLngBounds: [[minLat, minLng], [maxLat, maxLng]]
  samples: RouteSample[];
  segments: RouteSegment[];
  metrics: RouteMetrics;
  waypoints: Array<{ name: string; location: [number, number] }>;
  fetchedAt: string;
  error?: string;
}

/**
 * Contract for interchangeable routing providers (e.g. OSRM, OpenRouteService).
 */
export interface IRouteProvider {
  readonly name: string;
  fetchRoute(request: RouteRequest): Promise<RouteResult>;
}
