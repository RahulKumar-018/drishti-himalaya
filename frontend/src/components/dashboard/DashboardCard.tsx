import React from 'react';
import clsx from 'clsx';
import './DashboardCard.css';

export interface DashboardCardProps {
  title: string;
  value: string | number;
  unit?: string;
  subtitle?: string;
  icon?: React.ReactNode;
  accentColor?: string;
  trend?: {
    label: string;
    direction?: 'up' | 'down' | 'neutral';
  };
  badge?: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
  onClick?: () => void;
}

export const DashboardCard: React.FC<DashboardCardProps> = ({
  title,
  value,
  unit,
  subtitle,
  icon,
  accentColor,
  trend,
  badge,
  footer,
  className,
  onClick,
}) => {
  return (
    <div
      className={clsx(
        'dh-dashboard-card',
        { 'dh-dashboard-card--clickable': Boolean(onClick) },
        className
      )}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      <div className="dh-dashboard-card__header">
        <span className="dh-dashboard-card__title">{title}</span>
        <div className="dh-dashboard-card__header-right">
          {badge}
          {icon && (
            <div
              className="dh-dashboard-card__icon"
              style={accentColor ? { color: accentColor, backgroundColor: `${accentColor}18` } : undefined}
              aria-hidden="true"
            >
              {icon}
            </div>
          )}
        </div>
      </div>

      <div className="dh-dashboard-card__body">
        <div className="dh-dashboard-card__value-lockup">
          <span
            className="dh-dashboard-card__value"
            style={accentColor ? { color: accentColor } : undefined}
          >
            {value}
          </span>
          {unit && <span className="dh-dashboard-card__unit">{unit}</span>}
        </div>

        {subtitle && <p className="dh-dashboard-card__subtitle">{subtitle}</p>}

        {trend && (
          <div
            className={clsx('dh-dashboard-card__trend', {
              'dh-dashboard-card__trend--up': trend.direction === 'up',
              'dh-dashboard-card__trend--down': trend.direction === 'down',
            })}
          >
            <span>{trend.label}</span>
          </div>
        )}
      </div>

      {footer && <div className="dh-dashboard-card__footer">{footer}</div>}
    </div>
  );
};
