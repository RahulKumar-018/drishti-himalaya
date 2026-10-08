import React from 'react';
import clsx from 'clsx';
import {
  Compass,
  ArrowRight,
} from 'lucide-react';
import { Button } from '../components/common/Button';
import { Badge } from '../components/common/Badge';
import { RiskAssessment } from '../services/risk/types';
import { EnvironmentalData } from '../services/environmental/types';
import { CorridorSegmentRisk } from '../services/risk/segmentRiskService';
import { UseLocationSelectionReturn } from '../hooks/useLocationSelection';
import './HomePage.css';

export interface HomePageProps {
  onNavigate: (tab: string, context?: unknown) => void;
  riskAssessment?: RiskAssessment | null;
  envData?: EnvironmentalData | null;
  segments?: CorridorSegmentRisk[];
  selectedSegmentId?: string | null;
  onSelectSegment?: (segment: CorridorSegmentRisk | null) => void;
  scenarioPrecipitation?: number | null;
  onScenarioChange?: (val: number | null) => void;
  scenarioRiskAssessment?: RiskAssessment | null;
  locationSelection?: UseLocationSelectionReturn;
  className?: string;
}

export const HomePage: React.FC<HomePageProps> = ({
  onNavigate,
  riskAssessment,
  envData,
  className,
}) => {
  const currentRiskScore = riskAssessment?.score ?? 24.8;
  const currentRiskLevel = riskAssessment?.level ?? 'LOW';
  const livePrecip = envData?.rainfall?.precipitation ?? 0.0;

  return (
    <div className={clsx('dh-home-page', className)}>
      <div className="dh-home-overlay">
        <div className="dh-home-overlay__content">
          <div className="dh-home-overlay__badge-row">
            <span className="dh-home-overlay__live-pill">
              <span className="dh-home-overlay__live-dot" />
              GARHWAL HIMALAYAS
            </span>
            <span className="dh-home-overlay__model-pill">
              COPERNICUS DEM 90m
            </span>
          </div>

          <h1 className="dh-home-overlay__title">
            DRISHTI <span className="dh-home-overlay__title-accent">HIMALAYA</span>
          </h1>

          <p className="dh-home-overlay__tagline">
            Continuous geotechnical hazard monitoring and hydro-meteorological decision support.
          </p>

          <div className="dh-home-overlay__actions">
            <Button
              variant="primary"
              size="md"
              onClick={() => onNavigate('map')}
              leadingIcon={<Compass size={16} />}
            >
              Explore The Himalayas
            </Button>
            <Button
              variant="secondary"
              size="md"
              onClick={() => onNavigate('dashboard')}
              trailingIcon={<ArrowRight size={16} />}
            >
              Real-Time Risk Dashboard
            </Button>
          </div>
        </div>

        <div className="dh-home-overlay__stats">
          <div className="dh-home-overlay__stat">
            <span className="dh-home-overlay__stat-label">HAZARD LEVEL</span>
            <div className="dh-home-overlay__stat-val">
              <span style={{ color: riskAssessment?.colorHex ?? 'var(--risk-low)' }}>
                {currentRiskScore.toFixed(1)}
              </span>
              <Badge
                variant={currentRiskLevel === 'LOW' ? 'low' : currentRiskLevel === 'MODERATE' ? 'moderate' : 'high'}
                size="sm"
                showDot
              >
                {currentRiskLevel}
              </Badge>
            </div>
          </div>
          <div className="dh-home-overlay__stat-divider" />
          <div className="dh-home-overlay__stat">
            <span className="dh-home-overlay__stat-label">PRECIPITATION</span>
            <span className="dh-home-overlay__stat-val-text">{livePrecip.toFixed(1)} mm/h</span>
          </div>
          <div className="dh-home-overlay__stat-divider" />
          <div className="dh-home-overlay__stat">
            <span className="dh-home-overlay__stat-label">RESOLUTION</span>
            <span className="dh-home-overlay__stat-val-text">250m Segments</span>
          </div>
        </div>
      </div>
    </div>
  );
};

