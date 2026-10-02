import React from 'react';
import clsx from 'clsx';
import { CloudRain, Mountain, Activity, Layers } from 'lucide-react';
import { RiskFactor } from '../../services/risk/types';
import './RiskFactorCard.css';

export interface RiskFactorCardProps {
  factor: RiskFactor;
  className?: string;
}

export const RiskFactorCard: React.FC<RiskFactorCardProps> = ({ factor, className }) => {
  const isActive = factor.status === 'active';
  const isFuture = factor.status === 'unassessed_future_phase';
  const isUnavailable = factor.status === 'unavailable';

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'meteorological':
        return <CloudRain size={16} />;
      case 'topographic':
        return <Mountain size={16} />;
      case 'geotechnical':
        return <Layers size={16} />;
      default:
        return <Activity size={16} />;
    }
  };

  const getStatusBadge = () => {
    if (isActive) {
      return (
        <span className="dh-factor-card__badge dh-factor-card__badge--active">
          LIVE TELEMETRY
        </span>
      );
    }
    if (isFuture) {
      return (
        <span className="dh-factor-card__badge dh-factor-card__badge--future">
          FUTURE ML INGESTION
        </span>
      );
    }
    return (
      <span className="dh-factor-card__badge dh-factor-card__badge--unavailable">
        TELEMETRY OFFLINE
      </span>
    );
  };

  return (
    <div
      className={clsx(
        'dh-factor-card',
        {
          'dh-factor-card--active': isActive,
          'dh-factor-card--future': isFuture,
          'dh-factor-card--unavailable': isUnavailable,
        },
        className
      )}
    >
      <div className="dh-factor-card__header">
        <div className="dh-factor-card__icon-box" aria-hidden="true">
          {getCategoryIcon(factor.category)}
        </div>
        <div className="dh-factor-card__title-lockup">
          <span className="dh-factor-card__category">{factor.category}</span>
          <h4 className="dh-factor-card__title">{factor.name}</h4>
        </div>
        <div className="dh-factor-card__badge-wrapper">{getStatusBadge()}</div>
      </div>

      <div className="dh-factor-card__metrics">
        {/* Score & Weight */}
        <div className="dh-factor-card__metric-col">
          <span className="dh-factor-card__metric-label">Sub-Score</span>
          <div className="dh-factor-card__score-display">
            <span className="dh-factor-card__score-val">
              {isActive && factor.score !== null ? factor.score.toFixed(1) : '—'}
            </span>
            <span className="dh-factor-card__score-denom">/ 100</span>
          </div>
        </div>

        <div className="dh-factor-card__metric-col">
          <span className="dh-factor-card__metric-label">Effective Weight</span>
          <span className="dh-factor-card__metric-val dh-factor-card__metric-val--mono">
            {isActive
              ? `${(factor.normalizedWeight * 100).toFixed(0)}% (${factor.rawWeight} base)`
              : isFuture
              ? `${factor.rawWeight} base (deferred)`
              : '0% (normalized out)'}
          </span>
        </div>

        <div className="dh-factor-card__metric-col">
          <span className="dh-factor-card__metric-label">Score Contribution</span>
          <span className="dh-factor-card__metric-val dh-factor-card__metric-val--mono">
            {isActive && factor.weightedContribution !== null
              ? `+${factor.weightedContribution.toFixed(1)} pts`
              : '0.0 pts'}
          </span>
        </div>

        <div className="dh-factor-card__metric-col">
          <span className="dh-factor-card__metric-label">Physical Reading</span>
          <span className="dh-factor-card__metric-val dh-factor-card__metric-val--accent">
            {isActive && factor.rawValue !== null
              ? `${factor.rawValue} ${factor.unit}`
              : isFuture
              ? 'Pending ML Model'
              : 'No Signal'}
          </span>
        </div>
      </div>

      {/* Mini Gauge Bar */}
      <div className="dh-factor-card__gauge-track" aria-hidden="true">
        <div
          className="dh-factor-card__gauge-fill"
          style={{
            width: isActive && factor.score !== null ? `${factor.score}%` : '0%',
          }}
        />
      </div>

      {/* Threshold Reference & Scientific Narrative */}
      <div className="dh-factor-card__details">
        <div className="dh-factor-card__ref-row">
          <span className="dh-factor-card__ref-label">Threshold Reference:</span>
          <span className="dh-factor-card__ref-text">{factor.thresholdReference}</span>
        </div>
        <p className="dh-factor-card__desc">{factor.explanation}</p>
      </div>
    </div>
  );
};
