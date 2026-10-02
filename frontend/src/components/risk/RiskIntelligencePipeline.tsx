import React from 'react';
import clsx from 'clsx';
import {
  CloudRain,
  Mountain,
  Database,
  BrainCircuit,
  ShieldAlert,
  ArrowRight,
  Sparkles,
} from 'lucide-react';
import './RiskIntelligencePipeline.css';

export interface PipelineStage {
  id: string;
  name: string;
  subtitle: string;
  source: string;
  statusText: string;
  statusType: 'active' | 'deterministic' | 'planned';
  details: string;
  keyMetric?: string;
}

export interface RiskIntelligencePipelineProps {
  className?: string;
}

export const RiskIntelligencePipeline: React.FC<RiskIntelligencePipelineProps> = ({ className }) => {
  const stages: PipelineStage[] = [
    {
      id: 'weather',
      name: 'Weather Telemetry',
      subtitle: 'Dynamic Rainfall',
      source: 'Open-Meteo API',
      statusText: 'Live / Ingested',
      statusType: 'active',
      details: 'Hourly precipitation, 24h/72h accumulation, and scenario stress injection rate.',
      keyMetric: 'P24 / P72 / ARI',
    },
    {
      id: 'terrain',
      name: 'Terrain Topography',
      subtitle: 'DEM Hypsometry',
      source: 'Copernicus DEM 90m / 30m',
      statusText: 'Active / Calculated',
      statusType: 'active',
      details: 'Segment elevation, slope gradient (Horn’s method), and corridor terrain profile.',
      keyMetric: 'Slope 15°–60°',
    },
    {
      id: 'history',
      name: 'Historical Scars',
      subtitle: 'Inventory Spatial Index',
      source: 'NRSC / GSI Landslide Atlas',
      statusText: 'Curated Index',
      statusType: 'active',
      details: 'Spatial proximity to 11,219 mapped historical landslide scars and rupture zones.',
      keyMetric: 'd0 = 350m decay',
    },
    {
      id: 'mcda_ml',
      name: 'MCDA + ML Engine',
      subtitle: 'Multi-Factor Fusion',
      source: 'MCDA (Active) + XGBoost (Planned)',
      statusText: 'Deterministic V1 (Active)',
      statusType: 'deterministic',
      details: 'Multi-criteria weighted fusion currently active. Machine learning spatial susceptibility inference planned for backend release.',
      keyMetric: '35/30/20/15 Wts',
    },
    {
      id: 'decision',
      name: 'Risk Guidance & Alerts',
      subtitle: 'Actionable Corridor Output',
      source: 'Drishti Himalaya HUD',
      statusText: 'Active / Operational',
      statusType: 'active',
      details: 'Segment-level risk indices (0–100), bottleneck warnings, and safer route alternatives.',
      keyMetric: '4-Tier Exposure',
    },
  ];

  return (
    <div
      className={clsx('dh-pipeline', className)}
      role="region"
      aria-label="Risk Intelligence Processing Pipeline"
    >
      <div className="dh-pipeline__header">
        <div>
          <span className="dh-pipeline__subtitle">SYSTEM ARCHITECTURE</span>
          <h3 className="dh-pipeline__title">Himalayan Risk Intelligence Pipeline</h3>
          <p className="dh-pipeline__intro">
            From raw meteorological and geomorphic inputs to explainable, segment-level transit advisories.
          </p>
        </div>
        <div className="dh-pipeline__legend">
          <span className="dh-pipeline__legend-item">
            <span className="dh-pipeline__legend-dot dh-pipeline__legend-dot--active" /> Active Telemetry
          </span>
          <span className="dh-pipeline__legend-item">
            <span className="dh-pipeline__legend-dot dh-pipeline__legend-dot--det" /> Deterministic Logic
          </span>
          <span className="dh-pipeline__legend-item">
            <span className="dh-pipeline__legend-dot dh-pipeline__legend-dot--planned" /> ML Planned
          </span>
        </div>
      </div>

      {/* Connected Horizontal Flow */}
      <div className="dh-pipeline__flow">
        {stages.map((stage, idx) => {
          const isML = stage.id === 'mcda_ml';

          return (
            <React.Fragment key={stage.id}>
              <div
                className={clsx('dh-pipeline__card', {
                  'dh-pipeline__card--active': stage.statusType === 'active',
                  'dh-pipeline__card--det': stage.statusType === 'deterministic',
                })}
              >
                <div className="dh-pipeline__card-top">
                  <div className="dh-pipeline__icon-box">
                    {stage.id === 'weather' && <CloudRain size={16} />}
                    {stage.id === 'terrain' && <Mountain size={16} />}
                    {stage.id === 'history' && <Database size={16} />}
                    {stage.id === 'mcda_ml' && <BrainCircuit size={16} />}
                    {stage.id === 'decision' && <ShieldAlert size={16} />}
                  </div>
                  <span
                    className={clsx('dh-pipeline__status-tag', {
                      'dh-pipeline__status-tag--active': stage.statusType === 'active',
                      'dh-pipeline__status-tag--det': stage.statusType === 'deterministic',
                    })}
                  >
                    {stage.statusText}
                  </span>
                </div>

                <h4 className="dh-pipeline__stage-name">{stage.name}</h4>
                <span className="dh-pipeline__stage-sub">{stage.subtitle}</span>

                <div className="dh-pipeline__source-pill">
                  <span className="dh-pipeline__source-label">Source:</span> {stage.source}
                </div>

                <p className="dh-pipeline__details">{stage.details}</p>

                {isML && (
                  <div className="dh-pipeline__ml-note">
                    <Sparkles size={11} className="dh-pipeline__sparkle-icon" aria-hidden="true" />
                    <span>ML inference (XGBoost) planned for backend phase</span>
                  </div>
                )}

                {stage.keyMetric && (
                  <div className="dh-pipeline__metric-row">
                    <span className="dh-pipeline__metric-label">Key Metric</span>
                    <span className="dh-pipeline__metric-val">{stage.keyMetric}</span>
                  </div>
                )}
              </div>

              {idx < stages.length - 1 && (
                <div className="dh-pipeline__arrow-col" aria-hidden="true">
                  <ArrowRight size={18} className="dh-pipeline__arrow-icon" />
                </div>
              )}
            </React.Fragment>
          );
        })}
      </div>

      {/* Model Attribution Bar Strip (from UXMagic Screen 5) */}
      <div className="dh-pipeline__attribution-strip">
        <div className="dh-pipeline__attribution-head">
          <h4 className="dh-pipeline__attribution-title">Current Model Contribution Baseline</h4>
          <span className="dh-pipeline__attribution-subtitle">MCDA Deterministic Weights</span>
        </div>

        <div className="dh-pipeline__weights-grid">
          <div className="dh-pipeline__weight-item">
            <div className="dh-pipeline__weight-top">
              <span>Topographic Slope</span>
              <strong>35% wt</strong>
            </div>
            <div className="dh-pipeline__weight-bar-bg">
              <div className="dh-pipeline__weight-bar" style={{ width: '35%', background: 'var(--accent-primary)' }} />
            </div>
          </div>

          <div className="dh-pipeline__weight-item">
            <div className="dh-pipeline__weight-top">
              <span>Dynamic Rainfall</span>
              <strong>30% wt</strong>
            </div>
            <div className="dh-pipeline__weight-bar-bg">
              <div className="dh-pipeline__weight-bar" style={{ width: '30%', background: 'var(--accent-primary)' }} />
            </div>
          </div>

          <div className="dh-pipeline__weight-item">
            <div className="dh-pipeline__weight-top">
              <span>Historical Scar Proximity</span>
              <strong>20% wt</strong>
            </div>
            <div className="dh-pipeline__weight-bar-bg">
              <div className="dh-pipeline__weight-bar" style={{ width: '20%', background: 'var(--risk-low)' }} />
            </div>
          </div>

          <div className="dh-pipeline__weight-item">
            <div className="dh-pipeline__weight-top">
              <span>Road Geometry</span>
              <strong>15% wt</strong>
            </div>
            <div className="dh-pipeline__weight-bar-bg">
              <div className="dh-pipeline__weight-bar" style={{ width: '15%', background: 'var(--risk-low)' }} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
