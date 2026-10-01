/**
 * ==============================================================================
 * DRISHTI-HIMALAYA - ELEVATION & TERRAIN SERVICE
 * Normalizes ground elevation and terrain data using Copernicus DEM (90m).
 * ==============================================================================
 */

import { fetchEnvironmentalJson, ELEVATION_API_BASE_URL } from './environmentalApi';
import {
  EnvironmentalElevationData,
  EnvironmentalElevationPoint,
  EnvironmentalElevationProfileData,
  ServiceResult,
} from './types';
import { DEFAULT_CORRIDOR_LATITUDE, DEFAULT_CORRIDOR_LONGITUDE } from './rainfallService';

interface OpenMeteoElevationResponse {
  elevation?: (number | null)[];
}

export interface ElevationServiceOptions {
  forceRefresh?: boolean;
  timeoutMs?: number;
}

/**
 * Retrieves normalized ground elevation for a single coordinate point.
 *
 * @param latitude Geographic latitude (-90 to 90)
 * @param longitude Geographic longitude (-180 to 180)
 * @param options Configuration options including cache bypass
 */
export async function getElevation(
  latitude: number = DEFAULT_CORRIDOR_LATITUDE,
  longitude: number = DEFAULT_CORRIDOR_LONGITUDE,
  options: ElevationServiceOptions = {}
): Promise<ServiceResult<EnvironmentalElevationData>> {
  // Coordinate bounds validation
  if (
    typeof latitude !== 'number' ||
    typeof longitude !== 'number' ||
    isNaN(latitude) ||
    isNaN(longitude) ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  ) {
    return {
      status: 'error',
      data: null,
      error: `Invalid coordinates: latitude=${latitude}, longitude=${longitude}. Must be valid WGS84 coordinates.`,
    };
  }

  const queryParams = new URLSearchParams({
    latitude: latitude.toString(),
    longitude: longitude.toString(),
  });

  const url = `${ELEVATION_API_BASE_URL}/elevation?${queryParams.toString()}`;

  const fetchResult = await fetchEnvironmentalJson<OpenMeteoElevationResponse>(url, {
    skipCache: options.forceRefresh,
    timeoutMs: options.timeoutMs,
  });

  if (fetchResult.status === 'error') {
    return fetchResult;
  }

  const raw = fetchResult.data;

  if (!raw || !Array.isArray(raw.elevation) || raw.elevation.length === 0) {
    return {
      status: 'error',
      data: null,
      error: 'Elevation provider returned an empty or invalid elevation dataset.',
    };
  }

  const rawElevation = raw.elevation[0];
  const elevation = typeof rawElevation === 'number' ? Math.round(rawElevation) : null;

  const normalized: EnvironmentalElevationData = {
    latitude,
    longitude,
    elevation,
    elevationUnit: 'm',
    source: 'Open-Meteo Elevation API (Copernicus DEM 90m)',
    fetchedAt: new Date().toISOString(),
  };

  return {
    status: 'success',
    data: normalized,
    error: null,
    fromCache: fetchResult.fromCache,
  };
}

/**
 * Retrieves an elevation profile across multiple corridor coordinates.
 * Supports batching up to 100 points per request to query Open-Meteo elevation endpoints efficiently.
 *
 * @param coordinates Array of latitude and longitude coordinates
 * @param options Configuration options including cache bypass
 */
export async function getElevationProfile(
  coordinates: Array<{ latitude: number; longitude: number }>,
  options: ElevationServiceOptions = {}
): Promise<ServiceResult<EnvironmentalElevationProfileData>> {
  if (!Array.isArray(coordinates) || coordinates.length === 0) {
    return {
      status: 'error',
      data: null,
      error: 'Cannot calculate elevation profile for an empty coordinate list.',
    };
  }

  // Validate coordinates
  for (let i = 0; i < coordinates.length; i++) {
    const { latitude, longitude } = coordinates[i];
    if (
      typeof latitude !== 'number' ||
      typeof longitude !== 'number' ||
      isNaN(latitude) ||
      isNaN(longitude)
    ) {
      return {
        status: 'error',
        data: null,
        error: `Invalid coordinate pair at index ${i}: [${latitude}, ${longitude}].`,
      };
    }
  }

  // Open-Meteo supports comma-separated coordinates in batches
  const BATCH_SIZE = 100;
  const allPoints: EnvironmentalElevationPoint[] = [];

  for (let i = 0; i < coordinates.length; i += BATCH_SIZE) {
    const batch = coordinates.slice(i, i + BATCH_SIZE);
    const lats = batch.map((c) => c.latitude).join(',');
    const lons = batch.map((c) => c.longitude).join(',');

    const url = `${ELEVATION_API_BASE_URL}/elevation?latitude=${lats}&longitude=${lons}`;

    const batchResult = await fetchEnvironmentalJson<OpenMeteoElevationResponse>(url, {
      skipCache: options.forceRefresh,
      timeoutMs: options.timeoutMs,
    });

    if (batchResult.status === 'error') {
      return {
        status: 'error',
        data: null,
        error: `Failed to fetch elevation batch (${i} to ${i + batch.length}): ${batchResult.error}`,
      };
    }

    const elevationList = batchResult.data?.elevation || [];

    for (let j = 0; j < batch.length; j++) {
      const elVal = elevationList[j];
      allPoints.push({
        latitude: batch[j].latitude,
        longitude: batch[j].longitude,
        elevation: typeof elVal === 'number' ? Math.round(elVal) : null,
      });
    }
  }

  const validElevations = allPoints
    .map((p) => p.elevation)
    .filter((e): e is number => typeof e === 'number');

  const minElevation = validElevations.length > 0 ? Math.min(...validElevations) : null;
  const maxElevation = validElevations.length > 0 ? Math.max(...validElevations) : null;

  const normalizedProfile: EnvironmentalElevationProfileData = {
    points: allPoints,
    minElevation,
    maxElevation,
    elevationUnit: 'm',
    source: 'Open-Meteo Elevation API (Copernicus DEM 90m)',
    fetchedAt: new Date().toISOString(),
  };

  return {
    status: 'success',
    data: normalizedProfile,
    error: null,
  };
}
