import React from 'react';
import clsx from 'clsx';
import {
  CloudRain,
  Mountain,
  Database,
  BrainCircuit,
  ShieldAlert,
  ArrowRight,
  Info,
} from 'lucide-react';
import { RiskAssessment } from '../../services/risk/types';
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
  riskAssessment?: RiskAssessment | null;
}

interface BaseFactorMeta {
  id: string;
  name: string;
  baseWeight: number;
  description: string;
  colorVar: string;
}

const AUTHORITATIVE_BASE_FACTORS: BaseFactorMeta[] = [
  {
    id: 'precipitation_intensity',
    name: 'Precipitation Intensity',
    baseWeight: 30,
    description: 'Hourly precipitation rate (Open-Meteo)',
    colorVar: 'var(--accent-primary)',
  },
  {
    id: 'rainfall_accumulation_24h',
    name: '24h Rainfall Accumulation',
    baseWeight: 25,
    description: '24h antecedent rainfall depth',
    colorVar: 'var(--accent-primary)',
  },
  {
    id: 'terrain_slope_gradient',
    name: 'Terrain Slope Gradient',
    baseWeight: 20,
    description: 'DEM-derived corridor alignment gradient',
    colorVar: 'var(--accent-primary)',
  },
  {
    id: 'precipitation_probability',
    name: 'Precipitation Probability',
    baseWeight: 15,
    description: 'Probability of precipitation event',
    colorVar: 'var(--risk-low)',
  },
  {
    id: 'orographic_elevation',
    name: 'Orographic Elevation',
    baseWeight: 10,
    description: 'Terrain elevation hypsometric profile',
    colorVar: 'var(--risk-low)',
  },
];

