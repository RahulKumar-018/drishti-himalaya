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
 * Geometric segment between two consecutive sampled corridor control coordinates.
 * Measures DEM-derived longitudinal gradient along the straight corridor control polyline
 * (not the physical NH-7 road alignment).
 */
export interface TerrainSegment {
  readonly startLat: number;
  readonly startLon: number;
  readonly endLat: number;
  readonly endLon: number;
  /** Geodesic distance in meters (via Haversine) */
  readonly distanceM: number;
  /** Starting elevation in meters MSL */
  readonly startElevationM: number | null;
  /** Ending elevation in meters MSL */
  readonly endElevationM: number | null;
  /** Elevation difference in meters: endElevation - startElevation */
  readonly elevationChangeM: number | null;
  /** Longitudinal grade ratio: |elevationChangeM| / distanceM */
  readonly gradientRatio: number | null;
  /** Corridor alignment gradient angle in degrees: arctan(gradientRatio) * (180 / π) */
  readonly gradientDegrees: number | null;
  /** Corridor alignment grade expressed as percentage: gradientRatio * 100 */
  readonly gradientPercent: number | null;
}

/**
 * Rigorous DEM corridor alignment elevation and gradient metrics.
 * Evaluated along the straight control-point polyline connecting pilot corridor waypoints.
 * NOTE: This metric reflects corridor topographic relief and chord gradient,
 * not the gradient of the physical NH-7 road alignment.
 */
export interface TerrainProfileMetrics {
  /** Total number of dense coordinate samples across corridor */
  readonly sampleCount: number;
  /** Total corridor path distance in meters (sum of chord segment distances) */
  readonly totalDistanceM: number;
  /** Minimum ground elevation in meters MSL */
  readonly minElevationMsl: number | null;
  /** Maximum ground elevation in meters MSL */
  readonly maxElevationMsl: number | null;
  /** Cumulative vertical climb in meters (sum of positive Δh) */
  readonly elevationGainM: number | null;
  /** Cumulative vertical descent in meters (sum of negative Δh magnitudes) */
  readonly elevationLossM: number | null;
  /** Length-weighted mean corridor alignment gradient in degrees: (Σ gradientDegrees_i * d_i) / Σ d_i */
  readonly meanRouteGradientDegrees: number | null;
  /** Length-weighted mean corridor alignment gradient in percent: (Σ |Δh_i|) / (Σ d_i) * 100 */
  readonly meanRouteGradientPercent: number | null;
  /** Maximum localized segment gradient in degrees along control polyline */
  readonly peakRouteGradientDegrees: number | null;
  /** Maximum localized segment gradient in percent along control polyline */
  readonly peakRouteGradientPercent: number | null;
  /** Array of individual analyzed segments */
  readonly segments: readonly TerrainSegment[];
}

/**
 * Full terrain profile payload including raw points and calculated metrics.
 */
export interface TerrainProfileData {
  readonly points: readonly EnvironmentalElevationPoint[];
  readonly metrics: TerrainProfileMetrics;
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
