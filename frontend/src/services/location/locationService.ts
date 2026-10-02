/**
 * ==============================================================================
 * DRISHTI-HIMALAYA - LOCATION SERVICE
 * Phase 1: Location & Destination Selection Engine
 * ==============================================================================
 */

import { LocationPoint, LiveLocation, RouteValidationResult, LocationSource } from '../../types/location';
import { UTTARAKHAND_LOCATIONS, POPULAR_DESTINATION_IDS } from '../../data/locations/uttarakhandLocations';

/**
 * Searches the curated Uttarakhand location dataset.
 * Supports case-insensitive, whitespace-tolerant matching against names,
 * aliases, districts, and categories with relevance scoring.
 */
export function searchLocations(
  query: string,
  limit: number = 8,
  locations: LocationPoint[] = UTTARAKHAND_LOCATIONS
): LocationPoint[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return [];
  }

  interface ScoredResult {
    location: LocationPoint;
    score: number;
  }

  const results: ScoredResult[] = [];

  for (const loc of locations) {
    const nameLower = loc.name.toLowerCase();
    const districtLower = loc.district?.toLowerCase() ?? '';
    const categoryLower = loc.category.toLowerCase();
    const aliases = loc.aliases ?? [];

    let score = 0;

    if (nameLower === normalized) {
      score = 100;
    } else if (nameLower.startsWith(normalized)) {
      score = 80;
    } else if (nameLower.includes(normalized)) {
      score = 60;
    } else {
      // Check aliases
      let matchedAlias = false;
      for (const alias of aliases) {
        const aliasLower = alias.toLowerCase();
        if (aliasLower === normalized) {
          score = 75;
          matchedAlias = true;
          break;
        } else if (aliasLower.startsWith(normalized)) {
          score = 55;
          matchedAlias = true;
          break;
        } else if (aliasLower.includes(normalized)) {
          score = 45;
          matchedAlias = true;
          break;
        }
      }

      if (!matchedAlias) {
        if (districtLower.startsWith(normalized)) {
          score = 35;
        } else if (districtLower.includes(normalized)) {
          score = 25;
        } else if (categoryLower.startsWith(normalized) || categoryLower.includes(normalized)) {
          score = 15;
        }
      }
    }

    if (score > 0) {
      results.push({ location: loc, score });
    }
  }

  // Sort descending by relevance score, then alphabetical
  results.sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    return a.location.name.localeCompare(b.location.name);
  });

  return results.slice(0, limit).map((r) => r.location);
}

/**
 * Retrieves a single location by its unique ID.
 */
export function getLocationById(
  id: string,
  locations: LocationPoint[] = UTTARAKHAND_LOCATIONS
): LocationPoint | undefined {
  return locations.find((l) => l.id.toLowerCase() === id.toLowerCase());
}

/**
 * Returns popular destinations for quick selection chips.
 */
export function getPopularDestinations(
  locations: LocationPoint[] = UTTARAKHAND_LOCATIONS
): LocationPoint[] {
  const map = new Map(locations.map((l) => [l.id, l]));
  return POPULAR_DESTINATION_IDS.map((id) => map.get(id)).filter(
    (l): l is LocationPoint => l !== undefined
  );
}

/**
 * Computes great-circle distance between two coordinate pairs in kilometers (Haversine formula).
 */
export function computeDistanceKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371; // Earth radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Formats decimal coordinates into human-readable cardinal strings.
 * Example: (30.3165, 78.0322) => "30.3165° N, 78.0322° E"
 */
export function formatCoordinates(lat: number, lng: number): string {
  const latStr = `${Math.abs(lat).toFixed(4)}° ${lat >= 0 ? 'N' : 'S'}`;
  const lngStr = `${Math.abs(lng).toFixed(4)}° ${lng >= 0 ? 'E' : 'W'}`;
  return `${latStr}, ${lngStr}`;
}

/**
 * Creates a synthetic LocationPoint from arbitrary coordinates (e.g. map click, GPS).
 */
