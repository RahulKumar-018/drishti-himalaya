import React from 'react';
import clsx from 'clsx';
import { BellRing, Radio, Info } from 'lucide-react';
import { AlertFeed, DEMO_ALERTS } from '../components/alerts/AlertFeed';
import { AlertSeverity, HazardAlert } from '../components/alerts/AlertCard';
import { MonitoringTripApiResponse, TripAlertApiResponse } from '../services/api/types';
import './AlertsPage.css';

export interface AlertsPageProps {
  onNavigate: (tab: string, context?: unknown) => void;
  className?: string;
  alerts?: TripAlertApiResponse[];
  monitoringTrip?: MonitoringTripApiResponse | null;
  isLoading?: boolean;
  error?: string | null;
  onRetry?: () => void;
}

export const AlertsPage: React.FC<AlertsPageProps> = ({
  onNavigate,
  className,
  alerts,
  monitoringTrip,
  isLoading = false,
  error,
  onRetry,
}) => {
  const handleLocateOnMap = (alert: HazardAlert) => {
    onNavigate('map', { targetAlert: alert });
  };

  const liveAlerts: HazardAlert[] | undefined = alerts?.map((alert) => {
    const severity: AlertSeverity = alert.severity === 'LOW' ? 'ADVISORY' : (alert.severity as AlertSeverity);
    const triggerLabel = alert.trigger_source.replace(/_/g, ' ').toLowerCase();
    return {
      id: alert.id,
      code: `TRIP-${alert.id.slice(0, 8).toUpperCase()}`,
      severity,
      category: alert.trigger_source === 'RAIN_THRESHOLD' ? 'Intense Rainfall' : 'Road Subsidence',
      title: alert.title,
      location: monitoringTrip?.origin.name && monitoringTrip.destination.name
        ? `${monitoringTrip.origin.name} → ${monitoringTrip.destination.name}`
        : 'Monitored route',
      coordinates: monitoringTrip
        ? [monitoringTrip.origin.latitude, monitoringTrip.origin.longitude]
        : [30.1033, 78.2947],
      timestamp: new Date(alert.created_at).toLocaleString(),
      issuedAtIso: alert.created_at,
      triggerCondition: triggerLabel,
      recommendedAction: alert.message,
      affectedKmMarker: alert.current_risk_tier ? `${alert.current_risk_tier} route exposure` : 'Route monitoring alert',
      isActive: !alert.acknowledged_at,
      isDemo: false,
    };
  });

  return (
    <div className={clsx('dh-alerts-page', className)}>
      <div className="dh-alerts-page__header">
        <div className="dh-alerts-page__header-left">
          <div className="dh-alerts-page__tag">
            <BellRing size={14} />
            <span>CIVIL PROTECTION &amp; ROAD DISASTER ADVISORY FEED</span>
          </div>
          <h1 className="dh-alerts-page__title">EARLY WARNING ALERTS</h1>
          <p className="dh-alerts-page__subtitle">
            Active geotechnical failure warnings, monsoonal runoff thresholds, and river surge bulletins across the Char Dham highway network.
          </p>
        </div>

        <div className="dh-alerts-page__header-badge">
          <Radio size={13} className="dh-alerts-page__radio-icon" />
          <span>SDRF Uttarakhand Telemetry Protocol Aligned</span>
        </div>
      </div>

      {/* Data status banner */}
      <div className="dh-alerts-page__notice" role="note">
        <Info size={14} className="dh-alerts-page__notice-icon" aria-hidden="true" />
        <p className="dh-alerts-page__notice-text">
          <strong>{monitoringTrip ? 'Monitored trip feed:' : 'No monitored trip selected:'}</strong>{' '}
          {monitoringTrip ? 'Alerts are sourced from the backend risk reassessment pipeline.' : 'Start trip monitoring from the GIS map to receive route-specific alerts.'}
        </p>
      </div>

      {/* Feed Container */}
      {isLoading && <div className="dh-alerts-page__notice">Loading monitored trip alerts...</div>}
      {error && (
        <div className="dh-alerts-page__notice" role="alert">
          <p className="dh-alerts-page__notice-text">{error}</p>
          {onRetry && <button type="button" onClick={onRetry}>Retry</button>}
        </div>
      )}
      <AlertFeed alerts={liveAlerts ?? DEMO_ALERTS} onLocateOnMap={handleLocateOnMap} />
    </div>
  );
};
