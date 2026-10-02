/**
 * ==============================================================================
 * DRISHTI-HIMALAYA - ENVIRONMENTAL DATA MODELS
 * Strictly typed schemas for rainfall, elevation, and terrain data layers.
 * ==============================================================================
 */

/**
 * Standard Result wrapper for all environmental service operations.
 * Guarantees explicit error handling without throwing unhandled exceptions.
 */
export type ServiceResult<T> =
  | {
      status: 'success';
      data: T;
      error: null;
      fromCache?: boolean;
    }
  | {
      status: 'error';
      data: null;
      error: string;
      statusCode?: number;
    };

/**
 * Geographic point representation.
 */
export interface EnvironmentalLocation {
  latitude: number;
  longitude: number;
  name?: string;
}

/**
 * Individual hourly forecast point for precipitation analysis.
 */
export interface HourlyPrecipitationPoint {
  time: string;
  precipitation: number;
  probability: number | null;
}

/**
 * Normalized Rainfall / Precipitation dataset.
 * Collected from authoritative meteorological sources.
 */
export interface EnvironmentalRainfallData {
  latitude: number;
  longitude: number;
  timestamp: string;
  precipitation: number | null;
  precipitationUnit: string;
  rain: number | null;
  showers: number | null;
  precipitationProbability: number | null;
  weatherCode: number | null;
  weatherDescription: string;
  dailyPrecipitationSum: number | null;
  hourlyForecast?: HourlyPrecipitationPoint[];
  source: string;
  fetchedAt: string;
}

/**
 * Normalized Elevation dataset for a single geographic point.
 */
export interface EnvironmentalElevationData {
  latitude: number;
  longitude: number;
  elevation: number | null;
  elevationUnit: string;
  source: string;
  fetchedAt: string;
}

/**
 * Single coordinate point with resolved elevation.
 */
export interface EnvironmentalElevationPoint {
  latitude: number;
  longitude: number;
  elevation: number | null;
}

/**
 * Normalized Elevation Profile across multiple corridor waypoints.
 * Structured for route-wide terrain elevation gradient mapping.
 */
export interface EnvironmentalElevationProfileData {
  points: EnvironmentalElevationPoint[];
  minElevation: number | null;
  maxElevation: number | null;
  elevationUnit: string;
  source: string;
  fetchedAt: string;
}

/**
 * Coordinate pair for geographic positioning.
 */
export interface TerrainCoordinate {
  readonly latitude: number;
  readonly longitude: number;
}

/**
 * Individual sampled point along the corridor elevation profile.
 * Exposes geographic coordinates, DEM elevation, and cumulative corridor distance.
 */
export interface TerrainProfileSample {
  /** Geographic coordinate pair */
  readonly coordinate: TerrainCoordinate;
  /** DEM elevation in meters MSL, or null if unresolvable/corrupt */
  readonly elevation: number | null;
  /** Cumulative corridor distance from the first sample (origin) in meters */
  readonly distanceFromStart: number;
}

/**
 * Geometric segment between two consecutive sampled corridor control coordinates.
 * Measures DEM-derived longitudinal gradient along the straight corridor control polyline
 * (not the physical NH-7 road alignment).
 */
export interface TerrainProfileSegment {
  /** 0-based index of start sample in samples array */
  readonly startIndex: number;
  /** 0-based index of end sample in samples array */
  readonly endIndex: number;
  /** Cumulative corridor distance at start sample in meters */
  readonly startDistance: number;
  /** Cumulative corridor distance at end sample in meters */
  readonly endDistance: number;
  /** Geodesic horizontal distance between the two samples in meters (via Haversine) */
  readonly horizontalDistance: number;
  /** Vertical elevation difference (endElevation - startElevation) in meters, preserving sign (+ = gain, - = loss) */
  readonly elevationChange: number | null;
  /** Gradient magnitude expressed as percentage: abs(elevationChange) / horizontalDistance * 100 */
  readonly gradientPercent: number | null;
  /** Gradient magnitude in degrees: atan(abs(elevationChange) / horizontalDistance) * (180 / π) */
  readonly gradientDegrees: number | null;

  // Phase 5 backward-compatibility properties:
  readonly startLat: number;
  readonly startLon: number;
  readonly endLat: number;
  readonly endLon: number;
  readonly distanceM: number;
  readonly startElevationM: number | null;
  readonly endElevationM: number | null;
  readonly elevationChangeM: number | null;
  readonly gradientRatio: number | null;
}

/** Backward-compatibility alias for Phase 5 TerrainSegment */
export type TerrainSegment = TerrainProfileSegment;

/**
 * Rigorous DEM corridor alignment elevation and gradient metrics.
 * Evaluated along the straight control-point polyline connecting pilot corridor waypoints.
 * NOTE: This metric reflects corridor topographic relief and chord gradient,
 * not the gradient of the physical NH-7 road alignment.
 */
