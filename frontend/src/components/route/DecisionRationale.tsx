import React from 'react';
import clsx from 'clsx';
import { BrainCircuit, Info, TrendingDown, TrendingUp, Minus } from 'lucide-react';
import './DecisionRationale.css';

export interface RationaleFactor {
  id: string;
  label: string;
  delta?: number;
  unit?: string;
  direction?: 'increase' | 'decrease' | 'neutral';
  explanation: string;
}

export interface DecisionRationaleProps {
  title?: string;
  factors?: RationaleFactor[];
  comparisonRouteName?: string;
  referenceRouteName?: string;
  className?: string;
}

export const DecisionRationale: React.FC<DecisionRationaleProps> = ({
  title = 'Decision Rationale',
  factors,
  comparisonRouteName,
  referenceRouteName,
  className,
}) => {
  const hasData = factors && factors.length > 0;

  return (
    <div
      className={clsx('dh-decision-rationale', className)}
      role="region"
      aria-label="Route Decision Rationale"
    >
      <div className="dh-decision-rationale__header">
        <div>
          <span className="dh-decision-rationale__subtitle">EXPLAINABLE TRADE-OFFS</span>
          <h3 className="dh-decision-rationale__title">{title}</h3>
          {comparisonRouteName && referenceRouteName && (
            <p className="dh-decision-rationale__context">
              Comparing <strong>{comparisonRouteName}</strong> vs <strong>{referenceRouteName}</strong>
            </p>
          )}
        </div>
        <BrainCircuit size={22} className="dh-decision-rationale__brain-icon" aria-hidden="true" />
      </div>

      {!hasData ? (
        <div className="dh-decision-rationale__empty">
          <Info size={18} className="dh-decision-rationale__empty-icon" aria-hidden="true" />
          <p className="dh-decision-rationale__empty-text">
            Comparative factor analysis will appear when alternative route analysis data is available.
          </p>
        </div>
      ) : (
        <div className="dh-decision-rationale__grid">
          {factors.map((factor) => {
            const isDecrease = factor.direction === 'decrease' || (factor.delta !== undefined && factor.delta < 0);
            const isIncrease = factor.direction === 'increase' || (factor.delta !== undefined && factor.delta > 0);
            const formattedDelta =
              factor.delta !== undefined
                ? `${factor.delta > 0 ? '+' : ''}${factor.delta}${factor.unit || '%'}`
                : null;

            return (
              <div key={factor.id} className="dh-decision-rationale__card">
                <span className="dh-decision-rationale__factor-label">{factor.label}</span>

                <div className="dh-decision-rationale__delta-row">
                  {formattedDelta && (
                    <span
                      className={clsx('dh-decision-rationale__delta-val', {
                        'dh-decision-rationale__delta-val--good': isDecrease,
                        'dh-decision-rationale__delta-val--bad': isIncrease,
                        'dh-decision-rationale__delta-val--neutral': !isDecrease && !isIncrease,
                      })}
                    >
                      {formattedDelta}
                    </span>
                  )}
                  {isDecrease && <TrendingDown size={16} className="dh-decision-rationale__trend-icon dh-decision-rationale__trend-icon--good" aria-hidden="true" />}
                  {isIncrease && <TrendingUp size={16} className="dh-decision-rationale__trend-icon dh-decision-rationale__trend-icon--bad" aria-hidden="true" />}
                  {!isDecrease && !isIncrease && <Minus size={16} className="dh-decision-rationale__trend-icon" aria-hidden="true" />}
                </div>

                <p className="dh-decision-rationale__factor-desc">{factor.explanation}</p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
