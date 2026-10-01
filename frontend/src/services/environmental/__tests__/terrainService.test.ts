/**
 * ==============================================================================
 * DRISHTI-HIMALAYA - TERRAIN SERVICE UNIT TESTS
 * Rigorous validation of densification, batching, and route gradient calculation.
 * ==============================================================================
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  haversineDistance,
  densifyCoordinates,
  computeRouteGradientMetrics,
} from '../terrainService';
import { PILOT_CORRIDOR_COORDINATES } from '../corridorConstants';

describe('TerrainService - Geodesic & Densification Engine', () => {
  it('1. should return 0 meters for identical coordinate points', () => {
    const dist = haversineDistance(30.0869, 78.2676, 30.0869, 78.2676);
    assert.equal(dist, 0);
  });

  it('2. should compute accurate geodesic distance between known geographic points', () => {
    // Rishikesh (30.0869, 78.2676) to Shivpuri (30.1347, 78.3888)
    const dist = haversineDistance(30.0869, 78.2676, 30.1347, 78.3888);
    // Expected chord distance is ~12.8 km (12,800m ± 200m)
    assert.ok(dist > 12000 && dist < 13500, `Distance was ${dist}m, expected ~12.8km`);
  });

  it('3. should handle empty or single-point coordinate arrays safely', () => {
    assert.deepEqual(densifyCoordinates([]), []);
    const single = densifyCoordinates([{ latitude: 30.0869, longitude: 78.2676 }]);
    assert.equal(single.length, 1);
    assert.equal(single[0].latitude, 30.0869);
    assert.equal(single[0].longitude, 78.2676);
  });

  it('4. should densify 21 sparse corridor waypoints into > 300 samples at 500m interval', () => {
    const densified = densifyCoordinates(PILOT_CORRIDOR_COORDINATES, 500);

    // Pilot corridor straight chord sum is ~155 km -> expect 310 - 330 points
    assert.ok(
      densified.length >= 315 && densified.length <= 325,
      `Expected ~320 points, got ${densified.length}`
    );

    // First and last coordinates must match origin (Rishikesh) and destination (Joshimath)
    assert.equal(densified[0].latitude, PILOT_CORRIDOR_COORDINATES[0][0]);
    assert.equal(densified[0].longitude, PILOT_CORRIDOR_COORDINATES[0][1]);

    const lastIdx = densified.length - 1;
    const lastOrigIdx = PILOT_CORRIDOR_COORDINATES.length - 1;
    assert.equal(densified[lastIdx].latitude, PILOT_CORRIDOR_COORDINATES[lastOrigIdx][0]);
    assert.equal(densified[lastIdx].longitude, PILOT_CORRIDOR_COORDINATES[lastOrigIdx][1]);
  });

  it('5. should produce bit-for-bit identical dense coordinates across repeated executions', () => {
    const run1 = densifyCoordinates(PILOT_CORRIDOR_COORDINATES, 500);
    const run2 = densifyCoordinates(PILOT_CORRIDOR_COORDINATES, 500);

    assert.equal(run1.length, run2.length);
    for (let i = 0; i < run1.length; i++) {
      assert.equal(run1[i].latitude, run2[i].latitude);
      assert.equal(run1[i].longitude, run2[i].longitude);
    }
  });

  it('6. should handle configurable sampling intervals (e.g. 1000m, 250m)', () => {
    const coarse = densifyCoordinates(PILOT_CORRIDOR_COORDINATES, 1000);
    const fine = densifyCoordinates(PILOT_CORRIDOR_COORDINATES, 250);

    assert.ok(coarse.length < 200, `Coarse count ${coarse.length} should be < 200`);
    assert.ok(fine.length > 600, `Fine count ${fine.length} should be > 600`);
  });

  it('7. should handle duplicate identical consecutive points without zero-division or errors', () => {
    const withDups: [number, number][] = [
      [30.0869, 78.2676],
      [30.0869, 78.2676], // Duplicate
      [30.1347, 78.3888],
    ];
    const densified = densifyCoordinates(withDups, 500);
    assert.ok(densified.length > 2);
  });

  it('8. should verify exact 320-point count, no consecutive duplicates, and preserve final destination exactly', () => {
    const densified = densifyCoordinates(PILOT_CORRIDOR_COORDINATES, 500);

    // Exact count check for default 500m interval
    assert.equal(densified.length, 320, 'Pilot corridor at 500m spacing must produce exactly 320 coordinates');

    // First coordinate must strictly match Rishikesh
    assert.equal(densified[0].latitude, 30.0869);
    assert.equal(densified[0].longitude, 78.2676);

    // Final coordinate must strictly match Joshimath destination
    assert.equal(densified[319].latitude, 30.5564);
    assert.equal(densified[319].longitude, 79.5663);

    // Verify no consecutive duplicates and non-zero segment distances
    for (let i = 0; i < densified.length - 1; i++) {
      const p1 = densified[i];
      const p2 = densified[i + 1];
      assert.ok(
        p1.latitude !== p2.latitude || p1.longitude !== p2.longitude,
        `Duplicate coordinate detected at index ${i}`
      );
      const dist = haversineDistance(p1.latitude, p1.longitude, p2.latitude, p2.longitude);
      assert.ok(dist >= 400 && dist <= 510, `Segment ${i} distance ${dist}m out of expected ~500m step range`);
    }
  });
});

describe('TerrainService - Route Gradient & Elevation Metrics', () => {
  it('8. should calculate zero gradient, zero gain, zero loss for a completely flat route', () => {
    const flatPoints = [
      { latitude: 30.0, longitude: 78.0, elevation: 500 },
      { latitude: 30.01, longitude: 78.01, elevation: 500 },
      { latitude: 30.02, longitude: 78.02, elevation: 500 },
    ];

    const metrics = computeRouteGradientMetrics(flatPoints);

    assert.equal(metrics.sampleCount, 3);
    assert.ok(metrics.totalDistanceM > 0);
    assert.equal(metrics.minElevationMsl, 500);
    assert.equal(metrics.maxElevationMsl, 500);
    assert.equal(metrics.elevationGainM, 0);
    assert.equal(metrics.elevationLossM, 0);
    assert.equal(metrics.meanRouteGradientDegrees, 0);
    assert.equal(metrics.meanRouteGradientPercent, 0);
    assert.equal(metrics.peakRouteGradientDegrees, 0);
    assert.equal(metrics.peakRouteGradientPercent, 0);
  });

  it('9. should accurately calculate constant uphill climb with positive gain and zero loss', () => {
    // 2 points spaced ~1000m apart with 100m elevation climb (10% grade = ~5.71°)
    // lat difference of 0.009° is approximately 1,000 meters along meridian
    const p1 = { latitude: 30.0, longitude: 78.0, elevation: 500 };
    const p2 = { latitude: 30.009, longitude: 78.0, elevation: 600 };

    const metrics = computeRouteGradientMetrics([p1, p2]);

    assert.equal(metrics.minElevationMsl, 500);
    assert.equal(metrics.maxElevationMsl, 600);
    assert.equal(metrics.elevationGainM, 100);
    assert.equal(metrics.elevationLossM, 0);
    assert.ok(metrics.meanRouteGradientDegrees !== null && metrics.meanRouteGradientDegrees > 5.0 && metrics.meanRouteGradientDegrees < 6.5);
    assert.ok(metrics.meanRouteGradientPercent !== null && metrics.meanRouteGradientPercent > 9.0 && metrics.meanRouteGradientPercent < 11.0);
    assert.equal(metrics.peakRouteGradientDegrees, metrics.meanRouteGradientDegrees);
  });

  it('10. should accurately calculate downhill descent with zero gain and positive loss', () => {
    const p1 = { latitude: 30.0, longitude: 78.0, elevation: 1200 };
    const p2 = { latitude: 30.009, longitude: 78.0, elevation: 1000 };

    const metrics = computeRouteGradientMetrics([p1, p2]);

    assert.equal(metrics.minElevationMsl, 1000);
    assert.equal(metrics.maxElevationMsl, 1200);
    assert.equal(metrics.elevationGainM, 0);
    assert.equal(metrics.elevationLossM, 200);
    assert.ok(metrics.meanRouteGradientDegrees !== null && metrics.meanRouteGradientDegrees > 10.0);
  });

  it('11. should separate elevation gain and loss on irregular undulating terrain profiles', () => {
    const undulatingPoints = [
      { latitude: 30.00, longitude: 78.0, elevation: 400 },
      { latitude: 30.01, longitude: 78.0, elevation: 600 }, // +200m climb
      { latitude: 30.02, longitude: 78.0, elevation: 450 }, // -150m descent
      { latitude: 30.03, longitude: 78.0, elevation: 750 }, // +300m climb
    ];

    const metrics = computeRouteGradientMetrics(undulatingPoints);

    assert.equal(metrics.minElevationMsl, 400);
    assert.equal(metrics.maxElevationMsl, 750);
    assert.equal(metrics.elevationGainM, 500); // 200 + 300
    assert.equal(metrics.elevationLossM, 150); // 150
    assert.ok(metrics.meanRouteGradientDegrees !== null && metrics.meanRouteGradientDegrees > 0);
    assert.ok(metrics.peakRouteGradientDegrees !== null && metrics.peakRouteGradientDegrees > metrics.meanRouteGradientDegrees);
  });

  it('12. should calculate length-weighted mean gradient rather than simple arithmetic average', () => {
    // Short steep segment (100m distance, 20m climb = 20% grade = 11.3°)
    // Long gentle segment (10,000m distance, 50m climb = 0.5% grade = 0.29°)
    // Simple arithmetic mean would be (11.3 + 0.29)/2 = 5.8°
    // Length-weighted mean should be very close to the gentle grade ~0.4°
    const points = [
      { latitude: 30.000, longitude: 78.0, elevation: 100 },
      { latitude: 30.0009, longitude: 78.0, elevation: 120 }, // ~100m dist
      { latitude: 30.0909, longitude: 78.0, elevation: 170 }, // ~10,000m dist
    ];

    const metrics = computeRouteGradientMetrics(points);

    assert.ok(metrics.meanRouteGradientDegrees !== null);
    assert.ok(
      metrics.meanRouteGradientDegrees < 1.0,
      `Length-weighted gradient was ${metrics.meanRouteGradientDegrees}°, expected < 1.0°`
    );
    assert.ok(
      metrics.peakRouteGradientDegrees !== null && metrics.peakRouteGradientDegrees > 10.0,
      `Peak gradient was ${metrics.peakRouteGradientDegrees}°, expected > 10.0°`
    );
  });

  it('13. should reject corrupt or implausible elevation values (<0, >9000, NaN)', () => {
    const pointsWithCorrupt = [
      { latitude: 30.0, longitude: 78.0, elevation: 400 },
      { latitude: 30.01, longitude: 78.0, elevation: -50 }, // Invalid (<0)
      { latitude: 30.02, longitude: 78.0, elevation: 12000 }, // Invalid (>9000)
      { latitude: 30.03, longitude: 78.0, elevation: Number.NaN }, // Invalid (NaN)
      { latitude: 30.04, longitude: 78.0, elevation: 600 },
    ];

    const metrics = computeRouteGradientMetrics(pointsWithCorrupt);

    // Only 400 and 600 are valid
    assert.equal(metrics.minElevationMsl, 400);
    assert.equal(metrics.maxElevationMsl, 600);
    assert.equal(metrics.sampleCount, 5);
  });

  it('14. should handle insufficient samples (<2 points) without throwing', () => {
    const metrics0 = computeRouteGradientMetrics([]);
    assert.equal(metrics0.sampleCount, 0);
    assert.equal(metrics0.minElevationMsl, null);

    const metrics1 = computeRouteGradientMetrics([{ latitude: 30.0, longitude: 78.0, elevation: 500 }]);
    assert.equal(metrics1.sampleCount, 1);
    assert.equal(metrics1.meanRouteGradientDegrees, null);
  });

  it('15. should handle zero-distance adjacent points without division by zero', () => {
    const identicalPoints = [
      { latitude: 30.0869, longitude: 78.2676, elevation: 350 },
      { latitude: 30.0869, longitude: 78.2676, elevation: 350 }, // Identical coordinate
      { latitude: 30.1347, longitude: 78.3888, elevation: 420 },
    ];

    const metrics = computeRouteGradientMetrics(identicalPoints);
    assert.equal(metrics.sampleCount, 3);
    assert.ok(Number.isFinite(metrics.meanRouteGradientDegrees));
    assert.ok(Number.isFinite(metrics.peakRouteGradientDegrees));
  });

  it('16. should reconcile elevation gain and loss against endpoints: gain - loss === last - first', () => {
    // 1. Undulating synthetic profile with known climbs and descents
    const profile1 = [
      { latitude: 30.0, longitude: 78.0, elevation: 400 },
      { latitude: 30.01, longitude: 78.01, elevation: 650 }, // +250
      { latitude: 30.02, longitude: 78.02, elevation: 480 }, // -170
      { latitude: 30.03, longitude: 78.03, elevation: 890 }, // +410
      { latitude: 30.04, longitude: 78.04, elevation: 600 }, // -290
      { latitude: 30.05, longitude: 78.05, elevation: 750 }, // +150
      { latitude: 30.06, longitude: 78.06, elevation: 520 }, // -230
      { latitude: 30.07, longitude: 78.07, elevation: 1100 }, // +580
    ];

    const metrics1 = computeRouteGradientMetrics(profile1);
    assert.ok(metrics1.elevationGainM !== null && metrics1.elevationLossM !== null);

    const firstElev1 = profile1[0].elevation;
    const lastElev1 = profile1[profile1.length - 1].elevation;
    const netElev1 = lastElev1 - firstElev1; // 1100 - 400 = 700
    const calculatedNet1 = metrics1.elevationGainM - metrics1.elevationLossM;

    assert.equal(
      calculatedNet1,
      netElev1,
      `Telescoping invariant failed: gain (${metrics1.elevationGainM}) - loss (${metrics1.elevationLossM}) = ${calculatedNet1}, expected net ${netElev1}`
    );

    // 2. High-precision floating point check with tolerance <= 1m
    const profile2 = [
      { latitude: 30.1, longitude: 78.1, elevation: 363.4 },
      { latitude: 30.2, longitude: 78.2, elevation: 720.8 },
      { latitude: 30.3, longitude: 78.3, elevation: 512.2 },
      { latitude: 30.4, longitude: 78.4, elevation: 1817.1 },
    ];
    const metrics2 = computeRouteGradientMetrics(profile2);
    assert.ok(metrics2.elevationGainM !== null && metrics2.elevationLossM !== null);
    const netElev2 = Math.round(profile2[profile2.length - 1].elevation - profile2[0].elevation);
    const calculatedNet2 = metrics2.elevationGainM - metrics2.elevationLossM;
    assert.ok(
      Math.abs(calculatedNet2 - netElev2) <= 1,
      `Floating-point tolerance invariant failed: |${calculatedNet2} - ${netElev2}| > 1`
    );
  });
});

describe('TerrainService - Batching & Elevation Mapping Engine', () => {
  it('17. should correctly batch > 100 coordinates and maintain 1:1 elevation mapping', async () => {
    const { getDenseCorridorTerrainProfile } = await import('../terrainService');

    // Create 250 synthetic coordinates (which should produce 3 batches: 100, 100, 50)
    const syntheticPoints: [number, number][] = [];
    for (let i = 0; i < 250; i++) {
      syntheticPoints.push([30.0 + i * 0.001, 78.0 + i * 0.001]);
    }

    const originalFetch = globalThis.fetch;
    const requestedUrls: string[] = [];

    // Mock fetch to track URLs and return synthetic elevations matching coordinate indices
    globalThis.fetch = async (input: RequestInfo | URL) => {
      const urlStr = input.toString();
      requestedUrls.push(urlStr);

      const parsedUrl = new URL(urlStr);
      const lats = (parsedUrl.searchParams.get('latitude') || '').split(',');
      const count = lats.length;

      // Return synthetic elevations: 500 + index
      const elevations = Array.from({ length: count }, (_, idx) => 500 + idx * 10);

      return {
        ok: true,
        status: 200,
        json: async () => ({ elevation: elevations }),
      } as unknown as Response;
    };

    try {
      // Use targetIntervalM large enough so that densify doesn't subdivide further
      const result = await getDenseCorridorTerrainProfile(syntheticPoints, {
        targetIntervalM: 50000,
        forceRefresh: true,
      });

      assert.equal(result.status, 'success');
      assert.ok(result.data !== null);
      assert.equal(result.data.points.length, 250);

      // Verify batch sizes: 3 batches [100, 100, 50]
      assert.equal(requestedUrls.length, 3);
      const batch1Lats = new URL(requestedUrls[0]).searchParams.get('latitude')?.split(',');
      const batch2Lats = new URL(requestedUrls[1]).searchParams.get('latitude')?.split(',');
      const batch3Lats = new URL(requestedUrls[2]).searchParams.get('latitude')?.split(',');

      assert.equal(batch1Lats?.length, 100);
      assert.equal(batch2Lats?.length, 100);
      assert.equal(batch3Lats?.length, 50);

      // Verify boundary continuity: batch 1 ends at point 99, batch 2 starts at point 100 (no duplicate)
      assert.notEqual(batch1Lats?.[99], batch2Lats?.[0]);
      assert.notEqual(batch2Lats?.[99], batch3Lats?.[0]);

      // Verify elevation mapping matches coordinates
      assert.equal(result.data.points[0].elevation, 500);
      assert.equal(result.data.points[99].elevation, 500 + 99 * 10);
      assert.equal(result.data.points[100].elevation, 500);
      assert.equal(result.data.points[249].elevation, 500 + 49 * 10);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('18. should return structured error result when batch network request fails', async () => {
    const { getDenseCorridorTerrainProfile } = await import('../terrainService');

    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => {
      throw new Error('Synthetic network disconnection');
    };

    try {
      const result = await getDenseCorridorTerrainProfile(
        [
          [30.0, 78.0],
          [30.05, 78.05],
        ],
        { targetIntervalM: 5000, forceRefresh: true }
      );

      assert.equal(result.status, 'error');
      assert.equal(result.data, null);
      assert.ok(result.error?.includes('Synthetic network disconnection'));
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

