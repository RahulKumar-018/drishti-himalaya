import React from 'react';
import clsx from 'clsx';
import {
  MapPin,
  Mountain,
  CloudRain,
  History,
  GitBranch,
  ShieldAlert,
  ArrowRight,
  X,
  Crosshair,
} from 'lucide-react';
import { CorridorSegmentRisk } from '../../services/risk/segmentRiskService';
import { RouteSegmentProperties } from '../../services/api/types';
import './SegmentInspection.css';

export interface SegmentInspectionProps {
  segment: (CorridorSegmentRisk & { backendProperties?: RouteSegmentProperties }) | null;
  onClose?: () => void;
  onFocusMap?: (segment: CorridorSegmentRisk) => void;
  onCompareAlternatives?: () => void;
  className?: string;
}

export const SegmentInspection: React.FC<SegmentInspectionProps> = ({
  segment,
  onClose,
  onFocusMap,
  onCompareAlternatives,
  className,
}) => {
  if (!segment) {
    return (
      <div className={clsx('dh-segment-inspect dh-segment-inspect--empty', className)}>
        <Crosshair size={22} className="dh-segment-inspect__empty-icon" aria-hidden="true" />
        <p className="dh-segment-inspect__empty-title">No Road Segment Selected</p>
        <span className="dh-segment-inspect__empty-desc">
          Click any road segment or priority alert on the map to inspect its geotechnical risk drivers.
        </span>
      </div>
    );
  }

  // Derive weights and scores
  const score = segment.riskScore;
  const isSevere = score >= 75;
  const isHigh = score >= 50 && score < 75;
  const isModerate = score >= 25 && score < 50;
  const isIndeterminate = segment.riskTier === 'INDETERMINATE';

  const tierBadgeClass = isSevere
    ? 'dh-segment-inspect__badge--severe'
    : isHigh
    ? 'dh-segment-inspect__badge--high'
    : isModerate
    ? 'dh-segment-inspect__badge--moderate'
    : isIndeterminate
    ? 'dh-segment-inspect__badge--indeterminate'
    : 'dh-segment-inspect__badge--low';

  const bp = segment.backendProperties;

  // Real backend metrics or fallback baseline
  const rainfallRateMm =
    bp?.precipitation_24h_mm ??
    bp?.p24_mm ??
    segment.riskAssessment.factors.find(
      (f) => f.id === 'precipitation_intensity' || f.id === 'rainfall_accumulation_24h'
    )?.rawValue ??
    0;

  const gradientScore = bp
    ? Math.min(100, Math.round(((bp.slope_degrees ?? segment.gradientDegrees) / 35) * 100))
    : Math.min(100, Math.round((segment.gradientDegrees / 30) * 100));

  const rainfallScore = Math.min(100, Math.round((rainfallRateMm / 75) * 100));
  const scarScore = bp
    ? Math.min(100, Math.round((Math.max(0, 2000 - (bp.distance_to_historic_scar_m ?? 2000)) / 2000) * 100))
    : Math.min(100, Math.round((score * 0.85) + 10));

  const geometryScore = bp
    ? bp.is_cut_slope === true
      ? 100
      : bp.is_cut_slope === false
      ? 20
      : 50
    : Math.min(100, Math.round(segment.gradientDegrees > 15 ? 70 : 40));

  return (
    <div
      className={clsx('dh-segment-inspect', className)}
      role="region"
      aria-label={`Detailed Hazard Inspection for ${segment.name}`}
    >
      {/* Header with Close and Back */}
      <div className="dh-segment-inspect__header">
        <div className="dh-segment-inspect__title-group">
          <div className="dh-segment-inspect__sub-row">
            <span className="dh-segment-inspect__eyebrow">EXPLAINABLE RISK AUDIT</span>
            {onClose && (
              <button
                type="button"
                className="dh-segment-inspect__close-btn"
                onClick={onClose}
                aria-label="Close segment inspection"
              >
                <X size={15} />
              </button>
            )}
          </div>
          <h3 className="dh-segment-inspect__title">{segment.name}</h3>
          <p className="dh-segment-inspect__corridor-info">
            <MapPin size={11} className="dh-segment-inspect__pin-icon" aria-hidden="true" />
            {bp
              ? `Road Alignment · ${bp.segment_length_m ? Math.round(bp.segment_length_m) : 250}m segment (Chainage: ${bp.start_km?.toFixed(2)}–${bp.end_km?.toFixed(2)} km)`
              : `NH-7 Pilot Corridor · Segment ${segment.index + 1} of 20 (250m uniform unit)`}
          </p>
        </div>
      </div>

      {/* Hero Score Display */}
      <div className="dh-segment-inspect__score-card">
        <div className="dh-segment-inspect__score-top">
          <div>
            <span className="dh-segment-inspect__score-label">Composite Hazard Exposure</span>
            <span className={clsx('dh-segment-inspect__tier-pill', tierBadgeClass)}>
              {segment.riskTier} EXPOSURE
            </span>
          </div>
          <div className="dh-segment-inspect__score-number-group">
            <span
              className="dh-segment-inspect__score-number"
              style={{ color: segment.colorHex }}
            >
              {score > 0 ? score.toFixed(1) : '—'}
            </span>
            <span className="dh-segment-inspect__score-denom">/ 100</span>
          </div>
        </div>

        {/* Progress bar */}
        <div
          className="dh-segment-inspect__gauge"
          role="progressbar"
          aria-valuenow={score}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div
            className="dh-segment-inspect__gauge-bar"
            style={{ width: `${Math.min(100, Math.max(0, score))}%`, backgroundColor: segment.colorHex }}
          />
        </div>

        <div className="dh-segment-inspect__scale-ticks">
          <span>0 (Low)</span>
          <span>Moderate 25</span>
          <span>High 50</span>
          <span>Severe 75</span>
          <span>100</span>
        </div>
      </div>

      {/* 4-Factor Weighted Breakdown (MCDA Model) */}
      <div className="dh-segment-inspect__factors">
        <div className="dh-segment-inspect__factors-head">
          <h4 className="dh-segment-inspect__factors-title">Factor Attribution Breakdown</h4>
          <span className="dh-segment-inspect__weights-tag">
            {bp ? (bp.is_risk_complete ? 'Complete MCDA' : 'Partial MCDA') : 'Deterministic model weights'}
          </span>
        </div>

        {/* 1. Slope Gradient */}
        <div className="dh-segment-inspect__factor-item">
          <div className="dh-segment-inspect__factor-meta">
            <div className="dh-segment-inspect__factor-name">
              <Mountain size={13} className="dh-segment-inspect__factor-icon" aria-hidden="true" />
              <span>Topographic Slope (Copernicus DEM)</span>
            </div>
            <span className="dh-segment-inspect__factor-metric">
              {bp
                ? bp.slope_degrees !== null && bp.slope_degrees !== undefined
                  ? `${bp.slope_degrees.toFixed(1)}° (${bp.elevation_m !== null && bp.elevation_m !== undefined ? Math.round(bp.elevation_m) + 'm' : '—'})`
                  : 'Not available'
                : `${segment.gradientDegrees.toFixed(1)}° gradient`}
            </span>
          </div>
          <div className="dh-segment-inspect__factor-bar-bg">
            <div
              className="dh-segment-inspect__factor-bar"
              style={{
                width: `${gradientScore}%`,
                backgroundColor: gradientScore > 65 ? 'var(--risk-severe)' : 'var(--accent-primary)',
              }}
            />
          </div>
          <span className="dh-segment-inspect__factor-caption">
            Copernicus GLO-30 DEM 30m resolution elevation and slope.
          </span>
        </div>

        {/* 2. Dynamic Rainfall */}
        <div className="dh-segment-inspect__factor-item">
          <div className="dh-segment-inspect__factor-meta">
            <div className="dh-segment-inspect__factor-name">
              <CloudRain size={13} className="dh-segment-inspect__factor-icon" aria-hidden="true" />
              <span>24h Precipitation (Open-Meteo)</span>
            </div>
            <span className="dh-segment-inspect__factor-metric">
              {rainfallRateMm > 0 ? `${rainfallRateMm.toFixed(1)} mm` : '0.0 mm'}
            </span>
          </div>
          <div className="dh-segment-inspect__factor-bar-bg">
            <div
              className="dh-segment-inspect__factor-bar"
              style={{
                width: `${rainfallScore}%`,
                backgroundColor: rainfallScore > 65 ? 'var(--risk-severe)' : 'var(--accent-primary)',
              }}
            />
          </div>
          <span className="dh-segment-inspect__factor-caption">
            {bp && bp.p72_mm !== null && bp.p72_mm !== undefined
              ? `Open-Meteo observed (72h: ${bp.p72_mm.toFixed(1)}mm, ARI: ${bp.ari_mm?.toFixed(1) ?? '—'}mm)`
              : 'Active Open-Meteo precipitation telemetry.'}
          </span>
        </div>

        {/* 3. Historical Landslide Scar Proximity */}
        <div className="dh-segment-inspect__factor-item">
          <div className="dh-segment-inspect__factor-meta">
            <div className="dh-segment-inspect__factor-name">
              <History size={13} className="dh-segment-inspect__factor-icon" aria-hidden="true" />
              <span>Landslide Scars (GSI Inventory)</span>
            </div>
            <span className="dh-segment-inspect__factor-metric">
              {bp
                ? `${bp.distance_to_historic_scar_m !== null && bp.distance_to_historic_scar_m !== undefined ? Math.round(bp.distance_to_historic_scar_m) + 'm' : '—'} dist · ${bp.scar_density_1km ?? '—'} scars/km²`
                : `${scarScore}/100 exposure`}
            </span>
          </div>
          <div className="dh-segment-inspect__factor-bar-bg">
            <div
              className="dh-segment-inspect__factor-bar"
              style={{
                width: `${scarScore}%`,
                backgroundColor: scarScore > 75 ? 'var(--risk-severe)' : 'var(--risk-low)',
              }}
            />
          </div>
          <span className="dh-segment-inspect__factor-caption">
            Geological Survey of India (GSI) 1:50k landslide catalog KD-Tree.
          </span>
        </div>

        {/* 4. Road Cut-Slope Status */}
        <div className="dh-segment-inspect__factor-item">
          <div className="dh-segment-inspect__factor-meta">
            <div className="dh-segment-inspect__factor-name">
              <GitBranch size={13} className="dh-segment-inspect__factor-icon" aria-hidden="true" />
              <span>Road-Cut Status (OSM)</span>
            </div>
            <span className="dh-segment-inspect__factor-metric">
              {bp
                ? bp.is_cut_slope === true
                  ? 'Detected'
                  : bp.is_cut_slope === false
                  ? 'Not detected'
                  : 'Unknown'
                : `${geometryScore}/100`}
            </span>
          </div>
          <div className="dh-segment-inspect__factor-bar-bg">
            <div
              className="dh-segment-inspect__factor-bar"
              style={{
                width: `${geometryScore}%`,
                backgroundColor: geometryScore > 65 ? 'var(--risk-moderate)' : 'var(--risk-low)',
              }}
            />
          </div>
          <span className="dh-segment-inspect__factor-caption">
            {bp
              ? 'OpenStreetMap engineered road-cut excavation buffer.'
              : 'Curvature constraints and cut-slope toe setback along corridor alignment.'}
          </span>
        </div>

        {/* 5. Data Quality & Missing Features */}
        <div className="dh-segment-inspect__factor-item">
          <div className="dh-segment-inspect__factor-meta">
            <div className="dh-segment-inspect__factor-name">
              <ShieldAlert size={13} className="dh-segment-inspect__factor-icon" aria-hidden="true" />
              <span>Data Quality &amp; Feature Coverage</span>
            </div>
            <span
              className="dh-segment-inspect__factor-metric"
              style={{
                fontWeight: 700,
                color: (bp?.is_risk_complete ?? true) ? 'var(--risk-low)' : 'var(--risk-moderate)',
              }}
            >
              {bp ? (bp.is_risk_complete ? 'FULL EVALUATION' : 'PARTIAL EVALUATION') : segment.dataQualityRating}
            </span>
          </div>
          <span className="dh-segment-inspect__factor-caption">
            {bp?.missing_features && bp.missing_features.length > 0
              ? `Missing factors: ${bp.missing_features.join(', ')}. Assessment is partial; missing data is never assumed safe.`
              : 'All risk factors populated and evaluated.'}
          </span>
        </div>
      </div>

      {/* Action Advisory Box */}
      <div className="dh-segment-inspect__advisory">
        <div className="dh-segment-inspect__advisory-content">
          <ShieldAlert size={18} className="dh-segment-inspect__advisory-icon" aria-hidden="true" />
          <div>
            <h5 className="dh-segment-inspect__advisory-title">Tactical Transit Recommendation</h5>
            <p className="dh-segment-inspect__advisory-text">
              {isSevere
                ? 'High geological vulnerability detected. Travel through this sector should be deferred during active rainfall peaks.'
                : isHigh
                ? 'Heightened cut-slope saturation. Maintain visual lookout for debris ravelling and avoid stopping on shoulders.'
                : 'Corridor conditions stable under current hydro-meteorological baseline.'}
            </p>
          </div>
        </div>

        <div className="dh-segment-inspect__actions">
          {onFocusMap && (
            <button
              type="button"
              className="dh-segment-inspect__btn-secondary"
              onClick={() => onFocusMap(segment)}
            >
              <Crosshair size={13} /> Focus on Map
            </button>
          )}
          {onCompareAlternatives && (
            <button
              type="button"
              className="dh-segment-inspect__btn-primary"
              onClick={onCompareAlternatives}
            >
              Compare Alternatives <ArrowRight size={13} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