export interface TerrainProfileMetrics {
  // Phase 6A standard properties:
  /** Total corridor path distance in meters (sum of segment horizontal distances) */
  readonly totalDistance: number;
  /** Minimum ground elevation in meters MSL */
  readonly minElevation: number | null;
  /** Maximum ground elevation in meters MSL */
  readonly maxElevation: number | null;
  /** Cumulative vertical climb in meters: sum(max(deltaElevation, 0)) */
  readonly elevationGain: number | null;
  /** Cumulative vertical descent magnitude in meters: sum(abs(min(deltaElevation, 0))) */
  readonly elevationLoss: number | null;
  /** Length-weighted corridor gradient percent: sum(abs(deltaElevation)) / totalDistance * 100 */
  readonly meanGradientPercent: number | null;
  /** Length-weighted corridor gradient degrees: atan(meanGradientPercent / 100) * (180 / π) */
  readonly meanGradientDegrees: number | null;
  /** Maximum localized segment gradient magnitude in percentage */
  readonly peakGradientPercent: number | null;
  /** Maximum localized segment gradient magnitude in degrees */
  readonly peakGradientDegrees: number | null;
  /** 0-based index of the segment producing the peak gradient */
  readonly peakGradientSegmentIndex: number | null;

  // Phase 5 backward-compatibility properties:
  readonly sampleCount: number;
  readonly totalDistanceM: number;
  readonly minElevationMsl: number | null;
  readonly maxElevationMsl: number | null;
  readonly elevationGainM: number | null;
  readonly elevationLossM: number | null;
  readonly meanRouteGradientDegrees: number | null;
  readonly meanRouteGradientPercent: number | null;
  readonly peakRouteGradientDegrees: number | null;
  readonly peakRouteGradientPercent: number | null;
  readonly segments: readonly TerrainProfileSegment[];
}

/**
 * Structured Terrain Profile representation (Phase 6A).
 * Encapsulates ordered samples with cumulative chainage, segments, and profile metrics.
 */
export interface TerrainProfile {
  readonly samples: readonly TerrainProfileSample[];
  readonly segments: readonly TerrainProfileSegment[];
  readonly metrics: TerrainProfileMetrics;
}

/**
 * Full terrain profile payload including raw points, calculated metrics, and structured profile.
 */
export interface TerrainProfileData {
  readonly points: readonly EnvironmentalElevationPoint[];
  readonly metrics: TerrainProfileMetrics;
  readonly profile: TerrainProfile;
  readonly source: string;
  readonly fetchedAt: string;
}

/**
 * Basic Terrain data model.
 * Supplies spot elevation and dense corridor alignment profile metrics.
 */
export interface BasicTerrainData {
  elevation: EnvironmentalElevationData;
  /** Dense DEM-derived corridor alignment profile metrics along the control polyline */
  routeProfile?: TerrainProfileMetrics | null;
  /** Structured terrain profile with samples, segments, and metrics (Phase 6A) */
  terrainProfile?: TerrainProfile | null;
  /** Provisional corridor representative gradient in degrees */
  slopeDegrees?: number | null;
  /** Slope aspect direction, e.g. "NW", "S" (architectural placeholder) */
  aspect?: string | null;
  /** Terrain Ruggedness Index metric (architectural placeholder) */
  terrainRuggednessIndex?: number | null;
}

/**
 * Overall corridor environmental status.
 */
export type EnvironmentalTelemetryStatus = 'idle' | 'loading' | 'success' | 'partial' | 'error';

/**
 * Consolidated Environmental Data model for corridor monitoring.
 */
export interface EnvironmentalData {
  location: EnvironmentalLocation;
  rainfall: EnvironmentalRainfallData | null;
  terrain: BasicTerrainData | null;
  status: EnvironmentalTelemetryStatus;
  error: string | null;
  metadata: {
    fetchedAt: string;
    sources: string[];
  };
}

/**
 * WMO Weather Interpretation Codes (WW) mapping table.
 * Translates standard WMO codes returned by Open-Meteo into human-readable descriptions.
 */
export const WMO_WEATHER_CODE_MAP: Record<number, string> = {
  0: 'Clear sky',
  1: 'Mainly clear',
  2: 'Partly cloudy',
  3: 'Overcast',
  45: 'Fog',
  48: 'Depositing rime fog',
  51: 'Light drizzle',
  53: 'Moderate drizzle',
  55: 'Dense drizzle',
  56: 'Light freezing drizzle',
  57: 'Dense freezing drizzle',
  61: 'Slight rain',
  62: 'Moderate rain',
  63: 'Moderate rain',
  64: 'Heavy rain',
  65: 'Heavy rain',
  66: 'Light freezing rain',
  67: 'Heavy freezing rain',
  71: 'Slight snow fall',
  73: 'Moderate snow fall',
  75: 'Heavy snow fall',
  77: 'Snow grains',
  80: 'Slight rain showers',
  81: 'Moderate rain showers',
  82: 'Violent rain showers',
  85: 'Slight snow showers',
  86: 'Heavy snow showers',
  95: 'Thunderstorm',
  96: 'Thunderstorm with slight hail',
  99: 'Thunderstorm with heavy hail',
};

/**
 * Resolves a human-readable description for a given WMO weather code.
 */
export function getWeatherDescription(code: number | null | undefined): string {
  if (code === null || code === undefined) {
    return 'Unknown conditions';
  }
  return WMO_WEATHER_CODE_MAP[code] || `Weather condition (Code ${code})`;
}
