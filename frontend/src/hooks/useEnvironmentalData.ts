/**
 * ==============================================================================
 * DRISHTI-HIMALAYA - ENVIRONMENTAL DATA REACT HOOK
 * Manages loading, caching, error states, and on-demand refresh of corridor telemetry.
 * ==============================================================================
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  EnvironmentalData,
  getCorridorEnvironmentalData,
  DEFAULT_CORRIDOR_LATITUDE,
  DEFAULT_CORRIDOR_LONGITUDE,
} from '../services/environmental';

export interface UseEnvironmentalDataOptions {
  latitude?: number;
  longitude?: number;
  locationName?: string;
  autoFetch?: boolean;
}

export interface UseEnvironmentalDataReturn {
  data: EnvironmentalData | null;
  isLoading: boolean;
  isRefreshing: boolean;
  isError: boolean;
  error: string | null;
  lastUpdated: string | null;
  refresh: () => Promise<void>;
}

export function useEnvironmentalData(
  options: UseEnvironmentalDataOptions = {}
): UseEnvironmentalDataReturn {
  const {
    latitude = DEFAULT_CORRIDOR_LATITUDE,
    longitude = DEFAULT_CORRIDOR_LONGITUDE,
    locationName = 'NH-7 Corridor Center (Garhwal)',
    autoFetch = true,
  } = options;

  const [data, setData] = useState<EnvironmentalData | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(autoFetch);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

  // Prevent state updates if component unmounts mid-request
  const isMountedRef = useRef<boolean>(true);

  const fetchTelemetry = useCallback(
    async (forceRefresh: boolean = false) => {
      if (forceRefresh) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }
      setError(null);

      try {
        const result = await getCorridorEnvironmentalData(latitude, longitude, {
          forceRefresh,
          locationName,
        });

        if (!isMountedRef.current) return;

        if (result.status === 'success') {
          setData(result.data);
          setError(null);
          setLastUpdated(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
        } else {
          // If partial data was returned, we might still have data, but result is error
          setData(null);
          setError(result.error);
        }
      } catch (err: unknown) {
        if (!isMountedRef.current) return;
        const msg = err instanceof Error ? err.message : String(err);
        setData(null);
        setError(msg);
      } finally {
        if (isMountedRef.current) {
          setIsLoading(false);
          setIsRefreshing(false);
        }
      }
    },
    [latitude, longitude, locationName]
  );

  useEffect(() => {
    isMountedRef.current = true;
    if (autoFetch) {
      fetchTelemetry(false);
    }
    return () => {
      isMountedRef.current = false;
    };
  }, [autoFetch, fetchTelemetry]);

  const refresh = useCallback(async () => {
    await fetchTelemetry(true);
  }, [fetchTelemetry]);

  return {
    data,
    isLoading,
    isRefreshing,
    isError: error !== null || (data !== null && data.status === 'error'),
    error,
    lastUpdated,
    refresh,
  };
}
