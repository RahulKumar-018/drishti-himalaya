/**
 * ==============================================================================
 * DRISHTI-HIMALAYA - DENSE TERRAIN & ROUTE GRADIENT SERVICE
 * High-resolution DEM profiling, deterministic densification, and batch queries.
 * ==============================================================================
 */

import { fetchEnvironmentalJson, ELEVATION_API_BASE_URL } from './environmentalApi';
import {
  EnvironmentalElevationPoint,
  TerrainSegment,
  TerrainProfileMetrics,
  TerrainProfileData,
  ServiceResult,
} from './types';
import {
  PILOT_CORRIDOR_COORDINATES,
  DEFAULT_SAMPLING_INTERVAL_METERS,
  OPEN_METEO_ELEVATION_BATCH_LIMIT,
} from './corridorConstants';

const EARTH_RADIUS_METERS = 6371000;

export interface TerrainProfileOptions {
  /** Target sampling interval along route in meters (default: 500m) */
  targetIntervalM?: number;
  /** Force cache bypass */
  forceRefresh?: boolean;
  /** Custom timeout in milliseconds */
  timeoutMs?: number;
}

interface OpenMeteoElevationResponse {
  elevation?: (number | null)[];
}

/**
 * Computes great-circle geodesic distance between two WGS84 coordinates using the Haversine formula.
 *
 * @param lat1 Latitude of point 1 in decimal degrees
 * @param lon1 Longitude of point 1 in decimal degrees
 * @param lat2 Latitude of point 2 in decimal degrees
 * @param lon2 Longitude of point 2 in decimal degrees
 * @returns Geodesic distance in meters
 */
export function haversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  if (lat1 === lat2 && lon1 === lon2) {
    return 0;
  }

  const toRad = Math.PI / 180;
  const dLat = (lat2 - lat1) * toRad;
  const dLon = (lon2 - lon1) * toRad;
  const phi1 = lat1 * toRad;
  const phi2 = lat2 * toRad;

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);

  const clampedA = Math.max(0, Math.min(1, a));
  const c = 2 * Math.atan2(Math.sqrt(clampedA), Math.sqrt(1 - clampedA));

  return EARTH_RADIUS_METERS * c;
}

/**
 * Helper to round numbers to specified decimal places for deterministic coordinate generation.
 */
function roundCoord(val: number, decimals: number = 6): number {
  const factor = Math.pow(10, decimals);
  return Math.round(val * factor) / factor;
}

/**
 * Deterministically densifies an array of route waypoints to a target sampling interval.
 *
 * ALGORITHM:
 * 1. Iterates through each adjacent pair of input waypoints.
 * 2. Computes the geodesic chord distance using Haversine.
 * 3. Subdivides any segment longer than targetIntervalM into ceil(d / targetIntervalM) sub-steps.
 * 4. Linearly interpolates intermediate coordinates, rounding to 6 decimal places (~0.1m precision).
 * 5. Guarantees no duplicated or dropped coordinates, maintaining exact route ordering.
 *
 * @param waypoints Array of [latitude, longitude] pairs or coordinate objects
 * @param targetIntervalM Target sampling distance in meters (default: 500m)
 */
export function densifyCoordinates(
  waypoints: Array<{ latitude: number; longitude: number } | [number, number]>,
  targetIntervalM: number = DEFAULT_SAMPLING_INTERVAL_METERS
): Array<{ latitude: number; longitude: number }> {
  if (!Array.isArray(waypoints) || waypoints.length === 0) {
    return [];
  }

  // Normalize input format
  const normalizedWaypoints: Array<{ latitude: number; longitude: number }> = waypoints.map(
    (wp) => {
      if (Array.isArray(wp)) {
        return { latitude: wp[0], longitude: wp[1] };
      }
      return { latitude: wp.latitude, longitude: wp.longitude };
    }
  );

  if (normalizedWaypoints.length === 1) {
    return [{
      latitude: roundCoord(normalizedWaypoints[0].latitude),
      longitude: roundCoord(normalizedWaypoints[0].longitude),
    }];
  }

  const effectiveInterval = Math.max(10, targetIntervalM);
  const densified: Array<{ latitude: number; longitude: number }> = [];

  for (let i = 0; i < normalizedWaypoints.length - 1; i++) {
    const p1 = normalizedWaypoints[i];
    const p2 = normalizedWaypoints[i + 1];

    const dist = haversineDistance(p1.latitude, p1.longitude, p2.latitude, p2.longitude);

    // Add starting point of this segment
    densified.push({
      latitude: roundCoord(p1.latitude),
      longitude: roundCoord(p1.longitude),
    });

    if (dist > effectiveInterval) {
      const steps = Math.ceil(dist / effectiveInterval);
      for (let s = 1; s < steps; s++) {
        const fraction = s / steps;
        const interpLat = p1.latitude + fraction * (p2.latitude - p1.latitude);
        const interpLon = p1.longitude + fraction * (p2.longitude - p1.longitude);
        densified.push({
          latitude: roundCoord(interpLat),
          longitude: roundCoord(interpLon),
        });
      }
    }
  }

  // Add final waypoint
  const lastPoint = normalizedWaypoints[normalizedWaypoints.length - 1];
  densified.push({
    latitude: roundCoord(lastPoint.latitude),
    longitude: roundCoord(lastPoint.longitude),
  });

  return densified;
}

