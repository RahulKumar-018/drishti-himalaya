/**
 * ==============================================================================
 * DRISHTI-HIMALAYA - DETERMINISTIC RISK ENGINE TEST SUITE
 * Validates deterministic calculations, boundaries, telemetry sanitization,
 * dynamic normalization, and explainability across all 12 required scenarios.
 * ==============================================================================
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { EnvironmentalData } from '../../environmental/types';
import { DeterministicRiskEngine, deterministicRiskEngine } from '../deterministicRiskEngine';
import { extractRiskFeatures } from '../featureExtractor';
import { DEFAULT_RISK_ENGINE_CONFIG } from '../riskConfig';

/**
 * Helper to construct synthetic EnvironmentalData payloads for testing.
 */
function createMockTelemetry(overrides: {
  status?: EnvironmentalData['status'];
  error?: string | null;
  precipitation?: number | null;
  dailyPrecipitationSum?: number | null;
  precipitationProbability?: number | null;
  weatherCode?: number | null;
  elevation?: number | null;
  slopeDegrees?: number | null;
  fetchedAt?: string;
}): EnvironmentalData {
  const fetchedAt = overrides.fetchedAt || new Date().toISOString();
  return {
    location: {
      latitude: 30.32,
      longitude: 78.92,
      name: 'NH-7 Corridor Test Point',
    },
    status: overrides.status !== undefined ? overrides.status : 'success',
    error: overrides.error !== undefined ? overrides.error : null,
    rainfall:
      overrides.precipitation !== undefined ||
      overrides.dailyPrecipitationSum !== undefined ||
      overrides.precipitationProbability !== undefined ||
      overrides.weatherCode !== undefined
        ? {
            latitude: 30.32,
            longitude: 78.92,
            timestamp: fetchedAt,
            precipitation: overrides.precipitation !== undefined ? overrides.precipitation : 0.0,
            precipitationUnit: 'mm',
            rain: overrides.precipitation !== undefined ? overrides.precipitation : 0.0,
            showers: 0.0,
            precipitationProbability:
              overrides.precipitationProbability !== undefined ? overrides.precipitationProbability : 0,
            weatherCode: overrides.weatherCode !== undefined ? overrides.weatherCode : 0,
            weatherDescription: 'Test condition',
            dailyPrecipitationSum:
              overrides.dailyPrecipitationSum !== undefined ? overrides.dailyPrecipitationSum : 0.0,
            source: 'Test Provider',
            fetchedAt,
          }
        : null,
    terrain:
      overrides.elevation !== undefined || overrides.slopeDegrees !== undefined
        ? {
            elevation: {
              latitude: 30.32,
              longitude: 78.92,
              elevation: overrides.elevation !== undefined ? overrides.elevation : 500,
              elevationUnit: 'm',
              source: 'Test DEM Provider',
              fetchedAt,
            },
            slopeDegrees: overrides.slopeDegrees !== undefined ? overrides.slopeDegrees : 2.5,
          }
        : null,
    metadata: {
      fetchedAt,
      sources: ['Test Provider'],
    },
  };
}

