/**
 * ==============================================================================
 * DRISHTI-HIMALAYA - DETERMINISTIC RISK ENGINE
 * Pure mathematical, explainable, and configurable hazard evaluation foundation.
 * ==============================================================================
 */

import { EnvironmentalData } from '../environmental/types';
import {
  IRiskEngine,
  RiskAssessment,
  RiskFactor,
  RiskFactorId,
  RiskLevel,
  RiskEngineConfig,
} from './types';
import {
  DEFAULT_RISK_ENGINE_CONFIG,
  CONVECTIVE_WEATHER_MODIFIERS,
  RISK_TIER_CONFIG,
} from './riskConfig';
import { extractRiskFeatures } from './featureExtractor';

/**
 * Clamps a number between a minimum and maximum boundary.
 */
function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

/**
 * Rounds a number to a specified number of decimal places.
 */
function roundTo(val: number, decimals: number = 1): number {
  const factor = Math.pow(10, decimals);
  return Math.round(val * factor) / factor;
}

export class DeterministicRiskEngine implements IRiskEngine {
  public readonly id = 'drishti-deterministic-v1';
  public readonly name = 'Drishti-Himalaya Deterministic Risk Engine';
  public readonly type = 'deterministic' as const;

  /**
   * Evaluates environmental telemetry against deterministic hazard formulations.
   *
   * @param telemetry Real environmental data payload from Phase 3 services
   * @param config Optional configuration overrides
   * @param referenceNowMs Optional reference time in ms (for deterministic testing)
   */
  public evaluate(
    telemetry: EnvironmentalData | null,
    config?: Partial<RiskEngineConfig>,
    referenceNowMs?: number
  ): RiskAssessment {
    const effectiveConfig: RiskEngineConfig = {
      ...DEFAULT_RISK_ENGINE_CONFIG,
      ...config,
      baseWeights: {
        ...DEFAULT_RISK_ENGINE_CONFIG.baseWeights,
        ...config?.baseWeights,
      },
    };

    const evaluatedAt = new Date().toISOString();
    const features = extractRiskFeatures(telemetry, effectiveConfig, referenceNowMs);

    // If telemetry is completely insufficient or in error, return INDETERMINATE
    if (features.dataQuality.rating === 'INSUFFICIENT' || features.dataQuality.activeFactorsCount === 0) {
      return {
        score: null,
        level: 'INDETERMINATE',
        colorHex: RISK_TIER_CONFIG.INDETERMINATE.colorHex,
        primaryFactor: null,
        factors: this.buildInsufficientFactorsList(effectiveConfig),
        summaryExplanation:
          'Hazard level is indeterminate. Environmental telemetry stream is offline, corrupt, or insufficient.',
        dataQuality: features.dataQuality,
        evaluatedAt,
      };
    }

    // --- Factor 1: Acute Precipitation Intensity ---
    const precipWeight = effectiveConfig.baseWeights.precipitation_intensity;
    let precipFactor: RiskFactor;
    if (features.precipitationMmH.isAvailable && features.precipitationMmH.value !== null) {
      const val = features.precipitationMmH.value;
      const rawScore = (val / effectiveConfig.intensityProvisionalThresholdMmH) * 100.0;
      const score = clamp(roundTo(rawScore, 1), 0.0, 100.0);
      precipFactor = {
        id: 'precipitation_intensity',
        name: 'Precipitation Intensity',
        category: 'meteorological',
        status: 'active',
        score,
        rawWeight: precipWeight,
        normalizedWeight: 0, // Assigned during dynamic normalization
        weightedContribution: 0,
        rawValue: val,
        unit: 'mm/h',
        thresholdReference: `Provisional acute threshold: ${effectiveConfig.intensityProvisionalThresholdMmH} mm/h`,
        isProvisional: true,
        explanation: `Current precipitation rate of ${val.toFixed(1)} mm/h evaluated against provisional ${effectiveConfig.intensityProvisionalThresholdMmH} mm/h acute runoff threshold.`,
      };
    } else {
      precipFactor = {
        id: 'precipitation_intensity',
        name: 'Precipitation Intensity',
        category: 'meteorological',
        status: 'unavailable',
        score: null,
        rawWeight: precipWeight,
        normalizedWeight: 0,
        weightedContribution: null,
        rawValue: null,
        unit: 'mm/h',
        thresholdReference: `Provisional acute threshold: ${effectiveConfig.intensityProvisionalThresholdMmH} mm/h`,
        isProvisional: true,
        explanation: features.precipitationMmH.rejectionReason || 'Precipitation intensity telemetry is unavailable.',
      };
    }

    // --- Factor 2: 24h Rainfall Accumulation ---
    const accumWeight = effectiveConfig.baseWeights.rainfall_accumulation_24h;
    let accumFactor: RiskFactor;
    if (features.accumulation24hMm.isAvailable && features.accumulation24hMm.value !== null) {
      const val = features.accumulation24hMm.value;
      const rawScore = (val / effectiveConfig.accumulation24hThresholdMm) * 100.0;
      const score = clamp(roundTo(rawScore, 1), 0.0, 100.0);
      accumFactor = {
        id: 'rainfall_accumulation_24h',
        name: '24h Rainfall Accumulation',
        category: 'meteorological',
        status: 'active',
        score,
        rawWeight: accumWeight,
        normalizedWeight: 0,
        weightedContribution: 0,
        rawValue: val,
        unit: 'mm',
        thresholdReference: `LANDSLIP empirical saturation proxy threshold: ${effectiveConfig.accumulation24hThresholdMm} mm`,
        isProvisional: false,
        explanation: `24-hour rainfall accumulation of ${val.toFixed(1)} mm evaluated as antecedent proxy for potential saturation effects against LANDSLIP 75 mm threshold.`,
      };
    } else {
      accumFactor = {
        id: 'rainfall_accumulation_24h',
        name: '24h Rainfall Accumulation',
        category: 'meteorological',
        status: 'unavailable',
        score: null,
        rawWeight: accumWeight,
        normalizedWeight: 0,
        weightedContribution: null,
        rawValue: null,
        unit: 'mm',
        thresholdReference: `LANDSLIP empirical saturation proxy threshold: ${effectiveConfig.accumulation24hThresholdMm} mm`,
        isProvisional: false,
        explanation: features.accumulation24hMm.rejectionReason || '24h rainfall accumulation telemetry is unavailable.',
      };
    }

    // --- Factor 3: Precipitation Probability & Convective Weather ---
    const probWeight = effectiveConfig.baseWeights.precipitation_probability;
    let probFactor: RiskFactor;
    if (features.precipitationProbability.isAvailable && features.precipitationProbability.value !== null) {
      const val = features.precipitationProbability.value;
      const modifier = features.weatherCode ? CONVECTIVE_WEATHER_MODIFIERS[features.weatherCode] || 1.0 : 1.0;
      const rawScore = val * modifier;
      const score = clamp(roundTo(rawScore, 1), 0.0, 100.0);
      const modifierNote = modifier > 1.0 ? ` (amplified by convective weather code ${features.weatherCode})` : '';
      probFactor = {
        id: 'precipitation_probability',
        name: 'Precipitation Probability',
        category: 'meteorological',
        status: 'active',
        score,
        rawWeight: probWeight,
        normalizedWeight: 0,
        weightedContribution: 0,
        rawValue: val,
        unit: '%',
        thresholdReference: 'Forecast probability scaled by WMO convective modifiers',
        isProvisional: true,
        explanation: `Forecast precipitation probability of ${val}%${modifierNote}.`,
      };
    } else {
      probFactor = {
        id: 'precipitation_probability',
        name: 'Precipitation Probability',
        category: 'meteorological',
        status: 'unavailable',
        score: null,
        rawWeight: probWeight,
        normalizedWeight: 0,
        weightedContribution: null,
        rawValue: null,
        unit: '%',
        thresholdReference: 'Forecast probability scaled by WMO convective modifiers',
        isProvisional: true,
        explanation: features.precipitationProbability.rejectionReason || 'Precipitation probability telemetry is unavailable.',
      };
    }

    // --- Factor 4: Orographic Elevation Relief ---
    const elevWeight = effectiveConfig.baseWeights.orographic_elevation;
    let elevFactor: RiskFactor;
    if (features.elevationMsl.isAvailable && features.elevationMsl.value !== null) {
      const val = features.elevationMsl.value;
      const min = effectiveConfig.elevationCorridorMinMsl;
      const max = effectiveConfig.elevationCorridorMaxMsl;
      const rawScore = ((val - min) / (max - min)) * 100.0;
      const score = clamp(roundTo(rawScore, 1), 0.0, 100.0);
      elevFactor = {
        id: 'orographic_elevation',
        name: 'Orographic Elevation Relief',
        category: 'topographic',
        status: 'active',
        score,
        rawWeight: elevWeight,
        normalizedWeight: 0,
        weightedContribution: 0,
        rawValue: val,
        unit: 'm MSL',
        thresholdReference: `Corridor relief bounds: ${min} to ${max} m MSL`,
        isProvisional: true,
        explanation: `Corridor elevation of ${val.toLocaleString()} m MSL normalized across NH-7 relief bounds (${min}-${max} m MSL).`,
      };
    } else {
      elevFactor = {
        id: 'orographic_elevation',
        name: 'Orographic Elevation Relief',
        category: 'topographic',
        status: 'unavailable',
        score: null,
        rawWeight: elevWeight,
        normalizedWeight: 0,
        weightedContribution: null,
        rawValue: null,
        unit: 'm MSL',
        thresholdReference: `Corridor relief bounds: ${effectiveConfig.elevationCorridorMinMsl} to ${effectiveConfig.elevationCorridorMaxMsl} m MSL`,
        isProvisional: true,
        explanation: features.elevationMsl.rejectionReason || 'Elevation telemetry is corrupt or unavailable.',
      };
    }

    // --- Future Unassessed Factors (Explicitly Distinguishable) ---
    const slopeFactor: RiskFactor = {
      id: 'slope_instability',
      name: 'Topographic Slope Instability',
      category: 'geotechnical',
      status: 'unassessed_future_phase',
      score: null,
      rawWeight: 0.35, // Documented Phase 0 spec weight
      normalizedWeight: 0,
      weightedContribution: null,
      rawValue: null,
      unit: 'degrees',
      thresholdReference: 'Repose angle sigmoidal function (15° - 60°)',
      isProvisional: false,
      explanation: 'Geotechnical slope stability is unassessed pending DEM slope profiling in Phase 5.',
    };

    const scarFactor: RiskFactor = {
      id: 'scar_proximity',
      name: 'Historical Landslide Scar Proximity',
      category: 'geotechnical',
      status: 'unassessed_future_phase',
      score: null,
      rawWeight: 0.20, // Documented Phase 0 spec weight
      normalizedWeight: 0,
      weightedContribution: null,
      rawValue: null,
      unit: 'meters',
      thresholdReference: 'Exponential decay (d0 = 350m, NRSC Atlas)',
      isProvisional: false,
      explanation: 'Landslide scar proximity is unassessed pending NRSC database ingestion in Phase 7.',
    };

    const allCandidateFactors = [precipFactor, accumFactor, probFactor, elevFactor];
    const activeFactors = allCandidateFactors.filter((f) => f.status === 'active' && f.score !== null);

    // Sum active raw weights for dynamic normalization
    const activeRawWeightSum = activeFactors.reduce((sum, f) => sum + f.rawWeight, 0);

    if (activeRawWeightSum === 0 || activeFactors.length === 0) {
      return {
        score: null,
        level: 'INDETERMINATE',
        colorHex: RISK_TIER_CONFIG.INDETERMINATE.colorHex,
        primaryFactor: null,
        factors: [...allCandidateFactors, slopeFactor, scarFactor],
        summaryExplanation: 'No reliable active telemetry factors available to compute hazard score.',
        dataQuality: features.dataQuality,
        evaluatedAt,
      };
    }

    // Calculate dynamically normalized weights and weighted contributions
    let compositeScoreSum = 0;
    const normalizedActiveFactors = activeFactors.map((f) => {
      const normalizedWeight = roundTo(f.rawWeight / activeRawWeightSum, 4);
      const score = f.score as number;
      const weightedContribution = roundTo(normalizedWeight * score, 2);
      compositeScoreSum += normalizedWeight * score;
      return {
        ...f,
        normalizedWeight,
        weightedContribution,
      };
    });

    // Map updated factors back into full factors list
    const finalFactors: RiskFactor[] = [
      normalizedActiveFactors.find((f) => f.id === 'precipitation_intensity') || precipFactor,
      normalizedActiveFactors.find((f) => f.id === 'rainfall_accumulation_24h') || accumFactor,
      normalizedActiveFactors.find((f) => f.id === 'precipitation_probability') || probFactor,
      normalizedActiveFactors.find((f) => f.id === 'orographic_elevation') || elevFactor,
      slopeFactor,
      scarFactor,
    ];

    const finalScore = clamp(roundTo(compositeScoreSum, 1), 0.0, 100.0);

    // Determine risk level and color
    let level: RiskLevel;
    let colorHex: string;
    if (finalScore < RISK_TIER_CONFIG.MODERATE.minScore) {
      level = 'LOW';
      colorHex = RISK_TIER_CONFIG.LOW.colorHex;
    } else if (finalScore < RISK_TIER_CONFIG.HIGH.minScore) {
      level = 'MODERATE';
      colorHex = RISK_TIER_CONFIG.MODERATE.colorHex;
    } else if (finalScore < RISK_TIER_CONFIG.SEVERE.minScore) {
      level = 'HIGH';
      colorHex = RISK_TIER_CONFIG.HIGH.colorHex;
    } else {
      level = 'SEVERE';
      colorHex = RISK_TIER_CONFIG.SEVERE.colorHex;
    }

    // Determine primary contributing factor (highest weightedContribution)
    const sortedActive = [...normalizedActiveFactors].sort(
      (a, b) => (b.weightedContribution || 0) - (a.weightedContribution || 0)
    );
    const primaryFactor = sortedActive.length > 0 ? sortedActive[0] : null;

    // Generate judicial-grade deterministic explanation
    const summaryExplanation = this.generateSummaryExplanation(
      finalScore,
      level,
      primaryFactor,
      features.dataQuality.activeFactorsCount,
      features.dataQuality.unavailableFactorsCount
    );

    return {
      score: finalScore,
      level,
      colorHex,
      primaryFactor,
      factors: finalFactors,
      summaryExplanation,
      dataQuality: features.dataQuality,
      evaluatedAt,
    };
  }

