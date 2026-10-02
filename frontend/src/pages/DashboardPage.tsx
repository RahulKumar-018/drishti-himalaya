import React from 'react';
import clsx from 'clsx';
import {
  Activity,
  CloudRain,
  Mountain,
  Compass,
  AlertTriangle,
  RefreshCw,
  ArrowRight,
  MapPin,
} from 'lucide-react';
import { Card } from '../components/common/Card';
import { Badge } from '../components/common/Badge';
import { Button } from '../components/common/Button';
import { DashboardCard } from '../components/dashboard/DashboardCard';
import { RiskCard, RiskTierMetric } from '../components/dashboard/RiskCard';
import { AffectedAreasTable, CorridorSector } from '../components/dashboard/AffectedAreasTable';
import { RecentEventsList } from '../components/dashboard/RecentEventsList';
import { EnvironmentalData } from '../services/environmental/types';
import { RiskAssessment, RiskLevel } from '../services/risk/types';
import { CorridorSegmentRisk } from '../services/risk/segmentRiskService';
import './DashboardPage.css';

export interface DashboardPageProps {
  envData?: EnvironmentalData | null;
  riskAssessment?: RiskAssessment | null;
  segments?: CorridorSegmentRisk[];
  isLoading?: boolean;
  isRefreshing?: boolean;
  isError?: boolean;
  lastUpdated?: string | null;
  onRefresh?: () => Promise<void>;
  onNavigate: (tab: string, context?: unknown) => void;
  className?: string;
}

