/**
 * ==============================================================================
 * DRISHTI-HIMALAYA - ROUTE GEOMETRY & SAMPLING UTILITIES
 * High-precision geodesic sampling, bounds calculation, and segmentation.
 * ==============================================================================
 */

import { RouteSample, RouteSegment } from './routeTypes';
import { haversineDistance } from '../environmental/terrainService';

/**
 * Validates coordinate tuples [latitude, longitude], filters invalid or NaN points,
 * and eliminates duplicate consecutive points to prevent zero-distance divisions.
 */
export function validateAndCleanCoordinates(
  coords: Array<[number, number]>
): Array<[number, number]> {
  if (!Array.isArray(coords) || coords.length === 0) {
    return [];
  }

  const cleaned: Array<[number, number]> = [];

  for (let i = 0; i < coords.length; i++) {
    const pt = coords[i];
    if (
      !Array.isArray(pt) ||
      pt.length < 2 ||
      typeof pt[0] !== 'number' ||
      typeof pt[1] !== 'number' ||
      !Number.isFinite(pt[0]) ||
      !Number.isFinite(pt[1]) ||
      pt[0] < -90 ||
      pt[0] > 90 ||
      pt[1] < -180 ||
      pt[1] > 180
    ) {
      continue;
    }

    // Skip consecutive identical points (within ~0.1m)
    if (cleaned.length > 0) {
      const prev = cleaned[cleaned.length - 1];
      if (Math.abs(prev[0] - pt[0]) < 1e-7 && Math.abs(prev[1] - pt[1]) < 1e-7) {
        continue;
      }
    }

    cleaned.push([
      Math.round(pt[0] * 1e6) / 1e6,
      Math.round(pt[1] * 1e6) / 1e6,
    ]);
  }

  return cleaned;
}

/**
 * Computes bounding box [[minLat, minLng], [maxLat, maxLng]] from coordinate array.
 */
export function calculateRouteBounds(
  coords: Array<[number, number]>
): [[number, number], [number, number]] {
  if (!coords || coords.length === 0) {
    return [
      [30.0, 78.0],
      [31.0, 79.5],
    ];
  }

  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLng = Infinity;
  let maxLng = -Infinity;

  for (const [lat, lng] of coords) {
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
  }

  return [
    [minLat, minLng],
    [maxLat, maxLng],
  ];
}

/**
 * Computes monotonic cumulative distance along a polyline in meters.
 * Result has length equal to coords.length with result[0] === 0.
 */
export function calculateCumulativeDistances(
  coords: Array<[number, number]>
): number[] {
  if (!coords || coords.length === 0) {
    return [];
  }

  const cumulative: number[] = [0];
  let total = 0;

  for (let i = 1; i < coords.length; i++) {
    const prev = coords[i - 1];
    const curr = coords[i];
    const d = haversineDistance(prev[0], prev[1], curr[0], curr[1]);
    total += d;
    cumulative.push(total);
  }

  return cumulative;
}

/**
 * Samples a high-resolution route polyline at regular geodesic intervals (default: 500m).
 * Guarantees that:
 * 1. The first sample is the exact origin coordinate (distance = 0, fraction = 0).
 * 2. The last sample is the exact destination coordinate (distance = total, fraction = 1).
 * 3. Intermediate samples are interpolated linearly along polyline segments.
 *
 * @param coords Cleaned array of [latitude, longitude] pairs.
 * @param intervalMeters Spacing between samples in meters (default: 500m).
 */
