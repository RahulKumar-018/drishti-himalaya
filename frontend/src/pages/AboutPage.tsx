import React from 'react';
import clsx from 'clsx';
import {
  Mountain,
  Shield,
  TrendingUp,
  Compass,
  CheckCircle2,
  ArrowRight,
} from 'lucide-react';
import { Card } from '../components/common/Card';
import { Button } from '../components/common/Button';
import { RiskIntelligencePipeline } from '../components/risk/RiskIntelligencePipeline';
import './AboutPage.css';

export interface AboutPageProps {
  onNavigate: (tab: string) => void;
  className?: string;
}

export const AboutPage: React.FC<AboutPageProps> = ({ onNavigate, className }) => {
  return (
    <div className={clsx('dh-about-page', className)}>
      {/* ─── 1. HERO HEADER ───────────────────────────────────────────────── */}
      <div className="dh-about-page__header">
        <div className="dh-about-page__tag">
          <Mountain size={14} />
          <span>PROJECT ARCHITECTURE &amp; METHODOLOGY</span>
        </div>
        <h1 className="dh-about-page__title">ABOUT DRISHTI HIMALAYA</h1>
        <p className="dh-about-page__lead">
          An engineering decision support system built to predict, quantify, and visualize geotechnical road hazard exposure along the critical pilgrimage and defense arteries of the Indian Himalayas.
        </p>
      </div>

      {/* ─── 2. PROBLEM & SOLUTION GRID ───────────────────────────────────── */}
      <div className="dh-about-grid-2">
        <Card
          variant="default"
          title="The Problem We Are Solving"
          subtitle="The Himalayan Geotechnical Crisis"
          className="dh-about-card"
        >
          <div className="dh-about-card__content">
            <p>
              The Indian Himalayan Region (IHR), particularly the state of Uttarakhand, is home to the revered Char Dham pilgrimage routes (Kedarnath, Badrinath, Gangotri, Yamunotri). Annually, over <strong>4.5 million pilgrims and essential supply convoys</strong> navigate these narrow mountain corridors.
            </p>
            <p>
              However, the Himalayas are the youngest, highest, and most active mountain system on Earth. Intensive monsoon cloudbursts, severe toe-cutting for highway widening, and deep tectonic fault fractures trigger hundreds of destructive landslides and debris torrents each season.
            </p>
            <div className="dh-about-callout dh-about-callout--problem">
              <span className="dh-about-callout__title">Existing Operational Blindspot:</span>
              <p className="dh-about-callout__text">
                Current disaster management relies almost entirely on coarse, district-level weather forecasts (e.g. "Heavy rain warning for Chamoli district"). A district spans thousands of square kilometers. District forecasts cannot tell a transit coordinator whether a specific 500m gorge section on NH-7 is on the verge of slope failure.
              </p>
            </div>
          </div>
        </Card>

        <Card
          variant="default"
          title="The Drishti Himalaya Solution"
          subtitle="250m Granular Road Hazard Intelligence"
          className="dh-about-card"
        >
          <div className="dh-about-card__content">
            <p>
              Drishti Himalaya bridges the gap between regional satellite meteorology and hyper-local road safety through <strong>250-meter uniform highway disaggregation</strong>.
            </p>
            <p>
              By fusing Copernicus 90m Digital Elevation Models with real-time Open-Meteo precipitation streams and deterministic geotechnical risk functions, the system evaluates composite slope hazard exposure meter by meter.
            </p>
            <ul className="dh-about-feature-list">
              <li>
                <CheckCircle2 size={15} className="dh-about-feature-icon" />
                <span><strong>250m Segment Resolution:</strong> Identifies exact bottleneck zones rather than generic district warnings.</span>
              </li>
              <li>
                <CheckCircle2 size={15} className="dh-about-feature-icon" />
                <span><strong>Deterministic MCDA Baseline:</strong> 100% transparent, explainable factor attribution without black-box hallucination.</span>
              </li>
              <li>
                <CheckCircle2 size={15} className="dh-about-feature-icon" />
                <span><strong>What-If Stress Simulation:</strong> Instant dynamic recalculation of corridor risk under hypothetical cloudburst loads.</span>
              </li>
              <li>
                <CheckCircle2 size={15} className="dh-about-feature-icon" />
                <span><strong>Safer Alternative Routing:</strong> OSRM routing engine integrated with hazard indices to suggest less exposed bypass corridors.</span>
              </li>
            </ul>
          </div>
        </Card>
      </div>

      {/* ─── 3. CONCEPTUAL INTELLIGENCE PIPELINE ──────────────────────────── */}
      <RiskIntelligencePipeline className="dh-about-pipeline" />

      {/* ─── 4. TECHNOLOGY STACK SPECIFICATION ────────────────────────────── */}
      <Card
        variant="elevated"
        title="Technology Stack &amp; Open Datasets"
        subtitle="Modern, battle-tested geospatial engineering"
        className="dh-about-tech-card"
      >
        <div className="dh-about-tech-grid">
          <div className="dh-about-tech-item">
            <span className="dh-about-tech-cat">Frontend Core</span>
            <span className="dh-about-tech-name">React 19 &amp; TypeScript</span>
            <span className="dh-about-tech-desc">Strict typing, modular functional components, zero console exceptions.</span>
          </div>

          <div className="dh-about-tech-item">
            <span className="dh-about-tech-cat">Geospatial Mapping</span>
            <span className="dh-about-tech-name">Leaflet &amp; React-Leaflet</span>
            <span className="dh-about-tech-desc">Custom SVG pulse beacons, segment risk polyline shaders, OpenStreetMap tiles.</span>
          </div>

          <div className="dh-about-tech-item">
            <span className="dh-about-tech-cat">Elevation Telemetry</span>
            <span className="dh-about-tech-name">Copernicus DEM GLO-90</span>
            <span className="dh-about-tech-desc">90m spatial resolution digital surface model for slope gradient calculation.</span>
          </div>

          <div className="dh-about-tech-item">
            <span className="dh-about-tech-cat">Weather Telemetry</span>
            <span className="dh-about-tech-name">Open-Meteo Hourly API</span>
            <span className="dh-about-tech-desc">Keyless, high-reliability precipitation, accumulation, and probability streams.</span>
          </div>

          <div className="dh-about-tech-item">
            <span className="dh-about-tech-cat">Road Routing</span>
            <span className="dh-about-tech-name">OSRM Project</span>
            <span className="dh-about-tech-desc">Open Source Routing Machine providing real mountain highway geometry.</span>
          </div>

          <div className="dh-about-tech-item">
            <span className="dh-about-tech-cat">Testing &amp; Quality</span>
            <span className="dh-about-tech-name">Node TSX Native Test Runner</span>
            <span className="dh-about-tech-desc">115 automated test suites covering edge cases, math invariants, and UI states.</span>
          </div>
        </div>
      </Card>

      {/* ─── 4. ROLE OF AI/ML & FUTURE ROADMAP ─────────────────────────────── */}
      <div className="dh-about-grid-2">
        <Card
          variant="default"
          title="The Role of AI &amp; Machine Learning"
          subtitle="From Deterministic Baseline to Predictive Spatial ML"
          className="dh-about-card"
        >
          <div className="dh-about-card__content">
            <p>
              In disaster decision support, blind deployment of uncalibrated neural networks is hazardous. Drishti Himalaya implements a deliberate <strong>two-stage evolution</strong>:
            </p>
            <div className="dh-about-phase-box">
              <span className="dh-about-phase-title">Stage 1: Deterministic Physics Baseline (Current Frontend)</span>
              <p className="dh-about-phase-text">
                Evaluates rainfall runoff thresholds and DEM corridor slope gradients via transparent multi-criteria decision analysis (MCDA). This guarantees fail-safe operation even with partial telemetry.
              </p>
            </div>
            <div className="dh-about-phase-box dh-about-phase-box--upcoming">
              <span className="dh-about-phase-title">Stage 2: Spatial ML Susceptibility Inference (Backend Phase)</span>
              <p className="dh-about-phase-text">
                The Python/FastAPI backend will ingest historical landslide scars from the Geological Survey of India (GSI) catalog. An XGBoost model will compute non-linear failure probabilities conditioned on soil moisture, lithology, and cut-slope angles.
              </p>
            </div>
          </div>
        </Card>

        <Card
          variant="default"
          title="Expected Social &amp; Economic Impact"
          subtitle="Safeguarding Lives, Corridors, and Communities"
          className="dh-about-card"
        >
          <div className="dh-about-card__content">
            <ul className="dh-about-impact-list">
              <li>
                <div className="dh-about-impact-icon"><Shield size={16} /></div>
                <div>
                  <strong>Pilgrim Life Safety:</strong>
                  <p>Preventing convoys from entering high-risk gorges prior to cloudburst peaks, eliminating mass stranding incidents.</p>
                </div>
              </li>
              <li>
                <div className="dh-about-impact-icon"><TrendingUp size={16} /></div>
                <div>
                  <strong>Rapid Road Clearance:</strong>
                  <p>Enabling Border Roads Organisation (BRO) and PWD crews to pre-stage earthmovers near predicted bottleneck sectors.</p>
                </div>
              </li>
              <li>
                <div className="dh-about-impact-icon"><Compass size={16} /></div>
                <div>
                  <strong>Civil Protection Coordination:</strong>
                  <p>Providing Uttarakhand SDRF and district magistrates with unified real-time spatial situational awareness.</p>
                </div>
              </li>
            </ul>
          </div>
        </Card>
      </div>

      {/* ─── 5. BOTTOM NAVIGATION CTA ─────────────────────────────────────── */}
      <div className="dh-about-bottom-cta">
        <Button
          variant="primary"
          size="lg"
          onClick={() => onNavigate('dashboard')}
          trailingIcon={<ArrowRight size={16} />}
        >
          Explore Live Monitoring Dashboard
        </Button>
        <Button
          variant="secondary"
          size="lg"
          onClick={() => onNavigate('map')}
        >
          Open Interactive Corridor Map
        </Button>
      </div>
    </div>
  );
};
