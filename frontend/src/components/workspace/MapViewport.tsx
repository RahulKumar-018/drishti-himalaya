import React, { useState } from 'react';
import clsx from 'clsx';
import { ArrowRight, Compass } from 'lucide-react';
import { Divider } from '../common/Divider';
import { InteractiveMap } from '../map/InteractiveMap';
import { EnvironmentalData } from '../../services/environmental/types';
import { RiskAssessment } from '../../services/risk/types';
import { CorridorSegmentRisk } from '../../services/risk/segmentRiskService';
import { useEnvironmentalData, useRiskAssessment } from '../../hooks';
import { UseLocationSelectionReturn } from '../../hooks/useLocationSelection';
import './MapViewport.css';

export interface MapViewportProps {
  className?: string;
  envData?: EnvironmentalData | null;
  riskAssessment?: RiskAssessment | null;
  isLoading?: boolean;
  isError?: boolean;
  segments?: CorridorSegmentRisk[];
  selectedSegmentId?: string | null;
  onSelectSegment?: (segment: CorridorSegmentRisk) => void;
  isSimulated?: boolean;
  scenarioPrecipitation?: number | null;
  onResetScenario?: () => void;
  locationSelection?: UseLocationSelectionReturn;
}

export const MapViewport: React.FC<MapViewportProps> = ({
  className,
  envData: propEnvData,
  riskAssessment: propRiskAssessment,
  isLoading: propIsLoading,
  isError: propIsError,
  segments,
  selectedSegmentId,
  onSelectSegment,
  isSimulated = false,
  scenarioPrecipitation = null,
  onResetScenario,
  locationSelection,
}) => {
  // Use authoritative props or fallback to hook if mounted standalone
  const hookEnv = useEnvironmentalData({ autoFetch: propEnvData === undefined });
  const envData = propEnvData !== undefined ? propEnvData : hookEnv.data;
  const isLoading = propIsLoading !== undefined ? propIsLoading : hookEnv.isLoading;
  const isError = propIsError !== undefined ? propIsError : hookEnv.isError;

  const [viewMode, setViewMode] = useState<'3d' | 'map'>('3d');

  const hookRisk = useRiskAssessment(propRiskAssessment ? null : envData);
  const riskAssessment = propRiskAssessment ?? hookRisk;

  const hasCustomRoute = Boolean(
    locationSelection?.origin || locationSelection?.destination
  );

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
      riskStr = isSimulated
        ? `SCENARIO RISK: ${riskAssessment.level} (${riskAssessment.score.toFixed(1)}/100) [SIMULATION]`
        : `RISK: ${riskAssessment.level} (${riskAssessment.score.toFixed(1)}/100)`;
    } else {
      riskStr = 'RISK: INSUFFICIENT DATA';
    }

    let routeStr = '';
    if (locationSelection?.isRouting) {
      routeStr = ' | ROAD ROUTING: IN PROGRESS';
    } else if (locationSelection?.activeRoute?.status === 'success') {
      routeStr = ` | ROAD ROUTE: READY (${locationSelection.activeRoute.metrics.formattedDistance}, ${locationSelection.activeRoute.metrics.formattedDuration})`;
    } else if (locationSelection?.routingError) {
      routeStr = ' | ROAD ROUTE: UNAVAILABLE';
    } else if (locationSelection?.isRouteReady) {
      routeStr = ' | ROUTE INPUT: READY';
    } else if (hasCustomRoute) {
      routeStr = ' | ROUTE INPUT: IN PROGRESS';
    }

    return `${telemetryStr} | ${riskStr}${routeStr}`;
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
          <span className="dh-map-viewport__corridor-code">
            {locationSelection?.activeRoute
              ? 'ROAD ROUTE (OSRM)'
              : hasCustomRoute
              ? 'CUSTOM ROUTE'
              : 'GARHWAL HIMALAYAS'}
          </span>
        </div>

        <div className="dh-map-viewport__header-right">
          {hasCustomRoute ? (
            <>
              <span className="dh-map-viewport__waypoint">
                {locationSelection?.origin?.name.toUpperCase() ?? 'START LOCATION'}
              </span>
              <ArrowRight size={11} className="dh-map-viewport__waypoint-arrow" aria-hidden="true" />
              <span className="dh-map-viewport__waypoint">
                {locationSelection?.destination?.name.toUpperCase() ?? 'DESTINATION'}
              </span>
            </>
          ) : (
            <span className="dh-map-viewport__waypoint">
              HAZARD INTELLIGENCE GRID · UTTARAKHAND
            </span>
          )}
          <Divider orientation="vertical" variant="subtle" />
          <button 
            className="dh-button dh-button--secondary dh-button--sm"
            onClick={() => setViewMode(v => v === '3d' ? 'map' : '3d')}
            style={{ fontSize: '10px', padding: '2px 8px' }}
          >
            {viewMode === '3d' ? 'SWITCH TO MAP' : 'SWITCH TO 3D'}
          </button>
        </div>
      </div>

      {/* Main Map Canvas Area: Active Leaflet Map */}
      <div className="dh-map-viewport__canvas" style={{ display: viewMode === 'map' ? 'block' : 'none' }}>
        <InteractiveMap
          segments={segments}
          selectedSegmentId={selectedSegmentId}
          onSelectSegment={onSelectSegment}
          isSimulated={isSimulated}
          scenarioPrecipitation={scenarioPrecipitation}
          onResetScenario={onResetScenario}
          origin={locationSelection?.origin}
          destination={locationSelection?.destination}
          liveLocation={locationSelection?.liveLocation}
          selectionMode={locationSelection?.selectionMode}
          tempMapPoint={locationSelection?.tempMapPoint}
          onMapClick={locationSelection?.handleMapClick}
          onConfirmTempMapPoint={locationSelection?.confirmTempMapPoint}
          onCancelTempMapPoint={locationSelection?.cancelTempMapPoint}
          onCancelSelectionMode={locationSelection?.cancelMapSelection}
          onStartMapSelection={locationSelection?.startMapSelection}
          onUseLiveLocation={locationSelection?.useLiveLocationAsOrigin}
          onResetRouteSelection={locationSelection?.resetSelection}
          onSetOrigin={locationSelection?.setOrigin}
          onSetDestination={locationSelection?.setDestination}
          isLocating={locationSelection?.isLocating}
          activeRoute={locationSelection?.activeRoute}
          isRouting={locationSelection?.isRouting}
          routingError={locationSelection?.routingError}
          onRetryRouting={locationSelection?.retryRouting}
        />
      </div>

      {/* Bottom Technical Status Bar */}
      <div className="dh-map-viewport__footer">
        <span className="dh-map-viewport__footer-meta">
          {locationSelection?.activeRoute
            ? `UTTARAKHAND ROAD ROUTE (${locationSelection.activeRoute.provider.toUpperCase()})`
            : hasCustomRoute
            ? 'UTTARAKHAND DYNAMIC ROUTE SECTOR (PHASE 1)'
            : 'PILOT SECTOR: GARHWAL HIMALAYAS'}
        </span>
        <span className="dh-map-viewport__footer-status">{getStatusText()}</span>
      </div>
    </section>
  );
};
