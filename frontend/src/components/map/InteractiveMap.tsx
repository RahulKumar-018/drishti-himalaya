import React, { useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import {
  MapContainer,
  TileLayer,
  Polyline,
  Polygon,
  CircleMarker,
  Marker,
  Popup,
  Tooltip,
  Circle,
  useMap,
  useMapEvents,
} from 'react-leaflet';
import L from 'leaflet';
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';
import {
  Navigation,
  Crosshair,
  RotateCcw,
  MapPin,
  Flag,
  Loader2,
  MousePointer,
  Radio,
  Route,
  History,
  ShieldAlert,
  AlertTriangle,
} from 'lucide-react';
import {
  PILOT_CORRIDOR_COORDINATES,
  RISHIKESH_COORDS,
  JOSHIMATH_COORDS,
  DEFAULT_CORRIDOR_CENTER as CORRIDOR_CENTER,
  PILOT_CORRIDOR_CHORD_DISTANCE_KM,
  PILOT_CORRIDOR_PHYSICAL_ROAD_KM,
} from '../../services/environmental/corridorConstants';
import {
  CorridorSegmentRisk,
  calculateCorridorSegmentRisks,
} from '../../services/risk/segmentRiskService';
import { LocationPoint, LiveLocation, LocationSelectionMode } from '../../types/location';
import { formatCoordinates } from '../../services/location/locationService';
import { RouteResult } from '../../services/routing/routeTypes';
import { UTTARAKHAND_LOCATIONS, POPULAR_DESTINATION_IDS } from '../../data/locations/uttarakhandLocations';
import { RiskLegend } from './RiskLegend';
import './InteractiveMap.css';

// Fix default Leaflet asset URL resolution in bundlers
delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown })._getIconUrl;
L.Icon.Default.mergeOptions({
  iconUrl: markerIcon,
  iconRetinaUrl: markerIcon2x,
  shadowUrl: markerShadow,
});

// MapTiler Topo-v4 Configuration with OpenStreetMap Fallback
const MAPTILER_API_KEY = (import.meta.env.VITE_MAPTILER_API_KEY || '').trim();
const hasMapTilerKey = Boolean(MAPTILER_API_KEY);

const MAPTILER_TOPO_URL = `https://api.maptiler.com/maps/topo-v4/256/{z}/{x}/{y}.png?key=${MAPTILER_API_KEY}`;
const MAPTILER_ATTRIBUTION =
  '<a href="https://www.maptiler.com/copyright/" target="_blank" rel="noopener noreferrer">&copy; MapTiler</a> <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">&copy; OpenStreetMap contributors</a>';

const OSM_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
const OSM_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors';

// Backend API Endpoints for GIS Layers
const API_BASE_URL =
  (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, '') ||
  (typeof window !== 'undefined' ? '/api/v1' : 'http://127.0.0.1:8000/api/v1');

const HISTORICAL_CUTTINGS_API_URL = `${API_BASE_URL}/hazard/cuttings`;
const RISK_ZONES_API_URL = `${API_BASE_URL}/risk/zones`;
const LANDSLIDE_SCARS_API_URL = `${API_BASE_URL}/hazard/landslides?limit=80`;

/**
 * Historical OSM Road-Cutting Feature (2018 historical snapshot)
 * Represents excavated highway/path cuts extracted from OSM historical data.
 */
export interface HistoricalCuttingTags {
  cutting?: string;
  highway?: string;
  surface?: string;
  lanes?: string;
  [key: string]: string | undefined;
}

export interface HistoricalCuttingFeature {
  id: number;
  tags: HistoricalCuttingTags;
  coordinates: [number, number][]; // [longitude, latitude] as returned by backend API
}

export interface HistoricalCuttingsResponse {
  count: number;
  year: number;
  source: string;
  features: HistoricalCuttingFeature[];
}

export interface SpatialRiskZoneFeature {
  type: 'Feature';
  geometry: {
    type: 'Polygon';
    coordinates: number[][][]; // [[[lon, lat], ...]]
  };
  properties: {
    zone_id: string;
    zone_name: string;
    risk_score: number;
    risk_level: string;
    color_hex: string;
    factors: {
      rainfall?: number;
      slope?: number;
      terrain?: number;
      historical?: number;
    };
    disclaimer?: string;
  };
}

export interface GSILandslideFeature {
  type: 'Feature';
  id: string | number;
  geometry: {
    type: 'Point';
    coordinates: [number, number]; // [lon, lat]
  };
  properties: {
    SLIDE_NO?: string;
    LATITUDE?: number;
    LONGITUDE?: number;
    DISTRICT?: string;
    STATE?: string;
    TRIGGERING?: string;
    FAILURE_MECHANISM?: string;
    MATERIAL_TYPE?: string;
    LS_AREA?: number;
    CITATION?: string;
    [key: string]: any;
  };
}

// Default Garhwal Himalayan Overview Coordinates
const HIMALAYAN_DEFAULT_CENTER: [number, number] = [30.38, 79.12];
const HIMALAYAN_DEFAULT_ZOOM = 9;

/**
 * Himalayan Hazard Observation Stations
 * Strategic disaster telemetry and slope monitoring stations across Garhwal Uttarakhand.
 */
export interface HazardStation {
  id: string;
  name: string;
  code: string;
  latitude: number;
  longitude: number;
  elevationM: number;
  district: string;
  riverBasin: string;
  riskTier: 'LOW' | 'MODERATE' | 'HIGH';
  riskScore: number;
  hazardNote: string;
  sensors: string;
}

