/**
 * ==============================================================================
 * DRISHTI-HIMALAYA - ENVIRONMENTAL SERVICE FACADE
 * Unified interface for environmental telemetry data retrieval and normalization.
 * ==============================================================================
 */

import {
  EnvironmentalData,
  EnvironmentalLocation,
  ServiceResult,
  TerrainProfileMetrics,
} from './types';
import {
  getRainfallData,
  DEFAULT_CORRIDOR_LATITUDE,
  DEFAULT_CORRIDOR_LONGITUDE,
  RainfallServiceOptions,
} from './rainfallService';
import { getElevation, ElevationServiceOptions } from './elevationService';
import {
  getDenseCorridorTerrainProfile,
  TerrainProfileOptions,
} from './terrainService';
import { PILOT_CORRIDOR_COORDINATES } from './corridorConstants';

export * from './types';
export * from './environmentalApi';
export * from './rainfallService';
export * from './elevationService';
export * from './corridorConstants';
export * from './terrainService';

export interface CorridorEnvironmentalOptions
  extends RainfallServiceOptions,
    ElevationServiceOptions,
    TerrainProfileOptions {
  locationName?: string;
  corridorCoordinates?: Array<{ latitude: number; longitude: number } | [number, number]>;
}

/**
 * High-level consolidated retriever for corridor environmental telemetry.
 * Concurrently gathers rainfall, spot elevation, and dense DEM route gradient profile,
 * returning a normalized EnvironmentalData structure with strict state indicators.
 *
 * @param latitude Geographic latitude of corridor monitoring node
 * @param longitude Geographic longitude of corridor monitoring node
 * @param options Query and caching options
 */
export async function getCorridorEnvironmentalData(
  latitude: number = DEFAULT_CORRIDOR_LATITUDE,
  longitude: number = DEFAULT_CORRIDOR_LONGITUDE,
  options: CorridorEnvironmentalOptions = {}
): Promise<ServiceResult<EnvironmentalData>> {
  const location: EnvironmentalLocation = {
    latitude,
    longitude,
    name: options.locationName || 'NH-7 Corridor Center (Garhwal)',
  };

  const waypoints = options.corridorCoordinates || PILOT_CORRIDOR_COORDINATES;

  // Run independent environmental queries concurrently
  const [rainfallResult, elevationResult, terrainProfileResult] = await Promise.all([
    getRainfallData(latitude, longitude, options),
    getElevation(latitude, longitude, options),
    getDenseCorridorTerrainProfile(waypoints, {
      targetIntervalM: options.targetIntervalM,
      forceRefresh: options.forceRefresh,
      timeoutMs: options.timeoutMs,
    }),
  ]);

  const sources: string[] = [];
  const errors: string[] = [];

  const rainfallData = rainfallResult.status === 'success' ? rainfallResult.data : null;
  if (rainfallResult.status === 'success') {
    sources.push(rainfallResult.data.source);
  } else {
    errors.push(`Rainfall: ${rainfallResult.error}`);
  }

  const elevationData = elevationResult.status === 'success' ? elevationResult.data : null;
  if (elevationResult.status === 'success') {
    sources.push(elevationResult.data.source);
  } else {
    errors.push(`Elevation: ${elevationResult.error}`);
  }

  let routeProfileMetrics: TerrainProfileMetrics | null = null;
  if (terrainProfileResult.status === 'success') {
    routeProfileMetrics = terrainProfileResult.data.metrics;
    if (!sources.includes(terrainProfileResult.data.source)) {
      sources.push(terrainProfileResult.data.source);
    }
  } else {
    errors.push(`Terrain Profile: ${terrainProfileResult.error}`);
  }

  // Determine aggregate telemetry status
  let status: EnvironmentalData['status'];
  if (rainfallData && elevationData && routeProfileMetrics) {
    status = 'success';
  } else if (rainfallData || elevationData || routeProfileMetrics) {
    status = 'partial';
  } else {
    status = 'error';
  }

  const consolidated: EnvironmentalData = {
    location,
    rainfall: rainfallData,
    terrain: elevationData
      ? {
          elevation: elevationData,
          routeProfile: routeProfileMetrics,
          slopeDegrees: routeProfileMetrics?.meanRouteGradientDegrees ?? null,
          aspect: null,
          terrainRuggednessIndex: null,
        }
      : null,
    status,
    error: errors.length > 0 ? errors.join(' | ') : null,
    metadata: {
      fetchedAt: new Date().toISOString(),
      sources,
    },
  };

  if (status === 'error') {
    return {
      status: 'error',
      data: null,
      error: errors.join(' | ') || 'Failed to retrieve environmental telemetry.',
    };
  }

  return {
    status: 'success',
    data: consolidated,
    error: null,
  };
}
