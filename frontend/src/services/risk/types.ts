/**
 * ==============================================================================
 * DRISHTI-HIMALAYA - RISK ENGINE DOMAIN CONTRACTS
 * Strictly typed, immutable models for deterministic and ML-compatible hazard scoring.
 * ==============================================================================
 */

import { EnvironmentalData } from '../environmental/types';

/**
 * Standard four-tier hazard classification aligned with design system tokens,
 * plus INDETERMINATE for telemetry failure / insufficient data.
 */
export type RiskLevel = 'LOW' | 'MODERATE' | 'HIGH' | 'SEVERE' | 'INDETERMINATE';

/**
 * High-level hazard factor domain category.
 */
export type RiskFactorCategory = 'meteorological' | 'topographic' | 'geotechnical';

/**
 * Explicit state classification for each factor:
 * - active: reliably measured or derived from verified live telemetry.
 * - unavailable: expected active factor, but telemetry was missing, corrupted, or rejected.
 * - unassessed_future_phase: planned for future milestones (e.g. slope cuts, scar KD-tree).
 */
export type RiskFactorStatus = 'active' | 'unavailable' | 'unassessed_future_phase';

/**
 * Registered identifiers for all potential risk factors.
 */
export type RiskFactorId =
  | 'precipitation_intensity'
  | 'rainfall_accumulation_24h'
  | 'precipitation_probability'
  | 'orographic_elevation'
  | 'terrain_slope_gradient'
  | 'slope_instability'
  | 'scar_proximity';

/**
 * Individual evaluated hazard factor model.
 */
export interface RiskFactor {
  readonly id: RiskFactorId;
  readonly name: string;
  readonly category: RiskFactorCategory;
  readonly status: RiskFactorStatus;
  /** Sub-score on [0.0, 100.0] scale, or null if unavailable/unassessed */
  readonly score: number | null;
  /** Base weight configured in risk engine specification */
  readonly rawWeight: number;
  /** Dynamically normalized weight across currently active factors (sum = 1.0) */
  readonly normalizedWeight: number;
  /** Direct contribution to final score: normalizedWeight * score */
  readonly weightedContribution: number | null;
  /** Raw physical metric value before scaling (e.g. 18.4) */
  readonly rawValue: number | null;
  /** Physical unit of measurement (e.g. "mm/h", "mm", "%", "m MSL", "degrees") */
  readonly unit: string;
  /** Scientific or empirical threshold reference used for normalization */
  readonly thresholdReference: string;
  /** True if based on a provisional engineering assumption; False if source-backed */
  readonly isProvisional: boolean;
  /** Explanatory narrative explaining how the score was calculated */
  readonly explanation: string;
}

/**
 * Data Quality assessment ratings.
 */
export type DataQualityRating = 'HIGH' | 'MODERATE' | 'DEGRADED' | 'INSUFFICIENT';

/**
 * Comprehensive data quality and telemetry integrity audit report.
 */
export interface DataQualityReport {
  readonly rating: DataQualityRating;
  /** Percentage of potential active factors successfully evaluated [0, 100] */
  readonly completenessPercent: number;
  readonly activeFactorsCount: number;
  readonly unavailableFactorsCount: number;
  readonly futureUnassessedFactorsCount: number;
  readonly telemetryFreshnessSeconds: number | null;
  readonly isStale: boolean;
  /** Array of natural-language caveats regarding data limitations */
  readonly caveats: readonly string[];
}

/**
 * Consolidated immutable Risk Assessment result produced by an IRiskEngine.
 */
export interface RiskAssessment {
  /** Composite score [0.0, 100.0], or null if telemetry is insufficient */
  readonly score: number | null;
  readonly level: RiskLevel;
  /** UI Hex color matching design tokens (#10B981, #EAB308, #F97316, #EF4444, #64748B) */
  readonly colorHex: string;
  /** The primary hazard factor producing the highest weighted contribution */
  readonly primaryFactor: RiskFactor | null;
  /** Comprehensive list of all factors (active, unavailable, and future) */
  readonly factors: readonly RiskFactor[];
  /** Judicial-grade deterministic summary of the hazard evaluation */
  readonly summaryExplanation: string;
  /** Rigorous audit of data quality, freshness, and gaps */
  readonly dataQuality: DataQualityReport;
  /** ISO timestamp when the risk evaluation was performed */
  readonly evaluatedAt: string;
}

/**
 * Configurable parameters and threshold overrides for risk calculations.
 */
export interface RiskEngineConfig {
  /** Provisional hourly intensity threshold in mm/h (default: 25.0) */
  readonly intensityProvisionalThresholdMmH: number;
  /** Empirical 24h accumulation threshold in mm (default: 75.0, LANDSLIP) */
  readonly accumulation24hThresholdMm: number;
  /** Elevation bounds for corridor normalization in meters MSL (default: 300 to 2200) */
  readonly elevationCorridorMinMsl: number;
  readonly elevationCorridorMaxMsl: number;
  /** Physical plausibility bounds for elevation rejection */
  readonly elevationPhysicalMinMsl: number;
  readonly elevationPhysicalMaxMsl: number;
  /** Provisional terrain gradient threshold in degrees (default: 15.0) */
  readonly slopeGradientThresholdDegrees: number;
  /** Max allowable telemetry age in seconds before flagging as stale (default: 10800 = 3h) */
  readonly telemetryStalenessLimitSeconds: number;
  /** Base weights for candidate factors */
  readonly baseWeights: {
    readonly precipitation_intensity: number;
    readonly rainfall_accumulation_24h: number;
    readonly precipitation_probability: number;
    readonly orographic_elevation: number;
    readonly terrain_slope_gradient: number;
  };
}

/**
 * Pluggable Risk Engine contract.
 * Guarantees that future ML-hybrid or ML-inference engines can seamlessly replace
 * or augment the deterministic engine without breaking UI consumers.
 */
export interface IRiskEngine {
  readonly id: string;
  readonly name: string;
  readonly type: 'deterministic' | 'ml_hybrid' | 'ml_inference';
  evaluate(telemetry: EnvironmentalData | null, config?: Partial<RiskEngineConfig>): RiskAssessment;
}
