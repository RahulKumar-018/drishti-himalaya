import React from 'react';
import clsx from 'clsx';
import { MapViewport } from './MapViewport';
import { AnalysisPanel } from './AnalysisPanel';
import { EnvironmentalData } from '../../services/environmental/types';
import { RiskAssessment } from '../../services/risk/types';
import { CorridorSegmentRisk } from '../../services/risk/segmentRiskService';
import { UseLocationSelectionReturn } from '../../hooks/useLocationSelection';
import './Workspace.css';

export interface WorkspaceProps {
  className?: string;
  mapContent?: React.ReactNode;
  panelContent?: React.ReactNode;
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
}

export const Workspace: React.FC<WorkspaceProps> = ({
  className,
  mapContent,
  panelContent,
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
}) => {
  const isSimulated = scenarioPrecipitation !== null && scenarioPrecipitation !== undefined;

  return (
    <div className={clsx('dh-workspace', className)}>
      <div className="dh-workspace__map-region">
        {mapContent || (
          <MapViewport
            envData={envData}
            riskAssessment={isSimulated ? scenarioRiskAssessment ?? riskAssessment : riskAssessment}
            isLoading={isLoading}
            isError={isError}
            segments={segments}
            selectedSegmentId={selectedSegmentId}
            onSelectSegment={onSelectSegment}
            isSimulated={isSimulated}
            scenarioPrecipitation={scenarioPrecipitation}
            onResetScenario={() => onScenarioChange?.(null)}
            locationSelection={locationSelection}
          />
        )}
      </div>
      <div className="dh-workspace__panel-region">
        {panelContent || (
          <AnalysisPanel
            envData={envData}
            riskAssessment={riskAssessment}
            isLoading={isLoading}
            isRefreshing={isRefreshing}
            isError={isError}
            error={error}
            lastUpdated={lastUpdated}
            onRefresh={onRefresh}
            scenarioPrecipitation={scenarioPrecipitation}
            onScenarioChange={onScenarioChange}
            scenarioRiskAssessment={scenarioRiskAssessment}
            locationSelection={locationSelection}
            segments={segments}
            selectedSegmentId={selectedSegmentId}
            onSelectSegment={onSelectSegment}
          />
        )}
      </div>
    </div>
  );
};
