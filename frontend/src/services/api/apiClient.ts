/**
 * ==============================================================================
 * DRISHTI-HIMALAYA - BACKEND REST API CLIENT
 * Typed client service boundary preparing for future FastAPI backend integration.
 * Aligned strictly with API_SPEC.md.
 * ==============================================================================
 */

import {
  RouteAnalyzeRequest,
  RouteAnalyzeResponse,
  CorridorWeatherSummaryResponse,
  BackendHealthResponse,
} from './types';

const API_BASE_URL =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ||
  'http://localhost:8000/api/v1';

export class DrishtiApiClient {
  private baseUrl: string;

  constructor(baseUrl: string = API_BASE_URL) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  /**
   * Health check endpoint: GET /api/v1/health
   */
  async checkHealth(): Promise<BackendHealthResponse | null> {
    try {
      const response = await fetch(`${this.baseUrl}/health`, {
        method: 'GET',
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) return null;
      return (await response.json()) as BackendHealthResponse;
    } catch {
      // Backend is offline or not started yet
      return null;
    }
  }

  /**
   * Route analysis endpoint: POST /api/v1/route/analyze
   */
  async analyzeRoute(
    request: RouteAnalyzeRequest
  ): Promise<RouteAnalyzeResponse | null> {
    try {
      const response = await fetch(`${this.baseUrl}/route/analyze`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(request),
      });
      if (!response.ok) return null;
      return (await response.json()) as RouteAnalyzeResponse;
    } catch {
      // Graceful fallback when backend is not yet running
      return null;
    }
  }

  /**
   * Weather corridor summary: GET /api/v1/weather/corridor-summary
   */
  async getCorridorWeatherSummary(): Promise<CorridorWeatherSummaryResponse | null> {
    try {
      const response = await fetch(`${this.baseUrl}/weather/corridor-summary`, {
        method: 'GET',
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) return null;
      return (await response.json()) as CorridorWeatherSummaryResponse;
    } catch {
      return null;
    }
  }

  /**
   * Point Hazard Risk Prediction: POST /api/v1/risk/predict
   */
  async predictRisk(
    request: import('./types').RiskPredictApiRequest
  ): Promise<import('./types').RiskPredictApiResponse | null> {
    try {
      const response = await fetch(`${this.baseUrl}/risk/predict`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(request),
      });
      if (!response.ok) return null;
      return (await response.json()) as import('./types').RiskPredictApiResponse;
    } catch {
      return null;
    }
  }

  /**
   * Spatial Hazard Risk Zones: GET /api/v1/risk/zones
   */
  async getRiskZones(
    params?: { min_lat?: number; max_lat?: number; min_lon?: number; max_lon?: number }
  ): Promise<import('./types').RiskZonesApiResponse | null> {
    try {
      const url = new URL(`${this.baseUrl}/risk/zones`);
      if (params?.min_lat != null) url.searchParams.set('min_lat', String(params.min_lat));
      if (params?.max_lat != null) url.searchParams.set('max_lat', String(params.max_lat));
      if (params?.min_lon != null) url.searchParams.set('min_lon', String(params.min_lon));
      if (params?.max_lon != null) url.searchParams.set('max_lon', String(params.max_lon));

      const response = await fetch(url.toString(), {
        method: 'GET',
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) return null;
      return (await response.json()) as import('./types').RiskZonesApiResponse;
    } catch {
      return null;
    }
  }
}

export const apiClient = new DrishtiApiClient();
