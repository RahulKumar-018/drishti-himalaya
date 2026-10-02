import React, { useEffect, useRef } from 'react';
import clsx from 'clsx';
import {
  MapContainer,
  TileLayer,
  Polyline,
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

// Custom technical beacon icons
const startBeaconIcon = L.divIcon({
  className: 'dh-map-beacon dh-map-beacon--start',
  html: '<span class="dh-map-beacon__pulse"></span><span class="dh-map-beacon__dot"></span>',
  iconSize: [28, 28],
  iconAnchor: [14, 14],
  popupAnchor: [0, -14],
});

const endBeaconIcon = L.divIcon({
  className: 'dh-map-beacon dh-map-beacon--end',
  html: '<span class="dh-map-beacon__pulse"></span><span class="dh-map-beacon__dot"></span>',
  iconSize: [28, 28],
  iconAnchor: [14, 14],
  popupAnchor: [0, -14],
});

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

export {
  PILOT_CORRIDOR_COORDINATES,
  RISHIKESH_COORDS,
  JOSHIMATH_COORDS,
  CORRIDOR_CENTER,
  PILOT_CORRIDOR_CHORD_DISTANCE_KM,
  PILOT_CORRIDOR_PHYSICAL_ROAD_KM,
};

/**
 * Helper component ensuring Leaflet container recalculates dimensions
 * whenever mounted or resized, and fits corridor / selection bounds smoothly.
 */
function MapViewController({
  origin,
  destination,
  activeRoute,
}: {
  origin?: LocationPoint | null;
  destination?: LocationPoint | null;
  activeRoute?: RouteResult | null;
}): null {
  const map = useMap();
  const lastTargetKey = useRef<string>('');

  useEffect(() => {
    map.invalidateSize();

    const targetKey = `${origin?.id ?? ''}_${origin?.latitude ?? ''}_${destination?.id ?? ''}_${destination?.latitude ?? ''}_${activeRoute?.status ?? ''}_${activeRoute?.geometry?.length ?? 0}`;
    if (targetKey === lastTargetKey.current) {
      return;
    }
    lastTargetKey.current = targetKey;

    try {
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
      } else {
        map.fitBounds(L.latLngBounds(PILOT_CORRIDOR_COORDINATES), { padding: [36, 36] });
      }
    } catch {
      // Safe fallback
    }
  }, [map, origin, destination, activeRoute]);

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
  // Phase 1 Location Selection Props
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
  isLocating?: boolean;
  // Phase 2 Real Road Routing Props
  activeRoute?: RouteResult | null;
  isRouting?: boolean;
  routingError?: string | null;
  onRetryRouting?: () => void;
}

