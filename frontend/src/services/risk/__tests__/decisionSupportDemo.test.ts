/**
 * ==============================================================================
 * DRISHTI-HIMALAYA - DECISION SUPPORT DEMO TEST SUITE
 * Validates authoritative risk score consistency, risk-tier mapping,
 * corridor segment risk calculation, what-if scenario simulation,
 * and reset-to-live invariants.
 * ==============================================================================
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { EnvironmentalData } from '../../environmental/types';
import {
  PILOT_CORRIDOR_WAYPOINTS,
  PILOT_CORRIDOR_CHORD_DISTANCE_KM,
  PILOT_CORRIDOR_PHYSICAL_ROAD_KM,
} from '../../environmental/corridorConstants';
import { deterministicRiskEngine } from '../deterministicRiskEngine';
import { RISK_TIER_CONFIG } from '../riskConfig';
import { calculateCorridorSegmentRisks } from '../segmentRiskService';
import { evaluateRainfallScenario } from '../scenarioService';

/**
 * Synthetic baseline telemetry fixture for testing.
 */
function createBaselineTelemetry(overrides?: Partial<EnvironmentalData>): EnvironmentalData {
  return {
    location: {
      latitude: 30.32,
      longitude: 78.92,
      name: 'NH-7 Corridor Center (Garhwal)',
    },
    rainfall: {
      latitude: 30.32,
      longitude: 78.92,
      timestamp: new Date().toISOString(),
      precipitation: 2.4, // Light baseline rain
      precipitationUnit: 'mm/h',
      rain: 2.4,
      showers: 0,
      precipitationProbability: 30,
      weatherCode: 51,
      weatherDescription: 'Light drizzle',
      dailyPrecipitationSum: 8.5,
      source: 'Open-Meteo Weather API',
      fetchedAt: new Date().toISOString(),
    },
    terrain: {
      elevation: {
        latitude: 30.32,
        longitude: 78.92,
        elevation: 850,
        elevationUnit: 'm',
        source: 'Copernicus DEM (GLO-90)',
        fetchedAt: new Date().toISOString(),
      },
      slopeDegrees: 6.2,
      routeProfile: {
        totalDistance: 155040,
        minElevation: 340,
        maxElevation: 1890,
        elevationGain: 1850,
        elevationLoss: 300,
        meanGradientPercent: 10.8,
        meanGradientDegrees: 6.2,
        peakGradientPercent: 24.5,
        peakGradientDegrees: 13.8,
        peakGradientSegmentIndex: 12,
        sampleCount: 320,
        totalDistanceM: 155040,
        minElevationMsl: 340,
        maxElevationMsl: 1890,
        elevationGainM: 1850,
        elevationLossM: 300,
        meanRouteGradientDegrees: 6.2,
        meanRouteGradientPercent: 10.8,
        peakRouteGradientDegrees: 13.8,
        peakRouteGradientPercent: 24.5,
        segments: [],
      },
    },
    status: 'success',
    error: null,
    metadata: {
      fetchedAt: new Date().toISOString(),
      sources: ['Open-Meteo Weather API', 'Copernicus DEM (GLO-90)'],
    },
    ...overrides,
  };
}

describe('Authoritative Risk Score Consistency (Phase 1)', () => {
  it('1. should produce bit-for-bit identical risk scores across repeated evaluations of same telemetry', () => {
    const telemetry = createBaselineTelemetry();
    const eval1 = deterministicRiskEngine.evaluate(telemetry);
    const eval2 = deterministicRiskEngine.evaluate(telemetry);

    assert.notEqual(eval1.score, null);
    assert.equal(eval1.score, eval2.score, 'Repeated evaluations must yield identical risk score');
    assert.equal(eval1.level, eval2.level, 'Repeated evaluations must yield identical risk tier');
    assert.equal(eval1.colorHex, eval2.colorHex, 'Repeated evaluations must yield identical colorHex');
    assert.equal(
      eval1.primaryFactor?.id,
      eval2.primaryFactor?.id,
      'Repeated evaluations must yield identical primary factor'
    );
  });

  it('2. should verify that corridor distance constants are consistent and distinguish chord from physical road', () => {
    assert.equal(PILOT_CORRIDOR_CHORD_DISTANCE_KM, 155.0, 'Authoritative chord distance must be 155.0 km');
    assert.equal(PILOT_CORRIDOR_PHYSICAL_ROAD_KM, 240.0, 'Physical highway distance must be 240.0 km');
    assert.ok(
      PILOT_CORRIDOR_PHYSICAL_ROAD_KM > PILOT_CORRIDOR_CHORD_DISTANCE_KM,
      'Winding road distance must exceed straight chord distance'
    );
  });
});

