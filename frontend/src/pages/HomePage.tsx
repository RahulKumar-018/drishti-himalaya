import React from 'react';
import clsx from 'clsx';
import {
  Mountain,
  Compass,
  Activity,
  ShieldCheck,
  AlertTriangle,
  ArrowRight,
  Layers,
  CloudRain,
  ChevronRight,
} from 'lucide-react';
import { Button } from '../components/common/Button';
import { Badge } from '../components/common/Badge';
import { RiskAssessment } from '../services/risk/types';
import { EnvironmentalData } from '../services/environmental/types';
import './HomePage.css';

export interface HomePageProps {
  onNavigate: (tab: string) => void;
  riskAssessment?: RiskAssessment | null;
  envData?: EnvironmentalData | null;
  className?: string;
}

export const HomePage: React.FC<HomePageProps> = ({
  onNavigate,
  riskAssessment,
  envData,
  className,
}) => {
  const currentRiskScore = riskAssessment?.score ?? 24.8;
  const currentRiskLevel = riskAssessment?.level ?? 'LOW';
  const livePrecip = envData?.rainfall?.precipitation ?? 0.0;

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
              PILOT SECTOR: GARHWAL HIMALAYAS (NH-7)
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
            Monitors geotechnical hazard conditions and hydro-meteorological shocks along Himalayan pilgrimage arteries. Drishti Himalaya disaggregates mountain highways into 250m uniform segments, evaluating real-time multi-factor risk exposure to support safer route decisions for pilgrims, logistics operators, and civil disaster response teams.
          </p>

          <div className="dh-home-hero__disclaimer-badge">
            Operational Decision Support System · Continuous Deterministic Risk Monitoring · Future ML Susceptibility Inference Planned
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
              onClick={() => onNavigate('map')}
              leadingIcon={<Compass size={16} />}
            >
              Interactive Corridor Map
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
              <span className="dh-home-hero__stat-label">PILOT CORRIDOR</span>
              <span className="dh-home-hero__stat-val">Rishikesh → Joshimath</span>
              <span className="dh-home-hero__stat-sub">NH-7 · 246 km Mountain Road</span>
            </div>

            <div className="dh-home-hero__stat-divider" aria-hidden="true" />

            <div className="dh-home-hero__stat-item">
              <span className="dh-home-hero__stat-label">CORRIDOR HAZARD LEVEL</span>
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

      {/* ─── 2. HIMALAYAN RISK CONTEXT SECTION ───────────────────────────── */}
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
            <div className="dh-home-context__icon dh-home-context__icon--rain">
              <CloudRain size={22} />
            </div>
            <h3 className="dh-home-context__card-title">Cloudburst &amp; Monsoon Surges</h3>
            <p className="dh-home-context__card-text">
              Sudden localized downpours exceeding 25 mm/h saturate weathered rock joints and mobilize steep talus cones, triggering catastrophic debris torrents across roads within minutes.
            </p>
          </div>

          <div className="dh-home-context__card">
            <div className="dh-home-context__icon dh-home-context__icon--mountain">
              <Mountain size={22} />
            </div>
            <h3 className="dh-home-context__card-title">Steep Cut-Slope Geometry</h3>
            <p className="dh-home-context__card-text">
              Highway widening cuts the toe of steep mountain slopes (often &gt; 35°), leaving unstable rock blocks susceptible to planar and wedge sliding during moisture spikes.
            </p>
          </div>

          <div className="dh-home-context__card">
            <div className="dh-home-context__icon dh-home-context__icon--layers">
              <Layers size={22} />
            </div>
            <h3 className="dh-home-context__card-title">Active Tectonic Fault Zones</h3>
            <p className="dh-home-context__card-text">
              Traversing the Main Central Thrust (MCT) and Alaknanda Fault, sheared rock formations like chlorite schists and phyllites possess naturally diminished shear strength.
            </p>
          </div>

          <div className="dh-home-context__card">
            <div className="dh-home-context__icon dh-home-context__icon--shield">
              <ShieldCheck size={22} />
            </div>
            <h3 className="dh-home-context__card-title">Vulnerable Pilgrim Choke Points</h3>
            <p className="dh-home-context__card-text">
              Over 4 million pilgrims travel the Badrinath and Kedarnath corridors annually. A single roadblock at Sirobagarh or Birahi can strand thousands with zero bypass access.
            </p>
          </div>
        </div>
      </section>

      {/* ─── 3. CORE SOLUTION PILLARS ────────────────────────────────────── */}
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
              onClick={() => onNavigate('alerts')}
            >
              <span>View Active Alerts</span>
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      </section>

      {/* ─── 4. BOTTOM CALL TO ACTION BANNER ─────────────────────────────── */}
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
