import React from 'react';
import clsx from 'clsx';
import { BellRing, Radio, Info } from 'lucide-react';
import { AlertFeed, DEMO_ALERTS } from '../components/alerts/AlertFeed';
import { HazardAlert } from '../components/alerts/AlertCard';
import './AlertsPage.css';

export interface AlertsPageProps {
  onNavigate: (tab: string, context?: unknown) => void;
  className?: string;
}

export const AlertsPage: React.FC<AlertsPageProps> = ({ onNavigate, className }) => {
  const handleLocateOnMap = (alert: HazardAlert) => {
    onNavigate('map', { targetAlert: alert });
  };

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

      {/* Demo Notice Banner */}
      <div className="dh-alerts-page__notice" role="note">
        <Info size={14} className="dh-alerts-page__notice-icon" aria-hidden="true" />
        <p className="dh-alerts-page__notice-text">
          <strong>Operational Field Mode:</strong> Alerts are generated deterministically when live weather or slope criteria cross defined safety margins. In Phase 2 backend integration, this feed connects to <code>GET /api/v1/alerts</code>.
        </p>
      </div>

      {/* Feed Container */}
      <AlertFeed alerts={DEMO_ALERTS} onLocateOnMap={handleLocateOnMap} />
    </div>
  );
};
