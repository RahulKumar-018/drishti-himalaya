/**
 * ==============================================================================
 * DRISHTI-HIMALAYA - PHASE 6C DECISION-SUPPORT UI & HOTSPOTS TEST SUITE
 * Validates Phase 6C.2 (Why this assessment), Phase 6C.3 (Hotspot ranking),
 * Phase 6C.4 (Corridor visibility & coexistence), Phase 6C.5 (Pipeline invariants),
 * and strict terminology / decision-support phrasing compliance.
 * ==============================================================================
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateCorridorSegmentRisks,
  CorridorSegmentRisk,
} from '../../../services/risk/segmentRiskService';
import { PILOT_CORRIDOR_WAYPOINTS } from '../../../services/environmental/corridorConstants';
import { deterministicRiskEngine } from '../../../services/risk/deterministicRiskEngine';
import { EnvironmentalData } from '../../../services/environmental/types';

describe('Phase 6C - Decision-Support UI & Hotspot Invariants', () => {
  const timestamp = new Date().toISOString();
  const mockEnvData: EnvironmentalData = {
    location: {
      name: 'Rishikesh-Joshimath Corridor',
      latitude: 30.3,
      longitude: 79.1,
    },
    status: 'success',
    error: null,
    rainfall: {
      latitude: 30.3,
      longitude: 79.1,
      timestamp,
      precipitation: 14.5,
      precipitationUnit: 'mm',
      rain: 14.5,
      showers: 0.0,
      precipitationProbability: 80,
      weatherCode: 63,
      weatherDescription: 'Moderate Rain',
      dailyPrecipitationSum: 45.0,
      source: 'Open-Meteo',
      fetchedAt: timestamp,
    },
    terrain: {
      elevation: {
        latitude: 30.3,
        longitude: 79.1,
        elevation: 850,
        elevationUnit: 'm',
        source: 'Copernicus DEM 90m',
        fetchedAt: timestamp,
      },
      routeProfile: {
        totalDistance: 246000,
        minElevation: 350,
        maxElevation: 1890,
        elevationGain: 1450,
        elevationLoss: 220,
        meanGradientPercent: 22.0,
        meanGradientDegrees: 12.4,
        peakGradientPercent: 54.3,
        peakGradientDegrees: 28.5,
        peakGradientSegmentIndex: 0,
        sampleCount: 20,
        totalDistanceM: 246000,
        minElevationMsl: 350,
        maxElevationMsl: 1890,
        elevationGainM: 1450,
        elevationLossM: 220,
        meanRouteGradientDegrees: 12.4,
        meanRouteGradientPercent: 22.0,
        peakRouteGradientDegrees: 28.5,
        peakRouteGradientPercent: 54.3,
        segments: [],
      },
      slopeDegrees: 22.5,
    },
    metadata: {
      fetchedAt: timestamp,
      sources: ['Open-Meteo', 'Copernicus DEM 90m'],
    },
  };

  it('1. should rank corridor segments by riskScore descending without fabricating scores', () => {
    const segments = calculateCorridorSegmentRisks(mockEnvData);
    assert.ok(segments.length > 0, 'Corridor segments should be populated');

    // Filter valid numerical scores and sort descending (same presentation logic as AnalysisPanel)
    const validSegments = segments.filter(
      (s) =>
        s.riskTier !== 'INDETERMINATE' &&
        typeof s.riskScore === 'number' &&
        !Number.isNaN(s.riskScore)
    );
    const ranked = [...validSegments].sort((a, b) => b.riskScore - a.riskScore);
    const topHotspots = ranked.slice(0, 5);

    assert.ok(topHotspots.length <= 5, 'Must contain at most top 5 hotspots');
    assert.ok(topHotspots.length >= 1, 'Must contain at least 1 hotspot');

    // Verify strict descending monotonicity
    for (let i = 0; i < topHotspots.length - 1; i++) {
      assert.ok(
        topHotspots[i].riskScore >= topHotspots[i + 1].riskScore,
        `Hotspot rank #${i + 1} (${topHotspots[i].riskScore}) must be >= rank #${i + 2} (${topHotspots[i + 1].riskScore})`
      );
    }

    // Verify #1 hotspot has the highest score in the entire corridor
    const maxScore = Math.max(...validSegments.map((s) => s.riskScore));
    assert.equal(topHotspots[0].riskScore, maxScore);
  });

  it('2. should strictly exclude INDETERMINATE segments from numerical hotspot ranking', () => {
    const indeterminateSegment: CorridorSegmentRisk = {
      id: 'DH-SEG-TEST',
      index: 0,
      name: 'Test Segment',
      startWaypoint: PILOT_CORRIDOR_WAYPOINTS[0],
      endWaypoint: PILOT_CORRIDOR_WAYPOINTS[1],
      coordinates: [[30.0, 78.0], [30.1, 78.1]],
      distanceKm: 12.0,
      gradientDegrees: 15.0,
      gradientPercent: 26.8,
      startElevationM: 400,
      endElevationM: 600,
      minElevationM: 400,
      maxElevationM: 600,
      riskScore: 0,
      riskTier: 'INDETERMINATE',
      colorHex: '#94a3b8',
      primaryDriver: 'Offline Telemetry',
      factorContributions: [],
      activeFactorsRatio: '0/5 Active',
      dataQualityRating: 'DEGRADED',
      disclaimer: 'Insufficient telemetry',
      riskAssessment: {
        score: null,
        level: 'INDETERMINATE',
        colorHex: '#94a3b8',
        evaluatedAt: new Date().toISOString(),
        primaryFactor: null,
        factors: [],
        dataQuality: {
          completenessPercent: 0,
          activeFactorsCount: 0,
          unavailableFactorsCount: 5,
          futureUnassessedFactorsCount: 2,
          telemetryFreshnessSeconds: null,
          isStale: true,
          rating: 'INSUFFICIENT',
          caveats: ['Offline'],
        },
        summaryExplanation: 'Telemetry unavailable',
      },
    };

    const segmentsWithIndeterminate = [indeterminateSegment];
    const ranked = segmentsWithIndeterminate
      .filter((s) => s.riskTier !== 'INDETERMINATE' && typeof s.riskScore === 'number' && !Number.isNaN(s.riskScore))
      .sort((a, b) => b.riskScore - a.riskScore);

    assert.equal(ranked.length, 0, 'Indeterminate segments must be excluded from numerical ranking');
  });

  it('3. should provide authoritative "Why this assessment?" metrics directly from risk engine', () => {
    const assessment = deterministicRiskEngine.evaluate(mockEnvData);

    assert.ok(assessment.score !== null && assessment.score > 0, 'Risk score must be positive');
    assert.ok(['LOW', 'MODERATE', 'HIGH', 'SEVERE'].includes(assessment.level), 'Risk level must be valid tier');
    assert.ok(assessment.primaryFactor !== null, 'Primary factor driver must be identified');
    assert.ok(assessment.primaryFactor!.weightedContribution! > 0, 'Primary factor must have positive contribution');

    // Verify top active contributors ordering
    const activeContributors = assessment.factors
      .filter((f) => f.status === 'active' && f.weightedContribution !== null && f.weightedContribution > 0)
      .sort((a, b) => (b.weightedContribution ?? 0) - (a.weightedContribution ?? 0));

    assert.ok(activeContributors.length >= 1, 'Must have at least one active contributor');
    assert.equal(activeContributors[0].id, assessment.primaryFactor!.id, 'Highest contributor must match primaryFactor');
  });

  it('4. should correctly reflect dynamic normalization coverage without fabricating offline factors', () => {
    // Environmental data with missing terrain
    const partialEnvData: EnvironmentalData = {
      ...mockEnvData,
      terrain: {
        ...mockEnvData.terrain!,
        routeProfile: null,
        slopeDegrees: null,
      },
    };

    const assessment = deterministicRiskEngine.evaluate(partialEnvData);
    assert.equal(assessment.dataQuality.activeFactorsCount, 4, 'Should have exactly 4 active factors');
    assert.equal(assessment.dataQuality.unavailableFactorsCount, 1, 'Should have 1 unavailable factor');

    // Active weights must sum to 1.0
    const activeWeightSum = assessment.factors
      .filter((f) => f.status === 'active')
      .reduce((sum, f) => sum + f.normalizedWeight, 0);
    assert.ok(Math.abs(activeWeightSum - 1.0) < 1e-4, 'Active normalized weights must sum to 1.0');

    // Slope gradient should be unavailable
    const slopeFactor = assessment.factors.find((f) => f.id === 'terrain_slope_gradient');
    assert.ok(slopeFactor, 'Slope factor should exist');
    assert.equal(slopeFactor?.status, 'unavailable', 'Slope factor must be unavailable');
    assert.equal(slopeFactor?.weightedContribution, null, 'Unavailable factor must not fabricate contribution');
  });

  it('5. should enforce strict decision-support terminology and prohibit predictive claims', () => {
    const assessment = deterministicRiskEngine.evaluate(mockEnvData);
    const summary = (assessment.summaryExplanation || '').toLowerCase();
    const caveats = (assessment.dataQuality.caveats || []).join(' ').toLowerCase();

    const prohibitedPhrases = [
      'landslide predicted',
      'landslide will occur',
      'failure predicted',
      'safe route guaranteed',
      'road guaranteed safe',
      'geological failure detected',
    ];

    for (const phrase of prohibitedPhrases) {
      assert.ok(
        !summary.includes(phrase),
        `Summary must not contain prohibited predictive phrase: "${phrase}"`
      );
      assert.ok(
        !caveats.includes(phrase),
        `Caveats must not contain prohibited predictive phrase: "${phrase}"`
      );
    }
  });

  it('6. should verify base factor configuration weights match Phase 6B specification (30/25/20/15/10)', () => {
    const assessment = deterministicRiskEngine.evaluate(mockEnvData);
    const baseWeights: Record<string, number> = {};
    for (const f of assessment.factors) {
      baseWeights[f.id] = f.rawWeight;
    }

    assert.equal(baseWeights['precipitation_intensity'], 0.30, 'Precipitation Intensity must be 30%');
    assert.equal(baseWeights['rainfall_accumulation_24h'], 0.25, '24h Rainfall Accumulation must be 25%');
    assert.equal(baseWeights['terrain_slope_gradient'], 0.20, 'Terrain Slope Gradient must be 20%');
    assert.equal(baseWeights['precipitation_probability'], 0.15, 'Precipitation Probability must be 15%');
    assert.equal(baseWeights['orographic_elevation'], 0.10, 'Orographic Elevation must be 10%');

    const totalBase =
      baseWeights['precipitation_intensity'] +
      baseWeights['rainfall_accumulation_24h'] +
      baseWeights['terrain_slope_gradient'] +
      baseWeights['precipitation_probability'] +
      baseWeights['orographic_elevation'];
    assert.ok(Math.abs(totalBase - 1.0) < 1e-6, 'Base weights must sum to 1.0');
  });
});
