import React from 'react';
import clsx from 'clsx';
import {
  Compass,
  Activity,
  ShieldCheck,
  AlertTriangle,
  ArrowRight,
  Layers,
  CloudRain,
  ChevronRight,
  Mountain,
} from 'lucide-react';
import { Button } from '../components/common/Button';
import { Badge } from '../components/common/Badge';
import { MapViewport } from '../components/workspace/MapViewport';
import { RiskAssessment } from '../services/risk/types';
import { EnvironmentalData } from '../services/environmental/types';
import { CorridorSegmentRisk } from '../services/risk/segmentRiskService';
import { UseLocationSelectionReturn } from '../hooks/useLocationSelection';
import './HomePage.css';

export interface HomePageProps {
  onNavigate: (tab: string, context?: unknown) => void;
  riskAssessment?: RiskAssessment | null;
  envData?: EnvironmentalData | null;
  segments?: CorridorSegmentRisk[];
  selectedSegmentId?: string | null;
  onSelectSegment?: (segment: CorridorSegmentRisk | null) => void;
  scenarioPrecipitation?: number | null;
  onScenarioChange?: (val: number | null) => void;
  scenarioRiskAssessment?: RiskAssessment | null;
  locationSelection?: UseLocationSelectionReturn;
  className?: string;
}

