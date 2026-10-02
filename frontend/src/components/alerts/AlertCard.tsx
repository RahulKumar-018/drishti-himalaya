import React from 'react';
import clsx from 'clsx';
import {
  AlertTriangle,
  Flame,
  AlertCircle,
  Info,
  Clock,
  MapPin,
  ShieldAlert,
  ArrowRight,
} from 'lucide-react';
import { Badge } from '../common/Badge';
import './AlertCard.css';

export type AlertSeverity = 'SEVERE' | 'HIGH' | 'MODERATE' | 'ADVISORY';

export interface HazardAlert {
  id: string;
  code: string;
  severity: AlertSeverity;
  category: 'Flash Flood' | 'Landslide Scar' | 'Rockfall' | 'Intense Rainfall' | 'Road Subsidence';
  title: string;
  location: string;
  coordinates: [number, number];
  timestamp: string;
  issuedAtIso: string;
  triggerCondition: string;
  recommendedAction: string;
  affectedKmMarker: string;
  isActive: boolean;
  isDemo?: boolean;
}

export interface AlertCardProps {
  alert: HazardAlert;
  onLocateOnMap?: (alert: HazardAlert) => void;
  className?: string;
}

export const AlertCard: React.FC<AlertCardProps> = ({
  alert,
  onLocateOnMap,
  className,
}) => {
  const getSeverityBadgeVariant = (severity: AlertSeverity) => {
    switch (severity) {
      case 'SEVERE':
        return 'severe';
      case 'HIGH':
        return 'high';
      case 'MODERATE':
        return 'moderate';
      case 'ADVISORY':
      default:
        return 'default';
    }
  };

  const getSeverityIcon = (severity: AlertSeverity) => {
    switch (severity) {
      case 'SEVERE':
        return <Flame size={15} />;
      case 'HIGH':
        return <AlertTriangle size={15} />;
      case 'MODERATE':
        return <AlertCircle size={15} />;
      case 'ADVISORY':
      default:
        return <Info size={15} />;
    }
  };

  return (
    <article
      className={clsx(
        'dh-alert-card',
        `dh-alert-card--${alert.severity.toLowerCase()}`,
        className
      )}
    >
      <div className="dh-alert-card__top">
        <div className="dh-alert-card__top-left">
          <Badge
            variant={getSeverityBadgeVariant(alert.severity)}
            size="sm"
            showDot
          >
            {alert.severity} ALERT
          </Badge>
          <span className="dh-alert-card__code">{alert.code}</span>
          <span className="dh-alert-card__source-tag">
            {alert.isDemo !== false ? 'DEMO' : 'LIVE'}
          </span>
          <span className="dh-alert-card__category">
            {getSeverityIcon(alert.severity)}
            <span>{alert.category}</span>
          </span>
        </div>

        <div className="dh-alert-card__time">
          <Clock size={11} />
          <span>{alert.timestamp}</span>
        </div>
      </div>

      <h3 className="dh-alert-card__title">{alert.title}</h3>

      <div className="dh-alert-card__meta-bar">
        <div className="dh-alert-card__meta-item">
          <MapPin size={12} className="dh-alert-card__meta-icon" />
          <span className="dh-alert-card__location">{alert.location}</span>
        </div>
        <span className="dh-alert-card__dot-divider" aria-hidden="true">·</span>
        <span className="dh-alert-card__km-marker">{alert.affectedKmMarker}</span>
      </div>

      {/* Telemetry Trigger Box */}
      <div className="dh-alert-card__trigger-box">
        <span className="dh-alert-card__trigger-label">Trigger Condition:</span>
        <span className="dh-alert-card__trigger-text">{alert.triggerCondition}</span>
      </div>

      {/* Recommended Action Callout */}
      <div className="dh-alert-card__action-box">
        <div className="dh-alert-card__action-header">
          <ShieldAlert size={13} className="dh-alert-card__action-icon" />
          <span>RECOMMENDED TACTICAL ACTION</span>
        </div>
        <p className="dh-alert-card__action-text">{alert.recommendedAction}</p>
      </div>

      {/* Card Actions */}
      {onLocateOnMap && (
        <div className="dh-alert-card__footer">
          <button
            type="button"
            className="dh-alert-card__map-btn"
            onClick={() => onLocateOnMap(alert)}
          >
            <span>View on Corridor Map</span>
            <ArrowRight size={12} />
          </button>
        </div>
      )}
    </article>
  );
};
