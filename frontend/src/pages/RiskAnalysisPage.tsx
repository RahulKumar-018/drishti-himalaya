import React, { useState } from 'react';
import clsx from 'clsx';
import {
  Activity,
  Sliders,
  RefreshCw,
  Info,
} from 'lucide-react';
import { Card } from '../components/common/Card';
import { Badge } from '../components/common/Badge';
import { Button } from '../components/common/Button';
import { RiskFactorCard } from '../components/risk/RiskFactorCard';
import { RiskFormulaViewer } from '../components/risk/RiskFormulaViewer';
import { RiskIntelligencePipeline } from '../components/risk/RiskIntelligencePipeline';
import { RiskAssessment } from '../services/risk/types';
import { EnvironmentalData } from '../services/environmental/types';
import { evaluateRainfallScenario } from '../services/risk/scenarioService';
import './RiskAnalysisPage.css';

export interface RiskAnalysisPageProps {
  riskAssessment?: RiskAssessment | null;
  envData?: EnvironmentalData | null;
  scenarioPrecipitation?: number | null;
  onScenarioChange?: (val: number | null) => void;
  className?: string;
}

export const RiskAnalysisPage: React.FC<RiskAnalysisPageProps> = ({
  riskAssessment: propRiskAssessment,
  envData,
  scenarioPrecipitation: propScenarioPrecipitation,
  onScenarioChange,
  className,
}) => {
  const [localScenarioPrecip, setLocalScenarioPrecip] = useState<number | null>(null);

  const livePrecip = envData?.rainfall?.precipitation ?? 0.0;
  const isControlled = propScenarioPrecipitation !== undefined;
  const scenarioPrecip = isControlled ? propScenarioPrecipitation : localScenarioPrecip;
  const isSimActive = scenarioPrecip !== null && scenarioPrecip !== undefined;
  const activePrecip = isSimActive ? scenarioPrecip : livePrecip;

  const handleScenarioChange = (val: number) => {
    if (onScenarioChange) {
      onScenarioChange(val);
    } else {
      setLocalScenarioPrecip(val);
    }
  };

  const handleReset = () => {
    if (onScenarioChange) {
      onScenarioChange(null);
    } else {
      setLocalScenarioPrecip(null);
    }
  };

  const evaluatedScenarioRisk = React.useMemo(() => {
    return evaluateRainfallScenario(envData ?? null, activePrecip);
  }, [envData, activePrecip]);

  const activeAssessment = isSimActive
    ? evaluatedScenarioRisk
    : propRiskAssessment ?? evaluatedScenarioRisk;

  const liveScore = propRiskAssessment?.score ?? 24.8;
  const currentScore = activeAssessment.score ?? 24.8;
  const scoreDelta = Math.round((currentScore - liveScore) * 10) / 10;

  return (
    <div className={clsx('dh-analysis-page', className)}>
      {/* ─── 1. TOP HEADER ────────────────────────────────────────────────── */}
      <div className="dh-analysis-page__header">
        <div className="dh-analysis-page__header-title-lockup">
          <div className="dh-analysis-page__header-tag">
            <Activity size={14} />
            <span>GEOTECHNICAL &amp; METEOROLOGICAL FACTOR ATTRIBUTION</span>
          </div>
          <h1 className="dh-analysis-page__title">RISK ANALYSIS ENGINE</h1>
          <p className="dh-analysis-page__subtitle">
            Judicial-grade deterministic multi-criteria decision index (MCDA) evaluating real-time slope gradient, rainfall intensity, and accumulation.
          </p>
        </div>

        {/* Big Score Display */}
        <div className="dh-analysis-page__hero-score-box">
          <span className="dh-analysis-page__hero-score-label">
            {isSimActive ? 'SIMULATED CORRIDOR SCORE' : 'LIVE CORRIDOR SCORE'}
          </span>
          <div className="dh-analysis-page__hero-score-val-row">
            <span
              className="dh-analysis-page__hero-score-num"
              style={{ color: activeAssessment.colorHex }}
            >
              {currentScore.toFixed(1)}
            </span>
            <span className="dh-analysis-page__hero-score-denom">/ 100</span>
          </div>
          <Badge
            variant={
              activeAssessment.level === 'LOW'
                ? 'low'
                : activeAssessment.level === 'MODERATE'
                ? 'moderate'
                : activeAssessment.level === 'HIGH'
                ? 'high'
                : 'severe'
            }
            size="sm"
            showDot
          >
            {activeAssessment.level} EXPOSURE
          </Badge>
          {isSimActive && scoreDelta !== 0 && (
            <span
              className={clsx('dh-analysis-page__score-delta', {
                'dh-analysis-page__score-delta--up': scoreDelta > 0,
                'dh-analysis-page__score-delta--down': scoreDelta < 0,
              })}
            >
              {scoreDelta > 0 ? `+${scoreDelta.toFixed(1)} pts` : `${scoreDelta.toFixed(1)} pts`} vs Live
            </span>
          )}
        </div>
      </div>

      {/* ─── 2. WHAT-IF SCENARIO STRESS TEST CARD ────────────────────────── */}
      <Card
        variant="elevated"
        title="Interactive What-If Precipitation Simulator"
        subtitle="Simulate hypothetical cloudburst spikes and observe reactive hazard score shifts in real time"
        headerAction={
          <Badge variant="accent" size="sm">
            DETERMINISTIC SIMULATION
          </Badge>
        }
        className="dh-analysis-page__scenario-card"
      >
        <div className="dh-analysis-page__scenario-body">
          <div className="dh-analysis-page__slider-row">
            <div className="dh-analysis-page__slider-info">
              <label htmlFor="risk-page-slider" className="dh-analysis-page__slider-label">
                <Sliders size={13} />
                <span>Simulated Hourly Precipitation Intensity:</span>
              </label>
              <span className="dh-analysis-page__slider-value">
                {activePrecip.toFixed(1)} mm/h
              </span>
            </div>

            <input
              id="risk-page-slider"
              type="range"
              min={0}
              max={100}
              step={1}
              value={activePrecip}
              onChange={(e) => handleScenarioChange(parseFloat(e.target.value))}
              className="dh-analysis-page__range-slider"
              aria-label="Simulated rainfall intensity slider"
            />

            <div className="dh-analysis-page__slider-markers">
              <span>0 mm/h (Dry Baseline)</span>
              <span>15 mm/h (Moderate Rain)</span>
              <span>25 mm/h (Critical Runoff Threshold)</span>
              <span>50 mm/h (Heavy Cloudburst)</span>
              <span>100 mm/h (Catastrophic)</span>
            </div>
          </div>

          {/* Quick Preset Buttons */}
          <div className="dh-analysis-page__presets-row">
            <span className="dh-analysis-page__presets-label">Quick Presets:</span>
            {[
              { label: 'Live Observed', val: livePrecip },
              { label: '0 mm/h (Dry)', val: 0 },
              { label: '15 mm/h (Drizzle)', val: 15 },
              { label: '25 mm/h (Threshold)', val: 25 },
              { label: '50 mm/h (Severe)', val: 50 },
              { label: '80 mm/h (Cloudburst)', val: 80 },
            ].map((p) => (
              <button
                key={p.label}
                type="button"
                className={clsx('dh-analysis-page__preset-btn', {
                  'dh-analysis-page__preset-btn--active': Math.abs(activePrecip - p.val) < 0.1,
                })}
                onClick={() => handleScenarioChange(p.val)}
              >
                {p.label}
              </button>
            ))}

            {isSimActive && (
              <Button
                variant="secondary"
                size="sm"
                onClick={handleReset}
                leadingIcon={<RefreshCw size={11} />}
                className="dh-analysis-page__reset-btn"
              >
                Reset to Live
              </Button>
            )}
          </div>

          <div className="dh-analysis-page__scenario-disclaimer">
            <Info size={14} className="dh-analysis-page__scenario-disclaimer-icon" />
            <span>
              <strong>Methodology Notice:</strong> The current scenario engine is deterministic and intended for demonstration until connected to validated backend data.
            </span>
          </div>
        </div>
      </Card>

      {/* ─── 3. INDIVIDUAL FACTOR ATTRIBUTION GRID ───────────────────────── */}
      <section className="dh-analysis-page__factors-section">
        <div className="dh-analysis-page__factors-header">
          <h2 className="dh-analysis-page__factors-title">
            Factor Attribution Spectrum ({activeAssessment.factors.length} Monitored Factors)
          </h2>
          <span className="dh-analysis-page__factors-subtitle">
            Dynamic weight normalization ensures ∑ wᵢ* = 1.00 strictly across active signals
          </span>
        </div>

        <div className="dh-analysis-page__factors-grid">
          {activeAssessment.factors.map((factor) => (
            <RiskFactorCard key={factor.id} factor={factor} />
          ))}
        </div>
      </section>

      {/* ─── 4. CONCEPTUAL INTELLIGENCE PIPELINE ──────────────────────────── */}
      <RiskIntelligencePipeline
        className="dh-analysis-page__pipeline"
        riskAssessment={activeAssessment}
      />

      {/* ─── 5. MATHEMATICAL FORMULATION & ML INTEGRATION CONTRACT ───────── */}
      <RiskFormulaViewer />
    </div>
  );
};
