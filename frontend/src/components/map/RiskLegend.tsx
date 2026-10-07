import React from 'react';
import clsx from 'clsx';
import { RISK_TIER_CONFIG } from '../../services/risk/riskConfig';
import './RiskLegend.css';

export interface RiskLegendProps {
  className?: string;
  isSimulated?: boolean;
  showHistoricalCuttings?: boolean;
}

export const RiskLegend: React.FC<RiskLegendProps> = ({
  className,
  isSimulated = false,
  showHistoricalCuttings = true,
}) => {
  const tiers = [
    { key: 'LOW', label: 'LOW', range: '< 25', colorHex: RISK_TIER_CONFIG.LOW.colorHex },
    { key: 'MODERATE', label: 'MODERATE', range: '25 – 50', colorHex: RISK_TIER_CONFIG.MODERATE.colorHex },
    { key: 'HIGH', label: 'HIGH', range: '50 – 75', colorHex: RISK_TIER_CONFIG.HIGH.colorHex },
    { key: 'SEVERE', label: 'SEVERE', range: '≥ 75', colorHex: RISK_TIER_CONFIG.SEVERE.colorHex },
    { key: 'INDETERMINATE', label: 'UNKNOWN / INDETERMINATE', range: 'Partial / Missing', colorHex: '#94A3B8' },
  ] as const;

  return (
    <aside
      className={clsx('dh-risk-legend', className)}
      aria-label="Route and Corridor Risk Legend"
    >
      <div className="dh-risk-legend__header">
        <span className="dh-risk-legend__title">ROUTE RISK</span>
        {isSimulated && (
          <span className="dh-risk-legend__sim-tag">SCENARIO</span>
        )}
      </div>

      <ul className="dh-risk-legend__list">
        {tiers.map((t) => (
          <li key={t.key} className="dh-risk-legend__item">
            <span
              className="dh-risk-legend__swatch"
              style={{ backgroundColor: t.colorHex }}
              aria-hidden="true"
            />
            <span className="dh-risk-legend__label">{t.label}</span>
            <span className="dh-risk-legend__range">{t.range}</span>
          </li>
        ))}
        {showHistoricalCuttings && (
          <li className="dh-risk-legend__item dh-risk-legend__item--cutting">
            <span
              className="dh-risk-legend__swatch dh-risk-legend__swatch--cutting"
              aria-hidden="true"
            />
            <span className="dh-risk-legend__label dh-risk-legend__label--cutting">
              Historical OSM Cutting — 2018
            </span>
          </li>
        )}
      </ul>

      <div className="dh-risk-legend__footer">
        <span>Deterministic Decision Support</span>
      </div>
    </aside>
  );
};
