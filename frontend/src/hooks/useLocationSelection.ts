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
import { apiClient } from '../services/api/apiClient';
import { RouteAnalyzeResponse } from '../services/api/types';
import { adaptBackendRouteToRouteResult } from '../services/routing/backendRouteAdapter';

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

  // Trip Planning (Date & Departure Time)
  travelDate: string;
  departureTime: string;
  setTravelDate: (date: string) => void;
  setDepartureTime: (time: string) => void;

  // Authoritative Backend Route Analysis
  backendRouteAnalysis: RouteAnalyzeResponse | null;
  selectedAlternativeRouteId: string | null;
  setSelectedAlternativeRouteId: (routeId: string) => void;
  isBackendDegraded: boolean;
  backendError: string | null;

  // Routing Extensions
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

  // Trip Planning State
  const getTodayDateString = () => new Date().toISOString().split('T')[0];
  const [travelDate, setTravelDate] = useState<string>(getTodayDateString);
  const [departureTime, setDepartureTime] = useState<string>('06:00');

  // Authoritative Backend Route Analysis State
  const [backendRouteAnalysis, setBackendRouteAnalysis] = useState<RouteAnalyzeResponse | null>(null);
  const [selectedAlternativeRouteId, setSelectedAlternativeRouteIdState] = useState<string | null>(null);
  const [isBackendDegraded, setIsBackendDegraded] = useState<boolean>(false);
  const [backendError, setBackendError] = useState<string | null>(null);

  // Routing State
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
    setBackendRouteAnalysis(null);
    setSelectedAlternativeRouteIdState(null);
    setIsBackendDegraded(false);
    setBackendError(null);
  }, []);

  const setSelectedAlternativeRouteId = useCallback((routeId: string) => {
    setSelectedAlternativeRouteIdState(routeId);
    if (backendRouteAnalysis && origin && destination) {
      const selected = backendRouteAnalysis.routes.find((r) => r.route_id === routeId);
      if (selected) {
        const adapted = adaptBackendRouteToRouteResult(selected, origin, destination);
        setActiveRoute(adapted);
      }
    }
  }, [backendRouteAnalysis, origin, destination]);

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
    setBackendError(null);

    try {
      // 2. Authoritative First: Query Backend Route Hazard Engine (POST /api/v1/route/analyze)
      let backendSuccess = false;
      let adaptedBackendRoute: RouteResult | null = null;

      try {
        const backendRes = await apiClient.analyzeRoute({
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

        if (backendRes && backendRes.routes && backendRes.routes.length > 0) {
          setBackendRouteAnalysis(backendRes);
          setIsBackendDegraded(false);
          setBackendError(null);

          const primaryOrRec =
            backendRes.routes.find((r) => r.is_recommended) ||
            backendRes.routes[0];

          setSelectedAlternativeRouteIdState(primaryOrRec.route_id);
          adaptedBackendRoute = adaptBackendRouteToRouteResult(
            primaryOrRec,
            origin,
            destination
          );
          setActiveRoute(adaptedBackendRoute);
          setIsRouteReady(true);
          setRoutingStatus('success');
          backendSuccess = true;
          return { success: true, route: adaptedBackendRoute };
        }
      } catch (beErr) {
        console.warn('Backend route analysis unreachable, entering degraded fallback mode:', beErr);
      }

      // 3. Fallback: If backend is unavailable, query client-side OSRM only for basic geometry
      if (!backendSuccess) {
        setIsBackendDegraded(true);
        setBackendError(
          'Official Drishti risk analysis service is temporarily unavailable. Showing basic navigational route only — hazard scoring is offline.'
        );
        setBackendRouteAnalysis(null);

        const fallbackResult = await routeService.requestRoute({
          origin,
          destination,
          profile: 'driving',
          targetSampleIntervalM: 500,
        });

        if (fallbackResult.status === 'success') {
          // Label provider clearly so user never mistakes fallback for official risk assessment
          const degradedRoute: RouteResult = {
            ...fallbackResult,
            provider: 'OSRM (Basic Navigation Only — Risk Service Offline)',
          };
          setActiveRoute(degradedRoute);
          setIsRouteReady(true);
          setRoutingStatus('success');
          setRoutingError(null);
          return { success: true, route: degradedRoute };
        }

        // Provider reported failure
        setActiveRoute(null);
        setIsRouteReady(false);
        setRoutingStatus(fallbackResult.status);
        const errMsg = fallbackResult.error || 'Road route unavailable between selected locations.';
        setRoutingError(errMsg);
        return { success: false, error: errMsg };
      }

      return { success: false, error: 'Route analysis failed.' };
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
    await analyzeRoute();
  }, [analyzeRoute]);

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
    setTravelDate(getTodayDateString());
    setDepartureTime('06:00');
    setBackendRouteAnalysis(null);
    setSelectedAlternativeRouteIdState(null);
    setIsBackendDegraded(false);
    setBackendError(null);
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
    travelDate,
    departureTime,
    setTravelDate,
    setDepartureTime,
    backendRouteAnalysis,
    selectedAlternativeRouteId,
    setSelectedAlternativeRouteId,
    isBackendDegraded,
    backendError,
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
