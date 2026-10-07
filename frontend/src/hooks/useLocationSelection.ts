/**
 * ==============================================================================
 * DRISHTI-HIMALAYA - USE LOCATION SELECTION HOOK
 * Phase 1 & 2: Dynamic Location Selection & Real Road Routing
 * ==============================================================================
 */

import { useState, useCallback } from 'react';
import {
  LocationPoint,
  LiveLocation,
  LocationSelectionMode,
  RouteMode,
} from '../types/location';
import {
  validateRouteSelection,
  getCurrentBrowserLocation,
  createLocationFromCoordinates,
} from '../services/location/locationService';
import {
  RouteResult,
  RouteStatus,
} from '../services/routing/routeTypes';
import { routeService } from '../services/routing/routeService';
import { apiClient } from '../services/api';
import { RouteAnalyzeResponse } from '../services/api/types';

export interface UseLocationSelectionReturn {
  origin: LocationPoint | null;
  destination: LocationPoint | null;
  liveLocation: LiveLocation | null;
  selectionMode: LocationSelectionMode;
  tempMapPoint: LocationPoint | null;
  isLocating: boolean;
  locationError: string | null;
  isRouteReady: boolean;
  routeMode: RouteMode;
  validationError: string | null;

  // Phase 2 Routing Extensions
  activeRoute: RouteResult | null;
  isRouting: boolean;
  routingStatus: RouteStatus;
  routingError: string | null;

  setOrigin: (point: LocationPoint | null) => void;
  setDestination: (point: LocationPoint | null) => void;
  swapLocations: () => void;
  useLiveLocationAsOrigin: () => Promise<void>;
  startMapSelection: (mode: 'origin' | 'destination') => void;
  cancelMapSelection: () => void;
  handleMapClick: (lat: number, lng: number) => void;
  confirmTempMapPoint: () => void;
  cancelTempMapPoint: () => void;
  analyzeRoute: () => Promise<{ success: boolean; error?: string; route?: RouteResult }>;
  retryRouting: () => Promise<void>;
  resetSelection: () => void;
}

