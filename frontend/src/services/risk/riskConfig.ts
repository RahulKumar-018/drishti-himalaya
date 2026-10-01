/**
 * ==============================================================================
 * DRISHTI-HIMALAYA - RISK ENGINE CONFIGURATION & SCIENTIFIC CONSTANTS
 * Centralized engineering parameters, thresholds, and documented assumptions.
 * ==============================================================================
 */

import { RiskEngineConfig } from './types';

/**
 * ------------------------------------------------------------------------------
 * THRESHOLD SPECIFICATIONS & DOCUMENTED ASSUMPTIONS
 * ------------------------------------------------------------------------------
 */

/**
 * PROVISIONAL ENGINEERING ASSUMPTION:
 * Hourly precipitation rate indicative of intense, acute runoff along mountain cuts.
 *
 * NOTATION:
 * This is a configurable provisional engineering threshold requiring future regional
 * hydrologic calibration. It is NOT a universal "cloudburst threshold" (the Indian
 * Meteorological Department officially defines a cloudburst as >= 100 mm in 1 hour
 * over a ~20-30 sq km area). It serves here as an early-warning proxy for acute surficial
 * scour and culvert overflow along excavated highway alignments.
 */
export const PROVISIONAL_INTENSITY_THRESHOLD_MM_H = 25.0;

/**
 * SOURCE-BACKED EMPIRICAL THRESHOLD:
 * 24-hour cumulative rainfall threshold for landslide initiation in Uttarakhand.
 *
 * SOURCE REFERENCE:
 * Anchored in findings from the UK Natural Environment Research Council (NERC) /
 * British Geological Survey (BGS) and Geological Survey of India (GSI) LANDSLIP Project
 * (2016-2021) for the Chamoli / Rudraprayag districts of Uttarakhand.
 *
 * USAGE NOTE:
 * Used strictly as an antecedent rainfall accumulation proxy for potential regolith
 * saturation effects. It does NOT represent direct in-situ piezometric pore-water
 * pressure or borehole inclinometer measurements.
 */
export const LANDSLIP_ACCUMULATION_24H_THRESHOLD_MM = 75.0;

/**
 * PROVISIONAL ENGINEERING ASSUMPTION:
 * Geographic elevation bounds for hypsometric relief normalization along the NH-7 corridor.
 *
 * BOUNDS:
 * Min: 300.0 m MSL (approx. Rishikesh foothills at ~340 m MSL)
 * Max: 2200.0 m MSL (approx. upper relief above Joshimath at ~1,890 m MSL)
 *
 * JUSTIFICATION:
 * Normalized relief within the Garhwal transit corridor captures increasing orographic
 * cloud condensation, canyon slope steepness, and periglacial rock loosening with altitude.
 */
export const CORRIDOR_ELEVATION_MIN_MSL = 300.0;
export const CORRIDOR_ELEVATION_MAX_MSL = 2200.0;

/**
 * SOURCE-BACKED PHYSICAL PLAUSIBILITY BOUNDS:
 * Global physical plausibility limits for terrestrial highway elevations in India.
 *
 * MIN: 0.0 m MSL (mean sea level)
 * MAX: 9000.0 m MSL (exceeds Mount Everest summit at 8,848.86 m MSL)
 *
 * REJECTION RULE:
 * Any telemetry value outside [0.0, 9000.0] or non-finite/NaN is classified as CORRUPT
 * and marked as UNAVAILABLE. It is NEVER clamped or converted into a maximum-risk score.
 */
export const ELEVATION_PHYSICAL_MIN_MSL = 0.0;
export const ELEVATION_PHYSICAL_MAX_MSL = 9000.0;

/**
 * PROVISIONAL ENGINEERING ASSUMPTION:
 * Maximum allowable telemetry age before flagging data as stale.
 * 10,800 seconds = 3.0 hours.
 */
export const TELEMETRY_STALENESS_LIMIT_SECONDS = 3 * 60 * 60;

/**
 * SOURCE-BACKED CONVECTIVE WEATHER MODIFIERS (WMO Code WW Standards):
 * Multipliers applied to precipitation probability when high-energy convective storm cells
 * are reported by the meteorological provider.
 */
export const CONVECTIVE_WEATHER_MODIFIERS: Readonly<Record<number, number>> = {
  // Thunderstorms (with/without hail) indicate severe localized convective updrafts
  95: 1.25,
  96: 1.25,
  99: 1.25,
  // Violent rain showers indicate rapid localized rainfall bursts
  80: 1.15,
  81: 1.15,
  82: 1.25,
  // Heavy freezing rain / heavy snowfall
  67: 1.15,
  75: 1.15,
  86: 1.2,
};

/**
 * BASE FACTOR WEIGHTS:
 * Relative weights across the four currently active hydro-meteorological and topographic factors.
 * In Phase 4, these weights are dynamically normalized to sum to 1.0 across whichever
 * factors have verified, reliable telemetry.
 */
export const DEFAULT_BASE_WEIGHTS = {
  precipitation_intensity: 0.40,
  rainfall_accumulation_24h: 0.35,
  precipitation_probability: 0.15,
  orographic_elevation: 0.10,
} as const;

/**
 * RISK TIER PALETTE & THRESHOLDS
 * Aligned with CSS design tokens in styles/variables.css.
 */
export const RISK_TIER_CONFIG = {
  LOW: {
    minScore: 0.0,
    maxScore: 24.99,
    tier: 'LOW',
    colorHex: '#10B981',
    description: 'Minimal immediate hydro-meteorological hazard exposure.',
  },
  MODERATE: {
    minScore: 25.0,
    maxScore: 49.99,
    tier: 'MODERATE',
    colorHex: '#EAB308',
    description: 'Elevated precipitation or terrain exposure; proceed with routine vigilance.',
  },
  HIGH: {
    minScore: 50.0,
    maxScore: 74.99,
    tier: 'HIGH',
    colorHex: '#F97316',
    description: 'Significant cumulative rainfall or acute downpour; heightened slope instability potential.',
  },
  SEVERE: {
    minScore: 75.0,
    maxScore: 100.0,
    tier: 'SEVERE',
    colorHex: '#EF4444',
    description: 'Critical precipitation threshold exceeded; imminent transit hazard along mountain cuts.',
  },
  INDETERMINATE: {
    minScore: null,
    maxScore: null,
    tier: 'INDETERMINATE',
    colorHex: '#64748B',
    description: 'Telemetry unavailable or corrupt; hazard state cannot be verified.',
  },
} as const;

/**
 * Default production configuration for the Deterministic Risk Engine.
 */
export const DEFAULT_RISK_ENGINE_CONFIG: RiskEngineConfig = {
  intensityProvisionalThresholdMmH: PROVISIONAL_INTENSITY_THRESHOLD_MM_H,
  accumulation24hThresholdMm: LANDSLIP_ACCUMULATION_24H_THRESHOLD_MM,
  elevationCorridorMinMsl: CORRIDOR_ELEVATION_MIN_MSL,
  elevationCorridorMaxMsl: CORRIDOR_ELEVATION_MAX_MSL,
  elevationPhysicalMinMsl: ELEVATION_PHYSICAL_MIN_MSL,
  elevationPhysicalMaxMsl: ELEVATION_PHYSICAL_MAX_MSL,
  telemetryStalenessLimitSeconds: TELEMETRY_STALENESS_LIMIT_SECONDS,
  baseWeights: DEFAULT_BASE_WEIGHTS,
};
