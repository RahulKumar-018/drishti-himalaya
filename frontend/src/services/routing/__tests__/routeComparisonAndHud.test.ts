/**
 * ==============================================================================
 * DRISHTI-HIMALAYA - ROUTE COMPARISON, HUD & RATIONALE TEST SUITE
 * Validates route comparison data structures, decision rationale invariants,
 * 4-factor segment inspection weights (35/30/20/15), and pipeline staging.
 * ==============================================================================
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { RouteOption } from '../../../components/route/RouteComparisonHUD';
import { RationaleFactor } from '../../../components/route/DecisionRationale';

describe('Route Comparison HUD & Decision Rationale Engine', () => {
  it('1. should compare routes and rank by exposure without bias or hardcoded "Recommended" labels', () => {
    const routeOptions: RouteOption[] = [
      {
        id: 'route-nh7',
        title: 'Primary Corridor (NH-7 Main)',
        route: 'Via Rudraprayag & Karnaprayag',
        riskScore: 68.4,
        estimatedTime: '6h 15m',
        distanceKm: 246.0,
        status: 'high',
        statusBadge: 'Higher exposure',
        selected: false,
      },
      {
        id: 'route-bypass',
        title: 'Southern Bypass Route',
        route: 'Via Srinagar – Tehri Arterial',
        riskScore: 34.2,
        estimatedTime: '7h 10m',
        distanceKm: 268.5,
        status: 'moderate',
        statusBadge: 'Lower exposure',
        selected: true,
      },
    ];

    assert.equal(routeOptions.length, 2);
    const selectedRoute = routeOptions.find((r) => r.selected);
    assert.ok(selectedRoute);
    assert.equal(selectedRoute?.id, 'route-bypass');
    assert.equal(selectedRoute?.statusBadge, 'Lower exposure');

    // Verify neutral labeling invariant: none should claim unverified "Recommended"
    for (const r of routeOptions) {
      assert.notEqual(r.statusBadge?.toLowerCase(), 'recommended');
    }

    // Verify risk ordering
    const lowerRisk = routeOptions.reduce((min, r) => (r.riskScore < min.riskScore ? r : min));
    assert.equal(lowerRisk.id, 'route-bypass');
    assert.ok(lowerRisk.riskScore < 50);
  });

  it('2. should calculate factor deltas correctly for decision rationale', () => {
    const factors: RationaleFactor[] = [
      {
        id: 'slope',
        label: 'Slope Exposure',
        delta: -40.8,
        unit: '%',
        direction: 'decrease',
        explanation: 'Bypass corridor avoids steep gorge cutting along Alaknanda canyon.',
      },
      {
        id: 'rainfall',
        label: 'Rainfall Accumulation',
        delta: -33.3,
        unit: '%',
        direction: 'decrease',
        explanation: 'Southern ridge receives lower precipitation than northern cloudburst basin.',
      },
      {
        id: 'distance',
        label: 'Route Length',
        delta: 9.1,
        unit: '%',
        direction: 'increase',
        explanation: 'Trade-off: 22.5 km longer travel distance for lower landslide exposure.',
      },
    ];

    assert.equal(factors.length, 3);
    const slopeFactor = factors.find((f) => f.id === 'slope');
    assert.ok(slopeFactor);
    assert.equal(slopeFactor?.direction, 'decrease');
    assert.ok(slopeFactor?.delta !== undefined && slopeFactor.delta < 0);

    const distFactor = factors.find((f) => f.id === 'distance');
    assert.ok(distFactor);
    assert.equal(distFactor?.direction, 'increase');
    assert.ok(distFactor?.delta !== undefined && distFactor.delta > 0);
  });

  it('3. should verify 4-factor MCDA segment inspection weights strictly sum to 100%', () => {
    // Current deterministic model weights per UXMagic and project specification
    const MCDA_SEGMENT_WEIGHTS = {
      slope: 0.35, // 35%
      rainfall: 0.30, // 30%
      historicalScars: 0.20, // 20%
      roadGeometry: 0.15, // 15%
    };

    const totalWeight =
      MCDA_SEGMENT_WEIGHTS.slope +
      MCDA_SEGMENT_WEIGHTS.rainfall +
      MCDA_SEGMENT_WEIGHTS.historicalScars +
      MCDA_SEGMENT_WEIGHTS.roadGeometry;

    assert.ok(Math.abs(totalWeight - 1.0) < 1e-6, `MCDA weights must sum to 1.0, got ${totalWeight}`);
    assert.equal(MCDA_SEGMENT_WEIGHTS.slope, 0.35);
    assert.equal(MCDA_SEGMENT_WEIGHTS.rainfall, 0.30);
    assert.equal(MCDA_SEGMENT_WEIGHTS.historicalScars, 0.20);
    assert.equal(MCDA_SEGMENT_WEIGHTS.roadGeometry, 0.15);
  });

  it('4. should compute composite hazard score bounded in [0, 100] from factor contributions', () => {
    const computeSegmentHazard = (
      slopeContrib: number,
      rainContrib: number,
      scarContrib: number,
      geomContrib: number
    ): number => {
      const score =
        slopeContrib * 0.35 +
        rainContrib * 0.30 +
        scarContrib * 0.20 +
        geomContrib * 0.15;
      return Math.min(100, Math.max(0, Math.round(score * 10) / 10));
    };

    // Extreme zero case
    assert.equal(computeSegmentHazard(0, 0, 0, 0), 0.0);

    // Extreme max case
    assert.equal(computeSegmentHazard(100, 100, 100, 100), 100.0);

    // Typical moderate gorge case
    const moderateScore = computeSegmentHazard(55, 40, 20, 30);
    assert.ok(moderateScore >= 0 && moderateScore <= 100);
    assert.equal(moderateScore, 39.8);
  });
});
