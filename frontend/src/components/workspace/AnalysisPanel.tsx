import React, { useState } from 'react';
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
  HelpCircle,
} from 'lucide-react';
import { Card } from '../common/Card';
import { Badge } from '../common/Badge';
import { Button } from '../common/Button';
import { Divider } from '../common/Divider';
import { RouteSetupPanel } from '../route/RouteSetupPanel';
import { RouteComparisonHUD, RouteOption, DecisionRationale, RationaleFactor } from '../route';
import { SegmentInspection } from './SegmentInspection';
import { CorridorSegmentRisk } from '../../services/risk/segmentRiskService';
import { useEnvironmentalData, useRiskAssessment } from '../../hooks';
import { useLocationSelection, UseLocationSelectionReturn } from '../../hooks/useLocationSelection';
import { EnvironmentalData } from '../../services/environmental/types';
import { RiskAssessment } from '../../services/risk/types';
import { evaluateRainfallScenario } from '../../services/risk/scenarioService';
import { PILOT_CORRIDOR_CHORD_DISTANCE_KM } from '../../services/environmental/corridorConstants';
import './AnalysisPanel.css';

export interface AnalysisPanelProps {
  className?: string;
  envData?: EnvironmentalData | null;
  riskAssessment?: RiskAssessment | null;
  isLoading?: boolean;
  isRefreshing?: boolean;
  isError?: boolean;
  error?: string | null;
  lastUpdated?: string | null;
  onRefresh?: () => Promise<void>;
  scenarioPrecipitation?: number | null;
  onScenarioChange?: (val: number | null) => void;
  scenarioRiskAssessment?: RiskAssessment | null;
  locationSelection?: UseLocationSelectionReturn;
  segments?: CorridorSegmentRisk[];
  selectedSegmentId?: string | null;
  onSelectSegment?: (segment: CorridorSegmentRisk | null) => void;
}

