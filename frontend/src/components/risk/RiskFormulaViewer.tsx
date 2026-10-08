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
                <span className="dh-formula-viewer__step-badge">ACTIVE PRODUCTION ENGINE</span>
                <span className="dh-formula-viewer__step-title">FastAPI Authoritative MCDA Engine</span>
              </div>
              <p className="dh-formula-viewer__step-desc">
                Authoritative backend Risk Engine (<code>/api/v1/risk/predict</code>) evaluating Copernicus DEM 90m terrain gradients (35%), Open-Meteo precipitation (30%), GSI landslide proximity (20%), scar cluster density (10%), and road cut-slopes (5%).
              </p>
              <div className="dh-formula-viewer__step-status">
                <ShieldCheck size={13} />
                <span>FastAPI + SQLite/PostGIS + 448 Backend Tests</span>
              </div>
            </div>

            <div className="dh-formula-viewer__pipeline-arrow" aria-hidden="true">→</div>

            <div className="dh-formula-viewer__pipeline-step dh-formula-viewer__pipeline-step--upcoming">
              <div className="dh-formula-viewer__step-header">
                <span className="dh-formula-viewer__step-badge dh-formula-viewer__step-badge--ml">
                  SPATIAL GIS REPOSITORY
                </span>
                <span className="dh-formula-viewer__step-title">GSI 5,206 Landslide Catalog</span>
              </div>
              <p className="dh-formula-viewer__step-desc">
                KD-tree spatial indexing over 5,206 Geological Survey of India historical landslide polygons and 2018 OSM highway excavation alignments across Uttarakhand.
              </p>
              <div className="dh-formula-viewer__step-status">
                <Cpu size={13} />
                <span>Sub-Millisecond Nearest-Neighbor Spatial Queries</span>
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
