import React from 'react';
import clsx from 'clsx';
import { ArrowRight, Compass } from 'lucide-react';
import { Divider } from '../common/Divider';
import { InteractiveMap } from '../map/InteractiveMap';
import { useEnvironmentalData, useRiskAssessment } from '../../hooks';
import './MapViewport.css';

export interface MapViewportProps {
  className?: string;
}

export const MapViewport: React.FC<MapViewportProps> = ({ className }) => {
  const { data: envData, isLoading, isError } = useEnvironmentalData();
  const riskAssessment = useRiskAssessment(envData);

  const getStatusText = () => {
    let telemetryStr: string;
    if (isLoading && !envData) {
      telemetryStr = 'TELEMETRY: INITIALIZING';
    } else if (isError || !envData) {
      telemetryStr = 'TELEMETRY: OFFLINE';
    } else if (envData.status === 'partial') {
      telemetryStr = 'TELEMETRY: PARTIAL';
    } else {
      telemetryStr = 'TELEMETRY: ONLINE';
    }

    let riskStr: string;
    if (riskAssessment.score !== null && riskAssessment.level !== 'INDETERMINATE') {
      riskStr = `RISK: ${riskAssessment.level} (${riskAssessment.score.toFixed(1)}/100)`;
    } else {
      riskStr = 'RISK: INSUFFICIENT DATA';
    }

    return `${telemetryStr} | ${riskStr}`;
  };

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

      {/* Main Map Canvas Area: Active Leaflet Map */}
      <div className="dh-map-viewport__canvas">
        <InteractiveMap />
      </div>

      {/* Bottom Technical Status Bar */}
      <div className="dh-map-viewport__footer">
        <span className="dh-map-viewport__footer-meta">PILOT SECTOR: GARHWAL HIMALAYAS</span>
        <span className="dh-map-viewport__footer-status">{getStatusText()}</span>
      </div>
    </section>
  );
};
