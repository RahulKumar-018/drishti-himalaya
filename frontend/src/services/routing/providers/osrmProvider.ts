/**
 * ==============================================================================
 * DRISHTI-HIMALAYA - OSRM ROUTING PROVIDER
 * Phase 2: Real Road Routing + Dynamic Route Geometry
 *
 * Implements IRouteProvider using the Open Source Routing Machine (OSRM).
 * Free, open, CORS-friendly, and provides high-precision mountain road geometry
 * across Uttarakhand (NH-7, NH-107, NH-108, NH-34, etc.).
 *
 * Disclaimers:
 * - Routing provides road navigation geometry, distance, and duration estimates.
 * - It does not assess geotechnical stability or predict landslides.
 * ==============================================================================
 */

import {
  IRouteProvider,
  RouteRequest,
  RouteResult,
} from '../routeTypes';
import {
  validateAndCleanCoordinates,
  calculateRouteBounds,
  sampleRouteAtInterval,
  createRouteSegments,
  formatDistance,
  formatDuration,
} from '../routeGeometry';

const DEFAULT_OSRM_URL = 'https://router.project-osrm.org';
const REQUEST_TIMEOUT_MS = 15000;

interface OSRMResponse {
  code: string;
  message?: string;
  routes?: Array<{
    distance: number;
    duration: number;
    geometry: {
      type: string;
      coordinates: Array<[number, number]>; // OSRM gives GeoJSON: [longitude, latitude]
    };
  }>;
  waypoints?: Array<{
    name: string;
    location: [number, number]; // [lng, lat]
  }>;
}

export class OSRMProvider implements IRouteProvider {
  public readonly name = 'OSRM (OpenStreetMap)';
  private baseUrl: string;

  constructor(customBaseUrl?: string) {
    // Configurable via env var or constructor, falls back to public demo cluster
    const envUrl = (import.meta.env?.VITE_OSRM_BASE_URL as string) || '';
    this.baseUrl = (customBaseUrl || envUrl || DEFAULT_OSRM_URL).replace(/\/+$/, '');
  }

  public async fetchRoute(request: RouteRequest): Promise<RouteResult> {
    const { origin, destination, profile = 'driving', targetSampleIntervalM = 500 } = request;

    // Check basic coordinate validity
    if (
      !origin ||
      !destination ||
      typeof origin.latitude !== 'number' ||
      typeof origin.longitude !== 'number' ||
      typeof destination.latitude !== 'number' ||
      typeof destination.longitude !== 'number' ||
      !Number.isFinite(origin.latitude) ||
      !Number.isFinite(origin.longitude) ||
      !Number.isFinite(destination.latitude) ||
      !Number.isFinite(destination.longitude) ||
      origin.latitude < -90 ||
      origin.latitude > 90 ||
      origin.longitude < -180 ||
      origin.longitude > 180 ||
      destination.latitude < -90 ||
      destination.latitude > 90 ||
      destination.longitude < -180 ||
      destination.longitude > 180
    ) {
      return this.createErrorResult(
        request,
        'error',
        'Invalid coordinates provided for route origin or destination.'
      );
    }

    // Check identical coordinates
    if (
      Math.abs(origin.latitude - destination.latitude) < 1e-5 &&
      Math.abs(origin.longitude - destination.longitude) < 1e-5
    ) {
      return this.createErrorResult(
        request,
        'no_route',
        'Origin and destination cannot be the same location.'
      );
    }

    // Browser offline check
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      return this.createErrorResult(
        request,
        'error',
        'Device is offline. Please check your network connection.'
      );
    }