export const HomePage: React.FC<HomePageProps> = ({
  onNavigate,
  riskAssessment,
  envData,
  segments,
  selectedSegmentId,
  onSelectSegment,
  scenarioPrecipitation,
  onScenarioChange,
  scenarioRiskAssessment,
  locationSelection,
  className,
}) => {
  const currentRiskScore = riskAssessment?.score ?? 24.8;
  const currentRiskLevel = riskAssessment?.level ?? 'LOW';
  const livePrecip = envData?.rainfall?.precipitation ?? 0.0;
  const isSimulated = Boolean(scenarioPrecipitation !== null && scenarioPrecipitation !== undefined);

  const handleScrollToMap = () => {
    const mapEl = document.getElementById('map-workspace');
    if (mapEl) {
      mapEl.scrollIntoView({ behavior: 'smooth' });
    } else {
      onNavigate('map');
    }
  };

  return (
    <div className={clsx('dh-home-page', className)}>
      {/* ─── 1. HERO SECTION ──────────────────────────────────────────────── */}
      <section className="dh-home-hero">
        <div className="dh-home-hero__ambient-glow" aria-hidden="true" />

        <div className="dh-home-hero__container">
          {/* Top Status Pill */}
          <div className="dh-home-hero__badge-row">
            <span className="dh-home-hero__live-pill">
              <span className="dh-home-hero__live-dot" />
              PILOT SECTOR: GARHWAL HIMALAYAS
            </span>
            <span className="dh-home-hero__model-pill">
              COPERNICUS DEM 90m · OPEN-METEO TELEMETRY
            </span>
          </div>

          <h1 className="dh-home-hero__title">
            DRISHTI <span className="dh-home-hero__title-accent">HIMALAYA</span>
          </h1>

          <p className="dh-home-hero__tagline">
            AI-Assisted Himalayan Hazard Intelligence &amp; Route Risk Monitoring
          </p>

          <p className="dh-home-hero__problem">
            Continuous geotechnical hazard monitoring and hydro-meteorological decision support along Himalayan pilgrimage arteries. Drishti Himalaya disaggregates mountain highways into uniform 250m segments, evaluating multi-factor risk exposure to support safer route decisions for pilgrims, logistics operators, and civil disaster response teams.
          </p>

          <div className="dh-home-hero__disclaimer-badge">
            Operational Decision Support System · Continuous Deterministic Risk Monitoring · Open-Meteo &amp; Copernicus DEM Integration
          </div>

          {/* Action CTAs */}
          <div className="dh-home-hero__actions">
            <Button
              variant="primary"
              size="lg"
              onClick={() => onNavigate('dashboard')}
              trailingIcon={<ArrowRight size={16} />}
              className="dh-home-hero__primary-btn"
            >
              Open Risk Dashboard
            </Button>

            <Button
              variant="secondary"
              size="lg"
              onClick={handleScrollToMap}
              leadingIcon={<Compass size={16} />}
            >
              Explore Hazard Map
            </Button>

            <Button
              variant="ghost"
              size="lg"
              onClick={() => onNavigate('risk-analysis')}
              leadingIcon={<Activity size={16} />}
            >
              Risk Factor Analysis
            </Button>
          </div>

          {/* Live Corridor Quick Stats Strip */}
          <div className="dh-home-hero__stats-strip">
            <div className="dh-home-hero__stat-item">
              <span className="dh-home-hero__stat-label">PILOT SECTOR</span>
              <span className="dh-home-hero__stat-val">Garhwal Himalayas</span>
              <span className="dh-home-hero__stat-sub">NH-7 / Char Dham Highway Network</span>
            </div>

            <div className="dh-home-hero__stat-divider" aria-hidden="true" />

            <div className="dh-home-hero__stat-item">
              <span className="dh-home-hero__stat-label">COMPOSITE HAZARD LEVEL</span>
              <div className="dh-home-hero__stat-risk">
                <span
                  className="dh-home-hero__stat-score"
                  style={{ color: riskAssessment?.colorHex ?? 'var(--risk-low)' }}
                >
                  {currentRiskScore.toFixed(1)}
                </span>
                <span className="dh-home-hero__stat-denom">/ 100</span>
                <Badge
                  variant={currentRiskLevel === 'LOW' ? 'low' : currentRiskLevel === 'MODERATE' ? 'moderate' : 'high'}
                  size="sm"
                  showDot
                >
                  {currentRiskLevel} RISK
                </Badge>
              </div>
              <span className="dh-home-hero__stat-sub">Deterministic MCDA Index</span>
            </div>

            <div className="dh-home-hero__stat-divider" aria-hidden="true" />

            <div className="dh-home-hero__stat-item">
              <span className="dh-home-hero__stat-label">PRECIPITATION TELEMETRY</span>
              <span className="dh-home-hero__stat-val">
                {livePrecip.toFixed(1)} mm/h
              </span>
              <span className="dh-home-hero__stat-sub">Open-Meteo Hourly Stream</span>
            </div>

            <div className="dh-home-hero__stat-divider" aria-hidden="true" />

            <div className="dh-home-hero__stat-item">
              <span className="dh-home-hero__stat-label">DISAGGREGATION</span>
              <span className="dh-home-hero__stat-val">250m Segments</span>
              <span className="dh-home-hero__stat-sub">High-Resolution Exposure</span>
            </div>
          </div>
        </div>
      </section>

      {/* ─── 2. HIMALAYAN HAZARD INTELLIGENCE MAP SECTION ───────────────── */}
      <section className="dh-home-map-section" id="map-workspace">
        <div className="dh-home-section__header">
          <span className="dh-home-section__eyebrow">GEOSPATIAL INTELLIGENCE WORKSPACE</span>
          <h2 className="dh-home-section__title">
            Garhwal Himalayan Hazard Monitoring Grid
          </h2>
          <p className="dh-home-section__desc">
            Explore terrain topography, real-time hydro-meteorological telemetry, and active monitoring stations across Uttarakhand's pilgrimage corridors.
          </p>
        </div>

        <div className="dh-home-map-container">
          <MapViewport
            envData={envData}
            riskAssessment={isSimulated ? scenarioRiskAssessment ?? riskAssessment : riskAssessment}
            segments={segments}
            selectedSegmentId={selectedSegmentId}
            onSelectSegment={(seg) => onSelectSegment?.(seg)}
            isSimulated={isSimulated}
            scenarioPrecipitation={scenarioPrecipitation}
            onResetScenario={() => onScenarioChange?.(null)}
            locationSelection={locationSelection}
          />
        </div>
      </section>

      {/* ─── 3. HIMALAYAN RISK CONTEXT SECTION ───────────────────────────── */}
      <section className="dh-home-context">
        <div className="dh-home-section__header">
          <span className="dh-home-section__eyebrow">HIMALAYAN GEOTECHNICAL CONTEXT</span>
          <h2 className="dh-home-section__title">
            The Unique Fragility of Uttarakhand Pilgrimage Routes
          </h2>
          <p className="dh-home-section__desc">
            Unlike stable continental road networks, the Himalayan Char Dham highways (NH-7, NH-107, NH-34) carve through fragile sedimentary and metamorphic nappe thrusts subjected to severe weather shocks.
          </p>
        </div>

        <div className="dh-home-context__grid">
          <div className="dh-home-context__card">
            <div className="dh-home-context__card-image-wrap">
              <img
                src="/images/cloudburst-rain.jpg"
                alt="Intense Himalayan monsoon storm and rainfall over steep valley slopes"
                className="dh-home-context__card-image"
                loading="lazy"
              />
              <div className="dh-home-context__card-image-overlay" />
              <div className="dh-home-context__icon dh-home-context__icon--rain">
                <CloudRain size={20} />
              </div>
            </div>
            <div className="dh-home-context__card-content">
              <h3 className="dh-home-context__card-title">Cloudburst &amp; Monsoon Surges</h3>
              <p className="dh-home-context__card-text">
                Sudden localized downpours exceeding 25 mm/h saturate weathered rock joints and mobilize steep talus cones, triggering catastrophic debris torrents across roads within minutes.
              </p>
            </div>
          </div>

          <div className="dh-home-context__card">
            <div className="dh-home-context__card-image-wrap">
              <img
                src="/images/mountain-road-cut.jpg"
                alt="Steep excavated mountain highway cut along rugged Himalayan terrain"
                className="dh-home-context__card-image"
                loading="lazy"
              />
              <div className="dh-home-context__card-image-overlay" />
              <div className="dh-home-context__icon dh-home-context__icon--mountain">
                <Mountain size={20} />
              </div>
            </div>
            <div className="dh-home-context__card-content">
              <h3 className="dh-home-context__card-title">Steep Cut-Slope Geometry</h3>
              <p className="dh-home-context__card-text">
                Highway widening cuts the toe of steep mountain slopes (often &gt; 35°), leaving unstable rock blocks susceptible to planar and wedge sliding during moisture spikes.
              </p>
            </div>
          </div>

          <div className="dh-home-context__card">
            <div className="dh-home-context__card-image-wrap">
              <img
                src="/images/fault-rock-gorge.jpg"
                alt="Fractured metamorphic rock formations along deep Himalayan canyon gorge"
                className="dh-home-context__card-image"
                loading="lazy"
              />
              <div className="dh-home-context__card-image-overlay" />
              <div className="dh-home-context__icon dh-home-context__icon--layers">
                <Layers size={20} />
              </div>
            </div>
            <div className="dh-home-context__card-content">
              <h3 className="dh-home-context__card-title">Active Tectonic Fault Zones</h3>
              <p className="dh-home-context__card-text">
                Traversing the Main Central Thrust (MCT) and Alaknanda Fault, sheared rock formations like chlorite schists and phyllites possess naturally diminished shear strength.
              </p>
            </div>
          </div>

          <div className="dh-home-context__card">
            <div className="dh-home-context__card-image-wrap">
              <img
                src="/images/pilgrim-corridor.jpg"
                alt="Vehicles and pilgrimage convoy navigating narrow high-altitude Garhwal highway"
                className="dh-home-context__card-image"
                loading="lazy"
              />
              <div className="dh-home-context__card-image-overlay" />
              <div className="dh-home-context__icon dh-home-context__icon--shield">
                <ShieldCheck size={20} />
              </div>
            </div>
            <div className="dh-home-context__card-content">
              <h3 className="dh-home-context__card-title">Vulnerable Pilgrim Choke Points</h3>
              <p className="dh-home-context__card-text">
                Over 4 million pilgrims travel the Badrinath and Kedarnath corridors annually. A single roadblock at Sirobagarh or Birahi can strand thousands with zero bypass access.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ─── 4. CORE SOLUTION PILLARS ────────────────────────────────────── */}
      <section className="dh-home-pillars">
        <div className="dh-home-section__header">
          <span className="dh-home-section__eyebrow">SYSTEM ARCHITECTURE</span>
          <h2 className="dh-home-section__title">
            How Drishti Himalaya Solves Mountain Corridor Safety
          </h2>
          <p className="dh-home-section__desc">
            A comprehensive, modular decision support pipeline that turns complex geospatial and weather streams into actionable transit advisories.
          </p>
        </div>

        <div className="dh-home-pillars__grid">
          {/* Pillar 1 */}
          <div className="dh-home-pillar-card">
            <div className="dh-home-pillar-card__top">
              <span className="dh-home-pillar-card__num">01</span>
              <Compass size={20} className="dh-home-pillar-card__icon" />
            </div>
            <h3 className="dh-home-pillar-card__title">250m Segment Disaggregation</h3>
            <p className="dh-home-pillar-card__text">
              Instead of broad district-level alerts, routes are divided into uniform 250m slices. Each segment is individually evaluated for elevation gain, longitudinal slope gradient, and river gorge proximity.
            </p>
            <button
              type="button"
              className="dh-home-pillar-card__link"
              onClick={() => onNavigate('map')}
            >
              <span>Explore Interactive Map</span>
              <ChevronRight size={14} />
            </button>
          </div>

          {/* Pillar 2 */}
          <div className="dh-home-pillar-card">
            <div className="dh-home-pillar-card__top">
              <span className="dh-home-pillar-card__num">02</span>
              <Activity size={20} className="dh-home-pillar-card__icon" />
            </div>
            <h3 className="dh-home-pillar-card__title">Deterministic Multi-Factor Scoring</h3>
            <p className="dh-home-pillar-card__text">
              Combines 5 hydro-meteorological and terrain factors into a standardized 0–100 Hazard Score using dynamic weight normalization (∑ wᵢ = 1.0) with complete judicial transparency.
            </p>
            <button
              type="button"
              className="dh-home-pillar-card__link"
              onClick={() => onNavigate('risk-analysis')}
            >
              <span>View Factor Formulation</span>
              <ChevronRight size={14} />
            </button>
          </div>

          {/* Pillar 3 */}
          <div className="dh-home-pillar-card">
            <div className="dh-home-pillar-card__top">
              <span className="dh-home-pillar-card__num">03</span>
              <CloudRain size={20} className="dh-home-pillar-card__icon" />
            </div>
            <h3 className="dh-home-pillar-card__title">What-If Rainfall Stress Simulation</h3>
            <p className="dh-home-pillar-card__text">
              Engineers and civil authorities can simulate hypothetical downpour spikes (0 to 100 mm/h) in real time to stress-test corridor bottleneck vulnerabilities without waiting for disasters to unfold.
            </p>
            <button
              type="button"
              className="dh-home-pillar-card__link"
              onClick={() => onNavigate('risk-analysis')}
            >
              <span>Try Scenario Simulator</span>
              <ChevronRight size={14} />
            </button>
          </div>

          {/* Pillar 4 */}
          <div className="dh-home-pillar-card">
            <div className="dh-home-pillar-card__top">
              <span className="dh-home-pillar-card__num">04</span>
              <AlertTriangle size={20} className="dh-home-pillar-card__icon" />
            </div>
            <h3 className="dh-home-pillar-card__title">Early Warning &amp; Tactical Advisories</h3>
            <p className="dh-home-pillar-card__text">
              Provides tiered advisories (NORMAL, CAUTION, RESTRICTED, STANDBY) and automated evacuation / escort bulletins aligned with SDRF (State Disaster Response Force) standard operating procedures.
            </p>
            <button
              type="button"
              className="dh-home-pillar-card__link"
              onClick={() => onNavigate('dashboard')}
            >
              <span>Inspect Corridor Overview</span>
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      </section>

      {/* ─── 6. BOTTOM CALL TO ACTION BANNER ─────────────────────────────── */}
      <section className="dh-home-cta">
        <div className="dh-home-cta__container">
          <div className="dh-home-cta__text-group">
            <h2 className="dh-home-cta__title">
              Ready to Explore Himalayan Hazard Intelligence?
            </h2>
            <p className="dh-home-cta__desc">
              Launch the live command center dashboard to inspect real-time telemetry, segment hazard classifications, and interactive route simulations across Uttarakhand.
            </p>
          </div>
          <div className="dh-home-cta__btn-group">
            <Button
              variant="primary"
              size="lg"
              onClick={() => onNavigate('dashboard')}
              trailingIcon={<ArrowRight size={16} />}
            >
              Launch Monitoring Dashboard
            </Button>
            <Button
              variant="secondary"
              size="lg"
              onClick={() => onNavigate('about')}
            >
              Read Project Documentation
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
};
