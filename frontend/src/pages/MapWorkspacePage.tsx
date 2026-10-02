import React from 'react';
import clsx from 'clsx';
import { Workspace } from '../components/workspace/Workspace';
import { EnvironmentalData } from '../services/environmental/types';
import { RiskAssessment } from '../services/risk/types';
import { CorridorSegmentRisk } from '../services/risk/segmentRiskService';
import { UseLocationSelectionReturn } from '../hooks/useLocationSelection';
import './MapWorkspacePage.css';

export interface MapWorkspacePageProps {
  envData?: EnvironmentalData | null;
  riskAssessment?: RiskAssessment | null;
  isLoading?: boolean;
  isRefreshing?: boolean;
  isError?: boolean;
  error?: string | null;
  lastUpdated?: string | null;
  onRefresh?: () => Promise<void>;
  segments?: CorridorSegmentRisk[];
  selectedSegmentId?: string | null;
  onSelectSegment?: (segment: CorridorSegmentRisk | null) => void;
  scenarioPrecipitation?: number | null;
  onScenarioChange?: (val: number | null) => void;
  scenarioRiskAssessment?: RiskAssessment | null;
  locationSelection?: UseLocationSelectionReturn;
  className?: string;
}

export const MapWorkspacePage: React.FC<MapWorkspacePageProps> = ({
  envData,
  riskAssessment,
  isLoading,
  isRefreshing,
  isError,
  error,
  lastUpdated,
  onRefresh,
  segments,
  selectedSegmentId,
  onSelectSegment,
  scenarioPrecipitation,
  onScenarioChange,
  scenarioRiskAssessment,
  locationSelection,
  className,
}) => {
  return (
    <div className={clsx('dh-map-workspace-page', className)}>
      <Workspace
        envData={envData}
        riskAssessment={riskAssessment}
        isLoading={isLoading}
        isRefreshing={isRefreshing}
        isError={isError}
        error={error}
        lastUpdated={lastUpdated}
        onRefresh={onRefresh}
        segments={segments}
        selectedSegmentId={selectedSegmentId}
        onSelectSegment={onSelectSegment}
        scenarioPrecipitation={scenarioPrecipitation}
        onScenarioChange={onScenarioChange}
        scenarioRiskAssessment={scenarioRiskAssessment}
        locationSelection={locationSelection}
      />
    </div>
  );
};