export const DashboardPage: React.FC<DashboardPageProps> = ({
  envData,
  riskAssessment,
  segments = [],
  isRefreshing = false,
  lastUpdated,
  onRefresh,
  onNavigate,
  className,
}) => {
  const compositeScore = riskAssessment?.score ?? 24.8;
  const riskLevel: RiskLevel = riskAssessment?.level ?? 'LOW';
  const precipRate = envData?.rainfall?.precipitation ?? 0.0;
  const precipAccum24h = envData?.rainfall?.dailyPrecipitationSum ?? 0.0;
  const precipProbability = envData?.rainfall?.precipitationProbability ?? 0;
  const elevationMsl = envData?.terrain?.elevation?.elevation ?? 610;
  const meanGradient = envData?.terrain?.routeProfile?.meanRouteGradientDegrees ?? 14.2;
  const peakGradient = envData?.terrain?.routeProfile?.peakRouteGradientDegrees ?? 28.5;
  const totalGain = envData?.terrain?.routeProfile?.elevationGainM ?? 2100;

  // Calculate dynamic segment tier metrics if segments available
  const tierMetrics: RiskTierMetric[] = React.useMemo(() => {
    if (!segments || segments.length === 0) {
      return [
        {
          level: 'LOW',
          label: 'Low Hazard (< 25)',
          count: 14,
          percentage: 70,
          colorHex: 'var(--risk-low)',
          description: 'Stable alluvial & foothill sectors',
        },
        {
          level: 'MODERATE',
          label: 'Moderate (25–50)',
          count: 4,
          percentage: 20,
          colorHex: 'var(--risk-moderate)',
          description: 'Steeper gorge alignment cuts',
        },
        {
          level: 'HIGH',
          label: 'High Hazard (50–75)',
          count: 2,
          percentage: 10,
          colorHex: 'var(--risk-high)',
          description: 'Birahi / Helang scar zones',
        },
        {
          level: 'SEVERE',
          label: 'Severe Critical (≥ 75)',
          count: 0,
          percentage: 0,
          colorHex: 'var(--risk-severe)',
          description: 'Runoff threshold breached',
        },
      ];
    }

    const total = segments.length;
    const counts = { LOW: 0, MODERATE: 0, HIGH: 0, SEVERE: 0 };
    segments.forEach((s) => {
      if (s.riskTier in counts) {
        counts[s.riskTier as keyof typeof counts]++;
      }
    });

    return [
      {
        level: 'LOW',
        label: 'Low Hazard (< 25)',
        count: counts.LOW,
        percentage: Math.round((counts.LOW / total) * 100),
        colorHex: 'var(--risk-low)',
        description: 'Baseline stability, normal transit',
      },
      {
        level: 'MODERATE',
        label: 'Moderate (25–50)',
        count: counts.MODERATE,
        percentage: Math.round((counts.MODERATE / total) * 100),
        colorHex: 'var(--risk-moderate)',
        description: 'Steep river gorge sections',
      },
      {
        level: 'HIGH',
        label: 'High Hazard (50–75)',
        count: counts.HIGH,
        percentage: Math.round((counts.HIGH / total) * 100),
        colorHex: 'var(--risk-high)',
        description: 'Historical talus & scar exposure',
      },
      {
        level: 'SEVERE',
        label: 'Severe Critical (≥ 75)',
        count: counts.SEVERE,
        percentage: Math.round((counts.SEVERE / total) * 100),
        colorHex: 'var(--risk-severe)',
        description: 'Critical runoff threshold exceeded',
      },
    ];
  }, [segments]);

  const handleSelectSector = (sector: CorridorSector) => {
    // Jump directly to interactive map
    onNavigate('map', { targetSector: sector });
  };

  return (
    <div className={clsx('dh-dashboard-page', className)}>
      {/* ─── 1. TOP COMMAND BAR ────────────────────────────────────────────── */}
      <div className="dh-dashboard-bar">
        <div className="dh-dashboard-bar__left">
          <div className="dh-dashboard-bar__title-group">
            <h1 className="dh-dashboard-bar__title">MONITORING DASHBOARD</h1>
            <span className="dh-dashboard-bar__subtitle">
              Real-Time Hydro-Meteorological &amp; Terrain Command Center
            </span>
          </div>
        </div>

        <div className="dh-dashboard-bar__right">
          <div className="dh-dashboard-bar__meta">
            <span className="dh-dashboard-bar__meta-label">LAST TELEMETRY SYNC:</span>
            <span className="dh-dashboard-bar__meta-val">{lastUpdated || 'Active Stream'}</span>
          </div>

          <Button
            variant="secondary"
            size="sm"
            onClick={onRefresh}
            loading={isRefreshing}
            leadingIcon={<RefreshCw size={12} />}
          >
            {isRefreshing ? 'Synchronizing...' : 'Refresh Telemetry'}
          </Button>

          <Button
            variant="primary"
            size="sm"
            onClick={() => onNavigate('map')}
            trailingIcon={<ArrowRight size={12} />}
          >
            Launch Full Map
          </Button>
        </div>
      </div>

      {/* ─── 2. PRIMARY 4-METRIC OVERVIEW STRIP ───────────────────────────── */}
      <section className="dh-dashboard-grid-4">
        {/* Metric 1: Corridor Risk Score */}
        <DashboardCard
          title="Corridor Composite Risk"
          value={compositeScore.toFixed(1)}
          unit="/ 100"
          subtitle={`${riskLevel} Exposure Tier · Deterministic Multi-Criteria Index`}
          accentColor={riskAssessment?.colorHex ?? 'var(--risk-low)'}
          icon={<Activity size={16} />}
          badge={
            <Badge
              variant={riskLevel === 'LOW' ? 'low' : riskLevel === 'MODERATE' ? 'moderate' : 'high'}
              size="sm"
              showDot
            >
              {riskLevel}
            </Badge>
          }
          onClick={() => onNavigate('risk-analysis')}
          footer={
            <div className="dh-dashboard-card__meta-link">
              <span>Primary Driver: {riskAssessment?.primaryFactor?.name ?? 'Precipitation Intensity'}</span>
            </div>
          }
        />

        {/* Metric 2: Live Rainfall Telemetry */}
        <DashboardCard
          title="Precipitation Intensity"
          value={precipRate.toFixed(1)}
          unit="mm/h"
          subtitle={`24h Accum: ${precipAccum24h.toFixed(1)} mm · Rain Probability: ${precipProbability}%`}
          accentColor="var(--accent-primary)"
          icon={<CloudRain size={16} />}
          badge={
            <Badge variant={precipRate >= 25 ? 'severe' : precipRate > 5 ? 'moderate' : 'low'} size="sm">
              {precipRate >= 25 ? 'RUNOFF THRESHOLD' : 'NORMAL RANGE'}
            </Badge>
          }
          footer={
            <div className="dh-dashboard-card__meta-link">
              <span>Source: Open-Meteo Hourly API Stream</span>
            </div>
          }
        />

        {/* Metric 3: Slope & Terrain Gradient */}
        <DashboardCard
          title="Terrain Alignment Gradient"
          value={`${meanGradient.toFixed(1)}°`}
          unit={`(Peak: ${peakGradient.toFixed(1)}°)`}
          subtitle={`Node Elevation: ${elevationMsl}m MSL · Copernicus DEM 90m`}
          accentColor="#fb923c"
          icon={<Mountain size={16} />}
          badge={
            <Badge variant="moderate" size="sm">
              STEEP GORGE
            </Badge>
          }
          footer={
            <div className="dh-dashboard-card__meta-link">
              <span>Elevation Gain: +{totalGain}m MSL along NH-7</span>
            </div>
          }
        />

        {/* Metric 4: Active Early Warnings */}
        <DashboardCard
          title="Early Warning Bulletins"
          value="5"
          unit="Active"
          subtitle="1 Severe · 2 High · 1 Moderate · 1 Advisory"
          accentColor="var(--risk-high)"
          icon={<AlertTriangle size={16} />}
          badge={
            <Badge variant="high" size="sm" showDot>
              ACTION REQUIRED
            </Badge>
          }
          onClick={() => onNavigate('alerts')}
          footer={
            <div className="dh-dashboard-card__meta-link">
              <span>Latest: Talus displacement near Joshimath</span>
            </div>
          }
        />
      </section>

      {/* ─── 3. MIDDLE SECTION: HAZARD SPECTRUM + QUICK MAP JUMP ─────────── */}
      <section className="dh-dashboard-mid-row">
        <div className="dh-dashboard-mid-col dh-dashboard-mid-col--spectrum">
          <RiskCard
            activeLevel={riskLevel}
            compositeScore={compositeScore}
            tierMetrics={tierMetrics}
            onSelectTier={() => onNavigate('risk-analysis')}
          />
        </div>

        <div className="dh-dashboard-mid-col dh-dashboard-mid-col--map-preview">
          <Card
            variant="default"
            title="Geospatial Corridor Navigator"
            subtitle="Pilot Sector: Rishikesh to Joshimath (NH-7)"
            headerAction={
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onNavigate('map')}
                trailingIcon={<ArrowRight size={11} />}
              >
                Expand Full Map
              </Button>
            }
            className="dh-dashboard-map-preview-card"
          >
            <div className="dh-dashboard-map-preview-body">
              <div className="dh-dashboard-map-preview-visual">
                <div className="dh-dashboard-map-preview-overlay">
                  <div className="dh-dashboard-map-preview-marker dh-dashboard-map-preview-marker--origin">
                    <MapPin size={12} />
                    <span>Rishikesh (372m)</span>
                  </div>
                  <div className="dh-dashboard-map-preview-line" />
                  <div className="dh-dashboard-map-preview-marker dh-dashboard-map-preview-marker--dest">
                    <MapPin size={12} />
                    <span>Joshimath (1,890m)</span>
                  </div>
                </div>
                <div className="dh-dashboard-map-preview-cta">
                  <Button
                    variant="primary"
                    size="md"
                    onClick={() => onNavigate('map')}
                    leadingIcon={<Compass size={14} />}
                  >
                    Open Interactive Geospatial Map
                  </Button>
                  <span className="dh-dashboard-map-preview-hint">
                    Inspect 20 disaggregated 250m road segments &amp; trigger rainfall scenarios
                  </span>
                </div>
              </div>

              <div className="dh-dashboard-map-preview-metrics">
                <div className="dh-dashboard-map-stat">
                  <span className="dh-dashboard-map-stat__k">Corridor Length</span>
                  <span className="dh-dashboard-map-stat__v">156.4 km (NH-7)</span>
                </div>
                <div className="dh-dashboard-map-stat">
                  <span className="dh-dashboard-map-stat__k">Elevation Ascent</span>
                  <span className="dh-dashboard-map-stat__v">372m → 1,890m MSL</span>
                </div>
                <div className="dh-dashboard-map-stat">
                  <span className="dh-dashboard-map-stat__k">Routing Engine</span>
                  <span className="dh-dashboard-map-stat__v">OSRM Real Road Profile</span>
                </div>
              </div>
            </div>
          </Card>
        </div>
      </section>

      {/* ─── 4. LOWER SECTION: AFFECTED AREAS TABLE + RECENT INCIDENTS ───── */}
      <section className="dh-dashboard-bottom-grid">
        <div className="dh-dashboard-bottom-col dh-dashboard-bottom-col--table">
          <AffectedAreasTable onSelectSector={handleSelectSector} />
        </div>

        <div className="dh-dashboard-bottom-col dh-dashboard-bottom-col--incidents">
          <RecentEventsList
            onViewAll={() => onNavigate('alerts')}
            onSelectIncident={() => onNavigate('alerts')}
          />
        </div>
      </section>
    </div>
  );
};