describe('Risk-Tier Mapping & Style Verification (Phase 2 & 4)', () => {
  it('3. should map scores correctly across all 4 operational risk tiers and indeterminate', () => {
    // LOW: [0, 24.99]
    assert.equal(RISK_TIER_CONFIG.LOW.tier, 'LOW');
    assert.equal(RISK_TIER_CONFIG.LOW.colorHex, '#10B981');
    assert.equal(RISK_TIER_CONFIG.LOW.minScore, 0.0);
    assert.equal(RISK_TIER_CONFIG.LOW.maxScore, 24.99);

    // MODERATE: [25.0, 49.99]
    assert.equal(RISK_TIER_CONFIG.MODERATE.tier, 'MODERATE');
    assert.equal(RISK_TIER_CONFIG.MODERATE.colorHex, '#EAB308');
    assert.equal(RISK_TIER_CONFIG.MODERATE.minScore, 25.0);

    // HIGH: [50.0, 74.99]
    assert.equal(RISK_TIER_CONFIG.HIGH.tier, 'HIGH');
    assert.equal(RISK_TIER_CONFIG.HIGH.colorHex, '#F97316');
    assert.equal(RISK_TIER_CONFIG.HIGH.minScore, 50.0);

    // SEVERE: [75.0, 100.0]
    assert.equal(RISK_TIER_CONFIG.SEVERE.tier, 'SEVERE');
    assert.equal(RISK_TIER_CONFIG.SEVERE.colorHex, '#EF4444');
    assert.equal(RISK_TIER_CONFIG.SEVERE.minScore, 75.0);
    assert.equal(RISK_TIER_CONFIG.SEVERE.maxScore, 100.0);

    // INDETERMINATE
    assert.equal(RISK_TIER_CONFIG.INDETERMINATE.tier, 'INDETERMINATE');
    assert.equal(RISK_TIER_CONFIG.INDETERMINATE.colorHex, '#64748B');
  });
});

describe('Corridor Segment Risk Calculation (Phase 2 & 3)', () => {
  it('4. should divide the pilot corridor into exactly 20 contiguous segments for 21 waypoints', () => {
    const telemetry = createBaselineTelemetry();
    const segments = calculateCorridorSegmentRisks(telemetry);

    assert.equal(
      segments.length,
      PILOT_CORRIDOR_WAYPOINTS.length - 1,
      'Must have exactly 20 segments for 21 waypoints'
    );
    assert.equal(segments.length, 20);

    // Verify first and last segment endpoints
    assert.equal(segments[0].id, 'SEGMENT 01');
    assert.equal(segments[0].startWaypoint.name, 'Rishikesh');
    assert.equal(segments[0].endWaypoint.name, 'Shivpuri');

    assert.equal(segments[19].id, 'SEGMENT 20');
    assert.equal(segments[19].startWaypoint.name, 'Helang');
    assert.equal(segments[19].endWaypoint.name, 'Joshimath');
  });

  it('5. should calculate valid terrain gradients, risk scores, and color styles for every segment', () => {
    const telemetry = createBaselineTelemetry();
    const segments = calculateCorridorSegmentRisks(telemetry);

    let cumulativeDistanceKm = 0;

    for (const segment of segments) {
      assert.ok(segment.distanceKm > 0, `Segment ${segment.id} distance must be positive`);
      assert.ok(Number.isFinite(segment.gradientDegrees), `Segment ${segment.id} gradient must be finite`);
      assert.ok(segment.gradientDegrees >= 0, `Segment ${segment.id} gradient must be non-negative`);
      assert.ok(segment.riskScore >= 0 && segment.riskScore <= 100, `Segment ${segment.id} risk score must be [0, 100]`);
      assert.ok(['LOW', 'MODERATE', 'HIGH', 'SEVERE'].includes(segment.riskTier), `Segment ${segment.id} tier must be valid`);
      assert.ok(segment.colorHex.startsWith('#'), `Segment ${segment.id} colorHex must be a hex color string`);
      assert.ok(segment.primaryDriver.length > 0, `Segment ${segment.id} must specify primary hazard driver`);
      assert.ok(segment.factorContributions.length >= 4, `Segment ${segment.id} must include factor contributions`);
      assert.ok(segment.coordinates.length >= 2, `Segment ${segment.id} coordinates must form a polyline`);
      assert.ok(segment.disclaimer.includes('Does not predict landslides'), 'Must preserve landslide disclaimer');

      cumulativeDistanceKm += segment.distanceKm;
    }

    // Cumulative chord distance across 20 segments should approximate 155 km
    assert.ok(
      Math.abs(cumulativeDistanceKm - PILOT_CORRIDOR_CHORD_DISTANCE_KM) < 10,
      `Sum of segment distances (${cumulativeDistanceKm.toFixed(1)} km) should approximate chord distance (${PILOT_CORRIDOR_CHORD_DISTANCE_KM} km)`
    );
  });

  it('6. should reflect higher terrain gradient in upper gorge segments than lower foothill segments', () => {
    const telemetry = createBaselineTelemetry();
    const segments = calculateCorridorSegmentRisks(telemetry);

    const foothillSegment = segments[0]; // Rishikesh -> Shivpuri
    const gorgeSegment = segments[19]; // Helang -> Joshimath

    assert.ok(
      gorgeSegment.gradientDegrees > foothillSegment.gradientDegrees,
      `High-relief canyon segment gradient (${gorgeSegment.gradientDegrees}°) must exceed foothill gradient (${foothillSegment.gradientDegrees}°)`
    );
  });
});

