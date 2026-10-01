import React from 'react';
import clsx from 'clsx';
import { Mountain } from 'lucide-react';
import './TopNav.css';

export type NavItemKey = 'overview' | 'risk-analysis' | 'corridor';

export interface NavItemConfig {
  key: NavItemKey;
  label: string;
  isAvailable: boolean;
}

export interface TopNavProps {
  activeNav?: NavItemKey;
  onNavClick?: (key: NavItemKey) => void;
  systemStatusText?: string;
  className?: string;
}

const NAV_ITEMS: readonly NavItemConfig[] = [
  { key: 'overview', label: 'Overview', isAvailable: true },
  { key: 'risk-analysis', label: 'Risk Analysis', isAvailable: false },
  { key: 'corridor', label: 'Corridor', isAvailable: false },
] as const;

export const TopNav: React.FC<TopNavProps> = ({
  activeNav = 'overview',
  onNavClick,
  systemStatusText = 'SYSTEM READY',
  className,
}) => {
  const handleNavClick = (item: NavItemConfig) => {
    // In Phase 1B.1, routing is not yet active. We avoid fake navigation behavior.
    if (item.isAvailable && onNavClick) {
      onNavClick(item.key);
    }
  };

  return (
    <header className={clsx('dh-topnav', className)}>
      <div className="dh-topnav__container">
        {/* Left: Product Identity Lockup */}
        <div className="dh-topnav__brand">
          <div className="dh-topnav__mark" aria-hidden="true">
            <Mountain size={18} className="dh-topnav__mark-icon" />
          </div>
          <div className="dh-topnav__identity">
            <h1 className="dh-topnav__title">DRISHTI-HIMALAYA</h1>
            <span className="dh-topnav__subtitle">ROAD HAZARD DECISION SUPPORT</span>
          </div>
        </div>

        {/* Center: Primary Navigation (Visually present, non-functional in Phase 1B.1) */}
        <nav className="dh-topnav__nav" aria-label="Primary Navigation">
          <ul className="dh-topnav__nav-list">
            {NAV_ITEMS.map((item) => {
              const isActive = activeNav === item.key;
              return (
                <li key={item.key} className="dh-topnav__nav-item">
                  <button
                    type="button"
                    className={clsx('dh-topnav__nav-btn', {
                      'dh-topnav__nav-btn--active': isActive,
                      'dh-topnav__nav-btn--inactive': !item.isAvailable,
                    })}
                    onClick={() => handleNavClick(item)}
                    aria-current={isActive ? 'page' : undefined}
                    aria-disabled={!item.isAvailable ? 'true' : undefined}
                    title={
                      item.isAvailable
                        ? 'Active Analysis Workspace'
                        : 'Analysis view planned for upcoming phase'
                    }
                  >
                    {item.label}
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* Right: Technical System State Indicator */}
        <div className="dh-topnav__status">
          <div
            className="dh-topnav__status-indicator"
            role="status"
            aria-label={`System status: ${systemStatusText}`}
          >
            <span className="dh-topnav__status-dot" aria-hidden="true" />
            <span className="dh-topnav__status-label">{systemStatusText}</span>
          </div>
        </div>
      </div>
    </header>
  );
};

