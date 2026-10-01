/**
 * ==============================================================================
 * DRISHTI-HIMALAYA - ENVIRONMENTAL API CLIENT
 * Low-level HTTP fetch engine with timeouts, memory caching, and error handling.
 * ==============================================================================
 */

import { ServiceResult } from './types';

// Default configuration with Vite environment variable fallbacks
export const WEATHER_API_BASE_URL =
  import.meta.env.VITE_OPEN_METEO_WEATHER_BASE_URL || 'https://api.open-meteo.com/v1';

export const ELEVATION_API_BASE_URL =
  import.meta.env.VITE_OPEN_METEO_ELEVATION_BASE_URL || 'https://api.open-meteo.com/v1';

export const DEFAULT_TIMEOUT_MS = Number(
  import.meta.env.VITE_ENVIRONMENTAL_API_TIMEOUT_MS || 8000
);

// Cache TTL: 5 minutes in milliseconds
export const DEFAULT_CACHE_TTL_MS = 5 * 60 * 1000;

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

const memoryCache = new Map<string, CacheEntry<unknown>>();

export interface FetchOptions {
  timeoutMs?: number;
  skipCache?: boolean;
  ttlMs?: number;
}

/**
 * Clears the internal memory cache (useful for testing or full resets).
 */
export function clearEnvironmentalCache(): void {
  memoryCache.clear();
}

/**
 * Generic HTTP JSON fetcher with built-in:
 * 1. AbortController-based timeout
 * 2. In-memory TTL caching to avoid hitting rate limits
 * 3. Graceful error normalization (never throws unhandled exceptions)
 */
export async function fetchEnvironmentalJson<T>(
  url: string,
  options: FetchOptions = {}
): Promise<ServiceResult<T>> {
  const {
    timeoutMs = DEFAULT_TIMEOUT_MS,
    skipCache = false,
    ttlMs = DEFAULT_CACHE_TTL_MS,
  } = options;

  const now = Date.now();

  // Check in-memory cache if not explicitly skipped
  if (!skipCache && memoryCache.has(url)) {
    const entry = memoryCache.get(url) as CacheEntry<T>;
    if (now - entry.timestamp < ttlMs) {
      return {
        status: 'success',
        data: entry.data,
        error: null,
        fromCache: true,
      };
    } else {
      memoryCache.delete(url);
    }
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

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
      let errorDetail = response.statusText;
      try {
        const errorJson = await response.json();
        if (errorJson && typeof errorJson === 'object') {
          if ('reason' in errorJson && typeof errorJson.reason === 'string') {
            errorDetail = errorJson.reason;
          } else if ('message' in errorJson && typeof errorJson.message === 'string') {
            errorDetail = errorJson.message;
          }
        }
      } catch {
        // Fallback to HTTP status text if response is not JSON
      }

      if (response.status === 429) {
        return {
          status: 'error',
          data: null,
          error: 'Rate limit exceeded on environmental API. Please try again shortly.',
          statusCode: 429,
        };
      }

      return {
        status: 'error',
        data: null,
        error: `Environmental API HTTP ${response.status}: ${errorDetail || 'Server error'}`,
        statusCode: response.status,
      };
    }

    let parsedData: unknown;
    try {
      parsedData = await response.json();
    } catch {
      return {
        status: 'error',
        data: null,
        error: 'Malformed JSON payload received from environmental provider.',
      };
    }

    if (!parsedData || typeof parsedData !== 'object') {
      return {
        status: 'error',
        data: null,
        error: 'Invalid empty or non-object response received from environmental provider.',
      };
    }

    // Cache valid response
    memoryCache.set(url, {
      data: parsedData as T,
      timestamp: now,
    });

    return {
      status: 'success',
      data: parsedData as T,
      error: null,
      fromCache: false,
    };
  } catch (err: unknown) {
    clearTimeout(timeoutId);

    if (err instanceof DOMException && err.name === 'AbortError') {
      return {
        status: 'error',
        data: null,
        error: `Environmental API request timed out after ${timeoutMs}ms.`,
      };
    }

    if (err instanceof TypeError && err.message.toLowerCase().includes('failed to fetch')) {
      return {
        status: 'error',
        data: null,
        error: 'Network connectivity failure: Unable to reach environmental API.',
      };
    }

    const message = err instanceof Error ? err.message : String(err);
    return {
      status: 'error',
      data: null,
      error: `Unexpected environmental communication error: ${message}`,
    };
  }
}
