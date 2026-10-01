/**
 * ==============================================================================
 * DRISHTI-HIMALAYA - RAINFALL & PRECIPITATION SERVICE
 * Normalizes precipitation data from public Open-Meteo meteorological endpoints.
 * ==============================================================================
 */

import { fetchEnvironmentalJson, WEATHER_API_BASE_URL } from './environmentalApi';
import {
  EnvironmentalRainfallData,
  HourlyPrecipitationPoint,
  ServiceResult,
  getWeatherDescription,
} from './types';

// Default pilot corridor center point (between Rishikesh & Joshimath)
export const DEFAULT_CORRIDOR_LATITUDE = 30.32;
export const DEFAULT_CORRIDOR_LONGITUDE = 78.92;

interface OpenMeteoForecastResponse {
  latitude: number;
  longitude: number;
  current_units?: {
    precipitation?: string;
    rain?: string;
    showers?: string;
    weather_code?: string;
  };
  current?: {
    time: string;
    precipitation?: number | null;
    rain?: number | null;
    showers?: number | null;
    weather_code?: number | null;
  };
  daily?: {
    time?: string[];
    precipitation_sum?: (number | null)[];
    precipitation_probability_max?: (number | null)[];
  };
  hourly?: {
    time?: string[];
    precipitation?: (number | null)[];
    precipitation_probability?: (number | null)[];
  };
}

export interface RainfallServiceOptions {
  forceRefresh?: boolean;
  timeoutMs?: number;
}

/**
 * Retrieves and normalizes real-time and forecast precipitation data
 * for a specific geographic coordinate.
 *
 * @param latitude Geographic latitude (-90 to 90)
 * @param longitude Geographic longitude (-180 to 180)
 * @param options Configuration options including cache bypass
 */
export async function getRainfallData(
  latitude: number = DEFAULT_CORRIDOR_LATITUDE,
  longitude: number = DEFAULT_CORRIDOR_LONGITUDE,
  options: RainfallServiceOptions = {}
): Promise<ServiceResult<EnvironmentalRainfallData>> {
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
    current: 'precipitation,rain,showers,weather_code',
    hourly: 'precipitation,precipitation_probability',
    daily: 'precipitation_sum,precipitation_probability_max',
    timezone: 'auto',
  });

  const url = `${WEATHER_API_BASE_URL}/forecast?${queryParams.toString()}`;

  const fetchResult = await fetchEnvironmentalJson<OpenMeteoForecastResponse>(url, {
    skipCache: options.forceRefresh,
    timeoutMs: options.timeoutMs,
  });

  if (fetchResult.status === 'error') {
    return fetchResult;
  }

  const raw = fetchResult.data;

  // Validate presence of essential current block
  if (!raw.current) {
    return {
      status: 'error',
      data: null,
      error: 'Incomplete meteorological payload: missing "current" conditions block.',
    };
  }

  // Parse precipitation metrics safely
  const precipitation =
    typeof raw.current.precipitation === 'number' ? raw.current.precipitation : null;
  const rain = typeof raw.current.rain === 'number' ? raw.current.rain : null;
  const showers = typeof raw.current.showers === 'number' ? raw.current.showers : null;
  const weatherCode =
    typeof raw.current.weather_code === 'number' ? raw.current.weather_code : null;

  const precipitationUnit = raw.current_units?.precipitation || 'mm';
  const weatherDescription = getWeatherDescription(weatherCode);

  // Daily summary metrics
  const dailyPrecipitationSum =
    Array.isArray(raw.daily?.precipitation_sum) &&
    typeof raw.daily.precipitation_sum[0] === 'number'
      ? raw.daily.precipitation_sum[0]
      : null;

  const dailyMaxProbability =
    Array.isArray(raw.daily?.precipitation_probability_max) &&
    typeof raw.daily.precipitation_probability_max[0] === 'number'
      ? raw.daily.precipitation_probability_max[0]
      : null;

  // Assemble the next 24 hours of hourly precipitation predictions if available
  let hourlyForecast: HourlyPrecipitationPoint[] | undefined = undefined;
  if (
    Array.isArray(raw.hourly?.time) &&
    Array.isArray(raw.hourly?.precipitation)
  ) {
    const hourlyTimes = raw.hourly.time;
    const hourlyPrecip = raw.hourly.precipitation;
    const hourlyProb = raw.hourly.precipitation_probability || [];

    // Slice up to 24 consecutive hourly forecasts
    const limit = Math.min(24, hourlyTimes.length, hourlyPrecip.length);
    const forecastPoints: HourlyPrecipitationPoint[] = [];

    for (let i = 0; i < limit; i++) {
      forecastPoints.push({
        time: hourlyTimes[i],
        precipitation: typeof hourlyPrecip[i] === 'number' ? (hourlyPrecip[i] as number) : 0,
        probability: typeof hourlyProb[i] === 'number' ? hourlyProb[i] : null,
      });
    }

    hourlyForecast = forecastPoints;
  }

  const normalized: EnvironmentalRainfallData = {
    latitude,
    longitude,
    timestamp: raw.current.time || new Date().toISOString(),
    precipitation,
    precipitationUnit,
    rain,
    showers,
    precipitationProbability: dailyMaxProbability,
    weatherCode,
    weatherDescription,
    dailyPrecipitationSum,
    hourlyForecast,
    source: 'Open-Meteo Weather API',
    fetchedAt: new Date().toISOString(),
  };

  return {
    status: 'success',
    data: normalized,
    error: null,
    fromCache: fetchResult.fromCache,
  };
}