export const RiskIntelligencePipeline: React.FC<RiskIntelligencePipelineProps> = ({
  className,
  riskAssessment,
}) => {
  const isNormalized = (riskAssessment?.dataQuality?.unavailableFactorsCount ?? 0) > 0;
  const activeCount = riskAssessment?.dataQuality?.activeFactorsCount ?? 5;

  const stages: PipelineStage[] = [
    {
      id: 'weather',
      name: 'Weather Telemetry',
      subtitle: 'Dynamic Rainfall Telemetry',
      source: 'Open-Meteo API',
      statusText: 'Live / Ingested',
      statusType: 'active',
      details: 'Hourly precipitation intensity, 24h rainfall accumulation, and precipitation probability.',
      keyMetric: '30% / 25% / 15% Base',
    },
    {
      id: 'terrain',
      name: 'Terrain Topography',
      subtitle: 'Corridor Alignment DEM',
      source: 'Copernicus DEM 90m / 30m',
      statusText: 'Active / Calculated',
      statusType: 'active',
      details: 'DEM-derived corridor alignment gradient and orographic elevation hypsometry.',
      keyMetric: '20% / 10% Base',
    },
    {
      id: 'history',
      name: 'Historical Context',
      subtitle: 'Inventory Spatial Index',
      source: 'NRSC / GSI Landslide Atlas',
      statusText: 'Unassessed / Future',
      statusType: 'planned',
      details: 'Spatial catalog of historical landslide scars and cutting features. Contextual reference only; unassessed in Phase 6B active scoring.',
      keyMetric: '0% Active Weight',
    },
    {
      id: 'mcda_ml',
      name: 'Deterministic Risk Fusion',
      subtitle: '5-Factor Weighted Fusion',
      source: 'Deterministic Engine V1',
      statusText: 'Deterministic V1 (Active)',
      statusType: 'deterministic',
      details: 'Authoritative multi-criteria additive synthesis: 30/25/20/15/10 base weights with dynamic normalization when factors are unobserved.',
      keyMetric: '5-factor weighted fusion',
    },
    {
      id: 'decision',
      name: 'Decision Guidance',
      subtitle: 'Corridor Advisory & Exposure',
      source: 'Drishti Himalaya HUD',
      statusText: 'Active / Operational',
      statusType: 'active',
      details: 'Segment-level hazard exposure index (0–100), risk tier classification, and corridor hotspot ranking.',
      keyMetric: '4-Tier Exposure',
    },
  ];

  return (
    <div
      className={clsx('dh-pipeline', className)}
      role="region"
      aria-label="Risk Intelligence Processing Pipeline"
    >
      {/* Visual Dataflow Stepper */}
      <div className="dh-pipeline__stepper" aria-label="End-to-End Decision Flow">
        <div className="dh-pipeline__step dh-pipeline__step--active">
          <span className="dh-pipeline__step-dot" />
          <span className="dh-pipeline__step-text">LIVE TELEMETRY</span>
        </div>
        <ArrowRight size={12} className="dh-pipeline__step-arrow" aria-hidden="true" />
        <div className="dh-pipeline__step dh-pipeline__step--active">
          <span className="dh-pipeline__step-dot" />
          <span className="dh-pipeline__step-text">TERRAIN DATA</span>
        </div>
        <ArrowRight size={12} className="dh-pipeline__step-arrow" aria-hidden="true" />
        <div className="dh-pipeline__step dh-pipeline__step--active">
          <span className="dh-pipeline__step-dot dh-pipeline__step-dot--det" />
          <span className="dh-pipeline__step-text">DETERMINISTIC V1</span>
        </div>
        <ArrowRight size={12} className="dh-pipeline__step-arrow" aria-hidden="true" />
        <div className="dh-pipeline__step dh-pipeline__step--active">
          <span className="dh-pipeline__step-dot dh-pipeline__step-dot--det" />
          <span className="dh-pipeline__step-text">RISK ASSESSMENT</span>
        </div>
        <ArrowRight size={12} className="dh-pipeline__step-arrow" aria-hidden="true" />
        <div className="dh-pipeline__step dh-pipeline__step--active">
          <span className="dh-pipeline__step-dot" />
          <span className="dh-pipeline__step-text">DECISION SUPPORT</span>
        </div>
      </div>

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
            <span className="dh-pipeline__legend-dot dh-pipeline__legend-dot--planned" /> Unassessed / Future
          </span>
        </div>
      </div>

      {/* Connected Horizontal Flow */}
      <div className="dh-pipeline__flow">
        {stages.map((stage, idx) => {
          return (
            <React.Fragment key={stage.id}>
              <div
                className={clsx('dh-pipeline__card', {
                  'dh-pipeline__card--active': stage.statusType === 'active',
                  'dh-pipeline__card--det': stage.statusType === 'deterministic',
                  'dh-pipeline__card--planned': stage.statusType === 'planned',
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
                      'dh-pipeline__status-tag--planned': stage.statusType === 'planned',
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

      {/* Model Attribution Bar Strip */}
      <div className="dh-pipeline__attribution-strip">
        <div className="dh-pipeline__attribution-head">
          <div>
            <h4 className="dh-pipeline__attribution-title">Current Model Contribution Baseline</h4>
            <span className="dh-pipeline__attribution-subtitle">
              {isNormalized
                ? `Dynamic Normalization Active (${activeCount}/5 Active Factors)`
                : '5-Factor Authoritative Multi-Criteria Synthesis (30/25/20/15/10)'}
            </span>
          </div>
          {isNormalized && (
            <span className="dh-pipeline__attribution-badge">
              Dynamic Normalization Applied
            </span>
          )}
        </div>

        <div className="dh-pipeline__weights-grid">
          {AUTHORITATIVE_BASE_FACTORS.map((bf) => {
            const actualFactor = riskAssessment?.factors?.find((f) => f.id === bf.id);
            const isUnavailable = actualFactor?.status === 'unavailable';
            const normalizedPercent =
              actualFactor && actualFactor.normalizedWeight !== undefined
                ? actualFactor.normalizedWeight * 100
                : bf.baseWeight;
            const barWidth = isUnavailable ? 0 : normalizedPercent;

            return (
              <div
                key={bf.id}
                className={clsx('dh-pipeline__weight-item', {
                  'dh-pipeline__weight-item--unavailable': isUnavailable,
                })}
              >
                <div className="dh-pipeline__weight-top">
                  <span title={bf.description}>{bf.name}</span>
                  <strong>
                    {isUnavailable ? (
                      <span className="dh-pipeline__weight-unavail">Unavailable (0%)</span>
                    ) : isNormalized && actualFactor ? (
                      <span>
                        {normalizedPercent.toFixed(1)}%{' '}
                        <small style={{ opacity: 0.7, fontWeight: 400 }}>
                          ({bf.baseWeight}% base)
                        </small>
                      </span>
                    ) : (
                      `${bf.baseWeight}% base`
                    )}
                  </strong>
                </div>
                <div className="dh-pipeline__weight-bar-bg">
                  <div
                    className="dh-pipeline__weight-bar"
                    style={{
                      width: `${Math.min(100, Math.max(0, barWidth))}%`,
                      background: isUnavailable ? 'var(--text-disabled)' : bf.colorVar,
                    }}
                  />
                </div>
                <span className="dh-pipeline__weight-desc">
                  {isUnavailable
                    ? 'Sensor offline — weight redistributed dynamically'
                    : actualFactor && actualFactor.weightedContribution !== null
                    ? `Contributing +${actualFactor.weightedContribution.toFixed(1)} pts`
                    : bf.description}
                </span>
              </div>
            );
          })}
        </div>

        {/* Future Factors Section */}
        <div className="dh-pipeline__future-section">
          <div className="dh-pipeline__future-heading">
            <Info size={11} aria-hidden="true" />
            <span>Unassessed / Future Phase Factors (0% Active Weight)</span>
          </div>
          <div className="dh-pipeline__future-grid">
            <div className="dh-pipeline__future-item">
              <div className="dh-pipeline__future-top">
                <span className="dh-pipeline__future-name">Historical Landslide Scars</span>
                <span className="dh-pipeline__future-badge">Unassessed / Future (0%)</span>
              </div>
              <span className="dh-pipeline__future-desc">
                NRSC/GSI spatial atlas inventory. Contextual map reference only; excluded from Phase 6B score.
              </span>
            </div>
            <div className="dh-pipeline__future-item">
              <div className="dh-pipeline__future-top">
                <span className="dh-pipeline__future-name">Road Cut-Slope Geometry</span>
                <span className="dh-pipeline__future-badge">Unassessed / Future (0%)</span>
              </div>
              <span className="dh-pipeline__future-desc">
                OSM highway cutting geometries. Structural slope stability deferred to future backend phase.
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
