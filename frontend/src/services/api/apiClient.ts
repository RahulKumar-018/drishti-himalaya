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
  SegmentAttributionApiResponse,
  RiskPredictApiRequest,
  RiskPredictApiResponse,
  RiskZonesApiResponse,
  TripAlertApiResponse,
  MonitoringTripApiResponse,
  ReassessmentApiResponse,
} from './types';

const API_BASE_URL =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ||
  (typeof window !== 'undefined' ? '/api/v1' : 'http://127.0.0.1:8000/api/v1');

export class DrishtiApiClient {
  private baseUrl: string;

  constructor(baseUrl: string = API_BASE_URL) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  /**
   * Health check endpoint: GET /api/v1/health
   */
  async checkHealth(signal?: AbortSignal): Promise<BackendHealthResponse | null> {
    try {
      const response = await fetch(`${this.baseUrl}/health`, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal,
      });
      if (!response.ok) return null;
      return (await response.json()) as BackendHealthResponse;
    } catch {
      return null;
    }
  }

  /**
   * Route analysis endpoint: POST /api/v1/route/analyze
   */
  async analyzeRoute(
    request: RouteAnalyzeRequest,
    signal?: AbortSignal
  ): Promise<RouteAnalyzeResponse | null> {
    try {
      const response = await fetch(`${this.baseUrl}/route/analyze`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(request),
        signal,
      });
      if (!response.ok) return null;
      return (await response.json()) as RouteAnalyzeResponse;
    } catch {
      return null;
    }
  }

  /**
   * Segment Geotechnical Drilldown: GET /api/v1/hazard/segment/{segment_id}
   */
  async getSegmentDrilldown(
    segmentId: string,
    signal?: AbortSignal
  ): Promise<SegmentAttributionApiResponse | null> {
    try {
      const response = await fetch(`${this.baseUrl}/hazard/segment/${encodeURIComponent(segmentId)}`, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal,
      });
      if (!response.ok) return null;
      return (await response.json()) as SegmentAttributionApiResponse;
    } catch {
      return null;
    }
  }

  /**
   * Weather corridor summary: GET /api/v1/weather/corridor-summary
   */
  async getCorridorWeatherSummary(
    corridor: string = 'NH7',
    signal?: AbortSignal
  ): Promise<CorridorWeatherSummaryResponse | null> {
    try {
      const url = new URL(`${this.baseUrl}/weather/corridor-summary`);
      url.searchParams.set('corridor', corridor);
      const response = await fetch(url.toString(), {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal,
      });
      if (!response.ok) return null;
      return (await response.json()) as CorridorWeatherSummaryResponse;
    } catch {
      return null;
    }
  }

  /**
   * Historical OSM Road-Cuttings: GET /api/v1/hazard/cuttings
   */
  async getHistoricalCuttings(signal?: AbortSignal): Promise<{ count: number; year: number; features: unknown[] } | null> {
    try {
      const response = await fetch(`${this.baseUrl}/hazard/cuttings`, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal,
      });
      if (!response.ok) return null;
      return await response.json();
    } catch {
      return null;
    }
  }

  /**
   * Point Hazard Risk Prediction: POST /api/v1/risk/predict
   */
  async predictRisk(
    request: RiskPredictApiRequest,
    signal?: AbortSignal
  ): Promise<RiskPredictApiResponse | null> {
    try {
      const response = await fetch(`${this.baseUrl}/risk/predict`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(request),
        signal,
      });
      if (!response.ok) return null;
      return (await response.json()) as RiskPredictApiResponse;
    } catch {
      return null;
    }
  }

  /**
   * Spatial Hazard Risk Zones: GET /api/v1/risk/zones
   */
  async getRiskZones(
    params?: { min_lat?: number; max_lat?: number; min_lon?: number; max_lon?: number },
    signal?: AbortSignal
  ): Promise<RiskZonesApiResponse | null> {
    try {
      const url = new URL(`${this.baseUrl}/risk/zones`);
      if (params?.min_lat != null) url.searchParams.set('min_lat', String(params.min_lat));
      if (params?.max_lat != null) url.searchParams.set('max_lat', String(params.max_lat));
      if (params?.min_lon != null) url.searchParams.set('min_lon', String(params.min_lon));
      if (params?.max_lon != null) url.searchParams.set('max_lon', String(params.max_lon));

      const response = await fetch(url.toString(), {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal,
      });
      if (!response.ok) return null;
      return (await response.json()) as RiskZonesApiResponse;
    } catch {
      return null;
    }
  }

  /** Trip alert feed: GET /api/v1/monitoring/trips/{trip_id}/alerts */
  async getTripAlerts(tripId: string, signal?: AbortSignal): Promise<TripAlertApiResponse[] | null> {
    try {
      const response = await fetch(
        `${this.baseUrl}/monitoring/trips/${encodeURIComponent(tripId)}/alerts`,
        { method: 'GET', headers: { Accept: 'application/json' }, signal },
      );
      if (!response.ok) return null;
      return (await response.json()) as TripAlertApiResponse[];
    } catch {
      return null;
    }
  }

  async createMonitoredTrip(request: {
    origin: { latitude: number; longitude: number; name?: string };
    destination: { latitude: number; longitude: number; name?: string };
  }, signal?: AbortSignal): Promise<MonitoringTripApiResponse | null> {
    try {
      const response = await fetch(`${this.baseUrl}/monitoring/trips`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(request),
        signal,
      });
      if (!response.ok) return null;
      return (await response.json()) as MonitoringTripApiResponse;
    } catch {
      return null;
    }
  }

  async updateMonitoredTripStatus(
    tripId: string,
    status: 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'CANCELLED',
    signal?: AbortSignal,
  ): Promise<MonitoringTripApiResponse | null> {
    try {
      const response = await fetch(`${this.baseUrl}/monitoring/trips/${encodeURIComponent(tripId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ status }),
        signal,
      });
      if (!response.ok) return null;
      return (await response.json()) as MonitoringTripApiResponse;
    } catch {
      return null;
    }
  }

  async reassessMonitoredTrip(tripId: string, signal?: AbortSignal): Promise<ReassessmentApiResponse | null> {
    try {
      const response = await fetch(`${this.baseUrl}/monitoring/trips/${encodeURIComponent(tripId)}/reassess`, {
        method: 'POST',
        headers: { Accept: 'application/json' },
        signal,
      });
      if (!response.ok) return null;
      return (await response.json()) as ReassessmentApiResponse;
    } catch {
      return null;
    }
  }
}

export const apiClient = new DrishtiApiClient();