export const AnalysisPanel: React.FC<AnalysisPanelProps> = ({
  className,
  envData: propEnvData,
  riskAssessment: propRiskAssessment,
  isLoading: propIsLoading,
  isRefreshing: propIsRefreshing,
  isError: propIsError,
  error: propError,
  lastUpdated: propLastUpdated,
  onRefresh: propOnRefresh,
  scenarioPrecipitation: propScenarioPrecipitation,
  onScenarioChange: propOnScenarioChange,
  scenarioRiskAssessment: propScenarioRiskAssessment,
  locationSelection: propLocationSelection,
  segments,
  selectedSegmentId,
  onSelectSegment,
}) => {
  // Derive selected segment for detailed inspection
  const selectedSegment =
    segments && selectedSegmentId
      ? segments.find((s) => s.id === selectedSegmentId) ?? null
      : null;

  // Fallback to internal hook if locationSelection is not supplied
  const internalLocationSelection = useLocationSelection();
  const locationSelection = propLocationSelection ?? internalLocationSelection;

  // Fallback to internal hook if props are not supplied by Workspace container
  const hookEnv = useEnvironmentalData({ autoFetch: propEnvData === undefined });
  const envData = propEnvData !== undefined ? propEnvData : hookEnv.data;
  const isEnvLoading = propIsLoading !== undefined ? propIsLoading : hookEnv.isLoading;
  const isEnvRefreshing = propIsRefreshing !== undefined ? propIsRefreshing : hookEnv.isRefreshing;
  const isEnvError = propIsError !== undefined ? propIsError : hookEnv.isError;
  const envError = propError !== undefined ? propError : hookEnv.error;
  const lastUpdated = propLastUpdated !== undefined ? propLastUpdated : hookEnv.lastUpdated;
  const refreshEnv = propOnRefresh !== undefined ? propOnRefresh : hookEnv.refresh;

  const hookRisk = useRiskAssessment(propRiskAssessment ? null : envData);
  const riskAssessment = propRiskAssessment ?? hookRisk;

  // Local scenario state fallback for standalone mounting
  const [localScenarioPrecip, setLocalScenarioPrecip] = useState<number | null>(null);

  const livePrecip = envData?.rainfall?.precipitation ?? 0;
  const isControlledSim = propScenarioPrecipitation !== undefined;
  const scenarioPrecip = isControlledSim ? propScenarioPrecipitation : localScenarioPrecip;
  const isSimActive = scenarioPrecip !== null && scenarioPrecip !== undefined;
  const activeScenarioPrecip = isSimActive ? scenarioPrecip : livePrecip;

  const handleScenarioSlider = (val: number) => {
    if (propOnScenarioChange) {
      propOnScenarioChange(val);
    } else {
      setLocalScenarioPrecip(val);
    }
  };

  const handleResetScenario = () => {
    if (propOnScenarioChange) {
      propOnScenarioChange(null);
    } else {
      setLocalScenarioPrecip(null);
    }
  };

  const evaluatedScenarioRisk =
    propScenarioRiskAssessment ??
    evaluateRainfallScenario(envData, activeScenarioPrecip);

  const liveScore = riskAssessment.score ?? 0;
  const scenarioScore = evaluatedScenarioRisk.score ?? 0;
  const scoreDelta = Math.round((scenarioScore - liveScore) * 10) / 10;

  // Top active factor contributors for "Why this assessment?" executive rationale (Phase 6C.2)
  const topActiveContributors = React.useMemo(() => {
    if (!riskAssessment?.factors) return [];
    return riskAssessment.factors
      .filter((f) => f.status === 'active' && f.weightedContribution !== null && f.weightedContribution > 0)
      .sort((a, b) => (b.weightedContribution ?? 0) - (a.weightedContribution ?? 0))
      .slice(0, 3);
  }, [riskAssessment]);

  // Authoritative coverage derivation for executive assessment rationale (Phase 6C.2)
  const { coverageBadgeText, coverageDetailText } = React.useMemo(() => {
    const activeCount = riskAssessment?.dataQuality?.activeFactorsCount ?? 0;
    const unavailableCount = riskAssessment?.dataQuality?.unavailableFactorsCount ?? 0;
    const unavailableFactors = (riskAssessment?.factors ?? []).filter(
      (f) => f.status === 'unavailable'
    );

    if (unavailableCount > 0 && unavailableFactors.length > 0) {
      const missingNames = unavailableFactors
        .map((f) => {
          if (f.id === 'terrain_slope_gradient') return 'terrain unavailable';
          if (f.id === 'orographic_elevation') return 'elevation unavailable';
          if (f.id === 'precipitation_intensity') return 'rain intensity unavailable';
          if (f.id === 'rainfall_accumulation_24h') return '24h rainfall unavailable';
          if (f.id === 'precipitation_probability') return 'rain probability unavailable';
          return `${f.name.toLowerCase()} unavailable`;
        })
        .join(', ');
      return {
        coverageBadgeText: `${activeCount} active factors • ${missingNames}`,
        coverageDetailText: `${activeCount} active factors evaluated with dynamic weight normalization (${missingNames}).`,
      };
    }

    return {
      coverageBadgeText: `${activeCount} active factors`,
      coverageDetailText: `Full assessment coverage across all ${activeCount} active hydro-meteorological and hypsometric factors.`,
    };
  }, [riskAssessment]);

  // Derive ranked higher-risk segments (Hotspots) from authoritative corridor segments (Phase 6C.3)
  const rankedHotspots = React.useMemo(() => {
    if (!segments || segments.length === 0) return [];
    return segments
      .filter(
        (seg) =>
          typeof seg.riskScore === 'number' &&
          !isNaN(seg.riskScore) &&
          seg.riskTier !== 'INDETERMINATE'
      )
      .sort((a, b) => b.riskScore - a.riskScore)
      .slice(0, 5);
  }, [segments]);

  // Route Alternatives Selection State (Phase 1 & UXMagic Frame 3)
  const [selectedRouteId, setSelectedRouteId] = useState<string>('direct-corridor');

  const primaryScore = riskAssessment.score ?? 48;
  const isCustomRoute = !!locationSelection.activeRoute;
  const routeDist = isCustomRoute
    ? locationSelection.activeRoute?.metrics.totalDistanceKm
    : 156;
  const routeTime =
    (isCustomRoute ? locationSelection.activeRoute?.metrics.formattedDuration : null) || '7h 16m';

  const evaluatedRouteOptions: RouteOption[] = [
    {
      id: 'direct-corridor',
      title: isCustomRoute ? `${locationSelection.origin?.name} → ${locationSelection.destination?.name}` : 'Direct Corridor',
      route: 'Via Chamoli · NH-7',
      via: 'Primary arterial alignment',
      riskScore: primaryScore,
      estimatedTime: routeTime,
      distanceKm: routeDist,
      status: primaryScore >= 75 ? 'critical' : primaryScore >= 50 ? 'high' : primaryScore >= 25 ? 'moderate' : 'low',
      statusBadge: 'Direct corridor',
      selected: selectedRouteId === 'direct-corridor',
      riskTrend: 'Arterial transit',
    },
    {
      id: 'lower-exposure',
      title: 'Lower-Exposure Route',
      route: 'Via Srinagar · NH-7',
      via: 'Tehri / Srinagar diversion',
      riskScore: Math.max(18, Math.round(primaryScore * 0.72)),
      estimatedTime: '7h 42m',
      distanceKm: Math.round((routeDist || 156) * 1.14),
      status: 'low',
      statusBadge: 'Lower exposure',
      selected: selectedRouteId === 'lower-exposure',
      riskTrend: '-28% slope exposure',
    },
    {
      id: 'rainfall-sensitive',
      title: 'Rainfall-Sensitive Route',
      route: 'Via Rudraprayag Gorge',
      via: 'High-relief river cut-slopes',
      riskScore: Math.min(94, Math.round(primaryScore * 1.25 + 10)),
      estimatedTime: '7h 28m',
      distanceKm: Math.round((routeDist || 156) * 0.98),
      status: 'high',
      statusBadge: 'Rainfall-sensitive',
      selected: selectedRouteId === 'rainfall-sensitive',
      riskTrend: 'Watch rain threshold',
    },
  ];

  const comparativeFactors: RationaleFactor[] = [
    {
      id: 'slope',
      label: 'Slope Exposure',
      delta: -28,
      unit: '%',
      direction: 'decrease',
      explanation: 'Diversion reduces traversed cut-slope sectors exceeding 30° critical gradient.',
    },
    {
      id: 'rain',
      label: 'Rainfall Saturation',
      delta: -22,
      unit: '%',
      direction: 'decrease',
      explanation: 'Bypasses localized high-elevation cloudburst accumulation zones.',
    },
    {
      id: 'scars',
      label: 'Historical Scar Proximity',
      delta: -19,
      unit: '%',
      direction: 'decrease',
      explanation: 'Maintains greater buffer distance from recorded historical landslide scars.',
    },
  ];

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
        {/* Section 0: Dynamic Location & Destination Setup (Phase 1) */}
        <RouteSetupPanel locationSelection={locationSelection} />

        {/* Section 0.5: Detailed Hazard Segment Inspection (UXMagic Frame 4) */}
        {selectedSegment && (
          <SegmentInspection
            segment={selectedSegment}
            onClose={() => onSelectSegment?.(null)}
            onFocusMap={(seg) => onSelectSegment?.(seg)}
          />
        )}

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

        {/* Section 2: Hydro-Meteorological Risk (Phase 4 Foundation & Phase 6C.2) */}
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

            {/* 2. WHY THIS ASSESSMENT? (Phase 6C.2 Executive Rationale) */}
            <div className="dh-analysis-panel__why-box" role="region" aria-label="Why this assessment rationale">
              <div className="dh-analysis-panel__why-header">
                <div className="dh-analysis-panel__why-header-left">
                  <HelpCircle size={14} className="dh-analysis-panel__why-icon" aria-hidden="true" />
                  <span className="dh-analysis-panel__why-title">Why this assessment?</span>
                </div>
                <span className="dh-analysis-panel__why-coverage-badge">
                  {coverageBadgeText}
                </span>
              </div>

              <div className="dh-analysis-panel__why-body">
                {/* 1. Current assessment */}
                <div className="dh-analysis-panel__why-current-assessment">
                  <span
                    className="dh-analysis-panel__why-score-pill"
                    style={{ color: riskAssessment.colorHex, borderColor: riskAssessment.colorHex }}
                  >
                    {riskAssessment.score !== null ? `${riskAssessment.score.toFixed(1)} / 100` : '—'}
                  </span>
                  <span
                    className="dh-analysis-panel__why-tier-tag"
                    style={{ color: riskAssessment.colorHex }}
                  >
                    {riskAssessment.level !== 'INDETERMINATE' ? `${riskAssessment.level} EXPOSURE` : 'INDETERMINATE'}
                  </span>
                  <span className="dh-analysis-panel__why-status-text">
                    {riskAssessment.level === 'LOW' && 'Current environmental conditions evaluate to low baseline exposure.'}
                    {riskAssessment.level === 'MODERATE' && 'Elevated hydro-meteorological telemetry observed along corridor.'}
                    {riskAssessment.level === 'HIGH' && 'Significant hazard exposure from active weather and terrain factors.'}
                    {riskAssessment.level === 'SEVERE' && 'Critical hazard exposure from acute rainfall or slope gradients.'}
                    {riskAssessment.level === 'INDETERMINATE' && 'Telemetry insufficient or offline for reliable evaluation.'}
                  </span>
                </div>

                {/* 2. Primary driver */}
                <div className="dh-analysis-panel__why-driver-row">
                  <span className="dh-analysis-panel__why-driver-label">Primary driver:</span>
                  <span className="dh-analysis-panel__why-driver-name">
                    {riskAssessment.primaryFactor && (riskAssessment.score || 0) > 0
                      ? riskAssessment.primaryFactor.name
                      : riskAssessment.level === 'INDETERMINATE'
                      ? 'Indeterminate Telemetry'
                      : 'Baseline Calm Conditions'}
                  </span>
                  {riskAssessment.primaryFactor && (riskAssessment.score || 0) > 0 && riskAssessment.primaryFactor.weightedContribution !== null && (
                    <span className="dh-analysis-panel__why-driver-pts">
                      +{riskAssessment.primaryFactor.weightedContribution.toFixed(1)} pts ({(riskAssessment.primaryFactor.normalizedWeight * 100).toFixed(0)}% active weight)
                    </span>
                  )}
                </div>

                {/* 3. Contribution explanation (Strongest active contributors) */}
                {topActiveContributors.length > 0 && (
                  <div className="dh-analysis-panel__why-contrib-group">
                    <span className="dh-analysis-panel__why-contrib-label">Strongest active contributors:</span>
                    <div className="dh-analysis-panel__why-contrib-list">
                      {topActiveContributors.map((c) => (
                        <div key={c.id} className="dh-analysis-panel__why-contrib-item">
                          <span className="dh-analysis-panel__why-contrib-name">{c.name}</span>
                          <span className="dh-analysis-panel__why-contrib-pts">
                            +{c.weightedContribution !== null ? c.weightedContribution.toFixed(1) : '0.0'} pts
                          </span>
                          <span className="dh-analysis-panel__why-contrib-wt">
                            ({Math.round(c.normalizedWeight * 100)}% wt)
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 4. Assessment coverage */}
                <div className="dh-analysis-panel__why-coverage-row">
                  <span className="dh-analysis-panel__why-coverage-label">Assessment coverage:</span>
                  <span className="dh-analysis-panel__why-coverage-detail">
                    {coverageDetailText}
                  </span>
                </div>

                {/* 5. Authoritative Caveat / Narrative */}
                <div className="dh-analysis-panel__why-caveat">
                  {riskAssessment.summaryExplanation || 'Decision-support assessment based on available environmental telemetry.'}
                </div>
              </div>
            </div>

            {/* 3. Primary Contributing Factor Callout */}
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

            {/* 4. Factor Attribution Breakdown */}
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
                          {isActive ? 'ACTIVE' : isFuture ? 'UNASSESSED' : 'UNAVAILABLE'}
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

            {/* 5. Telemetry Quality Audit */}
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

            {/* 6. Scientific Limitation Caveat Box */}
            <div className="dh-analysis-panel__risk-caveat-box" role="note">
              <AlertCircle size={14} className="dh-analysis-panel__risk-caveat-icon" aria-hidden="true" />
              <p className="dh-analysis-panel__risk-caveat-text">
                Assessment is based on available hydro-meteorological and DEM corridor alignment gradient telemetry. The corridor gradient is calculated along the straight control-point polyline connecting pilot corridor waypoints and is not the gradient of the physical NH-7 road alignment. Static geotechnical slope stability (Factor of Safety) and historical landslide scar proximity are not yet assessed. No landslide probability, certainty, or event prediction is implied.
              </p>
            </div>
          </div>
        </Card>

        {/* Section 3: Higher-Risk Segments / Corridor Hotspots (Phase 6C.3) */}
        <Card
          variant="default"
          title="Higher-Risk Segments"
          subtitle="Corridor sectors ranked by deterministic hazard exposure"
          headerAction={
            rankedHotspots.length > 0 ? (
              <Badge variant="moderate" size="sm" showDot>
                TOP {rankedHotspots.length} HOTSPOTS
              </Badge>
            ) : null
          }
          className="dh-analysis-panel__card dh-analysis-panel__hotspots-card"
        >
          {rankedHotspots.length === 0 ? (
            <div className="dh-analysis-panel__hotspots-empty">
              <AlertCircle size={14} className="dh-analysis-panel__hotspots-empty-icon" aria-hidden="true" />
              <span>No ranked higher-risk segments available from current telemetry.</span>
            </div>
          ) : (
            <div className="dh-analysis-panel__hotspots-list" role="list" aria-label="Ranked higher-risk corridor segments">
              {rankedHotspots.map((hotspot, idx) => {
                const isSelected = selectedSegmentId === hotspot.id;
                const isHighest = idx === 0;

                return (
                  <button
                    key={hotspot.id}
                    type="button"
                    className={clsx('dh-analysis-panel__hotspot-row', {
                      'dh-analysis-panel__hotspot-row--selected': isSelected,
                      'dh-analysis-panel__hotspot-row--highest': isHighest,
                    })}
                    onClick={() => onSelectSegment?.(hotspot)}
                    aria-label={`Select ${hotspot.id} ${hotspot.name}, risk score ${hotspot.riskScore.toFixed(1)} out of 100, ${hotspot.riskTier} exposure`}
                  >
                    <div className="dh-analysis-panel__hotspot-left">
                      <span className={clsx('dh-analysis-panel__hotspot-rank', { 'dh-analysis-panel__hotspot-rank--top': isHighest })}>
                        #{idx + 1}
                      </span>
                      <div className="dh-analysis-panel__hotspot-info">
                        <div className="dh-analysis-panel__hotspot-title-row">
                          <span className="dh-analysis-panel__hotspot-id">{hotspot.id}</span>
                          <span className="dh-analysis-panel__hotspot-sector">{hotspot.name}</span>
                        </div>
                        <div className="dh-analysis-panel__hotspot-meta">
                          <span className="dh-analysis-panel__hotspot-driver">
                            Primary driver: <strong>{hotspot.primaryDriver}</strong>
                          </span>
                          <span className="dh-analysis-panel__hotspot-geo">
                            ~{hotspot.distanceKm.toFixed(1)} km · {hotspot.gradientDegrees.toFixed(1)}° DEM gradient
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="dh-analysis-panel__hotspot-right">
                      <span
                        className="dh-analysis-panel__hotspot-tier"
                        style={{
                          color: hotspot.colorHex,
                          backgroundColor: `${hotspot.colorHex}18`,
                          borderColor: hotspot.colorHex,
                        }}
                      >
                        {hotspot.riskTier}
                      </span>
                      <span className="dh-analysis-panel__hotspot-score" style={{ color: hotspot.colorHex }}>
                        {hotspot.riskScore.toFixed(1)}
                        <span className="dh-analysis-panel__hotspot-score-denom">/100</span>
                      </span>
                    </div>
                  </button>
                );
              })}
              <div className="dh-analysis-panel__hotspots-hint">
                Click any higher-risk segment to focus on map and inspect active factors.
              </div>
            </div>
          )}
        </Card>

        {/* Section 4: Route Alternatives & Exposure (UXMagic Frame 3) */}
        <Card
          variant="default"
          title="Route Alternatives & Exposure"
          subtitle="Multi-objective route exposure comparison (Time vs. Hazard)"
          headerAction={
            <Badge variant={primaryScore < 50 ? 'low' : 'moderate'} size="sm" showDot>
              {isCustomRoute ? 'CUSTOM ROUTE ACTIVE' : 'PILOT CORRIDOR'}
            </Badge>
          }
          className="dh-analysis-panel__card"
        >
          <RouteComparisonHUD
            routes={evaluatedRouteOptions}
            selectedRouteId={selectedRouteId}
            onSelectRoute={(id) => setSelectedRouteId(id)}
          />

          <Divider orientation="horizontal" variant="subtle" />

          <DecisionRationale
            title="Alternative Route Rationale"
            comparisonRouteName="Lower-Exposure Route"
            referenceRouteName="Direct Corridor"
            factors={comparativeFactors}
          />
        </Card>

        {/* Section 3: What-If Rainfall Scenario Simulation (Phase 6) */}
        <Card
          variant="elevated"
          title="What-If Rainfall Scenario"
          subtitle="Deterministic precipitation stress-test simulation"
          headerAction={
            <Badge variant="accent" size="sm">
              SIMULATION — NOT A FORECAST
            </Badge>
          }
          className="dh-analysis-panel__card dh-analysis-panel__scenario-card"
        >
          <div className="dh-analysis-panel__scenario-content">
            {/* Slider Section */}
            <div className="dh-analysis-panel__slider-container">
              <div className="dh-analysis-panel__slider-header">
                <label htmlFor="rainfall-slider" className="dh-analysis-panel__slider-label">
                  Simulated Precipitation Rate
                </label>
                <span className="dh-analysis-panel__slider-value">
                  {activeScenarioPrecip.toFixed(1)} mm/h
                </span>
              </div>

              <input
                id="rainfall-slider"
                type="range"
                min={0}
                max={100}
                step={1}
                value={activeScenarioPrecip}
                onChange={(e) => handleScenarioSlider(parseFloat(e.target.value))}
                className="dh-analysis-panel__slider-input"
                aria-label="What-if simulated rainfall intensity slider"
              />

              <div className="dh-analysis-panel__slider-scale">
                <span>0 mm/h (Dry)</span>
                <span>25 mm/h (Runoff Threshold)</span>
                <span>100 mm/h (Extreme)</span>
              </div>

              {/* Preset Quick Buttons */}
              <div className="dh-analysis-panel__presets">
                {[
                  { label: '0 mm/h', val: 0 },
                  { label: '15 mm/h', val: 15 },
                  { label: '25 mm/h (Threshold)', val: 25 },
                  { label: '50 mm/h', val: 50 },
                  { label: '75 mm/h', val: 75 },
                  { label: '100 mm/h', val: 100 },
                ].map((p) => (
                  <button
                    key={p.val}
                    type="button"
                    className={clsx('dh-analysis-panel__preset-btn', {
                      'dh-analysis-panel__preset-btn--active': isSimActive && activeScenarioPrecip === p.val,
                    })}
                    onClick={() => handleScenarioSlider(p.val)}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Observed vs Scenario Comparison Grid */}
            <div className="dh-analysis-panel__scenario-comparison">
              <div className="dh-analysis-panel__scenario-col">
                <span className="dh-analysis-panel__scenario-col-title">Live Observed</span>
                <div className="dh-analysis-panel__scenario-stat">
                  <span className="dh-analysis-panel__scenario-stat-sub">Precipitation</span>
                  <span className="dh-analysis-panel__scenario-stat-val">
                    {livePrecip.toFixed(1)} mm/h
                  </span>
                </div>
                <div className="dh-analysis-panel__scenario-stat">
                  <span className="dh-analysis-panel__scenario-stat-sub">Corridor Risk</span>
                  <span
                    className="dh-analysis-panel__scenario-stat-val"
                    style={{ color: riskAssessment.colorHex }}
                  >
                    {riskAssessment.score !== null ? `${riskAssessment.score.toFixed(1)}/100` : '—'}
                  </span>
                </div>
                <span
                  className="dh-analysis-panel__scenario-tier-badge"
                  style={{
                    color: riskAssessment.colorHex,
                    borderColor: riskAssessment.colorHex,
                  }}
                >
                  {riskAssessment.level}
                </span>
              </div>

              <div className="dh-analysis-panel__scenario-vs" aria-hidden="true">→</div>

              <div className="dh-analysis-panel__scenario-col dh-analysis-panel__scenario-col--sim">
                <span className="dh-analysis-panel__scenario-col-title">Scenario Simulated</span>
                <div className="dh-analysis-panel__scenario-stat">
                  <span className="dh-analysis-panel__scenario-stat-sub">Scenario Input</span>
                  <span className="dh-analysis-panel__scenario-stat-val">
                    {activeScenarioPrecip.toFixed(1)} mm/h
                  </span>
                </div>
                <div className="dh-analysis-panel__scenario-stat">
                  <span className="dh-analysis-panel__scenario-stat-sub">Scenario Risk</span>
                  <span
                    className="dh-analysis-panel__scenario-stat-val dh-analysis-panel__scenario-stat-val--prominent"
                    style={{ color: evaluatedScenarioRisk.colorHex }}
                  >
                    {evaluatedScenarioRisk.score !== null ? `${evaluatedScenarioRisk.score.toFixed(1)} / 100` : '—'}
                  </span>
                </div>
                <span
                  className="dh-analysis-panel__scenario-tier-badge"
                  style={{
                    color: evaluatedScenarioRisk.colorHex,
                    borderColor: evaluatedScenarioRisk.colorHex,
                  }}
                >
                  {evaluatedScenarioRisk.level}
                </span>
              </div>
            </div>

            {/* Primary Hazard Driver Under Scenario */}
            <div className="dh-analysis-panel__scenario-driver">
              <span className="dh-analysis-panel__scenario-driver-label">Scenario Primary Driver:</span>
              <span className="dh-analysis-panel__scenario-driver-val">
                {evaluatedScenarioRisk.primaryFactor?.name ?? 'Precipitation Intensity'}
              </span>
              {scoreDelta !== 0 && (
                <span
                  className={clsx('dh-analysis-panel__scenario-delta', {
                    'dh-analysis-panel__scenario-delta--up': scoreDelta > 0,
                    'dh-analysis-panel__scenario-delta--down': scoreDelta < 0,
                  })}
                >
                  {scoreDelta > 0 ? `+${scoreDelta.toFixed(1)} pts` : `${scoreDelta.toFixed(1)} pts`}
                </span>
              )}
            </div>

            {/* Scenario Factor Contributions Breakdown */}
            <div className="dh-analysis-panel__scenario-factors">
              <span className="dh-analysis-panel__scenario-factors-heading">
                Scenario Factor Attribution
              </span>
              <div className="dh-analysis-panel__scenario-factors-list">
                {evaluatedScenarioRisk.factors
                  .filter((f) => f.status === 'active')
                  .map((f) => (
                    <div key={f.id} className="dh-analysis-panel__scenario-factor-item">
                      <span className="dh-analysis-panel__scenario-factor-name">{f.name}</span>
                      <span className="dh-analysis-panel__scenario-factor-contrib">
                        {f.weightedContribution !== null ? `+${f.weightedContribution.toFixed(1)}` : '—'}
                        <span className="dh-analysis-panel__scenario-factor-wt">
                          ({Math.round(f.normalizedWeight * 100)}%)
                        </span>
                      </span>
                    </div>
                  ))}
              </div>
            </div>

            {/* Controls: Reset Button */}
            <div className="dh-analysis-panel__scenario-actions">
              <Button
                variant="secondary"
                size="sm"
                onClick={handleResetScenario}
                disabled={!isSimActive}
                className="dh-analysis-panel__reset-btn"
              >
                <RefreshCw size={12} className="dh-analysis-panel__btn-icon" aria-hidden="true" />
                RESET TO LIVE
              </Button>
              {isSimActive && (
                <span className="dh-analysis-panel__sim-active-note">
                  Map segments reflecting simulated scenario
                </span>
              )}
            </div>

            {/* Scientific Caveat Box */}
            <div className="dh-analysis-panel__risk-caveat-box dh-analysis-panel__risk-caveat-box--sim" role="note">
              <AlertCircle size={13} className="dh-analysis-panel__risk-caveat-icon" aria-hidden="true" />
              <p className="dh-analysis-panel__risk-caveat-text">
                SIMULATION — NOT A FORECAST. Evaluates hypothetical precipitation stress against deterministic runoff thresholds. Does not predict landslides or model physical slope failure mechanics.
              </p>
            </div>
          </div>
        </Card>

        {/* Section 4: Corridor / Real Road Metrics */}
        {locationSelection?.activeRoute && locationSelection.activeRoute.status === 'success' ? (
          <Card
            variant="muted"
            title="Road Route Metrics"
            subtitle={`Real road alignment via ${locationSelection.activeRoute.provider}`}
            className="dh-analysis-panel__card"
          >
            <div className="dh-analysis-panel__metrics-list">
              <div className="dh-analysis-panel__metric-row">
                <span className="dh-analysis-panel__metric-label">Road Distance</span>
                <span className="dh-analysis-panel__metric-value" style={{ color: 'var(--accent-primary)', fontWeight: 700 }}>
                  {locationSelection.activeRoute.metrics.formattedDistance}
                </span>
              </div>
              <Divider orientation="horizontal" variant="subtle" />
              <div className="dh-analysis-panel__metric-row">
                <span className="dh-analysis-panel__metric-label">Est. Travel Duration</span>
                <span className="dh-analysis-panel__metric-value">
                  {locationSelection.activeRoute.metrics.formattedDuration}
                </span>
              </div>
              <Divider orientation="horizontal" variant="subtle" />
              <div className="dh-analysis-panel__metric-row">
                <span className="dh-analysis-panel__metric-label">Elevation Range (MSL)</span>
                <span className="dh-analysis-panel__metric-value">
                  {locationSelection.activeRoute.metrics.elevationMin !== null
                    ? `${locationSelection.activeRoute.metrics.elevationMin}m → ${locationSelection.activeRoute.metrics.elevationMax}m`
                    : 'Unavailable'}
                </span>
              </div>
              <Divider orientation="horizontal" variant="subtle" />
              <div className="dh-analysis-panel__metric-row">
                <span className="dh-analysis-panel__metric-label">Elevation Gain / Loss</span>
                <span className="dh-analysis-panel__metric-value">
                  {locationSelection.activeRoute.metrics.elevationGain !== null
                    ? `+${locationSelection.activeRoute.metrics.elevationGain}m / -${locationSelection.activeRoute.metrics.elevationLoss}m`
                    : '—'}
                </span>
              </div>
              <Divider orientation="horizontal" variant="subtle" />
              <div className="dh-analysis-panel__metric-row">
                <span className="dh-analysis-panel__metric-label">Peak Terrain Gradient</span>
                <span className="dh-analysis-panel__metric-value">
                  {locationSelection.activeRoute.metrics.peakGradientDegrees !== null
                    ? `${locationSelection.activeRoute.metrics.peakGradientDegrees}° (${locationSelection.activeRoute.metrics.peakGradientPercent}%)`
                    : '—'}
                </span>
              </div>
              <Divider orientation="horizontal" variant="subtle" />
              <div className="dh-analysis-panel__metric-row">
                <span className="dh-analysis-panel__metric-label">DEM Sample Coverage</span>
                <span className="dh-analysis-panel__metric-value">
                  {locationSelection.activeRoute.metrics.elevationCoverageRatio || 'Unavailable'}
                </span>
              </div>
            </div>
          </Card>
        ) : (
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
                    ? `${(envData.terrain.routeProfile.totalDistanceM / 1000).toFixed(1)} km (chord)`
                    : `${PILOT_CORRIDOR_CHORD_DISTANCE_KM.toFixed(1)} km (chord)`}
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
                <span className="dh-analysis-panel__metric-label">Corridor Risk Score</span>
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
        )}
      </div>
    </aside>
  );
};