export function createLocationFromCoordinates(
  lat: number,
  lng: number,
  name?: string,
  source: LocationSource = 'map_click'
): LocationPoint {
  const coordsFormatted = formatCoordinates(lat, lng);
  const displayName = name ?? (source === 'live' ? 'Current GPS Location' : coordsFormatted);
  const idPrefix = source === 'live' ? 'gps' : 'map';
  const id = `${idPrefix}-${lat.toFixed(4)}-${lng.toFixed(4)}`;

  return {
    id,
    name: displayName,
    latitude: lat,
    longitude: lng,
    state: 'Uttarakhand',
    category: source === 'live' ? 'OTHER' : 'ROUTE_NODE',
    source,
    description: `Coordinates: ${coordsFormatted}`,
  };
}

/**
 * Validates whether origin and destination satisfy Phase 1 requirements
 * before permitting route preparation.
 */
export function validateRouteSelection(
  origin: LocationPoint | null,
  destination: LocationPoint | null
): RouteValidationResult {
  if (!origin) {
    return {
      isValid: false,
      error: 'Please select a starting location.',
    };
  }

  if (!destination) {
    return {
      isValid: false,
      error: 'Please select a destination.',
    };
  }

  // Coordinate range validation
  if (
    typeof origin.latitude !== 'number' ||
    typeof origin.longitude !== 'number' ||
    isNaN(origin.latitude) ||
    isNaN(origin.longitude) ||
    origin.latitude < -90 ||
    origin.latitude > 90 ||
    origin.longitude < -180 ||
    origin.longitude > 180
  ) {
    return {
      isValid: false,
      error: 'Start location has invalid geographic coordinates.',
    };
  }

  if (
    typeof destination.latitude !== 'number' ||
    typeof destination.longitude !== 'number' ||
    isNaN(destination.latitude) ||
    isNaN(destination.longitude) ||
    destination.latitude < -90 ||
    destination.latitude > 90 ||
    destination.longitude < -180 ||
    destination.longitude > 180
  ) {
    return {
      isValid: false,
      error: 'Destination has invalid geographic coordinates.',
    };
  }

  // Check if identical
  if (origin.id === destination.id) {
    return {
      isValid: false,
      error: 'Start and destination must be different locations.',
    };
  }

  const distKm = computeDistanceKm(
    origin.latitude,
    origin.longitude,
    destination.latitude,
    destination.longitude
  );

  // If coordinates are within 100 meters, treat as identical
  if (distKm < 0.1) {
    return {
      isValid: false,
      error: 'Start and destination are identical geographic coordinates.',
    };
  }

  return {
    isValid: true,
  };
}

/**
 * Requests the user's current geographic position via the browser Geolocation API.
 * Never called automatically; must be initiated by explicit user interaction.
 */
export function getCurrentBrowserLocation(
  options: PositionOptions = {
    enableHighAccuracy: true,
    timeout: 10000,
    maximumAge: 60000,
  },
  geolocationApi?: Geolocation
): Promise<LiveLocation> {
  return new Promise((resolve, reject) => {
    const geo =
      geolocationApi ??
      (typeof navigator !== 'undefined' ? navigator.geolocation : undefined);

    if (!geo) {
      reject(new Error('Geolocation is not supported by your browser.'));
      return;
    }

    geo.getCurrentPosition(
      (position) => {
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracyMeters: Math.round(position.coords.accuracy),
          timestamp: position.timestamp,
        });
      },
      (error) => {
        let msg = 'Unable to determine your location.';
        switch (error.code) {
          case error.PERMISSION_DENIED:
            msg = 'Location permission was denied. Please allow location access or select a location manually.';
            break;
          case error.POSITION_UNAVAILABLE:
            msg = 'Unable to determine your location. GPS or network positioning unavailable.';
            break;
          case error.TIMEOUT:
            msg = 'Location request timed out. Please try again or select manually.';
            break;
          default:
            msg = error.message || 'Unable to determine your location.';
            break;
        }
        reject(new Error(msg));
      },
      options
    );
  });
}
