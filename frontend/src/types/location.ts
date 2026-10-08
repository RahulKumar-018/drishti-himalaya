/**
 * ==============================================================================
 * DRISHTI-HIMALAYA - LOCATION DOMAIN TYPES
 * Phase 1: Dynamic Location & Destination Selection System
 * ==============================================================================
 */

export type LocationCategory =
  | 'CITY'
  | 'TOWN'
  | 'TOURIST'
  | 'PILGRIMAGE'
  | 'MOUNTAIN'
  | 'ROUTE_NODE'
  | 'DISTRICT_CENTER'
  | 'OTHER';

export type LocationSource =
  | 'curated'
  | 'live'
  | 'map_click'
  | 'custom';

export interface LocationPoint {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  state: string;
  district?: string;
  category: LocationCategory;
  source: LocationSource;
  aliases?: string[];
  elevationM?: number;
  description?: string;
}

export interface LiveLocation {
  latitude: number;
  longitude: number;
  accuracyMeters: number;
  timestamp: number;
}

export type LocationSelectionMode = 'origin' | 'destination' | null;

export interface RouteValidationResult {
  isValid: boolean;
  error?: string;
}

export type RouteMode = 'DEFAULT_PILOT_CORRIDOR' | 'USER_SELECTED_LOCATIONS';

export interface LocationSelectionState {
  origin: LocationPoint | null;
  destination: LocationPoint | null;
  liveLocation: LiveLocation | null;
  selectionMode: LocationSelectionMode;
  tempMapPoint: LocationPoint | null;
  isLocating: boolean;
  locationError: string | null;
  isRouteReady: boolean;
  routeMode: RouteMode;
  travelDate?: string;
  departureTime?: string;
}
