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
import { AffectedAreasTable, CorridorSector, CORRIDOR_SECTORS_DATA } from '../components/dashboard/AffectedAreasTable';
import { RecentEventsList } from '../components/dashboard/RecentEventsList';
import { EnvironmentalData } from '../services/environmental/types';
import { RiskAssessment, RiskLevel } from '../services/risk/types';
import { CorridorSegmentRisk } from '../services/risk/segmentRiskService';
import { LocationPoint } from '../types/location';
import './DashboardPage.css';

export interface DashboardPageProps {
  envData?: EnvironmentalData | null;
  riskAssessment?: RiskAssessment | null;
  segments?: CorridorSegmentRisk[];
  origin?: LocationPoint | null;
  destination?: LocationPoint | null;
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
  origin,
  destination,
  isRefreshing = false,
  lastUpdated,
  onRefresh,
  onNavigate,
  className,
}) => {
  const compositeScore = riskAssessment?.score ?? (segments.length > 0 ? Number((segments.reduce((acc, s) => acc + s.riskScore, 0) / segments.length).toFixed(1)) : null);
  const riskLevel: RiskLevel | null = riskAssessment?.level ?? (compositeScore !== null ? (compositeScore >= 75 ? 'SEVERE' : compositeScore >= 50 ? 'HIGH' : compositeScore >= 25 ? 'MODERATE' : 'LOW') : null);
  const precipRate = envData?.rainfall?.precipitation ?? null;
  const precipAccum24h = envData?.rainfall?.dailyPrecipitationSum ?? null;
  const precipProbability = envData?.rainfall?.precipitationProbability ?? null;
  const elevationMsl = envData?.terrain?.elevation?.elevation ?? (segments[0]?.startElevationM ?? null);
  const meanGradient = envData?.terrain?.routeProfile?.meanRouteGradientDegrees ?? (segments.length > 0 ? Number((segments.reduce((acc, s) => acc + s.gradientDegrees, 0) / segments.length).toFixed(1)) : null);
  const peakGradient = envData?.terrain?.routeProfile?.peakRouteGradientDegrees ?? (segments.length > 0 ? Math.max(...segments.map(s => s.gradientDegrees)) : null);
  const totalGain = envData?.terrain?.routeProfile?.elevationGainM ?? (segments.length > 1 ? Math.max(0, Math.round(segments[segments.length - 1].endElevationM - segments[0].startElevationM)) : null);

  // Calculate dynamic segment tier metrics directly from active corridor segments
  const tierMetrics: RiskTierMetric[] = React.useMemo(() => {
    const total = segments.length;
    if (total === 0) {
      return [
        { level: 'LOW', label: 'Low (< 25)', count: 0, percentage: 0, colorHex: 'var(--risk-low)', description: 'No corridor segments assessed' },
        { level: 'MODERATE', label: 'Moderate (25–50)', count: 0, percentage: 0, colorHex: 'var(--risk-moderate)', description: 'No corridor segments assessed' },
        { level: 'HIGH', label: 'High (50–75)', count: 0, percentage: 0, colorHex: 'var(--risk-high)', description: 'No corridor segments assessed' },
        { level: 'SEVERE', label: 'Severe (≥ 75)', count: 0, percentage: 0, colorHex: 'var(--risk-severe)', description: 'No corridor segments assessed' },
      ];
    }

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
        description: 'Stable alluvial & foothill sectors',
      },
      {
        level: 'MODERATE',
        label: 'Moderate (25–50)',
        count: counts.MODERATE,
        percentage: Math.round((counts.MODERATE / total) * 100),
        colorHex: 'var(--risk-moderate)',
        description: 'Steeper gorge alignment cuts',
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
        description: 'Runoff threshold breached',
      },
    ];
  }, [segments]);

  // Dynamic sectors generated from disaggregated route segments
  const dynamicSectors: CorridorSector[] = React.useMemo(() => {
    if (segments && segments.length > 0) {
      return segments.map((seg) => ({
        id: seg.id,
        name: seg.name,
        highway: 'NH-7',
        district: seg.endElevationM > 1400 ? 'Chamoli' : seg.endElevationM > 600 ? 'Rudraprayag' : 'Tehri Garhwal',
        elevationM: Math.round(seg.endElevationM),
        riskLevel: seg.riskTier,
        riskScore: Number(seg.riskScore.toFixed(1)),
        hazardType: seg.primaryDriver || (seg.gradientDegrees > 25 ? 'Steep slope gradient cut' : 'Fluvial valley terrace'),
        operationalStatus: (seg.riskTier === 'SEVERE' ? 'RESTRICTED' : seg.riskTier === 'HIGH' ? 'CAUTION' : 'NORMAL') as CorridorSector['operationalStatus'],
        coordinates: [seg.coordinates[0]?.[0] ?? 30.1033, seg.coordinates[0]?.[1] ?? 78.2947] as [number, number],
      }));
    }
    return CORRIDOR_SECTORS_DATA;
  }, [segments]);

  const severeCount = segments.filter((s) => s.riskTier === 'SEVERE').length;
  const highCount = segments.filter((s) => s.riskTier === 'HIGH').length;
  const moderateCount = segments.filter((s) => s.riskTier === 'MODERATE').length;
  const criticalTotal = severeCount + highCount;

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
          value={compositeScore !== null ? compositeScore.toFixed(1) : '—'}
          unit={compositeScore !== null ? "/ 100" : ""}
          subtitle={riskLevel ? `${riskLevel} Exposure Tier · Deterministic Multi-Criteria Index` : "Telemetry unassessed or loading"}
          accentColor={riskAssessment?.colorHex ?? 'var(--risk-low)'}
          icon={<Activity size={16} />}
          badge={
            <Badge
              variant={riskLevel === 'LOW' ? 'low' : riskLevel === 'MODERATE' ? 'moderate' : riskLevel ? 'high' : 'default'}
              size="sm"
              showDot={Boolean(riskLevel)}
            >
              {riskLevel ?? 'UNASSESSED'}
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
          value={precipRate !== null ? precipRate.toFixed(1) : '—'}
          unit={precipRate !== null ? "mm/h" : ""}
          subtitle={precipAccum24h !== null && precipProbability !== null
            ? `24h Accum: ${precipAccum24h.toFixed(1)} mm · Rain Probability: ${precipProbability}%`
            : "Live telemetry feed pending or unavailable"}
          accentColor="var(--accent-primary)"
          icon={<CloudRain size={16} />}
          badge={
            <Badge variant={precipRate !== null && precipRate >= 25 ? 'severe' : precipRate !== null && precipRate > 5 ? 'moderate' : 'low'} size="sm">
              {precipRate !== null ? (precipRate >= 25 ? 'RUNOFF THRESHOLD' : 'NORMAL RANGE') : 'UNAVAILABLE'}
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
          value={meanGradient !== null ? `${meanGradient.toFixed(1)}°` : '—'}
          unit={peakGradient !== null ? `(Peak: ${peakGradient.toFixed(1)}°)` : ""}
          subtitle={elevationMsl !== null ? `Node Elevation: ${Math.round(elevationMsl)}m MSL · Copernicus DEM 90m` : "DEM Elevation unassessed"}
          accentColor="#fb923c"
          icon={<Mountain size={16} />}
          badge={
            <Badge variant="moderate" size="sm">
              {meanGradient !== null && meanGradient > 20 ? 'STEEP GORGE' : 'HIMALAYAN CORRIDOR'}
            </Badge>
          }
          footer={
            <div className="dh-dashboard-card__meta-link">
              <span>{totalGain !== null ? `Elevation Gain: +${totalGain}m MSL along NH-7` : 'Terrain profile pending'}</span>
            </div>
          }
        />

        {/* Metric 4: Active Critical Hazard Segments */}
        <DashboardCard
          title="Critical Hazard Segments"
          value={String(criticalTotal)}
          unit={`/ ${segments.length || 20}`}
          subtitle={
            criticalTotal > 0
              ? `${severeCount} Severe · ${highCount} High · ${moderateCount} Moderate segments`
              : 'All evaluated corridor sectors within baseline thresholds'
          }
          accentColor={criticalTotal > 0 ? 'var(--risk-high)' : 'var(--risk-low)'}
          icon={<AlertTriangle size={16} />}
          badge={
            <Badge variant={criticalTotal > 0 ? 'high' : 'low'} size="sm" showDot>
              {criticalTotal > 0 ? 'ACTION REQUIRED' : 'CORRIDOR STABLE'}
            </Badge>
          }
          onClick={() => onNavigate('alerts')}
          footer={
            <div className="dh-dashboard-card__meta-link">
              <span>Provenance: GSI Landslide Inventory &amp; Historical Cut-Slopes</span>
            </div>
          }
        />
      </section>

      {/* ─── 3. MIDDLE SECTION: HAZARD SPECTRUM + QUICK MAP JUMP ─────────── */}
      <section className="dh-dashboard-mid-row">
        <div className="dh-dashboard-mid-col dh-dashboard-mid-col--spectrum">
          <RiskCard
            activeLevel={riskLevel ?? undefined}
            compositeScore={compositeScore}
            tierMetrics={tierMetrics}
            onSelectTier={() => onNavigate('risk-analysis')}
          />
        </div>

        <div className="dh-dashboard-mid-col dh-dashboard-mid-col--map-preview">
          <Card
            variant="default"
            title="Geospatial Corridor Navigator"
            subtitle={`Active Corridor: ${origin?.name || 'Rishikesh'} to ${destination?.name || 'Badrinath'} (NH-7)`}
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
                    <span>{origin?.name || 'Rishikesh'} ({Math.round(segments[0]?.startElevationM ?? 372)}m)</span>
                  </div>
                  <div className="dh-dashboard-map-preview-line" />
                  <div className="dh-dashboard-map-preview-marker dh-dashboard-map-preview-marker--dest">
                    <MapPin size={12} />
                    <span>{destination?.name || 'Badrinath'} ({Math.round(segments[segments.length - 1]?.endElevationM ?? 1890)}m)</span>
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
                    Inspect {segments.length || 20} disaggregated 250m road segments &amp; trigger rainfall scenarios
                  </span>
                </div>
              </div>

              <div className="dh-dashboard-map-preview-metrics">
                <div className="dh-dashboard-map-stat">
                  <span className="dh-dashboard-map-stat__k">Corridor Length</span>
                  <span className="dh-dashboard-map-stat__v">{segments.length > 0 ? (segments.reduce((acc, s) => acc + s.distanceKm, 0)).toFixed(1) : '156.4'} km (NH-7)</span>
                </div>
                <div className="dh-dashboard-map-stat">
                  <span className="dh-dashboard-map-stat__k">Elevation Ascent</span>
                  <span className="dh-dashboard-map-stat__v">{Math.round(segments[0]?.startElevationM ?? 372)}m → {Math.round(segments[segments.length - 1]?.endElevationM ?? 1890)}m MSL</span>
                </div>
                <div className="dh-dashboard-map-stat">
                  <span className="dh-dashboard-map-stat__k">Routing Engine</span>
                  <span className="dh-dashboard-map-stat__v">OpenRouteService / OSRM Highway Profile</span>
                </div>
              </div>
            </div>
          </Card>
        </div>
      </section>

      {/* ─── 4. LOWER SECTION: AFFECTED AREAS TABLE + RECENT INCIDENTS ───── */}
      <section className="dh-dashboard-bottom-grid">
        <div className="dh-dashboard-bottom-col dh-dashboard-bottom-col--table">
          <AffectedAreasTable sectors={dynamicSectors} onSelectSector={handleSelectSector} />
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
