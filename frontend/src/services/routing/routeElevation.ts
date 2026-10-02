/**
 * ==============================================================================
 * DRISHTI-HIMALAYA - ROUTE ELEVATION & TERRAIN GRADIENT ENRICHMENT
 * Phase 2: Real Road Routing + Dynamic Route Geometry
 *
 * Integrates road route samples with DEM elevation (Open-Meteo Copernicus DEM 90m)
 * and calculates longitudinal terrain gradients along physical road alignments.
 *
 * SCIENTIFIC CLARIFICATION:
 * - Gradient calculations represent road longitudinal TERRAIN GRADIENTS (slope of the road corridor).
 * - They do NOT represent geotechnical cut-slope or hillslope stability.
 * - Landslide susceptibility requires multi-factor geotechnical, lithological, and
 *   hydro-meteorological assessment.
 * ==============================================================================
 */

import { RouteResult, RouteSample, RouteSegment } from './routeTypes';
import { fetchEnvironmentalJson, ELEVATION_API_BASE_URL } from '../environmental/environmentalApi';
import { OPEN_METEO_ELEVATION_BATCH_LIMIT } from '../environmental/corridorConstants';

export interface GradientCalculation {
  elevationChangeM: number | null;
  gradientPercent: number | null;
  gradientDegrees: number | null;
}

/**
 * Calculates longitudinal terrain gradient between two points given horizontal distance and elevations.
 * Returns null values if either elevation is missing or horizontal distance is non-positive.
 *
 * @param horizontalDistM Geodesic or chainage distance in meters (> 0)
 * @param elev1M Start point elevation in meters
 * @param elev2M End point elevation in meters
 */
export function calculateGradient(
  horizontalDistM: number,
  elev1M: number | null | undefined,
  elev2M: number | null | undefined
): GradientCalculation {
  if (
    typeof elev1M !== 'number' ||
    typeof elev2M !== 'number' ||
    !Number.isFinite(elev1M) ||
    !Number.isFinite(elev2M) ||
    typeof horizontalDistM !== 'number' ||
    !Number.isFinite(horizontalDistM) ||
    horizontalDistM <= 0
  ) {
    return {
      elevationChangeM: null,
      gradientPercent: null,
      gradientDegrees: null,
    };
  }

  const elevationChangeM = Math.round((elev2M - elev1M) * 10) / 10;
  const rawGradientPercent = (elevationChangeM / horizontalDistM) * 100;
  const gradientPercent = Math.round(rawGradientPercent * 10) / 10;

  // Slope angle: atan(dh / d) in radians converted to degrees
  const angleRad = Math.atan(elevationChangeM / horizontalDistM);
  const rawDegrees = angleRad * (180 / Math.PI);
  const gradientDegrees = Math.round(rawDegrees * 10) / 10;

  return {
    elevationChangeM,
    gradientPercent,
    gradientDegrees,
  };
}

interface OpenMeteoElevationResponse {
  elevation?: (number | null)[];
}

/**
 * Enriches a RouteResult with Copernicus DEM elevation data from the environmental API.
 * Attaches ground elevation to each RouteSample, computes segment slope gradients,
 * and compiles comprehensive hypsometric route metrics.
 *
 * If the DEM API is unreachable or times out, the route remains intact with
 * clear data-quality indicators indicating missing telemetry (no fake elevation).
 */
