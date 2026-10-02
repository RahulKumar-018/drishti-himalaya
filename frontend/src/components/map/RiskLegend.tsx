import React from 'react';
import clsx from 'clsx';
import { RISK_TIER_CONFIG } from '../../services/risk/riskConfig';
import './RiskLegend.css';

export interface RiskLegendProps {
  className?: string;
  isSimulated?: boolean;
}

export const RiskLegend: React.FC<RiskLegendProps> = ({
  className,
  isSimulated = false,
}) => {
  const tiers = [
    { key: 'LOW', label: 'LOW', range: '< 25', config: RISK_TIER_CONFIG.LOW },
    { key: 'MODERATE', label: 'MODERATE', range: '25 – 50', config: RISK_TIER_CONFIG.MODERATE },
    { key: 'HIGH', label: 'HIGH', range: '50 – 75', config: RISK_TIER_CONFIG.HIGH },
    { key: 'SEVERE', label: 'SEVERE', range: '≥ 75', config: RISK_TIER_CONFIG.SEVERE },
  ] as const;

  return (
    <aside
      className={clsx('dh-risk-legend', className)}
      aria-label="Corridor Risk Legend"
    >
      <div className="dh-risk-legend__header">
        <span className="dh-risk-legend__title">CORRIDOR RISK</span>
        {isSimulated && (
          <span className="dh-risk-legend__sim-tag">SCENARIO</span>
        )}
      </div>

      <ul className="dh-risk-legend__list">
        {tiers.map((t) => (
          <li key={t.key} className="dh-risk-legend__item">
            <span
              className="dh-risk-legend__swatch"
              style={{ backgroundColor: t.config.colorHex }}
              aria-hidden="true"
            />
            <span className="dh-risk-legend__label">{t.label}</span>
            <span className="dh-risk-legend__range">{t.range}</span>
          </li>
        ))}
      </ul>

      <div className="dh-risk-legend__footer">
        <span>Deterministic Decision Support</span>
      </div>
    </aside>
  );
};
