/**
 * ==============================================================================
 * DRISHTI-HIMALAYA - RISK ENGINE FEATURE EXTRACTOR
 * Extracts, sanitizes, and audits real environmental telemetry for hazard modeling.
 * ==============================================================================
 */

import { EnvironmentalData } from '../environmental/types';
import { RiskEngineConfig, DataQualityReport, DataQualityRating } from './types';
import { DEFAULT_RISK_ENGINE_CONFIG } from './riskConfig';

export interface ExtractedMetric<T> {
  readonly value: T | null;
  readonly isAvailable: boolean;
  readonly rejectionReason: string | null;
}

export interface ExtractedFeatures {
  readonly precipitationMmH: ExtractedMetric<number>;
  readonly accumulation24hMm: ExtractedMetric<number>;
  readonly precipitationProbability: ExtractedMetric<number>;
  readonly weatherCode: number | null;
  readonly elevationMsl: ExtractedMetric<number>;
  readonly routeGradientDegrees: ExtractedMetric<number>;
  readonly peakGradientDegrees: ExtractedMetric<number>;
  readonly dataQuality: DataQualityReport;
}

/**
 * Validates a numeric measurement.
 * Returns null if the value is null, undefined, NaN, or non-finite.
 */
function sanitizeNumber(val: unknown): number | null {
  if (val === null || val === undefined) return null;
  const num = Number(val);
  if (!Number.isFinite(num) || Number.isNaN(num)) return null;
  return num;
}

/**
 * Extracts and sanitizes real environmental and DEM terrain telemetry.
 * Strictly guarantees that corrupted or missing values are classified as unavailable
 * and NEVER converted into artificial minimum or maximum scores.
 *
 * @param telemetry Raw environmental data payload from Phase 3/5 services
 * @param config Optional risk engine configuration overrides
 * @param nowMs Optional timestamp in milliseconds for deterministic time comparisons
 */
