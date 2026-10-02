/**
 * ==============================================================================
 * DRISHTI-HIMALAYA - ROUTE SERVICE (ORCHESTRATOR & FACADE)
 * Phase 2: Real Road Routing + Dynamic Route Geometry
 *
 * Coordinates routing providers, geometry sampling, in-memory caching,
 * and elevation telemetry enrichment.
 * ==============================================================================
 */

import {
  IRouteProvider,
  RouteRequest,
  RouteResult,
} from './routeTypes';
import { OSRMProvider } from './providers/osrmProvider';
import { enrichRouteWithElevation } from './routeElevation';

export interface RouteServiceOptions {
  enrichElevation?: boolean;
  forceRefresh?: boolean;
  timeoutMs?: number;
}

export class RouteService {
  private provider: IRouteProvider;
  private cache: Map<string, RouteResult> = new Map();

  constructor(defaultProvider?: IRouteProvider) {
    this.provider = defaultProvider || new OSRMProvider();
  }

  /**
   * Set or swap the underlying routing provider (e.g. OSRM, ORS, or mock for testing).
   */
  public setProvider(provider: IRouteProvider): void {
    this.provider = provider;
  }

  /**
   * Get the current provider name.
   */
  public getProviderName(): string {
    return this.provider.name;
  }

  /**
   * Clears the in-memory route cache.
   */
  public clearCache(): void {
    this.cache.clear();
  }

  /**
   * Computes cache key for an origin-destination pair.
   */
  private getCacheKey(request: RouteRequest): string {
    const o = request.origin;
    const d = request.destination;
    const oStr = `${o.latitude.toFixed(5)},${o.longitude.toFixed(5)}`;
    const dStr = `${d.latitude.toFixed(5)},${d.longitude.toFixed(5)}`;
    const prof = request.profile || 'driving';
    const interval = request.targetSampleIntervalM || 500;
    return `${this.provider.name}:${prof}:${oStr}->${dStr}:interval=${interval}`;
  }

  /**
   * Requests a road route between origin and destination, performs coordinate validation,
   * samples at regular intervals (~500m), and enriches with DEM elevation.
   *
   * @param request Route origin, destination, profile, and sampling parameters.
   * @param options Execution options (caching, elevation enrichment, timeouts).
   */
  public async requestRoute(
    request: RouteRequest,
    options: RouteServiceOptions = {}
  ): Promise<RouteResult> {
    const { enrichElevation = true, forceRefresh = false, timeoutMs } = options;

    const cacheKey = this.getCacheKey(request);

    // 1. Check cache
    if (!forceRefresh && this.cache.has(cacheKey)) {
      const cached = this.cache.get(cacheKey)!;
      return cached;
    }

    // 2. Fetch raw road route from provider
    const baseResult = await this.provider.fetchRoute(request);

    if (baseResult.status !== 'success') {
      return baseResult;
    }

    // 3. Enrich with DEM elevation telemetry if requested
    let finalResult = baseResult;
    if (enrichElevation) {
      try {
        finalResult = await enrichRouteWithElevation(baseResult, { timeoutMs });
      } catch (elevErr) {
        console.warn('Route elevation enrichment encountered error:', elevErr);
        // Base route remains completely valid even if DEM enrichment fails
      }
    }

    // 4. Cache successful result
    this.cache.set(cacheKey, finalResult);

    return finalResult;
  }
}

// Export singleton instance for app-wide use
export const routeService = new RouteService();
