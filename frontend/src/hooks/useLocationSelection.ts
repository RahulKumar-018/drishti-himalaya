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
      // 2. Fetch real road routing via RouteService
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
  }, [origin, destination]);

  const retryRouting = useCallback(async () => {
    if (!origin || !destination) return;
    setIsRouting(true);
    setRoutingStatus('loading');
    setRoutingError(null);

    try {
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
  }, [origin, destination]);

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