const HIMALAYAN_OBSERVATION_STATIONS: readonly HazardStation[] = [
  {
    id: 'st-01',
    name: 'Rishikesh Foothill Gateway',
    code: 'DH-RSK',
    latitude: 30.0869,
    longitude: 78.2676,
    elevationM: 340,
    district: 'Dehradun / Tehri',
    riverBasin: 'Ganga Mainstem',
    riskTier: 'LOW',
    riskScore: 14.2,
    hazardNote: 'Foothill fluvial stability and transit gateway',
    sensors: 'Telemetry Rain Gauge · Seismic Accelerometer',
  },
  {
    id: 'st-02',
    name: 'Devprayag Confluence Station',
    code: 'DH-DEV',
    latitude: 30.1459,
    longitude: 78.5986,
    elevationM: 480,
    district: 'Tehri / Pauri',
    riverBasin: 'Bhagirathi & Alaknanda Sangam',
    riskTier: 'LOW',
    riskScore: 21.8,
    hazardNote: 'Gorge toe erosion & cut-slope joint fractures',
    sensors: 'River Stage Monitor · Open-Meteo Telemetry',
  },
  {
    id: 'st-03',
    name: 'Srinagar Valley Alignment',
    code: 'DH-SRN',
    latitude: 30.2224,
    longitude: 78.7844,
    elevationM: 560,
    district: 'Pauri Garhwal',
    riverBasin: 'Alaknanda Broad Basin',
    riskTier: 'LOW',
    riskScore: 16.5,
    hazardNote: 'Alluvial terrace scour & drainage balance',
    sensors: 'Hydrological Radar · Automated Weather Station',
  },
  {
    id: 'st-04',
    name: 'Rudraprayag Sangam Choke',
    code: 'DH-RUD',
    latitude: 30.2844,
    longitude: 78.9811,
    elevationM: 610,
    district: 'Rudraprayag',
    riverBasin: 'Alaknanda & Mandakini Sangam',
    riskTier: 'MODERATE',
    riskScore: 36.4,
    hazardNote: 'Steep canyon cliff erosion & dual basin runoff',
    sensors: 'Tiltmeter Array · Precipitation Stream',
  },
  {
    id: 'st-05',
    name: 'Karnaprayag Confluence',
    code: 'DH-KRN',
    latitude: 30.2573,
    longitude: 79.2157,
    elevationM: 780,
    district: 'Chamoli',
    riverBasin: 'Alaknanda & Pindar Sangam',
    riskTier: 'MODERATE',
    riskScore: 38.2,
    hazardNote: 'High-velocity Pindar tributary sediment pulse',
    sensors: 'Acoustic Bedload Sensor · Rain Gauge',
  },
  {
    id: 'st-06',
    name: 'Chamoli Canyon Sector',
    code: 'DH-CHM',
    latitude: 30.4042,
    longitude: 79.3364,
    elevationM: 960,
    district: 'Chamoli',
    riverBasin: 'Middle Alaknanda Gorge',
    riskTier: 'MODERATE',
    riskScore: 42.1,
    hazardNote: 'Narrow rock canyon planar shear susceptibility',
    sensors: 'Borehole Inclinometer · Weather Telemetry',
  },
  {
    id: 'st-07',
    name: 'Birahi Talus Debris Zone',
    code: 'DH-BRH',
    latitude: 30.4180,
    longitude: 79.3850,
    elevationM: 1040,
    district: 'Chamoli',
    riverBasin: 'Birahi Ganga Confluence',
    riskTier: 'HIGH',
    riskScore: 58.7,
    hazardNote: 'Historical talus cone reactivation during high moisture',
    sensors: 'Wireline Extensometer · Rainfall Telemetry',
  },
  {
    id: 'st-08',
    name: 'Pipalkoti Cut-Slope Zone',
    code: 'DH-PIP',
    latitude: 30.4289,
    longitude: 79.4299,
    elevationM: 1260,
    district: 'Chamoli',
    riverBasin: 'Upper Alaknanda',
    riskTier: 'MODERATE',
    riskScore: 48.0,
    hazardNote: 'Excavated highway toe wedge sliding in fractured schists',
    sensors: 'Piezometer Array · Geophone Station',
  },
  {
    id: 'st-09',
    name: 'Helang Ravine Choke',
    code: 'DH-HLG',
    latitude: 30.5280,
    longitude: 79.5080,
    elevationM: 1650,
    district: 'Chamoli',
    riverBasin: 'Kalpeshwar / Alaknanda Choke',
    riskTier: 'HIGH',
    riskScore: 64.2,
    hazardNote: 'Severe relief gradient & debris torrent hazard',
    sensors: 'Automated Rain Gauge · Debris Flow Radar',
  },
  {
    id: 'st-10',
    name: 'Joshimath Escarpment',
    code: 'DH-JOS',
    latitude: 30.5564,
    longitude: 79.5663,
    elevationM: 1890,
    district: 'Chamoli',
    riverBasin: 'Dhauliganga / Alaknanda Gorge',
    riskTier: 'HIGH',
    riskScore: 68.5,
    hazardNote: 'Sub-surface subsidence & paleolandslide slope creep',
    sensors: 'DInSAR Ground Radar · Multi-Depth Piezometer',
  },
  {
    id: 'st-11',
    name: 'Badrinath Shrine Node',
    code: 'DH-BAD',
    latitude: 30.7433,
    longitude: 79.4938,
    elevationM: 3100,
    district: 'Chamoli',
    riverBasin: 'Upper Catchment / Nar-Narayan',
    riskTier: 'LOW',
    riskScore: 24.0,
    hazardNote: 'High-altitude moraine & seasonal snowpack runoff',
    sensors: 'Snow Water Equivalent Radar · AWS',
  },
  {
    id: 'st-12',
    name: 'Kedarnath Valley Head',
    code: 'DH-KED',
    latitude: 30.7352,
    longitude: 79.0669,
    elevationM: 3583,
    district: 'Rudraprayag',
    riverBasin: 'Mandakini Glacier Headwaters',
    riskTier: 'MODERATE',
    riskScore: 45.0,
    hazardNote: 'Proglacial outwash channel & moraine surge sensitivity',
    sensors: 'GLOF Early Warning Radar · Weather Stream',
  },
];