export function sampleRouteAtInterval(
  coords: Array<[number, number]>,
  intervalMeters: number = 500
): RouteSample[] {
  if (!coords || coords.length === 0) {
    return [];
  }

  if (coords.length === 1) {
    return [
      {
        id: 'sample-0001',
        index: 0,
        lat: coords[0][0],
        lng: coords[0][1],
        distanceFromOriginMeters: 0,
        routeFraction: 0,
      },
    ];
  }

  const cumulativeDistances = calculateCumulativeDistances(coords);
  const totalDistanceMeters = cumulativeDistances[cumulativeDistances.length - 1];

  if (totalDistanceMeters === 0) {
    return [
      {
        id: 'sample-0001',
        index: 0,
        lat: coords[0][0],
        lng: coords[0][1],
        distanceFromOriginMeters: 0,
        routeFraction: 0,
      },
    ];
  }

  const samples: RouteSample[] = [];

  // 1. Initial sample at exact origin
  samples.push({
    id: 'sample-0001',
    index: 0,
    lat: coords[0][0],
    lng: coords[0][1],
    distanceFromOriginMeters: 0,
    routeFraction: 0,
  });

  let targetDistance = intervalMeters;
  let currentSegmentIdx = 0;
  let sampleIndex = 1;

  while (targetDistance < totalDistanceMeters && currentSegmentIdx < coords.length - 1) {
    const dStart = cumulativeDistances[currentSegmentIdx];
    const dEnd = cumulativeDistances[currentSegmentIdx + 1];

    if (targetDistance > dEnd) {
      currentSegmentIdx++;
      continue;
    }

    const segLength = dEnd - dStart;
    const factor = segLength > 0 ? (targetDistance - dStart) / segLength : 0;

    const p1 = coords[currentSegmentIdx];
    const p2 = coords[currentSegmentIdx + 1];

    const lat = Math.round((p1[0] + (p2[0] - p1[0]) * factor) * 1e6) / 1e6;
    const lng = Math.round((p1[1] + (p2[1] - p1[1]) * factor) * 1e6) / 1e6;

    samples.push({
      id: `sample-${String(sampleIndex + 1).padStart(4, '0')}`,
      index: sampleIndex,
      lat,
      lng,
      distanceFromOriginMeters: Math.round(targetDistance * 10) / 10,
      routeFraction: Math.round((targetDistance / totalDistanceMeters) * 10000) / 10000,
    });

    sampleIndex++;
    targetDistance += intervalMeters;
  }

  // 2. Final sample at exact destination
  const lastCoord = coords[coords.length - 1];
  samples.push({
    id: `sample-${String(sampleIndex + 1).padStart(4, '0')}`,
    index: sampleIndex,
    lat: lastCoord[0],
    lng: lastCoord[1],
    distanceFromOriginMeters: Math.round(totalDistanceMeters * 10) / 10,
    routeFraction: 1.0,
  });

  return samples;
}

/**
 * Slices high-resolution polyline geometry for each segment between adjacent samples.
 */
export function createRouteSegments(
  samples: RouteSample[],
  _rawCoords?: Array<[number, number]>
): RouteSegment[] {
  if (!samples || samples.length < 2) {
    return [];
  }

  const segments: RouteSegment[] = [];

  for (let i = 0; i < samples.length - 1; i++) {
    const s1 = samples[i];
    const s2 = samples[i + 1];
    const lengthM = Math.max(0, s2.distanceFromOriginMeters - s1.distanceFromOriginMeters);

    // Approximate midpoint
    const midpoint = {
      lat: Math.round(((s1.lat + s2.lat) / 2) * 1e6) / 1e6,
      lng: Math.round(((s1.lng + s2.lng) / 2) * 1e6) / 1e6,
    };

    // Sub-geometry slice
    const segGeometry: Array<[number, number]> = [
      [s1.lat, s1.lng],
      [s2.lat, s2.lng],
    ];

    segments.push({
      id: `seg-${String(i + 1).padStart(3, '0')}`,
      index: i,
      startPoint: s1,
      endPoint: s2,
      midpoint,
      startDistanceMeters: s1.distanceFromOriginMeters,
      endDistanceMeters: s2.distanceFromOriginMeters,
      lengthMeters: Math.round(lengthM * 10) / 10,
      geometry: segGeometry,
    });
  }

  return segments;
}

/**
 * Formats distance in meters into human-readable metric string.
 * Example: 255324 -> "~255.3 km", 850 -> "850 m"
 */
export function formatDistance(meters: number): string {
  if (meters >= 1000) {
    return `~${(meters / 1000).toFixed(1)} km`;
  }
  return `${Math.round(meters)} m`;
}

/**
 * Formats duration in seconds into human-readable time string.
 * Example: 22699 -> "~6h 18m", 1856 -> "~31m"
 */
export function formatDuration(seconds: number): string {
  if (seconds <= 0) {
    return '0m';
  }

  const totalMinutes = Math.round(seconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours > 0) {
    return minutes > 0 ? `~${hours}h ${minutes}m` : `~${hours}h`;
  }

  return `~${Math.max(1, minutes)}m`;
}