/**
 * Computes DEM-derived corridor alignment gradient and profile metrics from sampled coordinate-elevation points.
 *
 * SCIENTIFIC & GEOMETRIC DISTINCTION:
 * - This function evaluates longitudinal corridor alignment gradient along the straight control-point
 *   polyline connecting pilot corridor waypoints. It is NOT the gradient of the physical NH-7 road alignment.
 * - It does NOT compute 2D valley-wall normal slope, geotechnical Factor of Safety, or landslide failure probability.
 * - Mean Corridor Gradient is calculated as a LENGTH-WEIGHTED metric:
 *   meanRouteGradientDegrees = (Σ gradientDegrees_i * distance_i) / totalDistance
 *   meanRouteGradientPercent = (Σ |Δh_i|) / totalDistance * 100
 *
 * MATHEMATICAL INVARIANT:
 * - For a continuous sequence where all sampled elevations are valid, elevationGainM - elevationLossM
 *   strictly equals (lastElevation - firstElevation) within floating-point tolerance (telescoping sum: Σ Δh_i = e_n - e_0).
 *
 * @param points Array of sampled coordinates with ground elevation
 */
export function computeRouteGradientMetrics(
  points: Array<{ latitude: number; longitude: number; elevation: number | null }>
): TerrainProfileMetrics {
  if (!Array.isArray(points) || points.length < 2) {
    return {
      sampleCount: Array.isArray(points) ? points.length : 0,
      totalDistanceM: 0,
      minElevationMsl: null,
      maxElevationMsl: null,
      elevationGainM: null,
      elevationLossM: null,
      meanRouteGradientDegrees: null,
      meanRouteGradientPercent: null,
      peakRouteGradientDegrees: null,
      peakRouteGradientPercent: null,
      segments: [],
    };
  }

  // Filter valid terrestrial elevations [0, 9000 m MSL]
  const validElevations = points
    .map((p) => p.elevation)
    .filter(
      (e): e is number =>
        typeof e === 'number' && Number.isFinite(e) && e >= 0 && e <= 9000
    );

  const minElevationMsl = validElevations.length > 0 ? Math.min(...validElevations) : null;
  const maxElevationMsl = validElevations.length > 0 ? Math.max(...validElevations) : null;

  const segments: TerrainSegment[] = [];
  let totalDistanceM = 0;
  let elevationGainM = 0;
  let elevationLossM = 0;
  let weightedDegSum = 0;
  let totalValidGradientDistanceM = 0;
  let maxGradientDeg = 0;
  let maxGradientPct = 0;
  let hasValidSegment = false;

  for (let i = 0; i < points.length - 1; i++) {
    const p1 = points[i];
    const p2 = points[i + 1];

    const segDist = haversineDistance(p1.latitude, p1.longitude, p2.latitude, p2.longitude);
    totalDistanceM += segDist;

    const e1 = p1.elevation;
    const e2 = p2.elevation;
    const isE1Valid = typeof e1 === 'number' && Number.isFinite(e1) && e1 >= 0 && e1 <= 9000;
    const isE2Valid = typeof e2 === 'number' && Number.isFinite(e2) && e2 >= 0 && e2 <= 9000;

    let elevationChangeM: number | null = null;
    let gradientRatio: number | null = null;
    let gradientDegrees: number | null = null;
    let gradientPercent: number | null = null;

    if (isE1Valid && isE2Valid) {
      hasValidSegment = true;
      const deltaH = e2 - e1;
      elevationChangeM = Math.round(deltaH * 10) / 10;

      if (deltaH > 0) {
        elevationGainM += deltaH;
      } else if (deltaH < 0) {
        elevationLossM += Math.abs(deltaH);
      }

      if (segDist > 0) {
        gradientRatio = Math.abs(deltaH) / segDist;
        const rad = Math.atan(gradientRatio);
        gradientDegrees = Math.round((rad * (180 / Math.PI)) * 100) / 100;
        gradientPercent = Math.round((gradientRatio * 100) * 100) / 100;

        weightedDegSum += gradientDegrees * segDist;
        totalValidGradientDistanceM += segDist;

        if (gradientDegrees > maxGradientDeg) {
          maxGradientDeg = gradientDegrees;
        }
        if (gradientPercent > maxGradientPct) {
          maxGradientPct = gradientPercent;
        }
      } else {
        // Zero-length segment (identical consecutive coordinates)
        gradientRatio = 0;
        gradientDegrees = 0;
        gradientPercent = 0;
      }
    }

    segments.push({
      startLat: p1.latitude,
      startLon: p1.longitude,
      endLat: p2.latitude,
      endLon: p2.longitude,
      distanceM: Math.round(segDist * 10) / 10,
      startElevationM: isE1Valid ? e1 : null,
      endElevationM: isE2Valid ? e2 : null,
      elevationChangeM,
      gradientRatio,
      gradientDegrees,
      gradientPercent,
    });
  }

  let meanRouteGradientDegrees: number | null = null;
  let meanRouteGradientPercent: number | null = null;
  let peakRouteGradientDegrees: number | null = null;
  let peakRouteGradientPercent: number | null = null;

  if (hasValidSegment && totalValidGradientDistanceM > 0) {
    meanRouteGradientDegrees = Math.round((weightedDegSum / totalValidGradientDistanceM) * 10) / 10;
    const totalDeltaSum = elevationGainM + elevationLossM;
    meanRouteGradientPercent = Math.round(((totalDeltaSum / totalValidGradientDistanceM) * 100) * 10) / 10;
    peakRouteGradientDegrees = Math.round(maxGradientDeg * 10) / 10;
    peakRouteGradientPercent = Math.round(maxGradientPct * 10) / 10;
  }

  return {
    sampleCount: points.length,
    totalDistanceM: Math.round(totalDistanceM),
    minElevationMsl,
    maxElevationMsl,
    elevationGainM: hasValidSegment ? Math.round(elevationGainM) : null,
    elevationLossM: hasValidSegment ? Math.round(elevationLossM) : null,
    meanRouteGradientDegrees,
    meanRouteGradientPercent,
    peakRouteGradientDegrees,
    peakRouteGradientPercent,
    segments,
  };
}

