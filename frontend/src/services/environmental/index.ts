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
} from './types';
import {
  getRainfallData,
  DEFAULT_CORRIDOR_LATITUDE,
  DEFAULT_CORRIDOR_LONGITUDE,
  RainfallServiceOptions,
} from './rainfallService';
import { getElevation, ElevationServiceOptions } from './elevationService';

export * from './types';
export * from './environmentalApi';
export * from './rainfallService';
export * from './elevationService';

export interface CorridorEnvironmentalOptions
  extends RainfallServiceOptions,
    ElevationServiceOptions {
  locationName?: string;
}

/**
 * High-level consolidated retriever for corridor environmental telemetry.
 * Concurrently gathers rainfall and elevation data, returning a normalized
 * EnvironmentalData structure with strict state indicators.
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

  // Run independent environmental queries concurrently
  const [rainfallResult, elevationResult] = await Promise.all([
    getRainfallData(latitude, longitude, options),
    getElevation(latitude, longitude, options),
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

  // Determine aggregate telemetry status
  let status: EnvironmentalData['status'];
  if (rainfallData && elevationData) {
    status = 'success';
  } else if (rainfallData || elevationData) {
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
          slopeDegrees: null, // Architectural slot for Phase 4
          aspect: null,       // Architectural slot for Phase 4
          terrainRuggednessIndex: null, // Architectural slot for Phase 4
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