    // Format coordinates: OSRM expects {lng},{lat};{lng},{lat}
    const coordsParam = `${origin.longitude},${origin.latitude};${destination.longitude},${destination.latitude}`;
    const url = `${this.baseUrl}/route/v1/${profile}/${coordsParam}?overview=full&geometries=geojson`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        if (response.status === 400 || response.status === 422) {
          return this.createErrorResult(
            request,
            'no_route',
            'No road route found between selected points (coordinates may be inaccessible by road).'
          );
        }
        return this.createErrorResult(
          request,
          'error',
          `Routing service returned HTTP status ${response.status} (${response.statusText}).`
        );
      }

      const data: OSRMResponse = await response.json();

      if (data.code === 'NoRoute') {
        return this.createErrorResult(
          request,
          'no_route',
          'No drivable road route found connecting these locations in Uttarakhand.'
        );
      }

      if (data.code !== 'Ok' || !data.routes || data.routes.length === 0) {
        return this.createErrorResult(
          request,
          'error',
          data.message || `Routing provider returned code: ${data.code}`
        );
      }

      const osrmRoute = data.routes[0];
      const rawCoordinates = osrmRoute.geometry?.coordinates;

      if (!Array.isArray(rawCoordinates) || rawCoordinates.length < 2) {
        return this.createErrorResult(
          request,
          'error',
          'Routing provider returned insufficient route geometry.'
        );
      }

      // Convert GeoJSON [lng, lat] to Leaflet [lat, lng]
      const leafletCoords: Array<[number, number]> = rawCoordinates.map((pt) => [pt[1], pt[0]]);
      const cleanedGeometry = validateAndCleanCoordinates(leafletCoords);

      if (cleanedGeometry.length < 2) {
        return this.createErrorResult(
          request,
          'error',
          'Route geometry contained invalid or zero-distance coordinates.'
        );
      }

      // Calculate spatial bounds
      const bounds = calculateRouteBounds(cleanedGeometry);

      // Generate analysis samples at regular spacing (~500m)
      const samples = sampleRouteAtInterval(cleanedGeometry, targetSampleIntervalM);

      // Construct route segments from samples
      const segments = createRouteSegments(samples, cleanedGeometry);

      // Distance and duration from provider
      const distanceMeters = Math.round(osrmRoute.distance * 10) / 10;
      const durationSeconds = Math.round(osrmRoute.duration);

      const waypoints = (data.waypoints || []).map((wp) => ({
        name: wp.name || '',
        location: [wp.location[1], wp.location[0]] as [number, number],
      }));

      const result: RouteResult = {
        status: 'success',
        provider: this.name,
        origin,
        destination,
        geometry: cleanedGeometry,
        distanceMeters,
        durationSeconds,
        bounds,
        samples,
        segments,
        metrics: {
          totalDistanceMeters: distanceMeters,
          totalDistanceKm: Math.round((distanceMeters / 1000) * 10) / 10,
          totalDurationSeconds: durationSeconds,
          formattedDistance: formatDistance(distanceMeters),
          formattedDuration: formatDuration(durationSeconds),
          sampleCount: samples.length,
          segmentCount: segments.length,
        },
        waypoints,
        fetchedAt: new Date().toISOString(),
      };

      return result;
    } catch (err: unknown) {
      clearTimeout(timeoutId);

      if (err instanceof DOMException && err.name === 'AbortError') {
        return this.createErrorResult(
          request,
          'error',
          'Routing request timed out. Mountain routing servers may be experiencing high load.'
        );
      }

      const message = err instanceof Error ? err.message : 'Unknown network failure';
      return this.createErrorResult(
        request,
        'error',
        `Network error reaching routing service: ${message}`
      );
    }
  }

  private createErrorResult(
    request: RouteRequest,
    status: 'no_route' | 'error',
    errorMessage: string
  ): RouteResult {
    return {
      status,
      provider: this.name,
      origin: request.origin,
      destination: request.destination,
      geometry: [],
      distanceMeters: 0,
      durationSeconds: 0,
      bounds: [
        [request.origin.latitude, request.origin.longitude],
        [request.destination.latitude, request.destination.longitude],
      ],
      samples: [],
      segments: [],
      metrics: {
        totalDistanceMeters: 0,
        totalDistanceKm: 0,
        totalDurationSeconds: 0,
        formattedDistance: 'Unavailable',
        formattedDuration: 'Unavailable',
        sampleCount: 0,
        segmentCount: 0,
      },
      waypoints: [],
      fetchedAt: new Date().toISOString(),
      error: errorMessage,
    };
  }
}
