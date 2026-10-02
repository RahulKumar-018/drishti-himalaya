import React from 'react';
import clsx from 'clsx';
import { ShieldCheck, AlertCircle, AlertTriangle, Flame } from 'lucide-react';
import { RiskLevel } from '../../services/risk/types';
import './RiskCard.css';

export interface RiskTierMetric {
  level: RiskLevel;
  label: string;
  count: number;
  percentage: number;
  colorHex: string;
  description: string;
}

export interface RiskCardProps {
  activeLevel?: RiskLevel;
  compositeScore?: number | null;
  tierMetrics?: RiskTierMetric[];
  className?: string;
  onSelectTier?: (level: RiskLevel) => void;
}

const DEFAULT_TIERS: RiskTierMetric[] = [
  {
    level: 'LOW',
    label: 'Low Hazard',
    count: 12,
    percentage: 60,
    colorHex: 'var(--risk-low)',
    description: 'Score < 25 · Baseline stability, no active rain runoff',
  },
  {
    level: 'MODERATE',
    label: 'Moderate',
    count: 5,
    percentage: 25,
    colorHex: 'var(--risk-moderate)',
    description: 'Score 25-50 · Elevated precipitation or steep alignment',
  },
  {
    level: 'HIGH',
    label: 'High Hazard',
    count: 2,
    percentage: 10,
    colorHex: 'var(--risk-high)',
    description: 'Score 50-75 · Severe slope gradient and intense rain',
  },
  {
    level: 'SEVERE',
    label: 'Severe Critical',
    count: 1,
    percentage: 5,
    colorHex: 'var(--risk-severe)',
    description: 'Score ≥ 75 · Critical runoff threshold exceeded',
  },
];

export const RiskCard: React.FC<RiskCardProps> = ({
  activeLevel,
  compositeScore,
  tierMetrics = DEFAULT_TIERS,
  className,
  onSelectTier,
}) => {
  const getTierIcon = (level: RiskLevel) => {
    switch (level) {
      case 'LOW':
        return <ShieldCheck size={16} />;
      case 'MODERATE':
        return <AlertCircle size={16} />;
      case 'HIGH':
        return <AlertTriangle size={16} />;
      case 'SEVERE':
        return <Flame size={16} />;
      default:
        return <ShieldCheck size={16} />;
    }
  };

  return (
    <div className={clsx('dh-risk-card', className)}>
      <div className="dh-risk-card__header">
        <div>
          <h3 className="dh-risk-card__title">CORRIDOR HAZARD SPECTRUM</h3>
          <span className="dh-risk-card__subtitle">
            20 Disaggregated 250m Segment Classifications
          </span>
        </div>
        {compositeScore !== undefined && compositeScore !== null && (
          <div className="dh-risk-card__score-badge">
            <span className="dh-risk-card__score-val">{compositeScore.toFixed(1)}</span>
            <span className="dh-risk-card__score-tag">OVERALL</span>
          </div>
        )}
      </div>

      {/* Stacked Risk Proportion Bar */}
      <div className="dh-risk-card__bar-track" aria-label="Hazard distribution bar">
        {tierMetrics.map((t) => (
          <div
            key={t.level}
            className="dh-risk-card__bar-segment"
            style={{
              width: `${t.percentage}%`,
              backgroundColor: t.colorHex,
            }}
            title={`${t.label}: ${t.count} segments (${t.percentage}%)`}
          />
        ))}
      </div>

      {/* Grid of Tier Summary Tiles */}
      <div className="dh-risk-card__grid">
        {tierMetrics.map((t) => {
          const isCurrentActive = activeLevel === t.level;
          return (
            <div
              key={t.level}
              className={clsx('dh-risk-card__tier-item', {
                'dh-risk-card__tier-item--active': isCurrentActive,
                'dh-risk-card__tier-item--clickable': Boolean(onSelectTier),
              })}
              onClick={() => onSelectTier?.(t.level)}
              style={{
                borderLeftColor: t.colorHex,
              }}
            >
              <div className="dh-risk-card__tier-top">
                <span className="dh-risk-card__tier-icon" style={{ color: t.colorHex }}>
                  {getTierIcon(t.level)}
                </span>
                <span className="dh-risk-card__tier-label">{t.label}</span>
                <span className="dh-risk-card__tier-count" style={{ color: t.colorHex }}>
                  {t.count}
                </span>
              </div>
              <span className="dh-risk-card__tier-desc">{t.description}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};