  /**
   * Generates a deterministic, factual natural-language justification.
   */
  private generateSummaryExplanation(
    score: number,
    level: RiskLevel,
    primary: RiskFactor | null,
    activeCount: number,
    unavailableCount: number
  ): string {
    const tierDesc = RISK_TIER_CONFIG[level]?.description || '';
    let driverText = '';

    if (primary && primary.weightedContribution !== null && primary.weightedContribution > 0) {
      driverText = ` Primary contributing factor is ${primary.name} (${primary.score}/100, contributing +${primary.weightedContribution.toFixed(1)} pts).`;
    } else {
      driverText = ' Hydro-meteorological and terrain variables reflect baseline calm conditions.';
    }

    const coverageText =
      unavailableCount > 0
        ? ` Evaluated across ${activeCount} active factor(s) with dynamic weight normalization (${unavailableCount} unavailable).`
        : ` Evaluated across all ${activeCount} active hydro-meteorological and hypsometric factors.`;

    const caveatText = ' Static geotechnical slope stability and historical scars are unassessed.';

    return `${level} hazard exposure (Score: ${score.toFixed(1)}/100). ${tierDesc}${driverText}${coverageText}${caveatText}`;
  }

  /**
   * Builds the factors list for scenarios with insufficient telemetry.
   */
  private buildInsufficientFactorsList(config: RiskEngineConfig): RiskFactor[] {
    const emptyFactor = (
      id: RiskFactorId,
      name: string,
      category: RiskFactor['category'],
      rawWeight: number,
      unit: string,
      threshold: string,
      isProvisional: boolean
    ): RiskFactor => ({
      id,
      name,
      category,
      status: 'unavailable',
      score: null,
      rawWeight,
      normalizedWeight: 0,
      weightedContribution: null,
      rawValue: null,
      unit,
      thresholdReference: threshold,
      isProvisional,
      explanation: 'Telemetry unavailable.',
    });

    return [
      emptyFactor('precipitation_intensity', 'Precipitation Intensity', 'meteorological', config.baseWeights.precipitation_intensity, 'mm/h', `Provisional: ${config.intensityProvisionalThresholdMmH} mm/h`, true),
      emptyFactor('rainfall_accumulation_24h', '24h Rainfall Accumulation', 'meteorological', config.baseWeights.rainfall_accumulation_24h, 'mm', `LANDSLIP: ${config.accumulation24hThresholdMm} mm`, false),
      emptyFactor('precipitation_probability', 'Precipitation Probability', 'meteorological', config.baseWeights.precipitation_probability, '%', 'WMO convective modifiers', true),
      emptyFactor('orographic_elevation', 'Orographic Elevation Relief', 'topographic', config.baseWeights.orographic_elevation, 'm MSL', `Relief: ${config.elevationCorridorMinMsl}-${config.elevationCorridorMaxMsl} m MSL`, true),
      {
        id: 'slope_instability',
        name: 'Topographic Slope Instability',
        category: 'geotechnical',
        status: 'unassessed_future_phase',
        score: null,
        rawWeight: 0.35,
        normalizedWeight: 0,
        weightedContribution: null,
        rawValue: null,
        unit: 'degrees',
        thresholdReference: 'Repose angle sigmoidal function (15° - 60°)',
        isProvisional: false,
        explanation: 'Geotechnical slope stability is unassessed pending Phase 5.',
      },
      {
        id: 'scar_proximity',
        name: 'Historical Landslide Scar Proximity',
        category: 'geotechnical',
        status: 'unassessed_future_phase',
        score: null,
        rawWeight: 0.20,
        normalizedWeight: 0,
        weightedContribution: null,
        rawValue: null,
        unit: 'meters',
        thresholdReference: 'Exponential decay (d0 = 350m, NRSC Atlas)',
        isProvisional: false,
        explanation: 'Landslide scar proximity is unassessed pending Phase 7.',
      },
    ];
  }
}

/**
 * Singleton instance of the default Deterministic Risk Engine.
 */
export const deterministicRiskEngine = new DeterministicRiskEngine();