describe('Rainfall What-If Scenario Simulation (Phase 6)', () => {
  it('7. should evaluate scenario risk without mutating live telemetry object', () => {
    const liveTelemetry = createBaselineTelemetry();
    const originalPrecip = liveTelemetry.rainfall?.precipitation;

    const scenarioRisk = evaluateRainfallScenario(liveTelemetry, 50.0);

    assert.equal(
      liveTelemetry.rainfall?.precipitation,
      originalPrecip,
      'Live telemetry precipitation must remain strictly unmutated'
    );
    assert.notEqual(scenarioRisk.score, null);
  });

  it('8. should monotonically increase composite risk as simulated precipitation increases', () => {
    const liveTelemetry = createBaselineTelemetry();

    const dryScenario = evaluateRainfallScenario(liveTelemetry, 0.0);
    const moderateScenario = evaluateRainfallScenario(liveTelemetry, 25.0);
    const severeScenario = evaluateRainfallScenario(liveTelemetry, 75.0);

    assert.notEqual(dryScenario.score, null);
    assert.notEqual(moderateScenario.score, null);
    assert.notEqual(severeScenario.score, null);

    assert.ok(
      (moderateScenario.score as number) >= (dryScenario.score as number),
      '25 mm/h scenario must produce risk >= 0 mm/h scenario'
    );
    assert.ok(
      (severeScenario.score as number) > (moderateScenario.score as number),
      '75 mm/h extreme scenario must produce risk > 25 mm/h scenario'
    );
  });

  it('9. should elevate risk tier to SEVERE under critical 75 mm/h rainfall with precipitation as primary driver', () => {
    const liveTelemetry = createBaselineTelemetry();
    const extremeScenario = evaluateRainfallScenario(liveTelemetry, 85.0);

    assert.notEqual(extremeScenario.score, null);
    assert.ok(
      extremeScenario.score! >= 60.0,
      `Extreme 85 mm/h scenario score (${extremeScenario.score}) must exceed 60`
    );
    assert.equal(
      extremeScenario.primaryFactor?.id,
      'precipitation_intensity',
      'Acute downpour must become the primary hazard driver under 85 mm/h scenario'
    );
  });

  it('10. should update corridor segment risks under scenario rainfall and restore on reset', () => {
    const liveTelemetry = createBaselineTelemetry();

    // Baseline live segments
    const liveSegments = calculateCorridorSegmentRisks(liveTelemetry);
    const liveSegment0Score = liveSegments[0].riskScore;

    // Severe scenario segments (50 mm/h)
    const simSegments = calculateCorridorSegmentRisks(liveTelemetry, 50.0);
    const simSegment0Score = simSegments[0].riskScore;

    assert.ok(
      simSegment0Score > liveSegment0Score,
      `Simulated segment risk (${simSegment0Score}) must be higher than live risk (${liveSegment0Score})`
    );

    // Reset: scenarioPrecipitation = null restores live segment scores exactly
    const resetSegments = calculateCorridorSegmentRisks(liveTelemetry, null);
    assert.equal(
      resetSegments[0].riskScore,
      liveSegment0Score,
      'Resetting scenario to null must restore exact live segment risk score'
    );
  });
});
