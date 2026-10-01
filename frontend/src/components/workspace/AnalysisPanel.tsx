import React from 'react';
import clsx from 'clsx';
import {
  CloudRain,
  Mountain,
  RefreshCw,
  AlertTriangle,
  Radio,
  Clock,
  Compass,
} from 'lucide-react';
import { Card } from '../common/Card';
import { Badge } from '../common/Badge';
import { Button } from '../common/Button';
import { Divider } from '../common/Divider';
import { useEnvironmentalData } from '../../hooks';
import './AnalysisPanel.css';

export interface AnalysisPanelProps {
  className?: string;
}

export const AnalysisPanel: React.FC<AnalysisPanelProps> = ({ className }) => {
  const {
    data: envData,
    isLoading: isEnvLoading,
    isRefreshing: isEnvRefreshing,
    isError: isEnvError,
    error: envError,
    lastUpdated,
    refresh: refreshEnv,
  } = useEnvironmentalData();

  // Status badge resolution for Environmental Conditions card
  const renderEnvBadge = () => {
    if (isEnvLoading && !envData) {
      return (
        <Badge variant="default" size="sm" showDot>
          CONNECTING...
        </Badge>
      );
    }
    if (isEnvError || !envData) {
      return (
        <Badge variant="severe" size="sm">
          DATA UNAVAILABLE
        </Badge>
      );
    }
    if (envData.status === 'partial') {
      return (
        <Badge variant="moderate" size="sm">
          PARTIAL TELEMETRY
        </Badge>
      );
    }
    return (
      <Badge variant="low" size="sm" showDot>
        DATA ONLINE
      </Badge>
    );
  };

  return (
    <aside
      className={clsx('dh-analysis-panel', className)}
      aria-label="Route and Risk Analysis Panel"
    >
      {/* Panel Header */}
      <div className="dh-analysis-panel__header">
        <h2 className="dh-analysis-panel__title">ANALYSIS PANEL</h2>
        <span className="dh-analysis-panel__subtitle">Decision Support Telemetry</span>
      </div>

      {/* Panel Scrollable Body */}
      <div className="dh-analysis-panel__content">
        {/* Section 1: Real Environmental Telemetry (Phase 3 Foundation) */}
        <Card
          variant="default"
          title="Environmental Conditions"
          subtitle="Real-time precipitation &amp; elevation telemetry"
          headerAction={renderEnvBadge()}
          className="dh-analysis-panel__card"
        >
          {isEnvLoading && !envData ? (
            <div className="dh-analysis-panel__loading-state" role="status" aria-label="Loading environmental data">
              <div className="dh-analysis-panel__loading-spinner">
                <RefreshCw size={16} className="dh-analysis-panel__spin-icon" />
              </div>
              <div className="dh-analysis-panel__loading-text">
                <span className="dh-analysis-panel__loading-title">Retrieving Telemetry</span>
                <span className="dh-analysis-panel__loading-desc">
                  Connecting to Open-Meteo &amp; Copernicus DEM endpoints...
                </span>
              </div>
            </div>
          ) : isEnvError && !envData ? (
            <div className="dh-analysis-panel__error-state" role="alert">
              <div className="dh-analysis-panel__error-header">
                <AlertTriangle size={15} className="dh-analysis-panel__error-icon" aria-hidden="true" />
                <span className="dh-analysis-panel__error-title">Telemetry Unavailable</span>
              </div>
              <p className="dh-analysis-panel__error-detail">
                {envError || 'Unable to establish connection with environmental data providers.'}
              </p>
              <p className="dh-analysis-panel__error-note">
                No simulated data is substituted. Reconnect to resume live telemetry.
              </p>
              <Button
                variant="secondary"
                size="sm"
                loading={isEnvRefreshing}
                onClick={refreshEnv}
                leadingIcon={<RefreshCw size={12} />}
                className="dh-analysis-panel__retry-btn"
              >
                Retry Connection
              </Button>
            </div>
          ) : envData ? (
            <div className="dh-analysis-panel__env-telemetry">
              {/* Primary Dual Metric Grid: Rainfall + Elevation */}
              <div className="dh-analysis-panel__env-grid">
                {/* Rainfall Telemetry Cell */}
                <div className="dh-analysis-panel__env-cell">
                  <div className="dh-analysis-panel__cell-header">
                    <CloudRain size={13} className="dh-analysis-panel__cell-icon dh-analysis-panel__cell-icon--rain" />
                    <span className="dh-analysis-panel__cell-title">PRECIPITATION</span>
                  </div>
                  <div className="dh-analysis-panel__cell-main">
                    <span className="dh-analysis-panel__cell-value">
                      {envData.rainfall?.precipitation !== null && envData.rainfall?.precipitation !== undefined
                        ? `${envData.rainfall.precipitation.toFixed(1)} ${envData.rainfall.precipitationUnit}`
                        : '—'}
                    </span>
                  </div>
                  <div className="dh-analysis-panel__cell-sub">
                    <span className="dh-analysis-panel__cell-subtext">
                      {envData.rainfall?.weatherDescription || 'Condition unknown'}
                    </span>
                    {envData.rainfall?.precipitationProbability !== null &&
                      envData.rainfall?.precipitationProbability !== undefined && (
                        <span className="dh-analysis-panel__cell-prob">
                          Pop: {envData.rainfall.precipitationProbability}%
                        </span>
                      )}
                  </div>
                </div>

                {/* Elevation Telemetry Cell */}
                <div className="dh-analysis-panel__env-cell">
                  <div className="dh-analysis-panel__cell-header">
                    <Mountain size={13} className="dh-analysis-panel__cell-icon dh-analysis-panel__cell-icon--elevation" />
                    <span className="dh-analysis-panel__cell-title">ELEVATION</span>
                  </div>
                  <div className="dh-analysis-panel__cell-main">
                    <span className="dh-analysis-panel__cell-value">
                      {envData.terrain?.elevation.elevation !== null &&
                      envData.terrain?.elevation.elevation !== undefined
                        ? `${envData.terrain.elevation.elevation.toLocaleString()} ${envData.terrain.elevation.elevationUnit}`
                        : '—'}
                    </span>
                    <span className="dh-analysis-panel__cell-unit-tag">MSL</span>
                  </div>
                  <div className="dh-analysis-panel__cell-sub">
                    <span className="dh-analysis-panel__cell-subtext">Copernicus DEM 90m</span>
                  </div>
                </div>
              </div>

              <Divider orientation="horizontal" variant="subtle" />

              {/* Technical Location & Provider Details */}
              <div className="dh-analysis-panel__env-meta-list">
                <div className="dh-analysis-panel__env-meta-row">
                  <span className="dh-analysis-panel__env-meta-label">
                    <Compass size={11} className="dh-analysis-panel__meta-icon" />
                    Monitoring Node
                  </span>
                  <span className="dh-analysis-panel__env-meta-val">
                    30.32° N, 78.92° E
                  </span>
                </div>
                <div className="dh-analysis-panel__env-meta-row">
                  <span className="dh-analysis-panel__env-meta-label">
                    <Radio size={11} className="dh-analysis-panel__meta-icon" />
                    Data Source
                  </span>
                  <span className="dh-analysis-panel__env-meta-val">
                    Open-Meteo (Keyless)
                  </span>
                </div>
                <div className="dh-analysis-panel__env-meta-row">
                  <span className="dh-analysis-panel__env-meta-label">
                    <Clock size={11} className="dh-analysis-panel__meta-icon" />
                    Last Synchronized
                  </span>
                  <span className="dh-analysis-panel__env-meta-val">
                    {lastUpdated || 'Recent'}
                  </span>
                </div>
              </div>

              {/* Refresh Action Trigger */}
              <div className="dh-analysis-panel__env-actions">
                <Button
                  variant="ghost"
                  size="sm"
                  loading={isEnvRefreshing}
                  onClick={refreshEnv}
                  leadingIcon={<RefreshCw size={11} />}
                  className="dh-analysis-panel__refresh-btn"
                >
                  {isEnvRefreshing ? 'Synchronizing...' : 'Refresh Telemetry'}
                </Button>
              </div>
            </div>
          ) : null}
        </Card>

        {/* Section 2: Route Analysis (Preserved Phase 1/2) */}
        <Card
          variant="default"
          title="Route Analysis"
          subtitle="Primary vs safer alternative route comparison"
          headerAction={
            <Badge variant="default" size="sm">
              AWAITING ROUTE INPUT
            </Badge>
          }
          className="dh-analysis-panel__card"
        >
          <p className="dh-analysis-panel__placeholder-text">
            Route corridor geometry and segment breakdown will populate once waypoint parameters are initialized.
          </p>
        </Card>

        {/* Section 3: Risk Assessment (Preserved Phase 1/2) */}
        <Card
          variant="default"
          title="Risk Assessment"
          subtitle="Geotechnical &amp; meteorological evaluation"
          headerAction={
            <Badge variant="default" size="sm">
              RISK ENGINE OFFLINE
            </Badge>
          }
          className="dh-analysis-panel__card"
        >
          <p className="dh-analysis-panel__placeholder-text">
            Hazard scoring engine pending backend connection. 250m segment slope stability models inactive.
          </p>
        </Card>

        {/* Section 4: Route Metrics (Preserved Phase 1/2) */}
        <Card
          variant="muted"
          title="Route Metrics"
          subtitle="Corridor telemetry overview"
          className="dh-analysis-panel__card"
        >
          <div className="dh-analysis-panel__metrics-list">
            <div className="dh-analysis-panel__metric-row">
              <span className="dh-analysis-panel__metric-label">Distance</span>
              <span className="dh-analysis-panel__metric-value">—</span>
            </div>
            <Divider orientation="horizontal" variant="subtle" />
            <div className="dh-analysis-panel__metric-row">
              <span className="dh-analysis-panel__metric-label">Estimated Time</span>
              <span className="dh-analysis-panel__metric-value">—</span>
            </div>
            <Divider orientation="horizontal" variant="subtle" />
            <div className="dh-analysis-panel__metric-row">
              <span className="dh-analysis-panel__metric-label">Risk Score</span>
              <span className="dh-analysis-panel__metric-value">—</span>
            </div>
            <Divider orientation="horizontal" variant="subtle" />
            <div className="dh-analysis-panel__metric-row">
              <span className="dh-analysis-panel__metric-label">Highest Risk Segment</span>
              <span className="dh-analysis-panel__metric-value">—</span>
            </div>
          </div>
        </Card>
      </div>
    </aside>
  );
};
