import React, { useEffect } from 'react';
import clsx from 'clsx';
import {
  MapContainer,
  TileLayer,
  Polyline,
  Marker,
  Popup,
  Tooltip,
  useMap,
} from 'react-leaflet';
import L from 'leaflet';
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';
import './InteractiveMap.css';

// Fix default Leaflet asset URL resolution in bundlers
delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown })._getIconUrl;
L.Icon.Default.mergeOptions({
  iconUrl: markerIcon,
  iconRetinaUrl: markerIcon2x,
  shadowUrl: markerShadow,
});

// Custom technical beacon icons for Start and End nodes
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

import {
  PILOT_CORRIDOR_COORDINATES,
  RISHIKESH_COORDS,
  JOSHIMATH_COORDS,
  DEFAULT_CORRIDOR_CENTER as CORRIDOR_CENTER,
} from '../../services/environmental/corridorConstants';

export { PILOT_CORRIDOR_COORDINATES, RISHIKESH_COORDS, JOSHIMATH_COORDS, CORRIDOR_CENTER };

/**
 * Helper component ensuring Leaflet container recalculates dimensions
 * whenever mounted or when the viewport resizes.
 */
function MapAutoResizer(): null {
  const map = useMap();

  useEffect(() => {
    map.invalidateSize();

    const timer = setTimeout(() => {
      map.invalidateSize();
    }, 250);

    const onResize = () => {
      map.invalidateSize();
    };

    window.addEventListener('resize', onResize);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', onResize);
    };
  }, [map]);

  return null;
}

export interface InteractiveMapProps {
  className?: string;
  zoom?: number;
}

export const InteractiveMap: React.FC<InteractiveMapProps> = ({
  className,
  zoom = 9,
}) => {
  return (
    <div className={clsx('dh-interactive-map', className)}>
      <MapContainer
        center={CORRIDOR_CENTER}
        zoom={zoom}
        scrollWheelZoom={true}
        zoomControl={true}
        attributionControl={true}
      >
        <MapAutoResizer />

        {/* Standard OpenStreetMap Tile Layer */}
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors'
          maxZoom={18}
          minZoom={7}
        />

        {/* Pilot Corridor Polyline (Rishikesh -> Joshimath) */}
        <Polyline
          positions={PILOT_CORRIDOR_COORDINATES}
          pathOptions={{
            color: '#0ea5e9', // Glacier cyan
            weight: 4,
            opacity: 0.9,
            lineCap: 'round',
            lineJoin: 'round',
          }}
        >
          <Tooltip sticky direction="top">
            NH-7 Pilot Corridor: Rishikesh → Joshimath (~240 km)
          </Tooltip>
          <Popup>
            <div className="dh-popup-card">
              <div className="dh-popup-card__header">
                <span className="dh-popup-card__title">NH-7 Pilot Corridor</span>
                <span className="dh-popup-card__badge dh-popup-card__badge--start">PROTOTYPE</span>
              </div>
              <span className="dh-popup-card__meta">Rishikesh → Joshimath | ~240 km</span>
              <p className="dh-popup-card__desc">
                Prototype corridor visualization. Authoritative road segmentation and live risk calculations will activate in Phase 4 &amp; 5.
              </p>
            </div>
          </Popup>
        </Polyline>

        {/* Rishikesh Start Marker */}
        <Marker position={RISHIKESH_COORDS} icon={startBeaconIcon}>
          <Tooltip direction="top" offset={[0, -12]}>
            Rishikesh — Pilot Corridor Start
          </Tooltip>
          <Popup>
            <div className="dh-popup-card">
              <div className="dh-popup-card__header">
                <h3 className="dh-popup-card__title">Rishikesh</h3>
                <span className="dh-popup-card__badge dh-popup-card__badge--start">START</span>
              </div>
              <span className="dh-popup-card__meta">30.0869° N, 78.2676° E | ~340 m MSL</span>
              <p className="dh-popup-card__desc">
                Pilot Corridor Start node. Transit origin at the Garhwal Himalayan foothills along NH-7.
              </p>
            </div>
          </Popup>
        </Marker>

        {/* Joshimath End Marker */}
        <Marker position={JOSHIMATH_COORDS} icon={endBeaconIcon}>
          <Tooltip direction="top" offset={[0, -12]}>
            Joshimath — Pilot Corridor End
          </Tooltip>
          <Popup>
            <div className="dh-popup-card">
              <div className="dh-popup-card__header">
                <h3 className="dh-popup-card__title">Joshimath</h3>
                <span className="dh-popup-card__badge dh-popup-card__badge--end">END</span>
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
