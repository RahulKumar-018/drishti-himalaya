import React from 'react';
import clsx from 'clsx';
import { Calculator, Cpu, ShieldCheck, Code } from 'lucide-react';
import { Card } from '../common/Card';
import './RiskFormulaViewer.css';

export interface RiskFormulaViewerProps {
  className?: string;
}

export const RiskFormulaViewer: React.FC<RiskFormulaViewerProps> = ({ className }) => {
  return (
    <div className={clsx('dh-formula-viewer', className)}>
      <Card
        variant="elevated"
        title="Multi-Criteria Hazard Evaluation Model"
        subtitle="Mathematical formulation & ML transition architecture"
        className="dh-formula-viewer__card"
      >
        <div className="dh-formula-viewer__content">
          {/* Active Formula Box */}
          <div className="dh-formula-viewer__equation-box">
            <div className="dh-formula-viewer__eq-header">
              <Calculator size={14} className="dh-formula-viewer__eq-icon" />
              <span>DETERMINISTIC COMPOSITE HAZARD INDEX (MCDA)</span>
            </div>
            <div className="dh-formula-viewer__formula">
              <code>
                Composite Hazard Score R = ∑ ( wᵢ* · Sᵢ ) &nbsp;for all active factors i ∈ A
              </code>
            </div>
            <div className="dh-formula-viewer__sub-formula">
              <code>
                Normalized Weight wᵢ* = wᵢ / ( ∑ (w_k for k ∈ A) ) &nbsp;ensuring ∑ wᵢ* strictly = 1.00
              </code>
            </div>
            <p className="dh-formula-viewer__note">
              Where <code>Sᵢ ∈ [0.0, 100.0]</code> is the calibrated piecewise linear sub-score evaluated against empirical Himalayan geotechnical failure thresholds (e.g. 25 mm/h hourly rainfall intensity, 75 mm 24h accumulation, and Copernicus DEM 90m slope gradients).
            </p>
          </div>

          {/* Architecture Transition Pipeline */}
          <div className="dh-formula-viewer__pipeline">
            <div className="dh-formula-viewer__pipeline-step dh-formula-viewer__pipeline-step--active">
              <div className="dh-formula-viewer__step-header">
                <span className="dh-formula-viewer__step-badge">CURRENT STAGE (PHASE 1–6)</span>
                <span className="dh-formula-viewer__step-title">Deterministic Baseline Engine</span>
              </div>
              <p className="dh-formula-viewer__step-desc">
                High-assurance, 100% deterministic, zero network flakiness. Evaluates Open-Meteo precipitation, 24h accumulation, probability, and Copernicus DEM 90m terrain gradients directly on the client.
              </p>
              <div className="dh-formula-viewer__step-status">
                <ShieldCheck size={13} />
                <span>115 Automated Test Suites Passing</span>
              </div>
            </div>

            <div className="dh-formula-viewer__pipeline-arrow" aria-hidden="true">→</div>

            <div className="dh-formula-viewer__pipeline-step dh-formula-viewer__pipeline-step--upcoming">
              <div className="dh-formula-viewer__step-header">
                <span className="dh-formula-viewer__step-badge dh-formula-viewer__step-badge--ml">
                  BACKEND PHASE
                </span>
                <span className="dh-formula-viewer__step-title">ML Spatial Hazard Inference</span>
              </div>
              <p className="dh-formula-viewer__step-desc">
                FastAPI / PyTorch service computing XGBoost landslide susceptibility maps trained on GSI (Geological Survey of India) historical scar catalogs + cut-slope KD-tree spatial indices.
              </p>
              <div className="dh-formula-viewer__step-status">
                <Cpu size={13} />
                <span>IRiskEngine Interface Contract Ready</span>
              </div>
            </div>
          </div>

          {/* Backend API Integration Contract Preview */}
          <div className="dh-formula-viewer__api-preview">
            <div className="dh-formula-viewer__api-header">
              <Code size={13} />
              <span>Target REST API Contract: POST /api/v1/route/analyze</span>
            </div>
            <pre className="dh-formula-viewer__code-block">
{`// Seamless Drop-In Contract Specified in API_SPEC.md:
interface RouteAnalysisApiResponse {
  status: "success";
  query_id: string;
  data_mode: "LIVE" | "DEMO";
  corridor: "NH-7 (Rishikesh - Joshimath)";
  routes: Array<{
    route_id: string;
    composite_route_risk: number; // [0.0 - 100.0]
    max_bottleneck_risk: number;
    high_risk_segment_count: number;
    recommendation: "PROCEED_NORMAL" | "CAUTION_HIGH_RISK" | "DIVERT_ALTERNATIVE";
    geojson: GeoJSON.FeatureCollection;
  }>;
}`}
            </pre>
          </div>
        </div>
      </Card>
    </div>
  );
};
