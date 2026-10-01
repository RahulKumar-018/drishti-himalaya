import React from 'react';
import clsx from 'clsx';
import { Card } from '../common/Card';
import { Badge } from '../common/Badge';
import { Divider } from '../common/Divider';
import './AnalysisPanel.css';

export interface AnalysisPanelProps {
  className?: string;
}

export const AnalysisPanel: React.FC<AnalysisPanelProps> = ({ className }) => {
  return (
    <aside
      className={clsx('dh-analysis-panel', className)}
      aria-label="Route and Risk Analysis Panel"
    >
      {/* Panel Header */}
      <div className="dh-analysis-panel__header">
        <h2 className="dh-analysis-panel__title">ANALYSIS PANEL</h2>
        <span className="dh-analysis-panel__subtitle">Decision Support Telemetry</span>
      </div>

      {/* Panel Scrollable Body */}
      <div className="dh-analysis-panel__content">
        {/* Section 1: Route Analysis */}
        <Card
          variant="default"
          title="Route Analysis"
          subtitle="Primary vs safer alternative route comparison"
          headerAction={
            <Badge variant="default" size="sm">
              AWAITING ROUTE INPUT
            </Badge>
          }
          className="dh-analysis-panel__card"
        >
          <p className="dh-analysis-panel__placeholder-text">
            Route corridor geometry and segment breakdown will populate once waypoint parameters are initialized.
          </p>
        </Card>

        {/* Section 2: Risk Assessment */}
        <Card
          variant="default"
          title="Risk Assessment"
          subtitle="Geotechnical &amp; meteorological evaluation"
          headerAction={
            <Badge variant="default" size="sm">
              RISK ENGINE OFFLINE
            </Badge>
          }
          className="dh-analysis-panel__card"
        >
          <p className="dh-analysis-panel__placeholder-text">
            Hazard scoring engine pending backend connection. 250m segment slope stability models inactive.
          </p>
        </Card>

        {/* Section 3: Route Metrics */}
        <Card
          variant="muted"
          title="Route Metrics"
          subtitle="Corridor telemetry overview"
          className="dh-analysis-panel__card"
        >
          <div className="dh-analysis-panel__metrics-list">
            <div className="dh-analysis-panel__metric-row">
              <span className="dh-analysis-panel__metric-label">Distance</span>
              <span className="dh-analysis-panel__metric-value">—</span>
            </div>
            <Divider orientation="horizontal" variant="subtle" />
            <div className="dh-analysis-panel__metric-row">
              <span className="dh-analysis-panel__metric-label">Estimated Time</span>
              <span className="dh-analysis-panel__metric-value">—</span>
            </div>
            <Divider orientation="horizontal" variant="subtle" />
            <div className="dh-analysis-panel__metric-row">
              <span className="dh-analysis-panel__metric-label">Risk Score</span>
              <span className="dh-analysis-panel__metric-value">—</span>
            </div>
            <Divider orientation="horizontal" variant="subtle" />
            <div className="dh-analysis-panel__metric-row">
              <span className="dh-analysis-panel__metric-label">Highest Risk Segment</span>
              <span className="dh-analysis-panel__metric-value">—</span>
            </div>
          </div>
        </Card>
      </div>
    </aside>
  );
};
