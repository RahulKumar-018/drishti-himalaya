import React from 'react';
import clsx from 'clsx';
import { Layers } from 'lucide-react';
import { TopNav, NavItemKey } from './TopNav';
import { CorridorStatus } from './CorridorStatus';
import { Footer } from './Footer';
import { RiskAssessment } from '../../services/risk/types';
import { EnvironmentalData } from '../../services/environmental/types';
import { CorridorSegmentRisk } from '../../services/risk/segmentRiskService';
import { DrishtiTerrainScene } from '../visualization/DrishtiTerrainScene';
import { IntroSequence } from '../experience/IntroSequence';
import { CinematicHUD } from './CinematicHUD';
import { IntelligenceDrawer } from '../experience/IntelligenceDrawer';

export interface AppShellProps {
  children?: React.ReactNode;
  activeNav?: NavItemKey;
  onNavClick?: (key: NavItemKey) => void;
  systemStatusText?: string;
  riskAssessment?: RiskAssessment | null;
  envData?: EnvironmentalData | null;
  scenarioPrecipitation?: number | null;
  onScenarioChange?: (val: number | null) => void;
  isLoadingRisk?: boolean;
  isRiskError?: boolean;
  showCorridorStatus?: boolean;
  className?: string;
  segments?: CorridorSegmentRisk[];
  selectedSegmentId?: string | null;
  onSelectSegment?: (segment: CorridorSegmentRisk | null) => void;
}

export const AppShell: React.FC<AppShellProps> = ({
  children,
  activeNav = 'home',
  onNavClick,
  systemStatusText,
  riskAssessment,
  envData,
  scenarioPrecipitation,
  onScenarioChange,
  isLoadingRisk,
  isRiskError,
  showCorridorStatus,
  className,
  segments = [],
  selectedSegmentId = null,
  onSelectSegment,
}) => {
  // Determine if corridor status bar should be shown
  const shouldShowCorridor =
    showCorridorStatus !== undefined
      ? showCorridorStatus
      : activeNav === 'map' || activeNav === 'corridor';

  // Cinematic mode is active when user selects 'terrain' tab
  const isCinematicMode = activeNav === 'terrain';

  const currentPrecip = scenarioPrecipitation !== null && scenarioPrecipitation !== undefined
    ? scenarioPrecipitation
    : (envData?.rainfall?.precipitation ?? 14.2);

  return (
    <div className={clsx('flex flex-col flex-1 min-h-screen w-full bg-[#0b0f14] text-slate-100 overflow-x-clip box-border', className)}>
      <IntroSequence />

      {/* 3D Atmospheric Terrain Scene - Active in 3D Terrain tab */}
      {isCinematicMode && (
        <DrishtiTerrainScene 
          segments={segments}
          selectedSegmentId={selectedSegmentId}
          onSelectSegment={onSelectSegment}
          precipitationMm={currentPrecip}
        />
      )}

      {/* Operational HUD is shown in terrain mode */}
      {isCinematicMode && (
        <CinematicHUD
          riskAssessment={riskAssessment}
          envData={envData}
          onOpenWorkspace={() => onNavClick?.('map')}
        />
      )}

      {/* Slide-In Intelligence Drawer in terrain mode */}
      {isCinematicMode && (
        <IntelligenceDrawer
          segments={segments}
          selectedSegmentId={selectedSegmentId}
          onSelectSegment={onSelectSegment}
          riskAssessment={riskAssessment}
          envData={envData}
          scenarioPrecipitation={scenarioPrecipitation}
          onScenarioChange={onScenarioChange}
        />
      )}

      {/* 1. Global Product Navigation Header - Always available */}
      <TopNav
        activeNav={activeNav}
        onNavClick={onNavClick}
        systemStatusText={systemStatusText}
        riskAssessment={riskAssessment}
        isLoadingRisk={isLoadingRisk}
        isRiskError={isRiskError}
      />

      {/* 2. Contextual Corridor Status Bar */}
      {!isCinematicMode && shouldShowCorridor && <CorridorStatus />}

      {/* 3. Main Application Content Viewport (Only rendered when in traditional tabs) */}
      {!isCinematicMode && (
        <main className="flex-1 flex flex-col relative z-10 box-border w-full" id="main-content">
          {children || (
            <div className="flex-1 flex items-center justify-center p-4 md:p-10 box-border">
              <div className="w-full max-w-[840px] min-h-[280px] md:min-h-[380px] bg-slate-900/45 border border-dashed border-white/10 rounded-md p-6 md:p-8 flex flex-col items-center justify-center text-center box-border">
                <div className="w-[52px] h-[52px] rounded-sm bg-slate-800/65 border border-white/5 flex items-center justify-center text-sky-400 mb-4" aria-hidden="true">
                  <Layers size={28} />
                </div>
                <h2 className="font-sans text-base md:text-lg font-semibold text-slate-100 m-0 mb-2 leading-tight">
                  Geospatial Analysis Workspace
                </h2>
                <p className="font-sans text-xs md:text-sm text-slate-400 max-w-[480px] m-0 mb-4 md:mb-6 leading-relaxed">
                  Interactive route and hazard analysis will appear here.
                </p>
                <div className="font-mono text-xs text-slate-500 bg-slate-900/35 border border-white/5 py-1 px-3 rounded-sm tracking-[0.02em]">
                  Phase 2 Interactive Map &amp; Decision HUD
                </div>
              </div>
            </div>
          )}
        </main>
      )}

      {/* 4. Global Footer */}
      {!isCinematicMode && <Footer onNavigate={(tab) => onNavClick?.(tab as NavItemKey)} />}
    </div>
  );
};