export function extractRiskFeatures(
  telemetry: EnvironmentalData | null,
  config: RiskEngineConfig = DEFAULT_RISK_ENGINE_CONFIG,
  nowMs: number = Date.now()
): ExtractedFeatures {
  const caveats: string[] = [];

  // Case 1: Complete telemetry absence or error status
  if (!telemetry || telemetry.status === 'error') {
    const reason = telemetry?.error || 'Environmental telemetry stream is unavailable or in error status.';
    caveats.push(reason);
    caveats.push('Historical landslide scar proximity is unassessed pending Phase 7.');

    const emptyMetric: ExtractedMetric<number> = {
      value: null,
      isAvailable: false,
      rejectionReason: reason,
    };

    return {
      precipitationMmH: emptyMetric,
      accumulation24hMm: emptyMetric,
      precipitationProbability: emptyMetric,
      weatherCode: null,
      elevationMsl: emptyMetric,
      routeGradientDegrees: emptyMetric,
      peakGradientDegrees: emptyMetric,
      dataQuality: {
        rating: 'INSUFFICIENT',
        completenessPercent: 0,
        activeFactorsCount: 0,
        unavailableFactorsCount: 5,
        futureUnassessedFactorsCount: 1,
        telemetryFreshnessSeconds: null,
        isStale: false,
        caveats,
      },
    };
  }

  // --- Feature 1: Precipitation Intensity ---
  let precipitationMmH: ExtractedMetric<number>;
  const rawPrecip = sanitizeNumber(telemetry.rainfall?.precipitation);
  if (rawPrecip === null) {
    precipitationMmH = {
      value: null,
      isAvailable: false,
      rejectionReason: 'Instantaneous precipitation telemetry is missing or null.',
    };
  } else if (rawPrecip < 0) {
    precipitationMmH = {
      value: null,
      isAvailable: false,
      rejectionReason: `Negative precipitation value (${rawPrecip} mm/h) rejected as corrupt sensor reading.`,
    };
    caveats.push('Negative precipitation value rejected as invalid sensor telemetry.');
  } else {
    precipitationMmH = {
      value: rawPrecip,
      isAvailable: true,
      rejectionReason: null,
    };
  }

  // --- Feature 2: 24h Rainfall Accumulation ---
  let accumulation24hMm: ExtractedMetric<number>;
  const rawAccum = sanitizeNumber(telemetry.rainfall?.dailyPrecipitationSum);
  if (rawAccum === null) {
    accumulation24hMm = {
      value: null,
      isAvailable: false,
      rejectionReason: '24-hour rainfall accumulation telemetry is missing or null.',
    };
  } else if (rawAccum < 0) {
    accumulation24hMm = {
      value: null,
      isAvailable: false,
      rejectionReason: `Negative accumulation value (${rawAccum} mm) rejected as corrupt sensor reading.`,
    };
    caveats.push('Negative 24h accumulation value rejected as invalid sensor telemetry.');
  } else {
    accumulation24hMm = {
      value: rawAccum,
      isAvailable: true,
      rejectionReason: null,
    };
  }

  // --- Feature 3: Precipitation Probability ---
  let precipitationProbability: ExtractedMetric<number>;
  const rawProb = sanitizeNumber(telemetry.rainfall?.precipitationProbability);
  if (rawProb === null) {
    precipitationProbability = {
      value: null,
      isAvailable: false,
      rejectionReason: 'Precipitation probability telemetry is missing or null.',
    };
  } else if (rawProb < 0 || rawProb > 100) {
    precipitationProbability = {
      value: null,
      isAvailable: false,
      rejectionReason: `Precipitation probability (${rawProb}%) out of physical bounds [0, 100].`,
    };
    caveats.push(`Out-of-bounds precipitation probability (${rawProb}%) rejected.`);
  } else {
    precipitationProbability = {
      value: rawProb,
      isAvailable: true,
      rejectionReason: null,
    };
  }

  const weatherCode = sanitizeNumber(telemetry.rainfall?.weatherCode);

  // --- Feature 4: Hypsometric Elevation ---
  let elevationMsl: ExtractedMetric<number>;
  const rawElev = sanitizeNumber(telemetry.terrain?.elevation?.elevation);
  if (rawElev === null) {
    elevationMsl = {
      value: null,
      isAvailable: false,
      rejectionReason: 'Elevation telemetry is missing or null.',
    };
  } else if (
    rawElev < config.elevationPhysicalMinMsl ||
    rawElev > config.elevationPhysicalMaxMsl
  ) {
    elevationMsl = {
      value: null,
      isAvailable: false,
      rejectionReason: `Elevation (${rawElev} m MSL) exceeds terrestrial physical bounds [${config.elevationPhysicalMinMsl}, ${config.elevationPhysicalMaxMsl} m MSL].`,
    };
    caveats.push(`Elevation telemetry (${rawElev} m MSL) rejected as physically implausible.`);
  } else {
    elevationMsl = {
      value: rawElev,
      isAvailable: true,
      rejectionReason: null,
    };
  }

  // --- Feature 5: DEM-Derived Corridor Alignment Gradient (Mean & Peak) ---
  let routeGradientDegrees: ExtractedMetric<number>;
  let peakGradientDegrees: ExtractedMetric<number>;

  const rawMeanGrad = sanitizeNumber(
    telemetry.terrain?.routeProfile?.meanRouteGradientDegrees ?? telemetry.terrain?.slopeDegrees
  );
  const rawPeakGrad = sanitizeNumber(telemetry.terrain?.routeProfile?.peakRouteGradientDegrees);

  if (rawMeanGrad === null) {
    routeGradientDegrees = {
      value: null,
      isAvailable: false,
      rejectionReason: 'DEM-derived corridor alignment gradient telemetry is missing or not yet profiled.',
    };
  } else if (rawMeanGrad < 0 || rawMeanGrad > 90) {
    routeGradientDegrees = {
      value: null,
      isAvailable: false,
      rejectionReason: `Corridor alignment gradient (${rawMeanGrad}°) outside plausible terrestrial range [0, 90°].`,
    };
    caveats.push(`Corridor alignment gradient telemetry (${rawMeanGrad}°) rejected as invalid.`);
  } else {
    routeGradientDegrees = {
      value: rawMeanGrad,
      isAvailable: true,
      rejectionReason: null,
    };
  }

  if (rawPeakGrad === null) {
    peakGradientDegrees = {
      value: null,
      isAvailable: false,
      rejectionReason: 'Peak corridor alignment gradient telemetry is missing.',
    };
  } else if (rawPeakGrad < 0 || rawPeakGrad > 90) {
    peakGradientDegrees = {
      value: null,
      isAvailable: false,
      rejectionReason: `Peak corridor alignment gradient (${rawPeakGrad}°) outside plausible range [0, 90°].`,
    };
  } else {
    peakGradientDegrees = {
      value: rawPeakGrad,
      isAvailable: true,
      rejectionReason: null,
    };
  }

  // --- Freshness & Quality Evaluation ---
  let telemetryFreshnessSeconds: number | null = null;
  let isStale = false;

  const timestampStr = telemetry.rainfall?.fetchedAt || telemetry.metadata?.fetchedAt;
  if (timestampStr) {
    const fetchedMs = new Date(timestampStr).getTime();
    if (!Number.isNaN(fetchedMs)) {
      telemetryFreshnessSeconds = Math.max(0, Math.floor((nowMs - fetchedMs) / 1000));
      if (telemetryFreshnessSeconds > config.telemetryStalenessLimitSeconds) {
        isStale = true;
        const hours = (telemetryFreshnessSeconds / 3600).toFixed(1);
        caveats.push(`Telemetry is ${hours} hours old; exceeds ${config.telemetryStalenessLimitSeconds / 3600}h freshness limit.`);
      }
    }
  }

  // Count active vs unavailable factors out of 5 candidate active factors
  const candidateMetrics = [
    precipitationMmH,
    accumulation24hMm,
    precipitationProbability,
    elevationMsl,
    routeGradientDegrees,
  ];
  const activeCount = candidateMetrics.filter((m) => m.isAvailable).length;
  const unavailableCount = candidateMetrics.length - activeCount;
  const futureCount = 2; // slope_instability + scar_proximity
  const completenessPercent = Math.round((activeCount / candidateMetrics.length) * 100);

  // Determine overall quality rating
  let rating: DataQualityRating;
  if (activeCount === 5 && !isStale) {
    rating = 'HIGH';
  } else if (activeCount >= 3 && !isStale) {
    rating = 'MODERATE';
  } else if (activeCount >= 1) {
    rating = 'DEGRADED';
  } else {
    rating = 'INSUFFICIENT';
  }

  // Append documentation caveats
  caveats.push('Geotechnical slope stability and historical landslide scars are unassessed in current decision-support prototype.');
  caveats.push('Terrain Slope Gradient represents DEM-derived corridor alignment gradient along control-point chords, not physical road gradient, geotechnical slope stability, or failure probability.');

  if (unavailableCount > 0) {
    caveats.push(`${unavailableCount} telemetry factor(s) unavailable; remaining active factors dynamically normalized.`);
  }

  return {
    precipitationMmH,
    accumulation24hMm,
    precipitationProbability,
    weatherCode,
    elevationMsl,
    routeGradientDegrees,
    peakGradientDegrees,
    dataQuality: {
      rating,
      completenessPercent,
      activeFactorsCount: activeCount,
      unavailableFactorsCount: unavailableCount,
      futureUnassessedFactorsCount: futureCount,
      telemetryFreshnessSeconds,
      isStale,
      caveats,
    },
  };
}
