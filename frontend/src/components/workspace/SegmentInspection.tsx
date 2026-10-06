import React from 'react';
import clsx from 'clsx';
import {
  MapPin,
  Mountain,
  CloudRain,
  ShieldAlert,
  ArrowRight,
  X,
  Crosshair,
  Activity,
  AlertCircle,
  Database,
  Layers,
  ShieldCheck,
} from 'lucide-react';
import { CorridorSegmentRisk } from '../../services/risk/segmentRiskService';
import { RiskFactor, RiskLevel } from '../../services/risk/types';
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
          Click any road segment or priority alert on the map to inspect its decision-support risk drivers.
        </span>
      </div>
    );
  }

  const assessment = segment.riskAssessment;
  const isIndeterminate = assessment.level === 'INDETERMINATE' || assessment.score === null;
  const score = segment.riskScore;

  const tierBadgeClass =
    segment.riskTier === 'SEVERE'
      ? 'dh-segment-inspect__badge--severe'
      : segment.riskTier === 'HIGH'
      ? 'dh-segment-inspect__badge--high'
      : segment.riskTier === 'MODERATE'
      ? 'dh-segment-inspect__badge--moderate'
      : segment.riskTier === 'LOW'
      ? 'dh-segment-inspect__badge--low'
      : 'dh-segment-inspect__badge--indeterminate';

  // Separate active/candidate factors from future unassessed factors
  const candidateFactors = assessment.factors.filter(
    (f) => f.status !== 'unassessed_future_phase'
  );
  const futureFactors = assessment.factors.filter(
    (f) => f.status === 'unassessed_future_phase'
  );

  const primaryFactor = assessment.primaryFactor;

  const getFactorIcon = (id: string) => {
    switch (id) {
      case 'precipitation_intensity':
      case 'rainfall_accumulation_24h':
      case 'precipitation_probability':
        return <CloudRain size={13} aria-hidden="true" />;
      case 'terrain_slope_gradient':
      case 'orographic_elevation':
        return <Mountain size={13} aria-hidden="true" />;
      case 'slope_instability':
        return <Layers size={13} aria-hidden="true" />;
      case 'scar_proximity':
        return <Database size={13} aria-hidden="true" />;
      default:
        return <Activity size={13} aria-hidden="true" />;
    }
  };

  const getDecisionGuidance = (tier: RiskLevel): { title: string; text: string } => {
    switch (tier) {
      case 'SEVERE':
        return {
          title: 'High Hazard Sector Advisory',
          text: 'Elevated hazard score under acute environmental stress. Review current rainfall conditions and official administrative travel advisories before proceeding through this sector.',
        };
      case 'HIGH':
        return {
          title: 'Heightened Vigilance Advisory',
          text: 'Higher-risk segment driven by heightened environmental telemetry readings. Exercise heightened vigilance and monitor local weather updates.',
        };
      case 'MODERATE':
        return {
          title: 'Routine Transit Advisory',
          text: 'Moderate decision-support assessment. Maintain standard transit vigilance under current environmental conditions.',
        };
      case 'LOW':
        return {
          title: 'Baseline Exposure Advisory',
          text: 'Low baseline hazard score under currently monitored hydro-meteorological telemetry. Use as a decision-support signal alongside official route advisories.',
        };
      case 'INDETERMINATE':
      default:
        return {
          title: 'Indeterminate Telemetry Advisory',
          text: 'Assessment is indeterminate because reliable active telemetry is insufficient to verify the current hazard state. Refer to local ground authorities.',
        };
    }
  };

  const advisory = getDecisionGuidance(segment.riskTier);

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
            <span className="dh-segment-inspect__eyebrow">DECISION-SUPPORT SEGMENT AUDIT</span>
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
            NH-7 Pilot Corridor · Segment {segment.index + 1} of 20 (~{segment.distanceKm.toFixed(1)} km chord)
          </p>
          <div className="dh-segment-inspect__terrain-meta">
            <Mountain size={11} className="dh-segment-inspect__terrain-icon" aria-hidden="true" />
            <span>
              DEM-derived corridor alignment gradient: <strong>{segment.gradientDegrees.toFixed(1)}°</strong> ({segment.gradientPercent.toFixed(1)}%) · {segment.startElevationM}m → {segment.endElevationM}m MSL
            </span>
          </div>
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
              style={{ color: isIndeterminate ? 'var(--text-muted)' : segment.colorHex }}
            >
              {isIndeterminate ? 'INDETERMINATE' : Math.round(score)}
            </span>
            {!isIndeterminate && <span className="dh-segment-inspect__score-denom">/ 100</span>}
          </div>
        </div>

        {/* Progress bar */}
        <div
          className="dh-segment-inspect__gauge"
          role="progressbar"
          aria-valuenow={isIndeterminate ? 0 : score}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div
            className="dh-segment-inspect__gauge-bar"
            style={{
              width: `${isIndeterminate ? 0 : score}%`,
              backgroundColor: isIndeterminate ? 'var(--text-muted)' : segment.colorHex,
            }}
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

      {/* Primary Hazard Driver Callout */}
      <div className="dh-segment-inspect__driver-card">
        <div className="dh-segment-inspect__driver-header">
          <Activity size={12} className="dh-segment-inspect__driver-icon" aria-hidden="true" />
          <span>Primary Hazard Driver</span>
        </div>
        <div className="dh-segment-inspect__driver-name">
          {primaryFactor ? primaryFactor.name : isIndeterminate ? 'Indeterminate Telemetry' : 'Baseline Calm Conditions'}
        </div>
        <div className="dh-segment-inspect__driver-detail">
          {primaryFactor && primaryFactor.weightedContribution !== null
            ? `+${primaryFactor.weightedContribution.toFixed(1)} pts score impact (${(primaryFactor.normalizedWeight * 100).toFixed(0)}% active weight)`
            : isIndeterminate
            ? 'Reliable active telemetry is insufficient to identify a primary driver.'
            : 'All monitored hydro-meteorological metrics are within baseline bounds.'}
        </div>
      </div>

      {/* 5-Factor Deterministic Attribution Breakdown */}
      <div className="dh-segment-inspect__factors">
        <div className="dh-segment-inspect__factors-head">
          <h4 className="dh-segment-inspect__factors-title">Factor Attribution Breakdown</h4>
          <span className="dh-segment-inspect__weights-tag">
            Dynamic normalized weights (∑ wᵢ* = 100%)
          </span>
        </div>

        {candidateFactors.map((factor: RiskFactor) => {
          const isActive = factor.status === 'active';
          return (
            <div
              key={factor.id}
              className={clsx('dh-segment-inspect__factor-item', {
                'dh-segment-inspect__factor-item--unavailable': !isActive,
              })}
            >
              <div className="dh-segment-inspect__factor-meta">
                <div className="dh-segment-inspect__factor-name">
                  <span className="dh-segment-inspect__factor-icon">
                    {getFactorIcon(factor.id)}
                  </span>
                  <span>{factor.name}</span>
                </div>
                <span
                  className={clsx('dh-segment-inspect__factor-badge', {
                    'dh-segment-inspect__factor-badge--active': isActive,
                    'dh-segment-inspect__factor-badge--unavailable': !isActive,
                  })}
                >
                  {isActive ? 'ACTIVE' : 'UNAVAILABLE'}
                </span>
              </div>

              <div className="dh-segment-inspect__factor-stats">
                <div className="dh-segment-inspect__stat-col">
                  <span className="dh-segment-inspect__stat-label">Reading</span>
                  <span className="dh-segment-inspect__stat-val dh-segment-inspect__stat-val--accent">
                    {isActive && factor.rawValue !== null
                      ? `${factor.rawValue} ${factor.unit}`
                      : 'No Signal'}
                  </span>
                </div>
                <div className="dh-segment-inspect__stat-col">
                  <span className="dh-segment-inspect__stat-label">Sub-Score</span>
                  <span className="dh-segment-inspect__stat-val">
                    {isActive && factor.score !== null ? `${factor.score.toFixed(1)}/100` : '—'}
                  </span>
                </div>
                <div className="dh-segment-inspect__stat-col">
                  <span className="dh-segment-inspect__stat-label">Norm. Weight</span>
                  <span className="dh-segment-inspect__stat-val">
                    {isActive ? `${(factor.normalizedWeight * 100).toFixed(0)}%` : '0%'}
                  </span>
                </div>
                <div className="dh-segment-inspect__stat-col">
                  <span className="dh-segment-inspect__stat-label">Contribution</span>
                  <span className="dh-segment-inspect__stat-val dh-segment-inspect__stat-val--contrib">
                    {isActive && factor.weightedContribution !== null
                      ? `+${factor.weightedContribution.toFixed(1)} pts`
                      : '0.0 pts'}
                  </span>
                </div>
              </div>

              {/* Progress bar gauge */}
              <div className="dh-segment-inspect__factor-bar-bg" aria-hidden="true">
                <div
                  className="dh-segment-inspect__factor-bar"
                  style={{
                    width: isActive && factor.score !== null ? `${factor.score}%` : '0%',
                    backgroundColor:
                      factor.score && factor.score >= 75
                        ? 'var(--risk-severe)'
                        : factor.score && factor.score >= 50
                        ? 'var(--risk-high)'
                        : 'var(--accent-primary)',
                  }}
                />
              </div>

              <span className="dh-segment-inspect__factor-caption">
                {factor.explanation}
              </span>
            </div>
          );
        })}

        {/* Future / Unassessed Factors Section */}
        {futureFactors.length > 0 && (
          <div className="dh-segment-inspect__future-section">
            <div className="dh-segment-inspect__future-head">
              <span className="dh-segment-inspect__future-title">
                Planned Future Telemetry (Not in Deterministic Score)
              </span>
            </div>
            {futureFactors.map((factor: RiskFactor) => (
              <div
                key={factor.id}
                className="dh-segment-inspect__factor-item dh-segment-inspect__factor-item--future"
              >
                <div className="dh-segment-inspect__factor-meta">
                  <div className="dh-segment-inspect__factor-name">
                    <span className="dh-segment-inspect__factor-icon">
                      {getFactorIcon(factor.id)}
                    </span>
                    <span>{factor.name}</span>
                  </div>
                  <span className="dh-segment-inspect__factor-badge dh-segment-inspect__factor-badge--future">
                    UNASSESSED (FUTURE PHASE)
                  </span>
                </div>
                <span className="dh-segment-inspect__factor-caption">
                  {factor.explanation}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Data Quality & Scientific Caveat */}
      <div className="dh-segment-inspect__quality-box" role="note">
        <div className="dh-segment-inspect__quality-row">
          <span className="dh-segment-inspect__quality-label">
            <ShieldCheck size={12} className="dh-segment-inspect__quality-icon" aria-hidden="true" />
            Data Quality Audit:
          </span>
          <span className="dh-segment-inspect__quality-val">
            {segment.dataQualityRating} · {segment.activeFactorsRatio}
          </span>
        </div>
        <div className="dh-segment-inspect__disclaimer-text">
          <AlertCircle size={12} className="dh-segment-inspect__disclaimer-icon" aria-hidden="true" />
          <span>{segment.disclaimer}</span>
        </div>
      </div>

      {/* Action Advisory Box */}
      <div className="dh-segment-inspect__advisory">
        <div className="dh-segment-inspect__advisory-content">
          <ShieldAlert size={18} className="dh-segment-inspect__advisory-icon" aria-hidden="true" />
          <div>
            <h5 className="dh-segment-inspect__advisory-title">{advisory.title}</h5>
            <p className="dh-segment-inspect__advisory-text">{advisory.text}</p>
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

