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
}

export const apiClient = new DrishtiApiClient();
