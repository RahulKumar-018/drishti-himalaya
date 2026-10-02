/**
 * ==============================================================================
 * DRISHTI-HIMALAYA - TERRAIN RISK INTEGRATION UNIT TESTS
 * Validates 5-factor risk scoring, slope exposure normalization, and 4-factor fallback.
 * ==============================================================================
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  deterministicRiskEngine,
  calculateTerrainGradientScore,
} from '../deterministicRiskEngine';
import { EnvironmentalData } from '../../environmental/types';

describe('TerrainRiskIntegration - Slope Exposure Transfer Function', () => {
  it('1. should evaluate non-positive gradients as 0.0 exposure', () => {
    assert.equal(calculateTerrainGradientScore(-5.0), 0.0);
    assert.equal(calculateTerrainGradientScore(0.0), 0.0);
    assert.equal(calculateTerrainGradientScore(NaN), 0.0);
  });

  it('2. should evaluate exact piecewise boundaries correctly and continuously', () => {
    // 0° -> 0
    assert.equal(calculateTerrainGradientScore(0.0), 0.0);
    // 3.0° -> exactly 20.0 (ruling mountain grade limit)
    assert.equal(calculateTerrainGradientScore(3.0), 20.0);
    // 8.0° -> exactly 55.0 (limiting/exceptional grade limit)
    assert.equal(calculateTerrainGradientScore(8.0), 55.0);
    // 15.0° -> exactly 85.0 (steep hairpin/switchback alignment)
    assert.equal(calculateTerrainGradientScore(15.0), 85.0);
    // 25.0°+ -> clamped at 100.0
    assert.equal(calculateTerrainGradientScore(25.0), 100.0);
    assert.equal(calculateTerrainGradientScore(45.0), 100.0);
  });

  it('3. should verify strict monotonicity across gradient spectrum (0° to 30°)', () => {
    let prevScore = -1;
    for (let deg = 0; deg <= 30; deg += 0.5) {
      const score = calculateTerrainGradientScore(deg);
      assert.ok(
        score >= prevScore,
        `Monotonicity violated at ${deg}°: current ${score} < prev ${prevScore}`
      );
      prevScore = score;
    }
  });
});

describe('TerrainRiskIntegration - 5-Factor Risk Scoring & Normalization', () => {
  const baseMockTelemetry: EnvironmentalData = {
    location: { latitude: 30.32, longitude: 78.92, name: 'NH-7 Corridor Center' },
    rainfall: {
      latitude: 30.32,
      longitude: 78.92,
      timestamp: '2026-10-01T12:00:00Z',
      precipitation: 5.0, // 5 mm/h
      precipitationUnit: 'mm/h',
      rain: 5.0,
      showers: 0,
      precipitationProbability: 40,
      weatherCode: 61,
      weatherDescription: 'Slight rain',
      dailyPrecipitationSum: 20.0, // 20 mm in 24h
      source: 'Open-Meteo',
      fetchedAt: new Date().toISOString(),
    },
    terrain: {
      elevation: {
        latitude: 30.32,
        longitude: 78.92,
        elevation: 1200,
        elevationUnit: 'm',
        source: 'Open-Meteo Elevation API (Copernicus DEM 90m)',
        fetchedAt: new Date().toISOString(),
      },
      routeProfile: {
        totalDistance: 155000,
        minElevation: 350,
        maxElevation: 1890,
        elevationGain: 1800,
        elevationLoss: 260,
        meanGradientPercent: 10.8,
        meanGradientDegrees: 6.2,
        peakGradientPercent: 25.8,
        peakGradientDegrees: 14.5,
        peakGradientSegmentIndex: 0,
        sampleCount: 320,
        totalDistanceM: 155000,
        minElevationMsl: 350,
        maxElevationMsl: 1890,
        elevationGainM: 1800,
        elevationLossM: 260,
        meanRouteGradientDegrees: 6.2, // ~10.8% grade
        meanRouteGradientPercent: 10.8,
        peakRouteGradientDegrees: 14.5,
        peakRouteGradientPercent: 25.8,
        segments: [],
      },
      slopeDegrees: 6.2,
      aspect: null,
      terrainRuggednessIndex: null,
    },
    status: 'success',
    error: null,
    metadata: {
      fetchedAt: new Date().toISOString(),
      sources: ['Open-Meteo Weather API', 'Open-Meteo Elevation API (Copernicus DEM 90m)'],
    },
  };

  it('4. should evaluate all 5 factors as ACTIVE when terrain route profile is present', () => {
    const assessment = deterministicRiskEngine.evaluate(baseMockTelemetry);

    assert.ok(assessment.score !== null);
    assert.notEqual(assessment.level, 'INDETERMINATE');

    const terrainFactor = assessment.factors.find((f) => f.id === 'terrain_slope_gradient');
    assert.ok(terrainFactor, 'terrain_slope_gradient factor must exist');
    assert.equal(terrainFactor?.status, 'active');
    assert.equal(terrainFactor?.name, 'Terrain Slope Gradient');
    assert.equal(terrainFactor?.category, 'topographic');
    assert.equal(terrainFactor?.rawValue, 6.2);
    assert.ok(terrainFactor?.score !== null && terrainFactor.score > 0);
    assert.ok(terrainFactor?.normalizedWeight !== null && terrainFactor.normalizedWeight > 0);
    assert.ok(terrainFactor?.weightedContribution !== null && terrainFactor.weightedContribution > 0);
    assert.equal(terrainFactor?.isProvisional, true);
    assert.ok(terrainFactor?.explanation.includes('corridor alignment gradient'));
    assert.ok(terrainFactor?.thresholdReference.includes('Provisional corridor alignment gradient normalization'));

    // Verify caveat distinguishes control chords from road alignment
    assert.ok(
      assessment.dataQuality.caveats.some((c) =>
        c.includes('control-point chords') || c.includes('not physical road gradient')
      )
    );

    // Historical scar proximity remains unassessed (Phase 7)
    const scarFactor = assessment.factors.find((f) => f.id === 'scar_proximity');
    assert.ok(scarFactor);
    assert.equal(scarFactor?.status, 'unassessed_future_phase');

    // Data quality check: 5 active factors, 2 future unassessed (slope_instability + scar_proximity)
    assert.equal(assessment.dataQuality.activeFactorsCount, 5);
    assert.equal(assessment.dataQuality.unavailableFactorsCount, 0);
    assert.equal(assessment.dataQuality.futureUnassessedFactorsCount, 2);
    assert.equal(assessment.dataQuality.rating, 'HIGH');
  });

  it('5. should ensure active normalized weights across all 5 factors strictly sum to 1.0', () => {
    const assessment = deterministicRiskEngine.evaluate(baseMockTelemetry);
    const activeFactors = assessment.factors.filter((f) => f.status === 'active');

    assert.equal(activeFactors.length, 5);

    const weightSum = activeFactors.reduce((sum, f) => sum + f.normalizedWeight, 0);
    assert.ok(
      Math.abs(weightSum - 1.0) < 0.001,
      `Normalized active weights sum was ${weightSum}, expected 1.000`
    );
  });

  it('6. should fall back to 4 active factors when terrain profile is unavailable', () => {
    const telemetryWithoutTerrainProfile: EnvironmentalData = {
      ...baseMockTelemetry,
      terrain: {
        elevation: baseMockTelemetry.terrain!.elevation,
        routeProfile: null, // Profile unavailable
        slopeDegrees: null,
      },
    };

    const assessment = deterministicRiskEngine.evaluate(telemetryWithoutTerrainProfile);

    assert.ok(assessment.score !== null);
    const terrainFactor = assessment.factors.find((f) => f.id === 'terrain_slope_gradient');
    assert.ok(terrainFactor);
    assert.equal(terrainFactor?.status, 'unavailable');
    assert.equal(terrainFactor?.score, null);
    assert.equal(terrainFactor?.weightedContribution, null);

    // 4 active factors
    const activeFactors = assessment.factors.filter((f) => f.status === 'active');
    assert.equal(activeFactors.length, 4);

    // Sum of 4 normalized weights must still strictly equal 1.0
    const weightSum = activeFactors.reduce((sum, f) => sum + f.normalizedWeight, 0);
    assert.ok(
      Math.abs(weightSum - 1.0) < 0.001,
      `Normalized active weights sum without terrain was ${weightSum}, expected 1.000`
    );

    assert.equal(assessment.dataQuality.activeFactorsCount, 4);
    assert.equal(assessment.dataQuality.unavailableFactorsCount, 1);
    assert.equal(assessment.dataQuality.rating, 'MODERATE');
  });

  it('7. should produce bit-for-bit identical results on repeated evaluation runs', () => {
    const eval1 = deterministicRiskEngine.evaluate(baseMockTelemetry, undefined, 1727784000000);
    const eval2 = deterministicRiskEngine.evaluate(baseMockTelemetry, undefined, 1727784000000);

    assert.equal(eval1.score, eval2.score);
    assert.equal(eval1.level, eval2.level);
    assert.equal(eval1.primaryFactor?.id, eval2.primaryFactor?.id);
    assert.equal(eval1.summaryExplanation, eval2.summaryExplanation);

    for (let i = 0; i < eval1.factors.length; i++) {
      assert.equal(eval1.factors[i].score, eval2.factors[i].score);
      assert.equal(eval1.factors[i].normalizedWeight, eval2.factors[i].normalizedWeight);
      assert.equal(eval1.factors[i].weightedContribution, eval2.factors[i].weightedContribution);
    }
  });

  it('8. should cleanly reject negative or implausible gradient telemetry (>90°)', () => {
    const telemetryWithCorruptGradient: EnvironmentalData = {
      ...baseMockTelemetry,
      terrain: {
        elevation: baseMockTelemetry.terrain!.elevation,
        routeProfile: {
          ...baseMockTelemetry.terrain!.routeProfile!,
          meanRouteGradientDegrees: -12.5, // Negative -> corrupt
        },
        slopeDegrees: -12.5,
      },
    };

    const assessment = deterministicRiskEngine.evaluate(telemetryWithCorruptGradient);

    const terrainFactor = assessment.factors.find((f) => f.id === 'terrain_slope_gradient');
    assert.equal(terrainFactor?.status, 'unavailable');
    assert.equal(terrainFactor?.score, null);
    assert.ok(terrainFactor?.explanation.includes('outside plausible'));
  });
});
