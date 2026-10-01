import React from 'react';
import clsx from 'clsx';
import { Map, ArrowRight, Compass } from 'lucide-react';
import { Badge } from '../common/Badge';
import { Divider } from '../common/Divider';
import './MapViewport.css';

export interface MapViewportProps {
  className?: string;
}

export const MapViewport: React.FC<MapViewportProps> = ({ className }) => {
  return (
    <section
      className={clsx('dh-map-viewport', className)}
      aria-label="Interactive Map Viewport"
    >
      {/* Top Header Strip: Context Metadata */}
      <div className="dh-map-viewport__header">
        <div className="dh-map-viewport__header-left">
          <div className="dh-map-viewport__tag">
            <Compass size={13} className="dh-map-viewport__tag-icon" aria-hidden="true" />
            <span>MAP VIEWPORT</span>
          </div>
          <Divider orientation="vertical" variant="subtle" />
          <span className="dh-map-viewport__corridor-code">NH-7 CORRIDOR</span>
        </div>

        <div className="dh-map-viewport__header-right">
          <span className="dh-map-viewport__waypoint">RISHIKESH</span>
          <ArrowRight size={11} className="dh-map-viewport__waypoint-arrow" aria-hidden="true" />
          <span className="dh-map-viewport__waypoint">JOSHIMATH</span>
        </div>
      </div>

      {/* Main Map Canvas Area: Restrained Technical Placeholder */}
      <div className="dh-map-viewport__canvas">
        <div className="dh-map-viewport__canvas-frame">
          <div className="dh-map-viewport__icon-box" aria-hidden="true">
            <Map size={30} className="dh-map-viewport__icon" />
          </div>

          <h2 className="dh-map-viewport__title">INTERACTIVE MAP</h2>

          <p className="dh-map-viewport__desc">
            Geospatial terrain and route risk visualization layer
          </p>

          <Badge variant="default" size="sm" showDot className="dh-map-viewport__badge">
            LEAFLET MAP MODULE — PENDING
          </Badge>
        </div>
      </div>

      {/* Bottom Technical Status Bar */}
      <div className="dh-map-viewport__footer">
        <span className="dh-map-viewport__footer-meta">PILOT SECTOR: GARHWAL HIMALAYAS</span>
        <span className="dh-map-viewport__footer-status">GEOSPATIAL ENGINE PENDING (PHASE 2)</span>
      </div>
    </section>
  );
};