/**
 * Retrieves a dense elevation profile and route gradient metrics for a corridor.
 * Automatically densifies coordinates to target sampling interval and executes
 * batched queries against the Open-Meteo elevation endpoint.
 *
 * @param waypoints Optional custom corridor coordinates. Defaults to NH-7 Pilot Corridor.
 * @param options Sampling interval, refresh override, and timeout settings.
 */
export async function getDenseCorridorTerrainProfile(
  waypoints?: Array<{ latitude: number; longitude: number } | [number, number]>,
  options: TerrainProfileOptions = {}
): Promise<ServiceResult<TerrainProfileData>> {
  const coordsInput = waypoints && waypoints.length > 0 ? waypoints : PILOT_CORRIDOR_COORDINATES;
  const targetIntervalM = options.targetIntervalM || DEFAULT_SAMPLING_INTERVAL_METERS;

  // 1. Densify corridor coordinates
  const denseCoordinates = densifyCoordinates(coordsInput, targetIntervalM);

  if (denseCoordinates.length < 2) {
    return {
      status: 'error',
      data: null,
      error: 'Insufficient coordinate samples to compute a terrain profile (minimum 2 points required).',
    };
  }

  // 2. Validate all densified coordinates
  for (let i = 0; i < denseCoordinates.length; i++) {
    const { latitude, longitude } = denseCoordinates[i];
    if (
      typeof latitude !== 'number' ||
      typeof longitude !== 'number' ||
      isNaN(latitude) ||
      isNaN(longitude) ||
      latitude < -90 ||
      latitude > 90 ||
      longitude < -180 ||
      longitude > 180
    ) {
      return {
        status: 'error',
        data: null,
        error: `Invalid coordinate pair at index ${i}: [${latitude}, ${longitude}]. Must be valid WGS84 coordinates.`,
      };
    }
  }

  // 3. Batch coordinates into chunks of <= 100 points
  const batchLimit = OPEN_METEO_ELEVATION_BATCH_LIMIT;
  const allSampledPoints: EnvironmentalElevationPoint[] = [];

  for (let i = 0; i < denseCoordinates.length; i += batchLimit) {
    const batch = denseCoordinates.slice(i, i + batchLimit);
    const lats = batch.map((c) => c.latitude).join(',');
    const lons = batch.map((c) => c.longitude).join(',');

    const url = `${ELEVATION_API_BASE_URL}/elevation?latitude=${lats}&longitude=${lons}`;

    const batchResult = await fetchEnvironmentalJson<OpenMeteoElevationResponse>(url, {
      skipCache: options.forceRefresh,
      timeoutMs: options.timeoutMs,
    });

    if (batchResult.status === 'error') {
      return {
        status: 'error',
        data: null,
        error: `Failed to fetch DEM elevation batch ${Math.floor(i / batchLimit) + 1} (${i} to ${i + batch.length}): ${batchResult.error}`,
      };
    }

    const elevationList = batchResult.data?.elevation || [];

    for (let j = 0; j < batch.length; j++) {
      const rawEl = elevationList[j];
      allSampledPoints.push({
        latitude: batch[j].latitude,
        longitude: batch[j].longitude,
        elevation: typeof rawEl === 'number' && Number.isFinite(rawEl) ? Math.round(rawEl) : null,
      });
    }
  }

  // 4. Compute route gradient and hypsometric metrics
  const metrics = computeRouteGradientMetrics(allSampledPoints);

  const profileData: TerrainProfileData = {
    points: allSampledPoints,
    metrics,
    source: 'Open-Meteo Elevation API (Copernicus DEM 90m)',
    fetchedAt: new Date().toISOString(),
  };

  return {
    status: 'success',
    data: profileData,
    error: null,
  };
}