describe('DeterministicRiskEngine - 12 Scenario Verification', () => {
  const engine = new DeterministicRiskEngine();

  // --- Scenario 1: Clear Weather (Baseline Low Risk) ---
  it('1. should evaluate clear weather in foothills as LOW risk', () => {
    const telemetry = createMockTelemetry({
      precipitation: 0.0,
      dailyPrecipitationSum: 0.0,
      precipitationProbability: 5,
      weatherCode: 0, // Clear sky
      elevation: 340, // Rishikesh foothills (~340m MSL)
    });

    const assessment = engine.evaluate(telemetry);

    assert.equal(assessment.level, 'LOW');
    assert.ok(assessment.score !== null && assessment.score < 10.0, `Expected score < 10, got ${assessment.score}`);
    assert.equal(assessment.colorHex, '#10B981');
    assert.equal(assessment.dataQuality.rating, 'HIGH');
    assert.ok(assessment.summaryExplanation.includes('LOW hazard exposure'));
  });

  // --- Scenario 2: Severe Rainfall Event ---
  it('2. should evaluate heavy precipitation and accumulation as SEVERE risk', () => {
    const telemetry = createMockTelemetry({
      precipitation: 35.0, // Exceeds 25 mm/h provisional intensity threshold
      dailyPrecipitationSum: 95.0, // Exceeds 75 mm LANDSLIP accumulation threshold
      precipitationProbability: 90,
      weatherCode: 95, // Thunderstorm (convective modifier 1.25)
      elevation: 1890, // Joshimath high-relief gorge
    });

    const assessment = engine.evaluate(telemetry);

    assert.equal(assessment.level, 'SEVERE');
    assert.ok(assessment.score !== null && assessment.score >= 75.0, `Expected score >= 75, got ${assessment.score}`);
    assert.equal(assessment.colorHex, '#EF4444');
    assert.ok(assessment.primaryFactor !== null);
    assert.ok(
      assessment.primaryFactor.id === 'precipitation_intensity' ||
      assessment.primaryFactor.id === 'rainfall_accumulation_24h'
    );
    assert.ok(assessment.summaryExplanation.includes('SEVERE hazard exposure'));
  });

  // --- Scenario 3: Moderate Monsoon ---
  it('3. should evaluate moderate precipitation as MODERATE risk', () => {
    const telemetry = createMockTelemetry({
      precipitation: 6.0, // Moderate rain (24% of 25mm/h)
      dailyPrecipitationSum: 28.0, // ~37% of LANDSLIP 75mm threshold
      precipitationProbability: 60,
      weatherCode: 61, // Slight rain
      elevation: 890, // Rudraprayag canyon confluence
    });

    const assessment = engine.evaluate(telemetry);

    assert.equal(assessment.level, 'MODERATE');
    assert.ok(
      assessment.score !== null && assessment.score >= 25.0 && assessment.score < 50.0,
      `Expected score between 25 and 50, got ${assessment.score}`
    );
    assert.equal(assessment.colorHex, '#EAB308');
  });

  // --- Scenario 4: Rainfall Unavailable (Partial Telemetry) ---
  it('4. should handle unavailable rainfall via dynamic weight normalization without throwing', () => {
    const telemetry = createMockTelemetry({
      // No rainfall block
      elevation: 1400,
      slopeDegrees: null,
    });

    const assessment = engine.evaluate(telemetry);

    assert.ok(assessment.score !== null);
    assert.equal(assessment.dataQuality.rating, 'DEGRADED');
    assert.equal(assessment.dataQuality.activeFactorsCount, 1);
    assert.equal(assessment.dataQuality.unavailableFactorsCount, 4);
    const elevFactor = assessment.factors.find((f) => f.id === 'orographic_elevation');
    assert.ok(elevFactor);
    assert.equal(elevFactor.normalizedWeight, 1.0); // Dynamically scaled to 100% of active weights
    assert.equal(elevFactor.status, 'active');
  });

  // --- Scenario 5: Completely Offline / Null Telemetry ---
  it('5. should return INDETERMINATE with null score when telemetry is offline or in error', () => {
    const errorTelemetry = createMockTelemetry({
      status: 'error',
      error: 'Network connection failure to weather station',
    });

    const assessment1 = engine.evaluate(errorTelemetry);
    assert.equal(assessment1.level, 'INDETERMINATE');
    assert.equal(assessment1.score, null);
    assert.equal(assessment1.primaryFactor, null);
    assert.equal(assessment1.colorHex, '#64748B');
    assert.equal(assessment1.dataQuality.rating, 'INSUFFICIENT');

    const nullAssessment = engine.evaluate(null);
    assert.equal(nullAssessment.level, 'INDETERMINATE');
    assert.equal(nullAssessment.score, null);
  });

  // --- Scenario 6: Invalid Negative Rainfall ---
  it('6. should reject negative rainfall values as corrupt and not crash', () => {
    const telemetry = createMockTelemetry({
      precipitation: -12.5, // Corrupt negative sensor reading
      dailyPrecipitationSum: -5.0,
      precipitationProbability: 20,
      elevation: 600,
    });

    const assessment = engine.evaluate(telemetry);

    // Negative metrics should be marked unavailable
    const precipFactor = assessment.factors.find((f) => f.id === 'precipitation_intensity');
    const accumFactor = assessment.factors.find((f) => f.id === 'rainfall_accumulation_24h');

    assert.equal(precipFactor?.status, 'unavailable');
    assert.equal(precipFactor?.score, null);
    assert.equal(accumFactor?.status, 'unavailable');
    assert.equal(accumFactor?.score, null);
    assert.ok(assessment.dataQuality.caveats.some((c) => c.includes('Negative precipitation value rejected')));
  });

  // --- Scenario 7: Invalid Elevation Handling ---
  it('7. should mark invalid elevation (<0, >9000, NaN) as unavailable and NEVER convert to max risk', () => {
    const corruptBelowZero = createMockTelemetry({
      precipitation: 5.0,
      dailyPrecipitationSum: 10.0,
      precipitationProbability: 30,
      elevation: -250, // Impossible terrestrial elevation in Himalayas
    });

    const featuresBelow = extractRiskFeatures(corruptBelowZero);
    assert.equal(featuresBelow.elevationMsl.isAvailable, false);

    const assessmentBelow = engine.evaluate(corruptBelowZero);
    const elevFactorBelow = assessmentBelow.factors.find((f) => f.id === 'orographic_elevation');
    assert.equal(elevFactorBelow?.status, 'unavailable');
    assert.equal(elevFactorBelow?.score, null);
    assert.notEqual(assessmentBelow.level, 'SEVERE'); // MUST NOT be artificially driven to SEVERE

    const corruptExceedsEverest = createMockTelemetry({
      precipitation: 0.0,
      dailyPrecipitationSum: 0.0,
      precipitationProbability: 0,
      elevation: 12000, // Higher than Everest
    });

    const assessmentAbove = engine.evaluate(corruptExceedsEverest);
    const elevFactorAbove = assessmentAbove.factors.find((f) => f.id === 'orographic_elevation');
    assert.equal(elevFactorAbove?.status, 'unavailable');
    assert.equal(elevFactorAbove?.score, null);
    // Baseline risk with 0 rain should remain LOW, not maxed out
    assert.equal(assessmentAbove.level, 'LOW');
  });

  // --- Scenario 8: Boundary Thresholds ---
  it('8. should accurately compute scores at exact boundary limits', () => {
    // Exact intensity threshold (25.0 mm/h) -> intensity score should be exactly 100
    const intensityBoundary = createMockTelemetry({
      precipitation: 25.0,
      dailyPrecipitationSum: 0.0,
      precipitationProbability: 0,
      elevation: 300, // Exact corridor min (300m) -> elevation score should be 0.0
    });

    const assessment1 = engine.evaluate(intensityBoundary);
    const precipFactor = assessment1.factors.find((f) => f.id === 'precipitation_intensity');
    const elevFactor = assessment1.factors.find((f) => f.id === 'orographic_elevation');

    assert.equal(precipFactor?.score, 100.0);
    assert.equal(elevFactor?.score, 0.0);

    // Exact accumulation threshold (75.0 mm) -> accumulation score should be exactly 100
    const accumBoundary = createMockTelemetry({
      precipitation: 0.0,
      dailyPrecipitationSum: 75.0,
      precipitationProbability: 0,
      elevation: 2200, // Exact corridor max (2200m) -> elevation score should be 100.0
    });

    const assessment2 = engine.evaluate(accumBoundary);
    const accumFactor = assessment2.factors.find((f) => f.id === 'rainfall_accumulation_24h');
    const elevFactorMax = assessment2.factors.find((f) => f.id === 'orographic_elevation');

    assert.equal(accumFactor?.score, 100.0);
    assert.equal(elevFactorMax?.score, 100.0);
  });

  // --- Scenario 9: Stale Telemetry ---
  it('9. should detect stale telemetry (> 3 hours old) and attach staleness caveat', () => {
    const referenceNowMs = 1700000000000;
    const fourHoursAgoIso = new Date(referenceNowMs - 4 * 3600 * 1000).toISOString();

    const staleTelemetry = createMockTelemetry({
      precipitation: 5.0,
      dailyPrecipitationSum: 15.0,
      precipitationProbability: 25,
      elevation: 750,
      fetchedAt: fourHoursAgoIso,
    });

    const assessment = engine.evaluate(staleTelemetry, undefined, referenceNowMs);

    assert.equal(assessment.dataQuality.isStale, true);
    assert.ok(assessment.dataQuality.telemetryFreshnessSeconds !== null);
    assert.ok(assessment.dataQuality.telemetryFreshnessSeconds > DEFAULT_RISK_ENGINE_CONFIG.telemetryStalenessLimitSeconds);
    assert.ok(assessment.dataQuality.caveats.some((c) => c.includes('hours old; exceeds')));
  });

  // --- Scenario 10: Deterministic Repeated Evaluation ---
  it('10. should produce bit-for-bit identical results on repeated runs for identical inputs', () => {
    const telemetry = createMockTelemetry({
      precipitation: 14.8,
      dailyPrecipitationSum: 42.6,
      precipitationProbability: 65,
      weatherCode: 81,
      elevation: 1150,
      fetchedAt: '2026-10-01T12:00:00.000Z',
    });

    const run1 = engine.evaluate(telemetry, undefined, 1700000000000);
    const run2 = deterministicRiskEngine.evaluate(telemetry, undefined, 1700000000000);
    const run3 = engine.evaluate(telemetry, undefined, 1700000000000);

    assert.equal(run1.score, run2.score);
    assert.equal(run2.score, run3.score);
    assert.equal(run1.level, run2.level);
    assert.equal(run1.summaryExplanation, run2.summaryExplanation);
    assert.deepEqual(run1.factors, run2.factors);
  });

  // --- Scenario 11: Dynamic Weight Normalization ---
  it('11. should ensure normalized weights of active factors strictly sum to 1.0', () => {
    // Telemetry with 3 out of 4 active factors (probability missing)
    const telemetry = createMockTelemetry({
      precipitation: 10.0,
      dailyPrecipitationSum: 30.0,
      // precipitationProbability omitted / null
      elevation: 1000,
    });

    const assessment = engine.evaluate(telemetry);
    const activeFactors = assessment.factors.filter((f) => f.status === 'active');

    const weightSum = activeFactors.reduce((sum, f) => sum + f.normalizedWeight, 0);
    assert.ok(Math.abs(weightSum - 1.0) < 0.001, `Active normalized weights sum to ${weightSum}, expected 1.0`);

    // Verify each active factor's contribution is normalizedWeight * score
    for (const f of activeFactors) {
      const expectedContrib = Math.round((f.normalizedWeight * (f.score as number)) * 100) / 100;
      assert.equal(f.weightedContribution, expectedContrib);
    }
  });

  // --- Scenario 12: Future/Unassessed Factors Appear as Caveats ---
  it('12. should clearly list slope and scar factors as unassessed_future_phase with explicit caveats', () => {
    const telemetry = createMockTelemetry({
      precipitation: 2.0,
      dailyPrecipitationSum: 5.0,
      precipitationProbability: 10,
      elevation: 500,
    });

    const assessment = engine.evaluate(telemetry);

    const slopeFactor = assessment.factors.find((f) => f.id === 'slope_instability');
    const scarFactor = assessment.factors.find((f) => f.id === 'scar_proximity');

    assert.ok(slopeFactor);
    assert.equal(slopeFactor.status, 'unassessed_future_phase');
    assert.equal(slopeFactor.score, null);
    assert.equal(slopeFactor.normalizedWeight, 0);

    assert.ok(scarFactor);
    assert.equal(scarFactor.status, 'unassessed_future_phase');
    assert.equal(scarFactor.score, null);
    assert.equal(scarFactor.normalizedWeight, 0);

    assert.ok(assessment.dataQuality.caveats.some((c) => c.includes('slope stability and historical landslide scars are unassessed')));
    assert.ok(assessment.summaryExplanation.includes('Static geotechnical slope stability and historical scars are unassessed'));
  });
});