// Technical beacon icons
const getStationIcon = (riskTier: 'LOW' | 'MODERATE' | 'HIGH') => {
  const colorMap = {
    LOW: 'var(--risk-low)',
    MODERATE: 'var(--risk-moderate)',
    HIGH: 'var(--risk-high)',
  };
  const color = colorMap[riskTier];

  return L.divIcon({
    className: `dh-map-beacon dh-map-beacon--station dh-map-beacon--${riskTier.toLowerCase()}`,
    html: `<span class="dh-map-beacon__pulse" style="border-color:${color}"></span><span class="dh-map-beacon__dot" style="background-color:${color};box-shadow:0 0 8px ${color}"></span>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
    popupAnchor: [0, -13],
  });
};

const originBeaconIcon = L.divIcon({
  className: 'dh-map-beacon dh-map-beacon--origin',
  html: '<span class="dh-map-beacon__pulse"></span><span class="dh-map-beacon__dot"></span>',
  iconSize: [30, 30],
  iconAnchor: [15, 15],
  popupAnchor: [0, -15],
});

const destBeaconIcon = L.divIcon({
  className: 'dh-map-beacon dh-map-beacon--destination',
  html: '<span class="dh-map-beacon__pulse"></span><span class="dh-map-beacon__dot"></span>',
  iconSize: [30, 30],
  iconAnchor: [15, 15],
  popupAnchor: [0, -15],
});

const liveLocationBeaconIcon = L.divIcon({
  className: 'dh-map-beacon dh-map-beacon--live',
  html: '<span class="dh-map-beacon__pulse"></span><span class="dh-map-beacon__dot"></span>',
  iconSize: [28, 28],
  iconAnchor: [14, 14],
  popupAnchor: [0, -14],
});

const tempBeaconIcon = L.divIcon({
  className: 'dh-map-beacon dh-map-beacon--temp',
  html: '<span class="dh-map-beacon__pulse"></span><span class="dh-map-beacon__dot"></span>',
  iconSize: [28, 28],
  iconAnchor: [14, 14],
  popupAnchor: [0, -14],
});

const poiBeaconIcon = L.divIcon({
  className: 'dh-map-beacon dh-map-beacon--poi',
  html: '<span class="dh-map-beacon__pulse" style="border-color:#c6a16a"></span><span class="dh-map-beacon__dot" style="background-color:#c6a16a;box-shadow:0 0 6px #c6a16a"></span>',
  iconSize: [22, 22],
  iconAnchor: [11, 11],
  popupAnchor: [0, -11],
});

export {
  PILOT_CORRIDOR_COORDINATES,
  RISHIKESH_COORDS,
  JOSHIMATH_COORDS,
  CORRIDOR_CENTER,
  PILOT_CORRIDOR_CHORD_DISTANCE_KM,
  PILOT_CORRIDOR_PHYSICAL_ROAD_KM,
};

/**
 * Controller ensuring Leaflet recalculates dimensions with ResizeObserver
 * and handles smart bound fitting without sudden jumps.
 */
function MapViewController({
  origin,
  destination,
  activeRoute,
  showCorridorRoute,
  selectedSegmentId,
  segments,
  fitTrigger,
}: {
  origin?: LocationPoint | null;
  destination?: LocationPoint | null;
  activeRoute?: RouteResult | null;
  showCorridorRoute?: boolean;
  selectedSegmentId?: string | null;
  segments?: CorridorSegmentRisk[];
  fitTrigger?: number;
}): null {
  const map = useMap();
  const lastTargetKey = useRef<string>('');

  // Auto-resize observer: cleanly invalidates size when layout changes
  useEffect(() => {
    const container = map.getContainer();
    if (!container) return;

    let resizeTimer: number;
    const observer = new ResizeObserver(() => {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => {
        try {
          map.invalidateSize({ pan: false });
        } catch {
          // container may be unmounting
        }
      }, 80);
    });

    observer.observe(container);
    return () => {
      window.clearTimeout(resizeTimer);
      observer.disconnect();
    };
  }, [map]);

  useEffect(() => {
    map.invalidateSize({ pan: false });

    const targetKey = `${origin?.id ?? ''}_${origin?.latitude ?? ''}_${destination?.id ?? ''}_${destination?.latitude ?? ''}_${activeRoute?.status ?? ''}_${activeRoute?.geometry?.length ?? 0}_${showCorridorRoute ? 'corridor' : 'default'}_${selectedSegmentId ?? ''}_${fitTrigger ?? 0}`;
    if (targetKey === lastTargetKey.current) {
      return;
    }
    lastTargetKey.current = targetKey;

    try {
      // Focus on specifically selected corridor segment if user clicked a hotspot/segment
      if (selectedSegmentId && segments && segments.length > 0) {
        const seg = segments.find((s) => s.id === selectedSegmentId);
        if (seg && seg.coordinates.length > 0) {
          const bounds = L.latLngBounds(seg.coordinates);
          map.fitBounds(bounds, { padding: [80, 80], maxZoom: 13 });
          return;
        }
      }

      if (activeRoute && activeRoute.status === 'success' && activeRoute.geometry.length > 0) {
        const bounds = L.latLngBounds(
          activeRoute.bounds[0],
          activeRoute.bounds[1]
        );
        map.fitBounds(bounds, { padding: [50, 50], maxZoom: 14 });
      } else if (origin && destination) {
        const bounds = L.latLngBounds(
          [origin.latitude, origin.longitude],
          [destination.latitude, destination.longitude]
        );
        map.fitBounds(bounds, { padding: [60, 60], maxZoom: 13 });
      } else if (origin) {
        map.setView([origin.latitude, origin.longitude], 11);
      } else if (destination) {
        map.setView([destination.latitude, destination.longitude], 11);
      } else if (showCorridorRoute) {
        map.fitBounds(L.latLngBounds(PILOT_CORRIDOR_COORDINATES), { padding: [36, 36] });
      } else {
        // Natural Garhwal Himalayan Overview
        map.setView(HIMALAYAN_DEFAULT_CENTER, HIMALAYAN_DEFAULT_ZOOM);
      }
    } catch {
      // Safe fallback
    }
  }, [map, origin, destination, activeRoute, showCorridorRoute, selectedSegmentId, segments, fitTrigger]);

  return null;
}

/**
 * Captures map clicks when selection mode is active
 */
function MapClickHandler({
  selectionMode,
  onMapClick,
}: {
  selectionMode?: LocationSelectionMode;
  onMapClick?: (lat: number, lng: number) => void;
}): null {
  useMapEvents({
    click(e) {
      if (selectionMode && onMapClick) {
        onMapClick(e.latlng.lat, e.latlng.lng);
      }
    },
  });
  return null;
}

export interface InteractiveMapProps {
  className?: string;
  zoom?: number;
  segments?: CorridorSegmentRisk[];
  selectedSegmentId?: string | null;
  onSelectSegment?: (segment: CorridorSegmentRisk) => void;
  isSimulated?: boolean;
  scenarioPrecipitation?: number | null;
  onResetScenario?: () => void;
  showCorridorRoute?: boolean;
  onToggleCorridorRoute?: (show: boolean) => void;
  // Location Selection Props
  origin?: LocationPoint | null;
  destination?: LocationPoint | null;
  liveLocation?: LiveLocation | null;
  selectionMode?: LocationSelectionMode;
  tempMapPoint?: LocationPoint | null;
  onMapClick?: (lat: number, lng: number) => void;
  onConfirmTempMapPoint?: () => void;
  onCancelTempMapPoint?: () => void;
  onCancelSelectionMode?: () => void;
  onStartMapSelection?: (mode: 'origin' | 'destination') => void;
  onUseLiveLocation?: () => Promise<void>;
  onResetRouteSelection?: () => void;
  onSetOrigin?: (loc: LocationPoint) => void;
  onSetDestination?: (loc: LocationPoint) => void;
  isLocating?: boolean;
  // Real Road Routing Props
  activeRoute?: RouteResult | null;
  isRouting?: boolean;
  routingError?: string | null;
  onRetryRouting?: () => void;
  mode?: string;
  // Phase 2 Interactive Inspection Props
  onSelectLocation?: (loc: LocationPoint) => void;
  onSelectHazardEntity?: (entity: any) => void;
}

export const InteractiveMap: React.FC<InteractiveMapProps> = ({
  className,
  zoom = HIMALAYAN_DEFAULT_ZOOM,
  segments,
  selectedSegmentId,
  onSelectSegment,
  isSimulated = false,
  scenarioPrecipitation = null,
  onResetScenario,
  showCorridorRoute: propShowCorridorRoute,
  onToggleCorridorRoute,
  origin,
  destination,
  liveLocation,
  selectionMode,
  tempMapPoint,
  onMapClick,
  onConfirmTempMapPoint,
  onCancelTempMapPoint,
  onCancelSelectionMode,
  onStartMapSelection,
  onUseLiveLocation,
  onResetRouteSelection,
  onSetOrigin,
  onSetDestination,
  isLocating = false,
  activeRoute,
  isRouting = false,
  routingError,
  onRetryRouting,
  mode,
  onSelectLocation,
  onSelectHazardEntity,
}) => {
  // Basemap fallback state
  const [useFallbackOsm, setUseFallbackOsm] = useState(!hasMapTilerKey);

  // Wheel zoom lock state: enabled by default for map zoom;
  // user can toggle off to protect page scroll (e.g. on touch devices)
  const [wheelZoomEnabled, setWheelZoomEnabled] = useState(true);

  // Layer toggle states
  const [showStations, setShowStations] = useState(true);
  const [internalShowCorridor, setInternalShowCorridor] = useState(false);
  const [showHistoricalCuttings, setShowHistoricalCuttings] = useState<boolean>(true);
  const [historicalCuttings, setHistoricalCuttings] = useState<HistoricalCuttingFeature[]>([]);
  const [cuttingsYear, setCuttingsYear] = useState<number>(2018);
  const [showRiskZones, setShowRiskZones] = useState<boolean>(true);
  const [riskZones, setRiskZones] = useState<SpatialRiskZoneFeature[]>([]);
  const [showLandslideScars, setShowLandslideScars] = useState<boolean>(true);
  const [landslideScars, setLandslideScars] = useState<GSILandslideFeature[]>([]);
  const [fitTrigger, setFitTrigger] = useState<number>(0);

  // Calculate corridor segments fallback if enabled
  const activeSegments = React.useMemo(() => {
    if (segments && segments.length > 0 && typeof (segments[0] as any)?.riskScore === 'number') {
      return segments;
    }
    return calculateCorridorSegmentRisks(null);
  }, [segments]);

  const hasAnalyzedRouteSegments = Boolean(
    activeRoute?.segments.some((segment) => typeof segment.riskScore === 'number')
  );
  
  const hasSegmentData = Boolean(activeSegments && activeSegments.length > 0);

  const showCorridorRoute =
    (propShowCorridorRoute !== undefined ? propShowCorridorRoute : internalShowCorridor) &&
    hasSegmentData &&
    !hasAnalyzedRouteSegments;

  const handleToggleRoute = () => {
    const nextVal = !showCorridorRoute;
    setInternalShowCorridor(nextVal);
    onToggleCorridorRoute?.(nextVal);
  };

  useEffect(() => {
    if (import.meta.env.DEV && !hasMapTilerKey) {
      console.info('[InteractiveMap] VITE_MAPTILER_API_KEY not configured. Falling back to OpenStreetMap.');
    }
  }, []);

  // Sync layer toggles with the active experience mode
  useEffect(() => {
    if (!mode) return;
    switch (mode) {
      case "environment":
        setShowStations(true);
        setShowHistoricalCuttings(false);
        setInternalShowCorridor(false);
        break;
      case "risk":
        setShowStations(false);
        setShowHistoricalCuttings(false);
        setInternalShowCorridor(true);
        break;
      case "terrain":
        setShowStations(false);
        setShowHistoricalCuttings(true);
        setInternalShowCorridor(false);
        break;
      case "overview":
        setShowStations(true);
        setShowHistoricalCuttings(true);
        setInternalShowCorridor(true);
        break;
      case "route":
        setShowStations(true);
        setInternalShowCorridor(true);
        break;
    }
  }, [mode]);

  // Fetch Historical OSM Road-Cutting dataset (2018 historical snapshot)
  useEffect(() => {
    const controller = new AbortController();
    let isMounted = true;

    async function fetchHistoricalCuttings() {
      try {
        const response = await fetch(HISTORICAL_CUTTINGS_API_URL, {
          signal: controller.signal,
          headers: { Accept: 'application/json' },
        });

        if (!response.ok) {
          if (import.meta.env.DEV) {
            console.warn(
              `[InteractiveMap] Historical cuttings HTTP ${response.status}: ${response.statusText}`
            );
          }
          return;
        }

        const data: HistoricalCuttingsResponse = await response.json();
        if (isMounted) {
          if (Array.isArray(data?.features)) {
            setHistoricalCuttings(data.features);
          } else {
            setHistoricalCuttings([]);
          }
          if (typeof data?.year === 'number') {
            setCuttingsYear(data.year);
          }
        }
      } catch (err: unknown) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          return; // Ignore intentional abort on unmount
        }
        if (import.meta.env.DEV) {
          console.warn('[InteractiveMap] Failed to load historical OSM road cuttings:', err);
        }
        // Failure handled gracefully - does not break the main map
      }
    }

    fetchHistoricalCuttings();

    return () => {
      isMounted = false;
      controller.abort();
    };
  }, []);

  // Fetch Spatial Hazard Risk Zones & GSI Landslide Scars from backend
  useEffect(() => {
    const controller = new AbortController();
    let isMounted = true;

    async function fetchHazardLayers() {
      // 1. Fetch Spatial Hazard Risk Zones
      try {
        const resp = await fetch(RISK_ZONES_API_URL, {
          signal: controller.signal,
          headers: { Accept: 'application/json' },
        });
        if (resp.ok) {
          const data = await resp.json();
          if (isMounted && Array.isArray(data?.features)) {
            setRiskZones(data.features);
          }
        }
      } catch (err: unknown) {
        if (!(err instanceof DOMException && err.name === 'AbortError') && import.meta.env.DEV) {
          console.warn('[InteractiveMap] Spatial risk zones unavailable:', err);
        }
      }

      // 2. Fetch GSI Historical Landslide Scars
      try {
        const resp = await fetch(LANDSLIDE_SCARS_API_URL, {
          signal: controller.signal,
          headers: { Accept: 'application/json' },
        });
        if (resp.ok) {
          const data = await resp.json();
          if (isMounted && Array.isArray(data?.features)) {
            setLandslideScars(data.features);
          }
        }
      } catch (err: unknown) {
        if (!(err instanceof DOMException && err.name === 'AbortError') && import.meta.env.DEV) {
          console.warn('[InteractiveMap] GSI landslide scars unavailable:', err);
        }
      }
    }

    fetchHazardLayers();

    return () => {
      isMounted = false;
      controller.abort();
    };
  }, []);


  const isSelectionActive = Boolean(selectionMode);

  const handleResetPerspective = () => {
    if (onResetRouteSelection) {
      onResetRouteSelection();
    }
    setFitTrigger(Date.now());
  };

  return (
    <div
      className={clsx(
        'dh-interactive-map',
        {
          'dh-interactive-map--picking': isSelectionActive,
        },
        className
      )}
      onWheel={(e) => e.stopPropagation()}
    >
      {/* Simulation Status Overlay Banner */}
      {isSimulated && scenarioPrecipitation !== null && (
        <div className="dh-interactive-map__sim-banner" role="status">
          <span className="dh-interactive-map__sim-text">
            <span className="dh-interactive-map__sim-dot" aria-hidden="true" />
            WHAT-IF SCENARIO: {scenarioPrecipitation.toFixed(1)} mm/h RAINFALL
          </span>
          {onResetScenario && (
            <button
              type="button"
              className="dh-interactive-map__sim-reset-btn"
              onClick={onResetScenario}
              title="Reset to live observed telemetry"
            >
              Reset to Live
            </button>
          )}
        </div>
      )}

      {/* Map Selection Mode Floating Banner */}
      {isSelectionActive && !tempMapPoint && (
        <div className="dh-interactive-map__picking-banner" role="status">
          <span className="dh-interactive-map__picking-text">
            <Crosshair size={13} aria-hidden="true" />
            Click anywhere on the terrain to set{' '}
            <strong>{selectionMode === 'origin' ? 'START LOCATION' : 'DESTINATION'}</strong>
          </span>
          {onCancelSelectionMode && (
            <button
              type="button"
              className="dh-interactive-map__picking-cancel-btn"
              onClick={onCancelSelectionMode}
            >
              Cancel
            </button>
          )}
        </div>
      )}

      {/* Routing Loading Floating Banner */}
      {isRouting && (
        <div className="dh-interactive-map__routing-banner" role="status">
          <Loader2 size={13} className="animate-spin" aria-hidden="true" />
          <span>ROUTING IN PROGRESS: Calculating mountain road geometry via OSRM...</span>
        </div>
      )}

      {/* Routing Error Floating Banner */}
      {routingError && !activeRoute && (
        <div className="dh-interactive-map__error-banner" role="alert">
          <span className="dh-interactive-map__error-text">
            <strong>Road route unavailable:</strong> {routingError}
          </span>
          {onRetryRouting && (
            <button
              type="button"
              className="dh-interactive-map__retry-btn"
              onClick={onRetryRouting}
              title="Retry routing request"
            >
              <RotateCcw size={10} aria-hidden="true" />
              Retry
            </button>
          )}
        </div>
      )}

      {/* Interactive Map Intelligence Toolbar (Top-Right) */}
      <div className="dh-interactive-map__toolbar" role="toolbar" aria-label="Map intelligence controls">
        {/* Layer: Monitoring Stations */}
        <button
          type="button"
          className={clsx('dh-interactive-map__tool-btn', {
            'dh-interactive-map__tool-btn--active': showStations,
          })}
          onClick={() => setShowStations(!showStations)}
          title="Toggle Himalayan observation & telemetry stations"
          aria-pressed={showStations}
        >
          <Radio size={11} aria-hidden="true" />
          <span>Stations</span>
        </button>

        {/* Layer: Route Corridor Segments */}
        <button
          type="button"
          className={clsx('dh-interactive-map__tool-btn', {
            'dh-interactive-map__tool-btn--active': showCorridorRoute,
          })}
          onClick={handleToggleRoute}
          title="Toggle NH-7 corridor risk segments"
          aria-pressed={showCorridorRoute}
        >
          <Route size={11} aria-hidden="true" />
          <span>Corridor Risk</span>
        </button>

        {/* Layer: Historical OSM Road-Cutting Features (2018) */}
        <button
          type="button"
          className={clsx('dh-interactive-map__tool-btn', {
            'dh-interactive-map__tool-btn--active': showHistoricalCuttings,
          })}
          onClick={() => setShowHistoricalCuttings(!showHistoricalCuttings)}
          title="Toggle Historical OSM Road-Cutting Features (2018)"
          aria-pressed={showHistoricalCuttings}
        >
          <History size={11} aria-hidden="true" />
          <span>Historical Cuttings</span>
        </button>

        {/* Layer: Spatial Hazard Risk Zones */}
        <button
          type="button"
          className={clsx('dh-interactive-map__tool-btn', {
            'dh-interactive-map__tool-btn--active': showRiskZones,
          })}
          onClick={() => setShowRiskZones(!showRiskZones)}
          title="Toggle Spatial Multi-Hazard Risk Zones"
          aria-pressed={showRiskZones}
        >
          <ShieldAlert size={11} aria-hidden="true" />
          <span>Risk Zones</span>
        </button>

        {/* Layer: Geological Survey of India (GSI) Historical Landslide Scars */}
        <button
          type="button"
          className={clsx('dh-interactive-map__tool-btn', {
            'dh-interactive-map__tool-btn--active': showLandslideScars,
          })}
          onClick={() => setShowLandslideScars(!showLandslideScars)}
          title="Toggle GSI Historical Landslide Scar Catalog (5,206 features)"
          aria-pressed={showLandslideScars}
        >
          <AlertTriangle size={11} aria-hidden="true" />
          <span>GSI Scars</span>
        </button>

        {/* GPS Live Geolocation */}
        {onUseLiveLocation && (
          <button
            type="button"
            className="dh-interactive-map__tool-btn"
            onClick={onUseLiveLocation}
            disabled={isLocating}
            title="Use current GPS location"
          >
            {isLocating ? <Loader2 size={11} className="animate-spin" /> : <Navigation size={11} />}
            <span>GPS</span>
          </button>
        )}

        {/* Route Pin Pickers */}
        {onStartMapSelection && (
          <>
            <button
              type="button"
              className={clsx('dh-interactive-map__tool-btn', {
                'dh-interactive-map__tool-btn--active': selectionMode === 'origin',
              })}
              onClick={() => {
                if (selectionMode === 'origin') {
                  onCancelSelectionMode?.();
                } else {
                  onStartMapSelection('origin');
                }
              }}
              title="Pick origin directly on map"
            >
              <MapPin size={11} />
              <span>Start</span>
            </button>

            <button
              type="button"
              className={clsx('dh-interactive-map__tool-btn', {
                'dh-interactive-map__tool-btn--active': selectionMode === 'destination',
              })}
              onClick={() => {
                if (selectionMode === 'destination') {
                  onCancelSelectionMode?.();
                } else {
                  onStartMapSelection('destination');
                }
              }}
              title="Pick destination directly on map"
            >
              <Flag size={11} />
              <span>Dest</span>
            </button>
          </>
        )}

        {/* Wheel Zoom Toggle (Enabled by default for map zoom) */}
        <button
          type="button"
          className={clsx('dh-interactive-map__tool-btn', {
            'dh-interactive-map__tool-btn--active': wheelZoomEnabled,
          })}
          onClick={() => setWheelZoomEnabled(!wheelZoomEnabled)}
          title={
            wheelZoomEnabled
              ? 'Mouse wheel zooms map (Click to release wheel for page scroll)'
              : 'Mouse wheel scrolls page (Click to re-enable map zoom)'
          }
          aria-pressed={wheelZoomEnabled}
        >
          <MousePointer size={11} aria-hidden="true" />
          <span>{wheelZoomEnabled ? 'Wheel: On' : 'Wheel: Off'}</span>
        </button>

        {/* Reset Himalayan Overview */}
        <button
          type="button"
          className="dh-interactive-map__tool-btn dh-interactive-map__tool-btn--reset"
          onClick={handleResetPerspective}
          title="Reset Himalayan perspective & frame Garhwal sector"
        >
          <RotateCcw size={11} aria-hidden="true" />
          <span>Reset</span>
        </button>
      </div>

      {/* Floating Map Risk Legend */}
      <RiskLegend
        isSimulated={isSimulated}
        showHistoricalCuttings={showHistoricalCuttings}
      />

      <MapContainer
        center={HIMALAYAN_DEFAULT_CENTER}
        zoom={zoom}
        scrollWheelZoom={wheelZoomEnabled}
        zoomControl={true}
        attributionControl={true}
      >
        <MapViewController
          origin={origin}
          destination={destination}
          activeRoute={activeRoute}
          showCorridorRoute={showCorridorRoute}
          fitTrigger={fitTrigger}
          selectedSegmentId={selectedSegmentId}
          segments={activeSegments}
        />
        <MapClickHandler selectionMode={selectionMode} onMapClick={onMapClick} />

        {/* Basemap Tile Layer: MapTiler Topo-v4 with graceful OpenStreetMap fallback */}
        {!useFallbackOsm && hasMapTilerKey ? (
          <TileLayer
            key="maptiler-topo"
            url={MAPTILER_TOPO_URL}
            attribution={MAPTILER_ATTRIBUTION}
            maxZoom={19}
            minZoom={5}
            eventHandlers={{
              tileerror: () => {
                if (!useFallbackOsm) {
                  if (import.meta.env.DEV) {
                    console.warn('[InteractiveMap] MapTiler tile request error. Reverting to OpenStreetMap.');
                  }
                  setUseFallbackOsm(true);
                }
              },
            }}
          />
        ) : (
          <TileLayer
            key="osm-fallback"
            url={OSM_URL}
            attribution={OSM_ATTRIBUTION}
            maxZoom={18}
            minZoom={7}
          />
        )}

        {/* ─── 1. HIMALAYAN HAZARD OBSERVATION STATIONS (DEFAULT INTELLIGENCE LAYER) ─── */}
        {showStations &&
          HIMALAYAN_OBSERVATION_STATIONS.map((st) => (
            <Marker
              key={st.id}
              position={[st.latitude, st.longitude]}
              icon={getStationIcon(st.riskTier)}
              eventHandlers={{
                click: () => {
                  onSelectLocation?.({
                    id: st.id,
                    name: st.name,
                    latitude: st.latitude,
                    longitude: st.longitude,
                    state: 'Uttarakhand',
                    district: st.district,
                    category: 'ROUTE_NODE',
                    source: 'curated',
                    elevationM: st.elevationM,
                    description: st.hazardNote,
                  });
                },
              }}
            >
              <Tooltip direction="top" offset={[0, -12]}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', fontWeight: 600 }}>
                  {st.name} (~{st.elevationM}m MSL) · {st.riskTier}
                </span>
              </Tooltip>
              <Popup maxWidth={320} className="dh-segment-popup">
                <div className="dh-popup-card dh-popup-card--station">
                  <div className="dh-popup-card__header">
                    <span className="dh-popup-card__title">{st.code}</span>
                    <span
                      className="dh-popup-card__badge"
                      style={{
                        color:
                          st.riskTier === 'LOW'
                            ? 'var(--risk-low)'
                            : st.riskTier === 'MODERATE'
                            ? 'var(--risk-moderate)'
                            : 'var(--risk-high)',
                        borderColor: 'currentColor',
                        border: '1px solid currentColor',
                      }}
                    >
                      {st.riskTier} EXPOSURE
                    </span>
                  </div>

                  <div className="dh-popup-card__route-name">{st.name}</div>

                  <div className="dh-popup-card__grid" style={{ marginTop: '8px' }}>
                    <div className="dh-popup-card__grid-item">
                      <span className="dh-popup-card__meta-k">Elevation MSL</span>
                      <span className="dh-popup-card__meta-v">~{st.elevationM} m</span>
                    </div>
                    <div className="dh-popup-card__grid-item">
                      <span className="dh-popup-card__meta-k">District</span>
                      <span className="dh-popup-card__meta-v">{st.district}</span>
                    </div>
                    <div className="dh-popup-card__grid-item" style={{ gridColumn: 'span 2' }}>
                      <span className="dh-popup-card__meta-k">Drainage Basin</span>
                      <span className="dh-popup-card__meta-v">{st.riverBasin}</span>
                    </div>
                  </div>

                  <div className="dh-popup-card__factors" style={{ marginTop: '8px' }}>
                    <span className="dh-popup-card__factors-title">Hazard Exposure Focus</span>
                    <p style={{ margin: 0, fontSize: '10.5px', color: 'var(--text-secondary)' }}>
                      {st.hazardNote}
                    </p>
                  </div>

                  <div className="dh-popup-card__telemetry-scope" style={{ marginTop: '8px' }}>
                    <span>Telemetry Stream: {st.sensors}</span>
                  </div>

                  {/* Contextual Route Actions */}
                  {(onSetOrigin || onSetDestination) && (
                    <div className="dh-popup-card__station-actions">
                      {onSetOrigin && (
                        <button
                          type="button"
                          className="dh-popup-card__action-btn"
                          onClick={() =>
                            onSetOrigin({
                              id: st.id,
                              name: st.name,
                              latitude: st.latitude,
                              longitude: st.longitude,
                              state: 'Uttarakhand',
                              district: st.district,
                              category: 'ROUTE_NODE',
                              source: 'curated',
                              elevationM: st.elevationM,
                            })
                          }
                        >
                          <MapPin size={11} />
                          <span>Set Start</span>
                        </button>
                      )}
                      {onSetDestination && (
                        <button
                          type="button"
                          className="dh-popup-card__action-btn"
                          onClick={() =>
                            onSetDestination({
                              id: st.id,
                              name: st.name,
                              latitude: st.latitude,
                              longitude: st.longitude,
                              state: 'Uttarakhand',
                              district: st.district,
                              category: 'ROUTE_NODE',
                              source: 'curated',
                              elevationM: st.elevationM,
                            })
                          }
                        >
                          <Flag size={11} />
                          <span>Set Destination</span>
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </Popup>
            </Marker>
          ))}

        {/* ─── 2. REAL ROAD ROUTE POLYLINE (OSRM Active Navigation) ─────────── */}
        {activeRoute && activeRoute.status === 'success' && activeRoute.geometry.length > 0 && (
          <>
            {/* Background contrast casing */}
            <Polyline
              positions={activeRoute.geometry}
              pathOptions={{
                color: '#020617',
                weight: 9,
                opacity: 0.85,
                lineCap: 'round',
                lineJoin: 'round',
              }}
            />
            {/* Foreground real road route polyline */}
            <Polyline
              positions={activeRoute.geometry}
              pathOptions={{
                color: '#00e5ff',
                weight: 5,
                opacity: 0.95,
                lineCap: 'round',
                lineJoin: 'round',
              }}
            >
              <Tooltip sticky direction="top">
                <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>
                  Road Route ({activeRoute.provider}): {activeRoute.metrics.formattedDistance} · {activeRoute.metrics.formattedDuration}
                </span>
              </Tooltip>
              <Popup maxWidth={340} className="dh-segment-popup">
                <div className="dh-popup-card dh-popup-card--route">
                  <div className="dh-popup-card__header">
                    <span className="dh-popup-card__title">REAL ROAD ROUTE</span>
                    <span
                      className="dh-popup-card__badge"
                      style={{
                        color: '#00e5ff',
                        backgroundColor: 'rgba(0, 229, 255, 0.12)',
                        borderColor: '#00e5ff',
                        border: '1px solid #00e5ff',
                      }}
                    >
                      {activeRoute.provider}
                    </span>
                  </div>

                  <div className="dh-popup-card__route-name">
                    {activeRoute.origin.name} → {activeRoute.destination.name}
                  </div>

                  <div className="dh-popup-card__grid" style={{ marginTop: '8px' }}>
                    <div className="dh-popup-card__grid-item">
                      <span className="dh-popup-card__meta-k">Road Distance</span>
                      <span className="dh-popup-card__meta-v" style={{ color: '#00e5ff' }}>
                        {activeRoute.metrics.formattedDistance}
                      </span>
                    </div>
                    <div className="dh-popup-card__grid-item">
                      <span className="dh-popup-card__meta-k">Est. Duration</span>
                      <span className="dh-popup-card__meta-v">
                        {activeRoute.metrics.formattedDuration}
                      </span>
                    </div>
                    <div className="dh-popup-card__grid-item">
                      <span className="dh-popup-card__meta-k">Elevation Profile</span>
                      <span className="dh-popup-card__meta-v">
                        {activeRoute.metrics.elevationMin !== null
                          ? `${activeRoute.metrics.elevationMin}m → ${activeRoute.metrics.elevationMax}m`
                          : 'Unavailable'}
                      </span>
                    </div>
                    <div className="dh-popup-card__grid-item">
                      <span className="dh-popup-card__meta-k">Peak Gradient</span>
                      <span className="dh-popup-card__meta-v">
                        {activeRoute.metrics.peakGradientDegrees !== null
                          ? `${activeRoute.metrics.peakGradientDegrees}° (${activeRoute.metrics.peakGradientPercent}%)`
                          : '—'}
                      </span>
                    </div>
                  </div>

                  <div className="dh-popup-card__telemetry-scope" style={{ marginTop: '8px' }}>
                    <span>Samples: {activeRoute.metrics.sampleCount} points (~500m intervals)</span>
                    <span className="dh-popup-card__scope-note">
                      DEM Coverage: {activeRoute.metrics.elevationCoverageRatio || 'Unavailable'}
                    </span>
                  </div>

                  <div className="dh-popup-card__disclaimer">
                    Routing provides physical road geometry and navigation estimates. It does not predict landslides or evaluate geotechnical slope stability.
                  </div>
                </div>
              </Popup>
            </Polyline>
          </>
        )}

        {/* ─── 2.1 AUTHORITATIVE ROUTE RISK SEGMENTS ───────────────────────── */}
        {hasAnalyzedRouteSegments &&
          activeRoute?.segments.map((segment) => {
            const score = segment.riskScore;
            const color = segment.riskColorHex ?? (
              score === null || score === undefined
                ? '#94a3b8'
                : score >= 75
                ? '#ef4444'
                : score >= 50
                ? '#f59e0b'
                : score >= 25
                ? '#eab308'
                : '#22c55e'
            );

            return (
              <Polyline
                key={`route-risk-${segment.id}`}
                positions={segment.geometry}
                pathOptions={{
                  color,
                  weight: 7,
                  opacity: 0.9,
                  lineCap: 'round',
                  lineJoin: 'round',
                }}
              >
                <Tooltip sticky direction="top">
                  <span style={{ fontFamily: 'monospace' }}>
                    <strong>Route segment {segment.index + 1}</strong> · Risk {score ?? 'unavailable'}/100
                    {segment.riskTier ? ` · ${segment.riskTier}` : ''}
                    {segment.primaryHazardDriver ? ` · ${segment.primaryHazardDriver}` : ''}
                  </span>
                </Tooltip>
              </Polyline>
            );
          })}

        {/* ─── 3. CORRIDOR SEGMENT RISK ANALYSIS (Contextual risk layer along pilot corridor) ─── */}
        {showCorridorRoute &&
          activeSegments.map((segment) => {
            const isSelected = selectedSegmentId === segment.id;
            const hasActiveRoute = Boolean(activeRoute && activeRoute.status === 'success');
            return (
              <React.Fragment key={segment.id}>
                {/* Contrast casing highlight for selected segment */}
                {isSelected && (
                  <Polyline
                    positions={segment.coordinates}
                    pathOptions={{
                      color: '#ffffff',
                      weight: 12,
                      opacity: 0.65,
                      lineCap: 'round',
                      lineJoin: 'round',
                    }}
                  />
                )}
                <Polyline
                  positions={segment.coordinates}
                  pathOptions={{
                    color: segment.colorHex,
                    weight: isSelected ? 9 : hasActiveRoute ? 4 : 5,
                    opacity: isSelected ? 1.0 : hasActiveRoute ? 0.75 : 0.9,
                    lineCap: 'round',
                    lineJoin: 'round',
                  }}
                  eventHandlers={{
                    click: () => {
                      onSelectSegment?.(segment);
                    },
                  }}
                >
                  <Tooltip sticky direction="top">
                    <span style={{ fontFamily: 'monospace' }}>
                      <strong>{segment.id}</strong>: {segment.name} | Risk {typeof segment.riskScore === 'number' ? segment.riskScore.toFixed(1) : '—'}/100 ({segment.riskTier})
                    </span>
                  </Tooltip>
                  <Popup maxWidth={300} className="dh-segment-popup">
                    <div className="dh-popup-card dh-popup-card--segment">
                      <div className="dh-popup-card__header">
                        <span className="dh-popup-card__title">{segment.id}</span>
                        <span
                          className="dh-popup-card__badge"
                          style={{
                            color: segment.colorHex,
                            backgroundColor: `${segment.colorHex}22`,
                            borderColor: segment.colorHex,
                            border: `1px solid ${segment.colorHex}`,
                          }}
                        >
                          {segment.riskTier}
                        </span>
                      </div>

                      <div className="dh-popup-card__route-name">{segment.name}</div>

                      <div className="dh-popup-card__risk-metric">
                        <span className="dh-popup-card__risk-label">Terrain Corridor Risk</span>
                        <span
                          className="dh-popup-card__risk-value"
                          style={{ color: segment.colorHex }}
                        >
                          {typeof segment.riskScore === 'number' ? `${segment.riskScore.toFixed(1)} / 100` : '—'}
                        </span>
                      </div>

                      <div className="dh-popup-card__grid">
                        <div className="dh-popup-card__grid-item">
                          <span className="dh-popup-card__meta-k">Distance</span>
                          <span className="dh-popup-card__meta-v">~{typeof segment.distanceKm === 'number' ? segment.distanceKm.toFixed(1) : '—'} km</span>
                        </div>
                        <div className="dh-popup-card__grid-item">
                          <span className="dh-popup-card__meta-k">Terrain Gradient</span>
                          <span className="dh-popup-card__meta-v">
                            {typeof segment.gradientDegrees === 'number' ? `${segment.gradientDegrees.toFixed(1)}°` : '—'}{' '}
                            ({typeof segment.gradientPercent === 'number' ? `${segment.gradientPercent.toFixed(1)}%` : '—'})
                          </span>
                        </div>
                        <div className="dh-popup-card__grid-item">
                          <span className="dh-popup-card__meta-k">Elevation</span>
                          <span className="dh-popup-card__meta-v">
                            {segment.startElevationM}m → {segment.endElevationM}m
                          </span>
                        </div>
                        <div className="dh-popup-card__grid-item">
                          <span className="dh-popup-card__meta-k">Primary Driver</span>
                          <span
                            className="dh-popup-card__meta-v dh-popup-card__meta-v--driver"
                            title={segment.primaryDriver}
                          >
                            {segment.primaryDriver}
                          </span>
                        </div>
                      </div>

                      <div className="dh-popup-card__factors">
                        <span className="dh-popup-card__factors-title">Factor Contributions</span>
                        <div className="dh-popup-card__factors-list">
                          {(segment.factorContributions || []).map((fc) => (
                            <div key={fc.id} className="dh-popup-card__factor-row">
                              <span className="dh-popup-card__factor-name">{fc.name}</span>
                              <span className="dh-popup-card__factor-score">
                                {typeof fc.contribution === 'number' ? `+${fc.contribution.toFixed(1)}` : '—'}
                                <span className="dh-popup-card__factor-weight">({fc.weightPercent}%)</span>
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="dh-popup-card__telemetry-scope">
                        <span>Data Quality: {segment.activeFactorsRatio} ({segment.dataQualityRating})</span>
                      </div>

                      <div className="dh-popup-card__disclaimer">
                        {segment.disclaimer}
                      </div>
                    </div>
                  </Popup>
                </Polyline>
              </React.Fragment>
            );
          })}

        {/* ─── 4. HISTORICAL OSM ROAD-CUTTING FEATURES (2018 Historical Snapshot) ─── */}
        {showHistoricalCuttings &&
          historicalCuttings.map((feature) => {
            // Backend provides [longitude, latitude]; Leaflet requires [latitude, longitude]
            const leafletCoords = feature.coordinates.map(
              ([lng, lat]) => [lat, lng] as [number, number]
            );

            return (
              <Polyline
                key={`hist-cutting-${feature.id}`}
                positions={leafletCoords}
                pathOptions={{
                  color: '#f59e0b',
                  weight: 4,
                  opacity: 0.85,
                  dashArray: '8 6',
                }}
              >
                <Tooltip sticky direction="top">
                  <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>
                    Historical Cutting: OSM Way #{feature.id} ({cuttingsYear})
                  </span>
                </Tooltip>
                <Popup maxWidth={320} className="dh-segment-popup">
                  <div className="dh-popup-card dh-popup-card--cutting">
                    <div className="dh-popup-card__header">
                      <span className="dh-popup-card__title">Historical Road Cutting</span>
                      <span
                        className="dh-popup-card__badge"
                        style={{
                          color: '#f59e0b',
                          backgroundColor: 'rgba(245, 158, 11, 0.12)',
                          borderColor: '#f59e0b',
                          border: '1px solid #f59e0b',
                        }}
                      >
                        OSM {cuttingsYear}
                      </span>
                    </div>

                    <div className="dh-popup-card__grid" style={{ marginTop: '8px' }}>
                      <div className="dh-popup-card__grid-item">
                        <span className="dh-popup-card__meta-k">Year</span>
                        <span className="dh-popup-card__meta-v">{cuttingsYear}</span>
                      </div>
                      <div className="dh-popup-card__grid-item">
                        <span className="dh-popup-card__meta-k">OSM Way ID</span>
                        <span className="dh-popup-card__meta-v">{feature.id}</span>
                      </div>
                      {feature.tags.highway && (
                        <div className="dh-popup-card__grid-item">
                          <span className="dh-popup-card__meta-k">Highway</span>
                          <span className="dh-popup-card__meta-v">{feature.tags.highway}</span>
                        </div>
                      )}
                      {feature.tags.surface && (
                        <div className="dh-popup-card__grid-item">
                          <span className="dh-popup-card__meta-k">Surface</span>
                          <span className="dh-popup-card__meta-v">{feature.tags.surface}</span>
                        </div>
                      )}
                      {feature.tags.lanes && (
                        <div className="dh-popup-card__grid-item">
                          <span className="dh-popup-card__meta-k">Lanes</span>
                          <span className="dh-popup-card__meta-v">{feature.tags.lanes}</span>
                        </div>
                      )}
                      {feature.tags.cutting && (
                        <div className="dh-popup-card__grid-item">
                          <span className="dh-popup-card__meta-k">Cutting</span>
                          <span className="dh-popup-card__meta-v">{feature.tags.cutting}</span>
                        </div>
                      )}
                    </div>

                    <div className="dh-popup-card__disclaimer" style={{ marginTop: '6px' }}>
                      Historical OSM snapshot ({cuttingsYear}). Road excavation slope hazard baseline.
                    </div>
                  </div>
                </Popup>
              </Polyline>
            );
          })}

        {/* ─── 4. SPATIAL HAZARD RISK ZONES (Polygonal Multi-Hazard Exposure) ─── */}
        {showRiskZones &&
          riskZones.map((zone) => {
            const polygonCoords = (zone.geometry?.coordinates?.[0] || []).map(
              ([lng, lat]) => [lat, lng] as [number, number]
            );
            if (polygonCoords.length < 3) return null;

            const p = zone.properties;
            const zoneColor = p.color_hex || '#eab308';

            return (
              <Polygon
                key={p.zone_id}
                positions={polygonCoords}
                pathOptions={{
                  color: zoneColor,
                  fillColor: zoneColor,
                  fillOpacity: 0.16,
                  weight: 2,
                  dashArray: '5 5',
                }}
                eventHandlers={{
                  click: () => {
                    onSelectHazardEntity?.({
                      type: 'RISK_ZONE',
                      id: p.zone_id,
                      name: p.zone_name,
                      riskScore: p.risk_score,
                      riskTier: p.risk_level,
                      factors: p.factors,
                      disclaimer: p.disclaimer,
                      source: 'Derived (MCDA Engine v1.0)',
                    });
                  },
                }}
              >
                <Tooltip sticky direction="top">
                  <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>
                    Hazard Zone: {p.zone_name} · {p.risk_level} ({p.risk_score?.toFixed(1)}/100)
                  </span>
                </Tooltip>
                <Popup maxWidth={320} className="dh-segment-popup">
                  <div className="dh-popup-card dh-popup-card--zone">
                    <div className="dh-popup-card__header">
                      <span className="dh-popup-card__title">MULTI-HAZARD RISK ZONE</span>
                      <span
                        className="dh-popup-card__badge"
                        style={{
                          color: zoneColor,
                          borderColor: zoneColor,
                          backgroundColor: `${zoneColor}22`,
                          border: `1px solid ${zoneColor}`,
                        }}
                      >
                        {p.risk_level} TIER
                      </span>
                    </div>
                    <div className="dh-popup-card__route-name">{p.zone_name}</div>
                    <div className="dh-popup-card__risk-metric">
                      <span className="dh-popup-card__risk-label">Multi-Criteria Score</span>
                      <span className="dh-popup-card__risk-value" style={{ color: zoneColor }}>
                        {p.risk_score?.toFixed(1)} / 100
                      </span>
                    </div>
                    <div className="dh-popup-card__grid" style={{ marginTop: '8px' }}>
                      <div className="dh-popup-card__grid-item">
                        <span className="dh-popup-card__meta-k">Rainfall Index</span>
                        <span className="dh-popup-card__meta-v">{p.factors?.rainfall?.toFixed(1) ?? '—'}</span>
                      </div>
                      <div className="dh-popup-card__grid-item">
                        <span className="dh-popup-card__meta-k">Slope Factor</span>
                        <span className="dh-popup-card__meta-v">{p.factors?.slope?.toFixed(1) ?? '—'}</span>
                      </div>
                      <div className="dh-popup-card__grid-item">
                        <span className="dh-popup-card__meta-k">Terrain Factor</span>
                        <span className="dh-popup-card__meta-v">{p.factors?.terrain?.toFixed(1) ?? '—'}</span>
                      </div>
                      <div className="dh-popup-card__grid-item">
                        <span className="dh-popup-card__meta-k">Data Status</span>
                        <span className="dh-popup-card__meta-v" style={{ color: 'var(--ochre)' }}>Derived</span>
                      </div>
                    </div>
                    <div className="dh-popup-card__disclaimer" style={{ marginTop: '8px' }}>
                      {p.disclaimer || 'Computed decision-support boundary across Himalayan corridor.'}
                    </div>
                  </div>
                </Popup>
              </Polygon>
            );
          })}

        {/* ─── 5. GSI HISTORICAL LANDSLIDE SCAR OVERLAY ─── */}
        {showLandslideScars &&
          landslideScars.map((scar) => {
            const [lng, lat] = scar.geometry?.coordinates || [0, 0];
            if (!lat || !lng) return null;
            const p = scar.properties || {};

            return (
              <CircleMarker
                key={`gsi-${scar.id}`}
                center={[lat, lng]}
                radius={5}
                pathOptions={{
                  color: '#ef4444',
                  fillColor: '#ef4444',
                  fillOpacity: 0.75,
                  weight: 1.5,
                }}
                eventHandlers={{
                  click: () => {
                    onSelectHazardEntity?.({
                      type: 'LANDSLIDE_SCAR',
                      id: String(scar.id),
                      name: `GSI Landslide #${p.SLIDE_NO || scar.id}`,
                      district: p.DISTRICT || 'Uttarakhand',
                      trigger: p.TRIGGERING || 'Rainfall / Saturated Soil',
                      mechanism: p.FAILURE_MECHANISM || 'Translational Slide',
                      material: p.MATERIAL_TYPE || 'Debris',
                      area: p.LS_AREA,
                      source: 'Geological Survey of India (GSI Catalog)',
                    });
                  },
                }}
              >
                <Tooltip direction="top" offset={[0, -6]}>
                  <span style={{ fontFamily: 'monospace', fontSize: '10px' }}>
                    GSI Scar #{p.SLIDE_NO || scar.id} · {p.DISTRICT || 'Uttarakhand'}
                  </span>
                </Tooltip>
                <Popup maxWidth={300} className="dh-segment-popup">
                  <div className="dh-popup-card">
                    <div className="dh-popup-card__header">
                      <span className="dh-popup-card__title">GSI HISTORICAL SCAR</span>
                      <span className="dh-popup-card__badge" style={{ color: '#ef4444', borderColor: '#ef4444' }}>
                        CATALOG #{scar.id}
                      </span>
                    </div>
                    <div className="dh-popup-card__route-name">
                      {p.SLIDE_NO || `Landslide Node ${scar.id}`}
                    </div>
                    <div className="dh-popup-card__grid" style={{ marginTop: '8px' }}>
                      <div className="dh-popup-card__grid-item">
                        <span className="dh-popup-card__meta-k">District</span>
                        <span className="dh-popup-card__meta-v">{p.DISTRICT || 'Uttarakhand'}</span>
                      </div>
                      <div className="dh-popup-card__grid-item">
                        <span className="dh-popup-card__meta-k">Trigger</span>
                        <span className="dh-popup-card__meta-v">{p.TRIGGERING || 'Rainfall'}</span>
                      </div>
                      <div className="dh-popup-card__grid-item">
                        <span className="dh-popup-card__meta-k">Mechanism</span>
                        <span className="dh-popup-card__meta-v">{p.FAILURE_MECHANISM || 'Slope Failure'}</span>
                      </div>
                      <div className="dh-popup-card__grid-item">
                        <span className="dh-popup-card__meta-k">Material</span>
                        <span className="dh-popup-card__meta-v">{p.MATERIAL_TYPE || 'Rock / Debris'}</span>
                      </div>
                    </div>
                    <div className="dh-popup-card__disclaimer" style={{ marginTop: '6px' }}>
                      Source: Geological Survey of India (GSI) historical landslide catalog.
                    </div>
                  </div>
                </Popup>
              </CircleMarker>
            );
          })}

        {/* ─── 6. CUSTOM USER-SELECTED LOCATION PINS ───────────────────────── */}
        {origin && (
          <Marker position={[origin.latitude, origin.longitude]} icon={originBeaconIcon}>
            <Tooltip direction="top" offset={[0, -14]} permanent>
              START: {origin.name}
            </Tooltip>
            <Popup>
              <div className="dh-popup-card">
                <div className="dh-popup-card__header">
                  <h3 className="dh-popup-card__title">{origin.name}</h3>
                  <span className="dh-popup-card__badge" style={{ color: '#10b981', borderColor: '#10b981' }}>
                    START
                  </span>
                </div>
                <span className="dh-popup-card__meta">
                  {formatCoordinates(origin.latitude, origin.longitude)}
                  {origin.elevationM ? ` | ~${origin.elevationM} m MSL` : ''}
                </span>
                <p className="dh-popup-card__desc">
                  {origin.description ?? `${origin.category} in ${origin.state}`}
                </p>
              </div>
            </Popup>
          </Marker>
        )}

        {destination && (
          <Marker position={[destination.latitude, destination.longitude]} icon={destBeaconIcon}>
            <Tooltip direction="top" offset={[0, -14]} permanent>
              DESTINATION: {destination.name}
            </Tooltip>
            <Popup>
              <div className="dh-popup-card">
                <div className="dh-popup-card__header">
                  <h3 className="dh-popup-card__title">{destination.name}</h3>
                  <span className="dh-popup-card__badge" style={{ color: '#ef4444', borderColor: '#ef4444' }}>
                    DESTINATION
                  </span>
                </div>
                <span className="dh-popup-card__meta">
                  {formatCoordinates(destination.latitude, destination.longitude)}
                  {destination.elevationM ? ` | ~${destination.elevationM} m MSL` : ''}
                </span>
                <p className="dh-popup-card__desc">
                  {destination.description ?? `${destination.category} in ${destination.state}`}
                </p>
              </div>
            </Popup>
          </Marker>
        )}

        {/* ─── 5. CANONICAL UTTARAKHAND DESTINATION POI PINS ─────────────────── */}
        {POPULAR_DESTINATION_IDS.map((destId) => {
          const loc = UTTARAKHAND_LOCATIONS.find((l) => l.id === destId);
          if (!loc || loc.id === origin?.id || loc.id === destination?.id) return null;

          return (
            <Marker
              key={`poi-${loc.id}`}
              position={[loc.latitude, loc.longitude]}
              icon={poiBeaconIcon}
              eventHandlers={{
                click: () => {
                  onSelectLocation?.(loc);
                },
              }}
            >
              <Tooltip direction="top" offset={[0, -10]}>
                {loc.name}
              </Tooltip>
              <Popup>
                <div className="dh-popup-card">
                  <div className="dh-popup-card__header">
                    <h3 className="dh-popup-card__title">{loc.name}</h3>
                    <span className="dh-popup-card__badge" style={{ color: 'var(--ochre)', borderColor: 'var(--ochre)' }}>
                      {loc.category}
                    </span>
                  </div>
                  <span className="dh-popup-card__meta">
                    {loc.district ? `${loc.district} District` : loc.state}
                    {loc.elevationM ? ` · ~${loc.elevationM} m MSL` : ''}
                  </span>
                  <p className="dh-popup-card__desc">
                    {loc.description ?? `${loc.name} in Uttarakhand`}
                  </p>
                  <div className="dh-popup-actions" style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
                    {onSetDestination && (
                      <button
                        type="button"
                        className="dh-popup-btn dh-popup-btn--dest"
                        onClick={() => onSetDestination(loc)}
                        style={{
                          flex: 1,
                          padding: '5px 8px',
                          background: 'rgba(198, 161, 106, 0.15)',
                          border: '1px solid var(--ochre)',
                          color: 'var(--ochre)',
                          fontSize: '9px',
                          letterSpacing: '0.08em',
                          cursor: 'pointer',
                          fontWeight: 600,
                        }}
                      >
                        SET DESTINATION
                      </button>
                    )}
                    {onSetOrigin && (
                      <button
                        type="button"
                        className="dh-popup-btn dh-popup-btn--start"
                        onClick={() => onSetOrigin(loc)}
                        style={{
                          flex: 1,
                          padding: '5px 8px',
                          background: 'rgba(83, 185, 155, 0.15)',
                          border: '1px solid #53b99b',
                          color: '#53b99b',
                          fontSize: '9px',
                          letterSpacing: '0.08em',
                          cursor: 'pointer',
                          fontWeight: 600,
                        }}
                      >
                        SET START
                      </button>
                    )}
                  </div>
                </div>
              </Popup>
            </Marker>
          );
        })}

        {/* Live GPS Location & Accuracy Radius */}
        {liveLocation && (
          <>
            <Marker position={[liveLocation.latitude, liveLocation.longitude]} icon={liveLocationBeaconIcon}>
              <Tooltip direction="top" offset={[0, -14]}>
                YOUR LOCATION (GPS ±{liveLocation.accuracyMeters}m)
              </Tooltip>
              <Popup>
                <div className="dh-popup-card">
                  <div className="dh-popup-card__header">
                    <h3 className="dh-popup-card__title">Current Device Location</h3>
                    <span className="dh-popup-card__badge" style={{ color: '#00e5ff', borderColor: '#00e5ff' }}>
                      GPS LIVE
                    </span>
                  </div>
                  <span className="dh-popup-card__meta">
                    {formatCoordinates(liveLocation.latitude, liveLocation.longitude)}
                  </span>
                  <p className="dh-popup-card__desc">
                    Position acquired via browser Geolocation API. Estimated accuracy: ±{liveLocation.accuracyMeters} meters.
                  </p>
                </div>
              </Popup>
            </Marker>
            <Circle
              center={[liveLocation.latitude, liveLocation.longitude]}
              radius={Math.max(liveLocation.accuracyMeters, 50)}
              pathOptions={{
                color: '#00e5ff',
                fillColor: '#00e5ff',
                fillOpacity: 0.08,
                weight: 1,
                dashArray: '3 4',
              }}
            />
          </>
        )}

        {/* Temporary Map Click Pin (Pending Confirmation) */}
        {tempMapPoint && (
          <Marker position={[tempMapPoint.latitude, tempMapPoint.longitude]} icon={tempBeaconIcon}>
            <Popup autoClose={false} closeOnClick={false}>
              <div className="dh-confirm-popup">
                <span className="dh-confirm-popup__title">
                  SELECT AS {selectionMode === 'origin' ? 'START' : 'DESTINATION'}?
                </span>
                <span className="dh-confirm-popup__coords">
                  {formatCoordinates(tempMapPoint.latitude, tempMapPoint.longitude)}
                </span>
                <div className="dh-confirm-popup__actions">
                  <button
                    type="button"
                    className="dh-confirm-popup__btn dh-confirm-popup__btn--confirm"
                    onClick={() => onConfirmTempMapPoint?.()}
                  >
                    Confirm
                  </button>
                  <button
                    type="button"
                    className="dh-confirm-popup__btn dh-confirm-popup__btn--cancel"
                    onClick={() => onCancelTempMapPoint?.()}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </Popup>
          </Marker>
        )}
      </MapContainer>
    </div>
  );
};
