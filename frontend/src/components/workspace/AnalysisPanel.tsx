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
  Activity,
  AlertCircle,
  ShieldAlert,
} from 'lucide-react';
import { Card } from '../common/Card';
import { Badge } from '../common/Badge';
import { Button } from '../common/Button';
import { Divider } from '../common/Divider';
import { useEnvironmentalData, useRiskAssessment } from '../../hooks';
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

  const riskAssessment = useRiskAssessment(envData);

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

  // Status badge resolution for Hydro-Meteorological Risk card
  const renderRiskBadge = () => {
    if (isEnvLoading && !envData) {
      return (
        <Badge variant="default" size="sm" showDot>
          CALCULATING...
        </Badge>
      );
    }
    switch (riskAssessment.level) {
      case 'LOW':
        return (
          <Badge variant="low" size="sm" showDot>
            LOW RISK
          </Badge>
        );
      case 'MODERATE':
        return (
          <Badge variant="moderate" size="sm" showDot>
            MODERATE RISK
          </Badge>
        );
      case 'HIGH':
        return (
          <Badge variant="high" size="sm" showDot>
            HIGH RISK
          </Badge>
        );
      case 'SEVERE':
        return (
          <Badge variant="severe" size="sm" showDot>
            SEVERE RISK
          </Badge>
        );
      case 'INDETERMINATE':
      default:
        return (
          <Badge variant="default" size="sm">
            INSUFFICIENT DATA
          </Badge>
        );
    }
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

              {/* DEM-Derived Corridor Alignment Profile Metrics (Phase 5) */}
              {envData.terrain?.routeProfile && (
                <>
                  <Divider orientation="horizontal" variant="subtle" />
                  <div className="dh-analysis-panel__profile-summary">
                    <div className="dh-analysis-panel__profile-row">
                      <span className="dh-analysis-panel__profile-label">Corridor Elevation Range</span>
                      <span className="dh-analysis-panel__profile-val">
                        {envData.terrain.routeProfile.minElevationMsl !== null &&
                        envData.terrain.routeProfile.maxElevationMsl !== null
                          ? `${envData.terrain.routeProfile.minElevationMsl} – ${envData.terrain.routeProfile.maxElevationMsl} m MSL`
                          : '—'}
                      </span>
                    </div>
                    <div className="dh-analysis-panel__profile-row">
                      <span className="dh-analysis-panel__profile-label">Elevation Gain / Loss</span>
                      <span className="dh-analysis-panel__profile-val">
                        +{envData.terrain.routeProfile.elevationGainM ?? 0}m / -{envData.terrain.routeProfile.elevationLossM ?? 0}m
                      </span>
                    </div>
                    <div className="dh-analysis-panel__profile-row">
                      <span className="dh-analysis-panel__profile-label">DEM Corridor Alignment Gradient</span>
                      <span className="dh-analysis-panel__profile-val">
                        Mean: {envData.terrain.routeProfile.meanRouteGradientDegrees ?? '—'}° ({envData.terrain.routeProfile.meanRouteGradientPercent ?? '—'}%) | Peak: {envData.terrain.routeProfile.peakRouteGradientDegrees ?? '—'}°
                      </span>
                    </div>
                    <div className="dh-analysis-panel__profile-note">
                      * Straight control polyline; not physical road gradient
                    </div>
                  </div>
                </>
              )}

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

        {/* Section 3: Hydro-Meteorological Risk (Phase 4 Foundation) */}
        <Card
          variant="default"
          title="Hydro-Meteorological Risk"
          subtitle="Deterministic hazard exposure evaluation"
          headerAction={renderRiskBadge()}
          className="dh-analysis-panel__card"
        >
          <div className="dh-analysis-panel__risk-telemetry">
            {/* 1. Hero Score Display & Dynamic Gauge */}
            <div className="dh-analysis-panel__risk-hero">
              <div className="dh-analysis-panel__risk-hero-top">
                <div className="dh-analysis-panel__risk-score-display">
                  <span
                    className="dh-analysis-panel__risk-score-number"
                    style={{ color: riskAssessment.colorHex }}
                  >
                    {riskAssessment.score !== null ? riskAssessment.score.toFixed(1) : '—'}
                  </span>
                  <span className="dh-analysis-panel__risk-score-denom">/ 100</span>
                </div>
                <span
                  className="dh-analysis-panel__risk-level-tag"
                  style={{ color: riskAssessment.colorHex }}
                >
                  {riskAssessment.level !== 'INDETERMINATE'
                    ? `${riskAssessment.level} EXPOSURE`
                    : 'INDETERMINATE'}
                </span>
              </div>

              {/* Progress Gauge */}
              <div
                className="dh-analysis-panel__risk-gauge"
                role="progressbar"
                aria-valuenow={riskAssessment.score ?? 0}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label="Composite hazard exposure score"
              >
                <div
                  className="dh-analysis-panel__risk-gauge-bar"
                  style={{
                    width: `${riskAssessment.score ?? 0}%`,
                    backgroundColor: riskAssessment.colorHex,
                  }}
                />
              </div>
            </div>

            {/* 2. Primary Contributing Factor Callout */}
            <div className="dh-analysis-panel__risk-driver-box">
              <div className="dh-analysis-panel__risk-driver-header">
                <Activity size={12} className="dh-analysis-panel__risk-driver-icon" aria-hidden="true" />
                <span>Primary Hazard Driver</span>
              </div>
              <span className="dh-analysis-panel__risk-driver-val">
                {riskAssessment.primaryFactor && (riskAssessment.score || 0) > 0
                  ? riskAssessment.primaryFactor.name
                  : 'Baseline Calm Conditions'}
              </span>
              <span className="dh-analysis-panel__risk-driver-contrib">
                {riskAssessment.primaryFactor && (riskAssessment.score || 0) > 0
                  ? `+${riskAssessment.primaryFactor.weightedContribution?.toFixed(1)} pts (${(riskAssessment.primaryFactor.normalizedWeight * 100).toFixed(0)}% active weight)`
                  : 'All monitored hydro-meteorological metrics are within safe baseline bounds.'}
              </span>
            </div>

            <Divider orientation="horizontal" variant="subtle" />

            {/* 3. Factor Attribution Breakdown */}
            <div className="dh-analysis-panel__factors-section">
              <span className="dh-analysis-panel__factors-title">Factor Attribution Breakdown</span>
              <div className="dh-analysis-panel__factors-list">
                {riskAssessment.factors.map((factor) => {
                  const isActive = factor.status === 'active';
                  const isFuture = factor.status === 'unassessed_future_phase';
                  return (
                    <div
                      key={factor.id}
                      className={clsx('dh-analysis-panel__factor-item', {
                        'dh-analysis-panel__factor-item--unassessed': isFuture || !isActive,
                      })}
                    >
                      <div className="dh-analysis-panel__factor-header">
                        <span className="dh-analysis-panel__factor-name">{factor.name}</span>
                        <span
                          className={clsx('dh-analysis-panel__factor-status-badge', {
                            'dh-analysis-panel__factor-status-badge--active': isActive,
                            'dh-analysis-panel__factor-status-badge--unavailable': factor.status === 'unavailable',
                            'dh-analysis-panel__factor-status-badge--future': isFuture,
                          })}
                        >
                          {isActive ? 'ACTIVE' : isFuture ? (factor.id === 'scar_proximity' ? 'PHASE 7' : 'UNASSESSED') : 'UNAVAILABLE'}
                        </span>
                      </div>
                      <div className="dh-analysis-panel__factor-metrics">
                        <span className="dh-analysis-panel__factor-score">
                          {isActive && factor.score !== null ? `${factor.score.toFixed(1)} / 100` : '—'}
                        </span>
                        <span className="dh-analysis-panel__factor-contrib">
                          {isActive && factor.weightedContribution !== null
                            ? `+${factor.weightedContribution.toFixed(1)} pts (${(factor.normalizedWeight * 100).toFixed(0)}% wt)`
                            : isFuture
                            ? 'Unassessed'
                            : 'No data'}
                        </span>
                      </div>
                      <span className="dh-analysis-panel__factor-desc">
                        {isActive && factor.rawValue !== null
                          ? `${factor.rawValue} ${factor.unit} • ${factor.thresholdReference}`
                          : factor.explanation}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            <Divider orientation="horizontal" variant="subtle" />

            {/* 4. Telemetry Quality Audit */}
            <div className="dh-analysis-panel__risk-quality-row">
              <span className="dh-analysis-panel__risk-quality-label">
                <ShieldAlert size={11} className="dh-analysis-panel__meta-icon" aria-hidden="true" />
                Data Quality Status
              </span>
              <span
                className="dh-analysis-panel__risk-quality-val"
                style={{
                  color:
                    riskAssessment.dataQuality.rating === 'HIGH'
                      ? 'var(--risk-low)'
                      : riskAssessment.dataQuality.rating === 'MODERATE'
                      ? 'var(--risk-moderate)'
                      : 'var(--text-muted)',
                }}
              >
                {riskAssessment.dataQuality.rating} ({riskAssessment.dataQuality.activeFactorsCount}/5 Active Telemetry)
              </span>
            </div>

            {/* 5. Scientific Limitation Caveat Box */}
            <div className="dh-analysis-panel__risk-caveat-box" role="note">
              <AlertCircle size={14} className="dh-analysis-panel__risk-caveat-icon" aria-hidden="true" />
              <p className="dh-analysis-panel__risk-caveat-text">
                Assessment is based on available hydro-meteorological and DEM corridor alignment gradient telemetry. The corridor gradient is calculated along the straight control-point polyline connecting pilot corridor waypoints and is not the gradient of the physical NH-7 road alignment. Static geotechnical slope stability (Factor of Safety) and historical landslide scar proximity are not yet assessed. No landslide probability, certainty, or event prediction is implied.
              </p>
            </div>
          </div>
        </Card>

        {/* Section 4: Corridor Metrics (Preserved Phase 1/2 + Phase 5 DEM Metrics) */}
        <Card
          variant="muted"
          title="Corridor Metrics"
          subtitle="Pilot corridor control polyline overview"
          className="dh-analysis-panel__card"
        >
          <div className="dh-analysis-panel__metrics-list">
            <div className="dh-analysis-panel__metric-row">
              <span className="dh-analysis-panel__metric-label">Corridor Distance</span>
              <span className="dh-analysis-panel__metric-value">
                {envData?.terrain?.routeProfile?.totalDistanceM
                  ? `${(envData.terrain.routeProfile.totalDistanceM / 1000).toFixed(1)} km`
                  : '—'}
              </span>
            </div>
            <Divider orientation="horizontal" variant="subtle" />
            <div className="dh-analysis-panel__metric-row">
              <span className="dh-analysis-panel__metric-label">Mean Corridor Gradient</span>
              <span className="dh-analysis-panel__metric-value">
                {envData?.terrain?.routeProfile?.meanRouteGradientDegrees !== null &&
                envData?.terrain?.routeProfile?.meanRouteGradientDegrees !== undefined
                  ? `${envData.terrain.routeProfile.meanRouteGradientDegrees.toFixed(1)}° (${envData.terrain.routeProfile.meanRouteGradientPercent?.toFixed(1)}%)`
                  : '—'}
              </span>
            </div>
            <Divider orientation="horizontal" variant="subtle" />
            <div className="dh-analysis-panel__metric-row">
              <span className="dh-analysis-panel__metric-label">Peak Corridor Gradient</span>
              <span className="dh-analysis-panel__metric-value">
                {envData?.terrain?.routeProfile?.peakRouteGradientDegrees !== null &&
                envData?.terrain?.routeProfile?.peakRouteGradientDegrees !== undefined
                  ? `${envData.terrain.routeProfile.peakRouteGradientDegrees.toFixed(1)}° (${envData.terrain.routeProfile.peakRouteGradientPercent?.toFixed(1)}%)`
                  : '—'}
              </span>
            </div>
            <Divider orientation="horizontal" variant="subtle" />
            <div className="dh-analysis-panel__metric-row">
              <span className="dh-analysis-panel__metric-label">Terrain Exposure Score</span>
              <span
                className="dh-analysis-panel__metric-value"
                style={{
                  color: riskAssessment.score !== null ? riskAssessment.colorHex : undefined,
                }}
              >
                {riskAssessment.score !== null ? `${riskAssessment.score.toFixed(1)} / 100` : '—'}
              </span>
            </div>
          </div>
        </Card>
      </div>
    </aside>
  );
};
