/**
 * ==============================================================================
 * DRISHTI-HIMALAYA - ROUTING SYSTEM UNIT TESTS
 * Phase 2: Real Road Routing + Dynamic Route Geometry
 * ==============================================================================
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  validateAndCleanCoordinates,
  calculateRouteBounds,
  calculateCumulativeDistances,
  sampleRouteAtInterval,
  createRouteSegments,
  formatDistance,
  formatDuration,
} from '../routeGeometry';
import {
  calculateGradient,
  enrichRouteWithElevation,
} from '../routeElevation';
import { OSRMProvider } from '../providers/osrmProvider';
import { RouteService } from '../routeService';
import { RouteRequest, RouteResult, IRouteProvider } from '../routeTypes';
import { LocationPoint } from '../../../types/location';

const mockOrigin: LocationPoint = {
  id: 'rishikesh',
  name: 'Rishikesh',
  latitude: 30.0869,
  longitude: 78.2676,
  state: 'Uttarakhand',
  category: 'CITY',
  source: 'curated',
};

const mockDestination: LocationPoint = {
  id: 'joshimath',
  name: 'Joshimath',
  latitude: 30.5564,
  longitude: 79.5663,
  state: 'Uttarakhand',
  category: 'TOWN',
  source: 'curated',
};

describe('Route Geometry & Coordinate Normalization', () => {
  it('1. should validate and filter invalid, out-of-range, and NaN coordinates', () => {
    const rawCoords: Array<[number, number]> = [
      [30.0869, 78.2676],
      [NaN as number, 78.3] as [number, number],
      [30.1, Infinity as number] as [number, number],
      [120.0, 78.4] as [number, number], // invalid latitude > 90
      [30.2, -200.0] as [number, number], // invalid longitude < -180
      [30.25, 78.5],
    ];

    const cleaned = validateAndCleanCoordinates(rawCoords);
    assert.strictEqual(cleaned.length, 2);
    assert.strictEqual(cleaned[0][0], 30.0869);
    assert.strictEqual(cleaned[1][0], 30.25);
  });

  it('2. should eliminate consecutive duplicate coordinates to prevent zero-distance divisions', () => {
    const rawCoords: Array<[number, number]> = [
      [30.0869, 78.2676],
      [30.0869, 78.2676], // identical duplicate
      [30.08690001, 78.26760001], // sub-millimeter duplicate (< 1e-7)
      [30.15, 78.35],
    ];

    const cleaned = validateAndCleanCoordinates(rawCoords);
    assert.strictEqual(cleaned.length, 2);
    assert.strictEqual(cleaned[0][0], 30.0869);
    assert.strictEqual(cleaned[1][0], 30.15);
  });

  it('3. should handle empty or corrupt coordinate array gracefully', () => {
    assert.deepStrictEqual(validateAndCleanCoordinates([]), []);
    assert.deepStrictEqual(validateAndCleanCoordinates(null as unknown as Array<[number, number]>), []);
  });

  it('4. should compute spatial bounding box correctly', () => {
    const coords: Array<[number, number]> = [
      [30.0869, 78.2676],
      [30.5564, 79.5663],
      [30.2, 78.1],
      [30.7, 79.2],
    ];

    const bounds = calculateRouteBounds(coords);
    assert.strictEqual(bounds[0][0], 30.0869); // minLat
    assert.strictEqual(bounds[0][1], 78.1); // minLng
    assert.strictEqual(bounds[1][0], 30.7); // maxLat
    assert.strictEqual(bounds[1][1], 79.5663); // maxLng
  });

  it('5. should calculate monotonic cumulative distance in meters', () => {
    const coords: Array<[number, number]> = [
      [30.0869, 78.2676],
      [30.1869, 78.3676],
      [30.2869, 78.4676],
    ];

    const distances = calculateCumulativeDistances(coords);
    assert.strictEqual(distances.length, 3);
    assert.strictEqual(distances[0], 0);
    assert.ok(distances[1] > distances[0], 'Cumulative distance must strictly increase');
    assert.ok(distances[2] > distances[1], 'Cumulative distance must strictly increase');
  });

  it('6. should format distances and durations into human-readable strings', () => {
    assert.strictEqual(formatDistance(255324), '~255.3 km');
    assert.strictEqual(formatDistance(850), '850 m');
    assert.strictEqual(formatDuration(22699), '~6h 18m');
    assert.strictEqual(formatDuration(1856), '~31m');
    assert.strictEqual(formatDuration(0), '0m');
  });
});

describe('Route Sampling & Segmentation Engine', () => {
  it('7. should generate regular samples with first sample at origin and last sample at destination', () => {
    // Approx 40 km test polyline with 4 vertices
    const coords: Array<[number, number]> = [
      [30.0, 78.0],
      [30.1, 78.1],
      [30.2, 78.2],
      [30.3, 78.3],
    ];

    const samples = sampleRouteAtInterval(coords, 2000); // 2 km interval
    assert.ok(samples.length > 5, 'Should produce multiple intermediate samples');

    // Invariant 1: First sample is exact origin
    assert.strictEqual(samples[0].index, 0);
    assert.strictEqual(samples[0].lat, 30.0);
    assert.strictEqual(samples[0].lng, 78.0);
    assert.strictEqual(samples[0].distanceFromOriginMeters, 0);
    assert.strictEqual(samples[0].routeFraction, 0);

    // Invariant 2: Last sample is exact destination
    const last = samples[samples.length - 1];
    assert.strictEqual(last.lat, 30.3);
    assert.strictEqual(last.lng, 78.3);
    assert.strictEqual(last.routeFraction, 1.0);
    assert.ok(last.distanceFromOriginMeters > 0);

    // Invariant 3: Distances and fractions are monotonically increasing
    for (let i = 1; i < samples.length; i++) {
      assert.ok(
        samples[i].distanceFromOriginMeters >= samples[i - 1].distanceFromOriginMeters,
        `Sample ${i} distance must be >= sample ${i - 1}`
      );
      assert.ok(
        samples[i].routeFraction >= samples[i - 1].routeFraction,
        `Sample ${i} fraction must be >= sample ${i - 1}`
      );
    }
  });

  it('8. should safely handle zero-distance / single-point geometry', () => {
    const coords: Array<[number, number]> = [[30.0869, 78.2676]];
    const samples = sampleRouteAtInterval(coords, 500);
    assert.strictEqual(samples.length, 1);
    assert.strictEqual(samples[0].distanceFromOriginMeters, 0);
    assert.strictEqual(samples[0].routeFraction, 0);
  });

  it('9. should create contiguous route segments between adjacent samples', () => {
    const coords: Array<[number, number]> = [
      [30.0, 78.0],
      [30.1, 78.1],
      [30.2, 78.2],
    ];
    const samples = sampleRouteAtInterval(coords, 5000);
    const segments = createRouteSegments(samples, coords);

    assert.strictEqual(segments.length, samples.length - 1);
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      assert.strictEqual(seg.index, i);
      assert.strictEqual(seg.startPoint.id, samples[i].id);
      assert.strictEqual(seg.endPoint.id, samples[i + 1].id);
      assert.ok(seg.lengthMeters >= 0);
      assert.ok(seg.geometry.length >= 2);
    }
  });
});

describe('Terrain Gradient & Elevation Integration', () => {
  it('10. should calculate longitudinal road terrain gradient and slope angles correctly', () => {
    // 1000m horizontal distance, 100m elevation gain -> 10% gradient
    const uphill = calculateGradient(1000, 500, 600);
    assert.strictEqual(uphill.elevationChangeM, 100);
    assert.strictEqual(uphill.gradientPercent, 10);
    // atan(0.1) * 180 / PI = 5.71 deg
    assert.strictEqual(uphill.gradientDegrees, 5.7);

    // 1000m horizontal distance, 50m elevation loss -> -5% gradient
    const downhill = calculateGradient(1000, 600, 550);
    assert.strictEqual(downhill.elevationChangeM, -50);
    assert.strictEqual(downhill.gradientPercent, -5);
    assert.strictEqual(downhill.gradientDegrees, -2.9);
  });

  it('11. should safely handle zero distance or missing elevation without dividing by zero', () => {
    const zeroDist = calculateGradient(0, 500, 600);
    assert.strictEqual(zeroDist.gradientPercent, null);
    assert.strictEqual(zeroDist.gradientDegrees, null);

    const missingElev = calculateGradient(1000, null, 600);
    assert.strictEqual(missingElev.gradientPercent, null);
    assert.strictEqual(missingElev.gradientDegrees, null);

    const nanElev = calculateGradient(1000, 500, NaN);
    assert.strictEqual(nanElev.gradientPercent, null);
    assert.strictEqual(nanElev.gradientDegrees, null);
  });

  it('12. should enrich route segments and aggregate hypsometric metrics', async () => {
    const baseResult: RouteResult = {
      status: 'success',
      provider: 'TestProvider',
      origin: mockOrigin,
      destination: mockDestination,
      geometry: [
        [30.0, 78.0],
        [30.1, 78.1],
        [30.2, 78.2],
      ],
      distanceMeters: 30000,
      durationSeconds: 2400,
      bounds: [
        [30.0, 78.0],
        [30.2, 78.2],
      ],
      samples: [
        { id: 's1', index: 0, lat: 30.0, lng: 78.0, distanceFromOriginMeters: 0, routeFraction: 0 },
        { id: 's2', index: 1, lat: 30.1, lng: 78.1, distanceFromOriginMeters: 15000, routeFraction: 0.5 },
        { id: 's3', index: 2, lat: 30.2, lng: 78.2, distanceFromOriginMeters: 30000, routeFraction: 1.0 },
      ],
      segments: [
        {
          id: 'seg-1',
          index: 0,
          startPoint: { id: 's1', index: 0, lat: 30.0, lng: 78.0, distanceFromOriginMeters: 0, routeFraction: 0 },
          endPoint: { id: 's2', index: 1, lat: 30.1, lng: 78.1, distanceFromOriginMeters: 15000, routeFraction: 0.5 },
          midpoint: { lat: 30.05, lng: 78.05 },
          startDistanceMeters: 0,
          endDistanceMeters: 15000,
          lengthMeters: 15000,
          geometry: [[30.0, 78.0], [30.1, 78.1]],
        },
        {
          id: 'seg-2',
          index: 1,
          startPoint: { id: 's2', index: 1, lat: 30.1, lng: 78.1, distanceFromOriginMeters: 15000, routeFraction: 0.5 },
          endPoint: { id: 's3', index: 2, lat: 30.2, lng: 78.2, distanceFromOriginMeters: 30000, routeFraction: 1.0 },
          midpoint: { lat: 30.15, lng: 78.15 },
          startDistanceMeters: 15000,
          endDistanceMeters: 30000,
          lengthMeters: 15000,
          geometry: [[30.1, 78.1], [30.2, 78.2]],
        },
      ],
      metrics: {
        totalDistanceMeters: 30000,
        totalDistanceKm: 30,
        totalDurationSeconds: 2400,
        formattedDistance: '~30.0 km',
        formattedDuration: '~40m',
        sampleCount: 3,
        segmentCount: 2,
      },
      waypoints: [],
      fetchedAt: new Date().toISOString(),
    };

    // Enriching route (in test env without network will handle gracefully)
    const enriched = await enrichRouteWithElevation(baseResult, { timeoutMs: 50 });
    assert.strictEqual(enriched.status, 'success');
    assert.strictEqual(enriched.samples.length, 3);
    assert.strictEqual(enriched.segments.length, 2);
    assert.ok(enriched.metrics.elevationCoverageRatio !== undefined);
  });
});

describe('OSRM Provider & Failure Handling', () => {
  it('13. should reject invalid origin or destination coordinates before making network call', async () => {
    const provider = new OSRMProvider();
    const badRequest: RouteRequest = {
      origin: { ...mockOrigin, latitude: NaN },
      destination: mockDestination,
    };

    const result = await provider.fetchRoute(badRequest);
    assert.strictEqual(result.status, 'error');
    assert.ok(result.error?.includes('Invalid coordinates'));
    assert.strictEqual(result.geometry.length, 0);
  });

  it('14. should reject identical origin and destination coordinates as no_route', async () => {
    const provider = new OSRMProvider();
    const sameRequest: RouteRequest = {
      origin: mockOrigin,
      destination: mockOrigin,
    };

    const result = await provider.fetchRoute(sameRequest);
    assert.strictEqual(result.status, 'no_route');
    assert.ok(result.error?.includes('cannot be the same location'));
  });

  it('15. should handle network/offline failure safely without crashing', async () => {
    // Route to non-existent endpoint to simulate network failure
    const provider = new OSRMProvider('http://127.0.0.1:54321');
    const result = await provider.fetchRoute({
      origin: mockOrigin,
      destination: mockDestination,
    });

    assert.strictEqual(result.status, 'error');
    assert.ok(result.error !== undefined);
    assert.strictEqual(result.geometry.length, 0);
    assert.strictEqual(result.metrics.formattedDistance, 'Unavailable');
  });
});

describe('RouteService Orchestrator & In-Memory Cache', () => {
  it('16. should cache successful route requests and return cached instance', async () => {
    let fetchCount = 0;

    const mockProvider: IRouteProvider = {
      name: 'MockProvider',
      async fetchRoute(req: RouteRequest): Promise<RouteResult> {
        fetchCount++;
        return {
          status: 'success',
          provider: 'MockProvider',
          origin: req.origin,
          destination: req.destination,
          geometry: [[req.origin.latitude, req.origin.longitude], [req.destination.latitude, req.destination.longitude]],
          distanceMeters: 50000,
          durationSeconds: 3600,
          bounds: [[req.origin.latitude, req.origin.longitude], [req.destination.latitude, req.destination.longitude]],
          samples: [],
          segments: [],
          metrics: {
            totalDistanceMeters: 50000,
            totalDistanceKm: 50,
            totalDurationSeconds: 3600,
            formattedDistance: '~50.0 km',
            formattedDuration: '~1h',
            sampleCount: 2,
            segmentCount: 1,
          },
          waypoints: [],
          fetchedAt: new Date().toISOString(),
        };
      },
    };

    const service = new RouteService(mockProvider);

    const req: RouteRequest = {
      origin: mockOrigin,
      destination: mockDestination,
    };

    // First request - fetches from provider
    const res1 = await service.requestRoute(req, { enrichElevation: false });
    assert.strictEqual(fetchCount, 1);
    assert.strictEqual(res1.status, 'success');

    // Second request with same params - should hit cache
    const res2 = await service.requestRoute(req, { enrichElevation: false });
    assert.strictEqual(fetchCount, 1, 'Subsequent identical request must hit cache without refetching');
    assert.strictEqual(res2.distanceMeters, 50000);

    // Third request with forceRefresh - should bypass cache
    const res3 = await service.requestRoute(req, { enrichElevation: false, forceRefresh: true });
    assert.strictEqual(fetchCount, 2, 'forceRefresh must bypass cache');
    assert.strictEqual(res3.status, 'success');
  });

  it('17. should clear cache when clearCache is called', async () => {
    let fetchCount = 0;
    const mockProvider: IRouteProvider = {
      name: 'MockProvider2',
      async fetchRoute(req: RouteRequest): Promise<RouteResult> {
        fetchCount++;
        return {
          status: 'success',
          provider: 'MockProvider2',
          origin: req.origin,
          destination: req.destination,
          geometry: [[req.origin.latitude, req.origin.longitude], [req.destination.latitude, req.destination.longitude]],
          distanceMeters: 10000,
          durationSeconds: 900,
          bounds: [[req.origin.latitude, req.origin.longitude], [req.destination.latitude, req.destination.longitude]],
          samples: [],
          segments: [],
          metrics: {
            totalDistanceMeters: 10000,
            totalDistanceKm: 10,
            totalDurationSeconds: 900,
            formattedDistance: '~10.0 km',
            formattedDuration: '~15m',
            sampleCount: 2,
            segmentCount: 1,
          },
          waypoints: [],
          fetchedAt: new Date().toISOString(),
        };
      },
    };

    const service = new RouteService(mockProvider);
    await service.requestRoute({ origin: mockOrigin, destination: mockDestination }, { enrichElevation: false });
    assert.strictEqual(fetchCount, 1);

    service.clearCache();

    await service.requestRoute({ origin: mockOrigin, destination: mockDestination }, { enrichElevation: false });
    assert.strictEqual(fetchCount, 2, 'Should re-fetch after clearCache');
  });
});
