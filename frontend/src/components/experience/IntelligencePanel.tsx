import type { RouteSegment } from "../../types/route";
import { formatTelemetryValue } from "../../services/environmental/telemetry";
import { getRiskColor, getRiskLabel, getRiskState } from "../../services/risk/riskEngine";

interface IntelligencePanelProps {
  segment: RouteSegment | null;
  onClose: () => void;
}

function FactorRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="factor-row">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

export function IntelligencePanel({ segment, onClose }: IntelligencePanelProps) {
  if (!segment) return null;
  const telemetry = segment.telemetry;
  const riskColor = getRiskColor(segment.risk);
  const isAssessed = segment.risk !== null;

  return (
    <aside className="intelligence-panel" aria-label={`Intelligence panel for ${segment.label}`}>
      <div className="panel-topline">
        <span className="eyebrow">NH-7 / SEGMENT {String(segment.index).padStart(2, "0")}</span>
        <button className="close-button" type="button" onClick={onClose} aria-label="Close intelligence panel">
          CLOSE <span aria-hidden="true">×</span>
        </button>
      </div>
      <div className="panel-heading">
        <p className="panel-kicker">SELECTED SPAN</p>
        <h2>{segment.from}</h2>
        <div className="panel-arrow">→</div>
        <h2>{segment.to}</h2>
      </div>

      <section className="panel-section panel-section--status">
        <span className="eyebrow">STATUS</span>
        <div className="risk-status">
          <span className="status-dot" style={{ backgroundColor: riskColor }} />
          <strong>{getRiskLabel(segment.risk)}</strong>
        </div>
        <p className="muted-copy">
          Risk classification is {getRiskState(segment.risk).toLowerCase()}; no deterministic landslide prediction is made.
        </p>
      </section>

      <section className="panel-section">
        <div className="section-heading">
          <span className="eyebrow">ENVIRONMENT</span>
          <span className="data-state">{telemetry.state}</span>
        </div>
        <div className="telemetry-grid">
          <div>
            <span>PRECIPITATION</span>
            <strong>{formatTelemetryValue(telemetry.precipitationMm24h, " mm / 24h")}</strong>
          </div>
          <div>
            <span>PROBABILITY</span>
            <strong>{formatTelemetryValue(telemetry.probabilityPercent, "%")}</strong>
          </div>
          <div>
            <span>ELEVATION</span>
            <strong>{segment.elevationMeters != null ? `${Math.round(segment.elevationMeters)} m` : formatTelemetryValue(telemetry.elevationMeters, " m")}</strong>
          </div>
          <div>
            <span>SLOPE GRADIENT</span>
            <strong>{segment.slopeDegrees != null ? `${segment.slopeDegrees.toFixed(1)}°` : "DATA UNAVAILABLE"}</strong>
          </div>
        </div>
      </section>

      <section className="panel-section">
        <div className="section-heading">
          <span className="eyebrow">RISK FACTORS</span>
          <span className="data-state">{segment.risk?.source ?? "SOURCE-GATED"}</span>
        </div>
        <div className="factor-list">
          <FactorRow
            label="PRECIPITATION (P24)"
            value={telemetry.precipitationMm24h === null ? "UNASSESSED" : `${telemetry.precipitationMm24h} mm`}
          />
          <FactorRow
            label="TERRAIN GRADIENT"
            value={segment.slopeDegrees != null ? `${segment.slopeDegrees.toFixed(1)}° (Copernicus DEM)` : segment.terrainState}
          />
          <FactorRow
            label="ROAD ENGINEERING"
            value={segment.isCutSlope ? "ENGINEERED CUT-SLOPE" : "NATURAL PROFILE"}
          />
          <FactorRow
            label="GSI LANDSLIDE PROXIMITY"
            value={segment.distanceToHistoricScarM != null ? `${Math.round(segment.distanceToHistoricScarM)} m` : (isAssessed ? "ACTIVE CATALOG" : "UNASSESSED")}
          />
        </div>
      </section>

      <section className="panel-section panel-section--support">
        <span className="eyebrow">DECISION SUPPORT</span>
        {segment.geotechnicalAdvisory ? (
          <>
            <p>{segment.geotechnicalAdvisory}</p>
            <p className="muted-copy">
              Authoritative multi-criteria decision support (MCDA). Monitor real-time geotechnical and meteorological alerts before transit.
            </p>
          </>
        ) : isAssessed ? (
          <>
            <p>Calculated terrain gradient and hydro-meteorological saturation are assessed for this corridor span.</p>
            <p className="muted-copy">
              Monitor real-time weather and terrain advisories before transit. Uncertainty-aware decision support only.
            </p>
          </>
        ) : (
          <>
            <p>Environmental and terrain telemetry is not connected for this corridor span.</p>
            <p className="muted-copy">
              Monitor rainfall and terrain conditions before travel when live sources become available.
            </p>
          </>
        )}
      </section>

      <div className="panel-footer">
        <span className="status-dot" style={{ backgroundColor: riskColor }} />
        <span>
          {segment.risk ? `RISK SOURCE / ${segment.risk.source}` : "TRANSPARENCY STATE / DATA UNAVAILABLE"}
        </span>
      </div>
    </aside>
  );
}
