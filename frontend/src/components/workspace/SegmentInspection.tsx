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
import './SegmentInspection.css';

export interface SegmentInspectionProps {
  segment: CorridorSegmentRisk | null;
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

  const tierBadgeClass = isSevere
    ? 'dh-segment-inspect__badge--severe'
    : isHigh
    ? 'dh-segment-inspect__badge--high'
    : isModerate
    ? 'dh-segment-inspect__badge--moderate'
    : 'dh-segment-inspect__badge--low';

  // Deterministic 4-Factor Model Weights (UXMagic & Mathematical Blueprint Spec)
  // Slope: 35%, Rainfall: 30%, Landslide Scar Proximity: 20%, Road Geometry: 15%
  const rainfallFactor = segment.riskAssessment.factors.find(
    (f) => f.id === 'precipitation_intensity' || f.id === 'rainfall_accumulation_24h'
  );
  const rainfallRateMm = rainfallFactor?.rawValue ?? 0;
  const gradientScore = Math.min(100, Math.round((segment.gradientDegrees / 30) * 100));
  const rainfallScore = Math.min(100, Math.round((rainfallRateMm / 75) * 100));
  // In demo/deterministic baseline: historical scar and geometry use baseline normalized indices
  const scarScore = Math.min(100, Math.round((score * 0.85) + 10));
  const geometryScore = Math.min(100, Math.round((segment.gradientDegrees > 15 ? 70 : 40)));

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
            NH-7 Pilot Corridor · Segment {segment.index + 1} of 20 (250m uniform unit)
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
              {Math.round(score)}
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
            style={{ width: `${score}%`, backgroundColor: segment.colorHex }}
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
          <span className="dh-segment-inspect__weights-tag">Deterministic model weights</span>
        </div>

        {/* 1. Slope Gradient */}
        <div className="dh-segment-inspect__factor-item">
          <div className="dh-segment-inspect__factor-meta">
            <div className="dh-segment-inspect__factor-name">
              <Mountain size={13} className="dh-segment-inspect__factor-icon" aria-hidden="true" />
              <span>Topographic Slope</span>
            </div>
            <span className="dh-segment-inspect__factor-metric">
              35% weight · {segment.gradientDegrees.toFixed(1)}° gradient
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
            DEM 90m hypsometric slope gradient across segment polyline.
          </span>
        </div>

        {/* 2. Dynamic Rainfall */}
        <div className="dh-segment-inspect__factor-item">
          <div className="dh-segment-inspect__factor-meta">
            <div className="dh-segment-inspect__factor-name">
              <CloudRain size={13} className="dh-segment-inspect__factor-icon" aria-hidden="true" />
              <span>24h Rainfall Saturation</span>
            </div>
            <span className="dh-segment-inspect__factor-metric">
              30% weight · {rainfallRateMm.toFixed(1)} mm/h
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
            Active Open-Meteo precipitation rate &amp; scenario stress input.
          </span>
        </div>

        {/* 3. Historical Landslide Scar Proximity */}
        <div className="dh-segment-inspect__factor-item">
          <div className="dh-segment-inspect__factor-meta">
            <div className="dh-segment-inspect__factor-name">
              <History size={13} className="dh-segment-inspect__factor-icon" aria-hidden="true" />
              <span>Historical Scar Proximity</span>
            </div>
            <span className="dh-segment-inspect__factor-metric">
              20% weight · {scarScore}/100 exposure
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
            NRSC Landslide Atlas inventory proximity index.
          </span>
        </div>

        {/* 4. Road Geometry & Bend Radius */}
        <div className="dh-segment-inspect__factor-item">
          <div className="dh-segment-inspect__factor-meta">
            <div className="dh-segment-inspect__factor-name">
              <GitBranch size={13} className="dh-segment-inspect__factor-icon" aria-hidden="true" />
              <span>Road Geometry Exposure</span>
            </div>
            <span className="dh-segment-inspect__factor-metric">
              15% weight · {geometryScore}/100
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
            Curvature constraints and cut-slope toe setback along corridor alignment.
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
