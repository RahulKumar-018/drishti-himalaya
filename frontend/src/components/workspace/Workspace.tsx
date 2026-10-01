import React from 'react';
import clsx from 'clsx';
import { MapViewport } from './MapViewport';
import { AnalysisPanel } from './AnalysisPanel';
import './Workspace.css';

export interface WorkspaceProps {
  className?: string;
  mapContent?: React.ReactNode;
  panelContent?: React.ReactNode;
}

export const Workspace: React.FC<WorkspaceProps> = ({
  className,
  mapContent,
  panelContent,
}) => {
  return (
    <div className={clsx('dh-workspace', className)}>
      <div className="dh-workspace__map-region">
        {mapContent || <MapViewport />}
      </div>
      <div className="dh-workspace__panel-region">
        {panelContent || <AnalysisPanel />}
      </div>
    </div>
  );
};
