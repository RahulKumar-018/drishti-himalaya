import React from 'react';
import clsx from 'clsx';
import { Layers } from 'lucide-react';
import { TopNav, NavItemKey } from './TopNav';
import { CorridorStatus } from './CorridorStatus';
import './AppShell.css';

export interface AppShellProps {
  children?: React.ReactNode;
  activeNav?: NavItemKey;
  onNavClick?: (key: NavItemKey) => void;
  className?: string;
}

export const AppShell: React.FC<AppShellProps> = ({
  children,
  activeNav = 'overview',
  onNavClick,
  className,
}) => {
  return (
    <div className={clsx('dh-app-shell', className)}>
      {/* 1. Global Product Navigation Header */}
      <TopNav activeNav={activeNav} onNavClick={onNavClick} />


      {/* 2. Corridor Context Status Frame */}
      <CorridorStatus />

      {/* 3. Main Application Content Viewport */}
      <main className="dh-app-shell__main" id="main-content">
        {children || (
          <div className="dh-app-shell__workspace-placeholder">
            <div className="dh-app-shell__placeholder-frame">
              <div className="dh-app-shell__placeholder-icon" aria-hidden="true">
                <Layers size={28} />
              </div>
              <h2 className="dh-app-shell__placeholder-title">
                Geospatial Analysis Workspace
              </h2>
              <p className="dh-app-shell__placeholder-subtitle">
                Interactive route and hazard analysis will appear here.
              </p>
              <div className="dh-app-shell__placeholder-badge">
                Reserved for Phase 2 Interactive Map &amp; Decision HUD
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};