export function useLocationSelection(): UseLocationSelectionReturn {
  const [origin, setOriginState] = useState<LocationPoint | null>(null);
  const [destination, setDestinationState] = useState<LocationPoint | null>(null);
  const [liveLocation, setLiveLocation] = useState<LiveLocation | null>(null);
  const [selectionMode, setSelectionMode] = useState<LocationSelectionMode>(null);
  const [tempMapPoint, setTempMapPoint] = useState<LocationPoint | null>(null);
  const [isLocating, setIsLocating] = useState<boolean>(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [isRouteReady, setIsRouteReady] = useState<boolean>(false);

  // Phase 2 Routing State
  const [activeRoute, setActiveRoute] = useState<RouteResult | null>(null);
  const [isRouting, setIsRouting] = useState<boolean>(false);
  const [routingStatus, setRoutingStatus] = useState<RouteStatus>('idle');
  const [routingError, setRoutingError] = useState<string | null>(null);

  const routeMode: RouteMode =
    origin || destination || isRouteReady || activeRoute
      ? 'USER_SELECTED_LOCATIONS'
      : 'DEFAULT_PILOT_CORRIDOR';

  const clearRoutingState = useCallback(() => {
    setActiveRoute(null);
    setIsRouteReady(false);
    setRoutingStatus('idle');
    setRoutingError(null);
    setValidationError(null);
  }, []);

  const setOrigin = useCallback((point: LocationPoint | null) => {
    setOriginState(point);
    clearRoutingState();
  }, [clearRoutingState]);

  const setDestination = useCallback((point: LocationPoint | null) => {
    setDestinationState(point);
    clearRoutingState();
  }, [clearRoutingState]);

  const swapLocations = useCallback(() => {
    setOriginState((prevOrigin) => {
      setDestinationState(prevOrigin);
      return destination;
    });
    clearRoutingState();
  }, [destination, clearRoutingState]);

  const useLiveLocationAsOrigin = useCallback(async () => {
    setIsLocating(true);
    setLocationError(null);
    clearRoutingState();

    try {
      const live = await getCurrentBrowserLocation();
      setLiveLocation(live);

      const locPoint = createLocationFromCoordinates(
        live.latitude,
        live.longitude,
        `My Location (±${live.accuracyMeters}m)`,
        'live'
      );

      setOriginState(locPoint);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unable to acquire GPS location.';
      setLocationError(msg);
    } finally {
      setIsLocating(false);
    }
  }, [clearRoutingState]);

  const startMapSelection = useCallback((mode: 'origin' | 'destination') => {
    setSelectionMode(mode);
    setTempMapPoint(null);
    setLocationError(null);
    setValidationError(null);
  }, []);

  const cancelMapSelection = useCallback(() => {
    setSelectionMode(null);
    setTempMapPoint(null);
  }, []);

  const handleMapClick = useCallback((lat: number, lng: number) => {
    const tempPoint = createLocationFromCoordinates(
      lat,
      lng,
      undefined,
      'map_click'
    );
    setTempMapPoint(tempPoint);
  }, []);

  const confirmTempMapPoint = useCallback(() => {
    if (!tempMapPoint || !selectionMode) {
      return;
    }

    if (selectionMode === 'origin') {
      setOriginState(tempMapPoint);
    } else if (selectionMode === 'destination') {
      setDestinationState(tempMapPoint);
    }

    setTempMapPoint(null);
    setSelectionMode(null);
    clearRoutingState();
  }, [tempMapPoint, selectionMode, clearRoutingState]);

  const cancelTempMapPoint = useCallback(() => {
    setTempMapPoint(null);
  }, []);

  const buildRouteResultFromBackend = useCallback((
    analysis: RouteAnalyzeResponse,
    originPt: LocationPoint,
    destPt: LocationPoint
  ): RouteResult | null => {
    if (!analysis.routes || analysis.routes.length === 0) {
      return null;
    }
    const primaryRoute = analysis.routes[0];
    const features = primaryRoute.geojson?.features || [];

    const geometry: [number, number][] = [];
    let minLat = 90, maxLat = -90, minLng = 180, maxLng = -180;
    let minElev: number | null = null;
    let maxElev: number | null = null;
    let maxSlope: number | null = null;
    let elevCount = 0;

    for (const f of features) {
      if (f.properties.elevation_m !== null && f.properties.elevation_m !== undefined) {
        elevCount++;
        if (minElev === null || f.properties.elevation_m < minElev) minElev = f.properties.elevation_m;
        if (maxElev === null || f.properties.elevation_m > maxElev) maxElev = f.properties.elevation_m;
      }
      if (f.properties.slope_degrees !== null && f.properties.slope_degrees !== undefined) {
        if (maxSlope === null || f.properties.slope_degrees > maxSlope) maxSlope = f.properties.slope_degrees;
      }
      for (const pt of f.geometry.coordinates) {
        const lat = pt[1];
        const lng = pt[0];
        geometry.push([lat, lng]);
        if (lat < minLat) minLat = lat;
        if (lat > maxLat) maxLat = lat;
        if (lng < minLng) minLng = lng;
        if (lng > maxLng) maxLng = lng;
      }
    }

    if (geometry.length === 0) {
      minLat = Math.min(originPt.latitude, destPt.latitude);
      maxLat = Math.max(originPt.latitude, destPt.latitude);
      minLng = Math.min(originPt.longitude, destPt.longitude);
      maxLng = Math.max(originPt.longitude, destPt.longitude);
    }

    const bounds: [[number, number], [number, number]] = [
      [minLat, minLng],
      [maxLat, maxLng],
    ];

    const totalDistanceKm = primaryRoute.total_distance_km;
    const totalDurationMin = primaryRoute.estimated_time_minutes;
    const hours = Math.floor(totalDurationMin / 60);
    const mins = Math.round(totalDurationMin % 60);

    const routeSegments = features.map((f, idx) => {
      const coords = f.geometry.coordinates.map((pt) => [pt[1], pt[0]] as [number, number]);
      const startCoord = coords[0] || [originPt.latitude, originPt.longitude];
      const endCoord = coords[coords.length - 1] || startCoord;
      const midLat = f.properties.midpoint ? f.properties.midpoint[1] : (startCoord[0] + endCoord[0]) / 2;
      const midLng = f.properties.midpoint ? f.properties.midpoint[0] : (startCoord[1] + endCoord[1]) / 2;

      return {
        id: f.id || `seg_${idx}`,
        index: f.properties.segment_index ?? idx,
        startPoint: {
          id: `sample_${idx}_start`,
          index: idx,
          lat: startCoord[0],
          lng: startCoord[1],
          distanceFromOriginMeters: (f.properties.start_km ?? 0) * 1000,
          routeFraction: totalDistanceKm > 0 ? (f.properties.start_km ?? 0) / totalDistanceKm : 0,
          elevationM: f.properties.elevation_m,
        },
        endPoint: {
          id: `sample_${idx}_end`,
          index: idx + 1,
          lat: endCoord[0],
          lng: endCoord[1],
          distanceFromOriginMeters: (f.properties.end_km ?? 0) * 1000,
          routeFraction: totalDistanceKm > 0 ? (f.properties.end_km ?? 0) / totalDistanceKm : 1,
          elevationM: f.properties.elevation_m,
        },
        midpoint: { lat: midLat, lng: midLng },
        startDistanceMeters: (f.properties.start_km ?? 0) * 1000,
        endDistanceMeters: (f.properties.end_km ?? 0) * 1000,
        lengthMeters: f.properties.segment_length_m,
        geometry: coords,
        startElevationM: f.properties.elevation_m,
        endElevationM: f.properties.elevation_m,
        gradientDegrees: f.properties.slope_degrees,
      };
    });

    return {
      status: 'success' as const,
      provider: `Risk Engine (${analysis.data_provenance?.routing_source || 'OpenRouteService'})`,
      origin: originPt,
      destination: destPt,
      geometry,
      distanceMeters: Math.round(totalDistanceKm * 1000),
      durationSeconds: Math.round(totalDurationMin * 60),
      bounds,
      samples: [],
      segments: routeSegments,
      metrics: {
        totalDistanceMeters: Math.round(totalDistanceKm * 1000),
        totalDistanceKm: totalDistanceKm,
        totalDurationSeconds: Math.round(totalDurationMin * 60),
        formattedDistance: `~${totalDistanceKm.toFixed(1)} km`,
        formattedDuration: hours > 0 ? `${hours}h ${mins}m` : `${mins}m`,
        sampleCount: features.length,
        segmentCount: features.length,
        elevationMin: minElev,
        elevationMax: maxElev,
        peakGradientDegrees: maxSlope,
        peakGradientPercent: maxSlope !== null ? Math.round(Math.tan((maxSlope * Math.PI) / 180) * 100) : null,
        elevationCoverageRatio: `${elevCount}/${features.length} Segments`,
      },
      waypoints: [
        { name: originPt.name, location: [originPt.latitude, originPt.longitude] },
        { name: destPt.name, location: [destPt.latitude, destPt.longitude] },
      ],
      fetchedAt: new Date().toISOString(),
      analyzedRoute: primaryRoute,
      analysisResponse: analysis,
    };
  }, []);

  const analyzeRoute = useCallback(async (): Promise<{
    success: boolean;
    error?: string;
    route?: RouteResult;
  }> => {
    // 1. Validate coordinate selection
    const validation = validateRouteSelection(origin, destination);
    if (!validation.isValid || !origin || !destination) {
      const errMsg = validation.error ?? 'Invalid route selection.';
      setValidationError(errMsg);
      setIsRouteReady(false);
      setActiveRoute(null);
      setRoutingStatus('error');
      return { success: false, error: errMsg };
    }

    setValidationError(null);
    setIsRouting(true);
    setRoutingStatus('loading');
    setRoutingError(null);

    try {
      // 2a. Attempt real backend route analysis with ~250m segmentation & deterministic MCDA
      try {
        const backendAnalysis = await apiClient.analyzeRoute({
          origin: {
            latitude: origin.latitude,
            longitude: origin.longitude,
            name: origin.name,
          },
          destination: {
            latitude: destination.latitude,
            longitude: destination.longitude,
            name: destination.name,
          },
          preference_weight_safety: 0.5,
        });

        if (backendAnalysis && backendAnalysis.routes && backendAnalysis.routes.length > 0) {
          const analyzedRouteResult = buildRouteResultFromBackend(backendAnalysis, origin, destination);
          if (analyzedRouteResult) {
            setActiveRoute(analyzedRouteResult);
            setIsRouteReady(true);
            setRoutingStatus('success');
            setRoutingError(null);
            return { success: true, route: analyzedRouteResult };
          }
        }
      } catch (backendErr) {
        // Continue to RouteService fallback
      }

      // 2b. Graceful fallback to client RouteService
      const result = await routeService.requestRoute({
        origin,
        destination,
        profile: 'driving',
        targetSampleIntervalM: 500,
      });

      if (result.status === 'success') {
        setActiveRoute(result);
        setIsRouteReady(true);
        setRoutingStatus('success');
        setRoutingError(null);
        return { success: true, route: result };
      }

      // Handle provider-reported failure
      setActiveRoute(null);
      setIsRouteReady(false);
      setRoutingStatus(result.status);
      const errMsg = result.error || 'Road route unavailable between selected locations.';
      setRoutingError(errMsg);
      return { success: false, error: errMsg };
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : 'Routing service error.';
      setActiveRoute(null);
      setIsRouteReady(false);
      setRoutingStatus('error');
      setRoutingError(errMsg);
      return { success: false, error: errMsg };
    } finally {
      setIsRouting(false);
    }
  }, [origin, destination, buildRouteResultFromBackend]);

  const retryRouting = useCallback(async () => {
    if (!origin || !destination) return;
    setIsRouting(true);
    setRoutingStatus('loading');
    setRoutingError(null);

    try {
      try {
        const backendAnalysis = await apiClient.analyzeRoute({
          origin: {
            latitude: origin.latitude,
            longitude: origin.longitude,
            name: origin.name,
          },
          destination: {
            latitude: destination.latitude,
            longitude: destination.longitude,
            name: destination.name,
          },
          preference_weight_safety: 0.5,
        });

        if (backendAnalysis && backendAnalysis.routes && backendAnalysis.routes.length > 0) {
          const analyzedRouteResult = buildRouteResultFromBackend(backendAnalysis, origin, destination);
          if (analyzedRouteResult) {
            setActiveRoute(analyzedRouteResult);
            setIsRouteReady(true);
            setRoutingStatus('success');
            setRoutingError(null);
            return;
          }
        }
      } catch (backendErr) {
        // Fallback to routeService
      }

      const result = await routeService.requestRoute(
        {
          origin,
          destination,
          profile: 'driving',
          targetSampleIntervalM: 500,
        },
        { forceRefresh: true }
      );

      if (result.status === 'success') {
        setActiveRoute(result);
        setIsRouteReady(true);
        setRoutingStatus('success');
        setRoutingError(null);
      } else {
        setActiveRoute(null);
        setIsRouteReady(false);
        setRoutingStatus(result.status);
        setRoutingError(result.error || 'Road route unavailable.');
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : 'Network error during retry.';
      setActiveRoute(null);
      setIsRouteReady(false);
      setRoutingStatus('error');
      setRoutingError(errMsg);
    } finally {
      setIsRouting(false);
    }
  }, [origin, destination, buildRouteResultFromBackend]);

  const resetSelection = useCallback(() => {
    setOriginState(null);
    setDestinationState(null);
    setLiveLocation(null);
    setSelectionMode(null);
    setTempMapPoint(null);
    setIsLocating(false);
    setLocationError(null);
    setValidationError(null);
    setIsRouteReady(false);
    setActiveRoute(null);
    setIsRouting(false);
    setRoutingStatus('idle');
    setRoutingError(null);
  }, []);

  return {
    origin,
    destination,
    liveLocation,
    selectionMode,
    tempMapPoint,
    isLocating,
    locationError,
    isRouteReady,
    routeMode,
    validationError,
    activeRoute,
    isRouting,
    routingStatus,
    routingError,
    setOrigin,
    setDestination,
    swapLocations,
    useLiveLocationAsOrigin,
    startMapSelection,
    cancelMapSelection,
    handleMapClick,
    confirmTempMapPoint,
    cancelTempMapPoint,
    analyzeRoute,
    retryRouting,
    resetSelection,
  };
}