export async function enrichRouteWithElevation(
  route: RouteResult,
  options: { timeoutMs?: number; skipCache?: boolean } = {}
): Promise<RouteResult> {
  if (!route || route.status !== 'success' || !route.samples || route.samples.length === 0) {
    return route;
  }

  const samples = route.samples;
  const batchLimit = OPEN_METEO_ELEVATION_BATCH_LIMIT;
  const rawElevations: (number | null)[] = [];

  try {
    for (let i = 0; i < samples.length; i += batchLimit) {
      const batch = samples.slice(i, i + batchLimit);
      const lats = batch.map((s) => s.lat).join(',');
      const lons = batch.map((s) => s.lng).join(',');

      const url = `${ELEVATION_API_BASE_URL}/elevation?latitude=${lats}&longitude=${lons}`;

      const res = await fetchEnvironmentalJson<OpenMeteoElevationResponse>(url, {
        timeoutMs: options.timeoutMs ?? 10000,
        skipCache: options.skipCache ?? false,
      });

      if (res.status === 'success' && res.data?.elevation) {
        rawElevations.push(...res.data.elevation);
      } else {
        // Fill batch with nulls on failure
        for (let j = 0; j < batch.length; j++) {
          rawElevations.push(null);
        }
      }
    }
  } catch {
    // Fill remainder with nulls on network exception
    while (rawElevations.length < samples.length) {
      rawElevations.push(null);
    }
  }

  // Enrich samples
  let validElevCount = 0;
  const validElevations: number[] = [];

  const enrichedSamples: RouteSample[] = samples.map((sample, idx) => {
    const rawVal = rawElevations[idx];
    const isValid = typeof rawVal === 'number' && Number.isFinite(rawVal) && rawVal >= 0 && rawVal <= 9000;

    if (isValid) {
      const elevM = Math.round(rawVal);
      validElevCount++;
      validElevations.push(elevM);
      return {
        ...sample,
        elevationM: elevM,
        elevationSource: 'Open-Meteo (Copernicus DEM 90m)',
      };
    }

    return {
      ...sample,
      elevationM: null,
      elevationSource: 'Unavailable',
    };
  });

  // Enrich segments with slope and elevation change
  let totalElevationGain = 0;
  let totalElevationLoss = 0;
  let peakGradientPercent: number | null = null;
  let peakGradientDegrees: number | null = null;
  let hasValidSegment = false;

  const enrichedSegments: RouteSegment[] = route.segments.map((seg, idx) => {
    const s1 = enrichedSamples[idx];
    const s2 = enrichedSamples[idx + 1] || s1;

    const e1 = s1.elevationM;
    const e2 = s2.elevationM;
    const grad = calculateGradient(seg.lengthMeters, e1, e2);

    if (grad.elevationChangeM !== null) {
      hasValidSegment = true;
      if (grad.elevationChangeM > 0) {
        totalElevationGain += grad.elevationChangeM;
      } else {
        totalElevationLoss += Math.abs(grad.elevationChangeM);
      }

      if (grad.gradientPercent !== null) {
        const absPercent = Math.abs(grad.gradientPercent);
        if (peakGradientPercent === null || absPercent > Math.abs(peakGradientPercent)) {
          peakGradientPercent = grad.gradientPercent;
          peakGradientDegrees = grad.gradientDegrees;
        }
      }
    }

    return {
      ...seg,
      startPoint: s1,
      endPoint: s2,
      startElevationM: e1,
      endElevationM: e2,
      elevationChangeM: grad.elevationChangeM,
      gradientPercent: grad.gradientPercent,
      gradientDegrees: grad.gradientDegrees,
    };
  });

  // Calculate route aggregate metrics
  const minElevation = validElevations.length > 0 ? Math.min(...validElevations) : null;
  const maxElevation = validElevations.length > 0 ? Math.max(...validElevations) : null;
  const averageElevation =
    validElevations.length > 0
      ? Math.round(validElevations.reduce((a, b) => a + b, 0) / validElevations.length)
      : null;

  const coveragePercent = Math.round((validElevCount / samples.length) * 100);
  const elevationCoverageRatio =
    validElevCount > 0
      ? `${validElevCount}/${samples.length} Samples (${coveragePercent}%)`
      : 'Unavailable (DEM service unreachable)';

  return {
    ...route,
    samples: enrichedSamples,
    segments: enrichedSegments,
    metrics: {
      ...route.metrics,
      elevationMin: minElevation,
      elevationMax: maxElevation,
      elevationGain: hasValidSegment ? Math.round(totalElevationGain) : null,
      elevationLoss: hasValidSegment ? Math.round(totalElevationLoss) : null,
      averageElevation,
      peakGradientPercent,
      peakGradientDegrees,
      elevationCoverageRatio,
    },
  };
}
