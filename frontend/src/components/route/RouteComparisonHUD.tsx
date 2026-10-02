import React from 'react';
import clsx from 'clsx';
import { ShieldCheck, Clock, Compass, ArrowRight, AlertTriangle } from 'lucide-react';
import './RouteComparisonHUD.css';

export interface RouteOption {
  id: string;
  title: string;
  route: string;
  riskScore: number;
  estimatedTime: string;
  distanceKm?: number;
  status?: 'low' | 'moderate' | 'high' | 'critical';
  statusBadge?: string;
  selected?: boolean;
  via?: string;
  riskTrend?: string;
}

export interface RouteComparisonHUDProps {
  routes: RouteOption[];
  selectedRouteId?: string | null;
  onSelectRoute?: (routeId: string) => void;
  onViewOnMap?: (routeId: string) => void;
  onInspectDrivers?: (routeId: string) => void;
  className?: string;
}

const getTierColor = (score: number) => {
  if (score < 25) return 'var(--risk-low)';
  if (score < 50) return 'var(--risk-moderate)';
  if (score < 75) return 'var(--risk-high)';
  return 'var(--risk-severe)';
};

const getTierLabel = (score: number) => {
  if (score < 25) return 'Low';
  if (score < 50) return 'Moderate';
  if (score < 75) return 'High';
  return 'Critical';
};

export const RouteComparisonHUD: React.FC<RouteComparisonHUDProps> = ({
  routes,
  selectedRouteId,
  onSelectRoute,
  onViewOnMap,
  onInspectDrivers,
  className,
}) => {
  if (!routes || routes.length === 0) {
    return (
      <div className={clsx('dh-route-hud dh-route-hud--empty', className)}>
        <Compass size={24} className="dh-route-hud__empty-icon" aria-hidden="true" />
        <p className="dh-route-hud__empty-text">No route comparison options currently active.</p>
        <span className="dh-route-hud__empty-sub">
          Select origin and destination to generate alternative route evaluations.
        </span>
      </div>
    );
  }

  return (
    <div className={clsx('dh-route-hud', className)} role="region" aria-label="Route Alternatives Comparison">
      <div className="dh-route-hud__header">
        <div>
          <span className="dh-route-hud__subtitle">MULTI-CRITERIA ALTERNATIVES</span>
          <h3 className="dh-route-hud__title">Route Risk Comparison</h3>
        </div>
        <span className="dh-route-hud__count-badge">{routes.length} options evaluated</span>
      </div>

      <div className="dh-route-hud__grid">
        {routes.map((opt) => {
          const isSelected = selectedRouteId ? opt.id === selectedRouteId : !!opt.selected;
          const tierColor = getTierColor(opt.riskScore);
          const tierLabel = getTierLabel(opt.riskScore);

          return (
            <div
              key={opt.id}
              className={clsx('dh-route-hud__card', {
                'dh-route-hud__card--selected': isSelected,
                'dh-route-hud__card--critical': opt.status === 'critical' || opt.riskScore >= 75,
              })}
              onClick={() => onSelectRoute?.(opt.id)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onSelectRoute?.(opt.id);
                }
              }}
              aria-pressed={isSelected}
            >
              {/* Card Header: Neutral Badge + Indicator */}
              <div className="dh-route-hud__card-top">
                <span
                  className={clsx('dh-route-hud__badge', {
                    'dh-route-hud__badge--recommended': opt.statusBadge?.toLowerCase().includes('lower') || opt.statusBadge?.toLowerCase().includes('recommended'),
                    'dh-route-hud__badge--fastest': opt.statusBadge?.toLowerCase().includes('fastest') || opt.statusBadge?.toLowerCase().includes('direct'),
                    'dh-route-hud__badge--warning': opt.statusBadge?.toLowerCase().includes('avoid') || opt.statusBadge?.toLowerCase().includes('sensitive'),
                  })}
                >
                  {opt.statusBadge || 'Corridor Option'}
                </span>
                {opt.riskScore < 50 ? (
                  <ShieldCheck size={18} style={{ color: tierColor }} aria-hidden="true" />
                ) : (
                  <AlertTriangle size={18} style={{ color: tierColor }} aria-hidden="true" />
                )}
              </div>

              {/* Title & Path */}
              <h4 className="dh-route-hud__card-title">{opt.title}</h4>
              <p className="dh-route-hud__card-via">{opt.via || opt.route}</p>

              {/* Score & Time Metrics */}
              <div className="dh-route-hud__metrics">
                <div className="dh-route-hud__metric-group">
                  <div className="dh-route-hud__score-display">
                    <span className="dh-route-hud__score-val" style={{ color: tierColor }}>
                      {Math.round(opt.riskScore)}
                    </span>
                    <span className="dh-route-hud__score-sub">/ 100</span>
                  </div>
                  <span className="dh-route-hud__tier-tag" style={{ color: tierColor }}>
                    {tierLabel} Risk
                  </span>
                </div>

                <div className="dh-route-hud__time-group">
                  <div className="dh-route-hud__time-row">
                    <Clock size={13} className="dh-route-hud__time-icon" aria-hidden="true" />
                    <span className="dh-route-hud__time-val">{opt.estimatedTime}</span>
                  </div>
                  {opt.distanceKm !== undefined && (
                    <span className="dh-route-hud__dist-val">{opt.distanceKm} km</span>
                  )}
                  {opt.riskTrend && (
                    <span className="dh-route-hud__trend-val">{opt.riskTrend}</span>
                  )}
                </div>
              </div>

              {/* Action Links */}
              <div className="dh-route-hud__card-actions">
                <button
                  type="button"
                  className="dh-route-hud__action-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    onViewOnMap?.(opt.id);
                  }}
                >
                  View on map <ArrowRight size={12} />
                </button>
                {onInspectDrivers && (
                  <button
                    type="button"
                    className="dh-route-hud__inspect-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      onInspectDrivers(opt.id);
                    }}
                  >
                    Inspect drivers
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <p className="dh-route-hud__disclaimer">
        * Comparative scores are deterministic model evaluations based on active hydro-meteorological telemetry and corridor terrain gradients.
      </p>
    </div>
  );
};