export const InteractiveMap: React.FC<InteractiveMapProps> = ({
  className,
  zoom = 9,
  segments,
  selectedSegmentId,
  onSelectSegment,
  isSimulated = false,
  scenarioPrecipitation = null,
  onResetScenario,
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
  isLocating = false,
  activeRoute,
  isRouting = false,
  routingError,
  onRetryRouting,
}) => {
  // Basemap fallback state: defaults to false if MapTiler API key is present, true if missing
  const [useFallbackOsm, setUseFallbackOsm] = React.useState(!hasMapTilerKey);

  useEffect(() => {
    if (import.meta.env.DEV && !hasMapTilerKey) {
      console.info('[InteractiveMap] VITE_MAPTILER_API_KEY not configured. Falling back to OpenStreetMap.');
    }
  }, []);

  // If segments are not provided by parent, calculate fallback baseline
  const activeSegments =
    segments && segments.length > 0
      ? segments
      : calculateCorridorSegmentRisks(null);

  const isSelectionActive = Boolean(selectionMode);
  const hasCustomSelection = Boolean(origin || destination);

  return (
    <div
      className={clsx('dh-interactive-map', {
        'dh-interactive-map--picking': isSelectionActive,
      }, className)}
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
            Click anywhere on the map to set{' '}
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

      {/* Quick Map Controls Toolbar (Top-Right) */}
      <div className="dh-interactive-map__toolbar" role="toolbar" aria-label="Map location controls">
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
              title="Pick origin on map"
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
              title="Pick destination on map"
            >
              <Flag size={11} />
              <span>Dest</span>
            </button>
          </>
        )}

        {hasCustomSelection && onResetRouteSelection && (
          <button
            type="button"
            className="dh-interactive-map__tool-btn dh-interactive-map__tool-btn--reset"
            onClick={onResetRouteSelection}
            title="Reset to default pilot corridor"
          >
            <RotateCcw size={11} />
            <span>Reset</span>
          </button>
        )}
      </div>

      {/* Floating Map Risk Legend */}
      <RiskLegend isSimulated={isSimulated} />

      <MapContainer
        center={CORRIDOR_CENTER}
        zoom={zoom}
        scrollWheelZoom={true}
        zoomControl={true}
        attributionControl={true}
      >
        <MapViewController origin={origin} destination={destination} activeRoute={activeRoute} />
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

        {/* ─── PHASE 2 REAL ROAD ROUTE POLYLINE ─────────────────────────── */}
        {activeRoute && activeRoute.status === 'success' && activeRoute.geometry.length > 0 && (
          <>
            {/* Background contrast casing for mountain terrain legibility */}
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

        {/* ─── BASELINE PILOT CORRIDOR (Shown when no real custom route is loaded) ─── */}
        {(!activeRoute || activeRoute.status !== 'success') &&
          activeSegments.map((segment) => {
          const isSelected = selectedSegmentId === segment.id;
          return (
            <Polyline
              key={segment.id}
              positions={segment.coordinates}
              pathOptions={{
                color: segment.colorHex,
                weight: isSelected ? 8 : 5,
                opacity: isSelected ? 1.0 : 0.9,
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
                  <strong>{segment.id}</strong>: {segment.name} | Risk {segment.riskScore.toFixed(1)}/100 ({segment.riskTier})
                </span>
              </Tooltip>
              <Popup maxWidth={300} className="dh-segment-popup">
                <div className="dh-popup-card dh-popup-card--segment">
                  {/* Header: Segment ID & Risk Tier Badge */}
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

                  {/* Primary Score */}
                  <div className="dh-popup-card__risk-metric">
                    <span className="dh-popup-card__risk-label">Terrain Corridor Risk</span>
                    <span
                      className="dh-popup-card__risk-value"
                      style={{ color: segment.colorHex }}
                    >
                      {segment.riskScore.toFixed(1)} / 100
                    </span>
                  </div>

                  {/* Grid Metrics */}
                  <div className="dh-popup-card__grid">
                    <div className="dh-popup-card__grid-item">
                      <span className="dh-popup-card__meta-k">Distance</span>
                      <span className="dh-popup-card__meta-v">~{segment.distanceKm.toFixed(1)} km</span>
                    </div>
                    <div className="dh-popup-card__grid-item">
                      <span className="dh-popup-card__meta-k">Terrain Gradient</span>
                      <span className="dh-popup-card__meta-v">
                        {segment.gradientDegrees.toFixed(1)}° ({segment.gradientPercent.toFixed(1)}%)
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

                  {/* Factor Contributions */}
                  <div className="dh-popup-card__factors">
                    <span className="dh-popup-card__factors-title">Factor Contributions</span>
                    <div className="dh-popup-card__factors-list">
                      {segment.factorContributions.map((fc) => (
                        <div key={fc.id} className="dh-popup-card__factor-row">
                          <span className="dh-popup-card__factor-name">{fc.name}</span>
                          <span className="dh-popup-card__factor-score">
                            {fc.contribution !== null ? `+${fc.contribution.toFixed(1)}` : '—'}
                            <span className="dh-popup-card__factor-weight">({fc.weightPercent}%)</span>
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Telemetry Scope & Data Quality */}
                  <div className="dh-popup-card__telemetry-scope">
                    <span>Data Quality: {segment.activeFactorsRatio} ({segment.dataQualityRating})</span>
                    <span className="dh-popup-card__scope-note">
                      Shared corridor hydro-met telemetry · Segment DEM gradient
                    </span>
                  </div>

                  {/* Technical Disclaimer */}
                  <div className="dh-popup-card__disclaimer">
                    {segment.disclaimer}
                  </div>
                </div>
              </Popup>
            </Polyline>
          );
        })}

        {/* ─── PHASE 1 CUSTOM LOCATION MARKERS ─────────────────────────── */}

        {/* Custom Start Location Marker */}
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

        {/* Custom Destination Marker */}
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

        {/* Live GPS Location Marker & Accuracy Halo */}
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
                    Position estimated via browser Geolocation API. Estimated accuracy radius: ±{liveLocation.accuracyMeters} meters.
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

        {/* ─── BASELINE PILOT CORRIDOR NODES (Rishikesh & Joshimath) ─────── */}
        <Marker position={RISHIKESH_COORDS} icon={startBeaconIcon}>
          <Tooltip direction="top" offset={[0, -12]}>
            Rishikesh — Pilot Corridor Start (~340 m MSL)
          </Tooltip>
          <Popup>
            <div className="dh-popup-card">
              <div className="dh-popup-card__header">
                <h3 className="dh-popup-card__title">Rishikesh</h3>
                <span className="dh-popup-card__badge dh-popup-card__badge--start">PILOT START</span>
              </div>
              <span className="dh-popup-card__meta">30.0869° N, 78.2676° E | ~340 m MSL</span>
              <p className="dh-popup-card__desc">
                Pilot Corridor Start node. Transit origin at the Garhwal Himalayan foothills along NH-7.
              </p>
            </div>
          </Popup>
        </Marker>

        <Marker position={JOSHIMATH_COORDS} icon={endBeaconIcon}>
          <Tooltip direction="top" offset={[0, -12]}>
            Joshimath — Pilot Corridor End (~1,890 m MSL)
          </Tooltip>
          <Popup>
            <div className="dh-popup-card">
              <div className="dh-popup-card__header">
                <h3 className="dh-popup-card__title">Joshimath</h3>
                <span className="dh-popup-card__badge dh-popup-card__badge--end">PILOT END</span>
              </div>
              <span className="dh-popup-card__meta">30.5564° N, 79.5663° E | ~1,890 m MSL</span>
              <p className="dh-popup-card__desc">
                Pilot Corridor End node. Strategic terminus situated in the high-relief Alaknanda gorge.
              </p>
            </div>
          </Popup>
        </Marker>
      </MapContainer>
    </div>
  );
};
