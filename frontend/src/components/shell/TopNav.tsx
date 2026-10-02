import React, { useState, useEffect } from 'react';
import clsx from 'clsx';
import {
  Mountain,
  Menu,
  X,
  Compass,
  Activity,
  BellRing,
  LayoutDashboard,
  Home,
  Info,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { RiskAssessment } from '../../services/risk/types';
import './TopNav.css';

export type NavItemKey =
  | 'home'
  | 'overview'
  | 'dashboard'
  | 'map'
  | 'corridor'
  | 'risk-analysis'
  | 'alerts'
  | 'about';

export interface NavItemConfig {
  key: NavItemKey;
  label: string;
  icon?: React.ReactNode;
  isAvailable: boolean;
}

export interface TopNavProps {
  activeNav?: NavItemKey;
  onNavClick?: (key: NavItemKey) => void;
  systemStatusText?: string;
  riskAssessment?: RiskAssessment | null;
  isLoadingRisk?: boolean;
  isRiskError?: boolean;
  className?: string;
}

export const NAV_ITEMS: readonly NavItemConfig[] = [
  { key: 'home', label: 'Home', icon: <Home size={14} />, isAvailable: true },
  { key: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard size={14} />, isAvailable: true },
  { key: 'map', label: 'Corridor Map', icon: <Compass size={14} />, isAvailable: true },
  { key: 'risk-analysis', label: 'Risk Analysis', icon: <Activity size={14} />, isAvailable: true },
  { key: 'alerts', label: 'Alerts', icon: <BellRing size={14} />, isAvailable: true },
  { key: 'about', label: 'About', icon: <Info size={14} />, isAvailable: true },
] as const;

export const TopNav: React.FC<TopNavProps> = ({
  activeNav = 'home',
  onNavClick,
  systemStatusText,
  riskAssessment,
  isLoadingRisk = false,
  isRiskError = false,
  className,
}) => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isOnline, setIsOnline] = useState<boolean>(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Normalize active key for backwards compatibility
  const normalizedActiveKey =
    activeNav === 'overview' ? 'home' : activeNav === 'corridor' ? 'map' : activeNav;

  // Resolve status text and color from authoritative risk engine assessment
  let displayStatusText: string;
  let statusDotColor: string = 'var(--accent-primary)';

  if (systemStatusText !== undefined) {
    displayStatusText = systemStatusText;
  } else if (isLoadingRisk && (!riskAssessment || riskAssessment.score === null)) {
    displayStatusText = 'RISK: CALCULATING';
    statusDotColor = '#eab308';
  } else if (
    isRiskError ||
    !riskAssessment ||
    riskAssessment.score === null ||
    riskAssessment.level === 'INDETERMINATE'
  ) {
    displayStatusText = 'RISK: UNAVAILABLE';
    statusDotColor = '#64748b';
  } else {
    displayStatusText = `RISK: ${riskAssessment.level} · ${riskAssessment.score.toFixed(1)}`;
    statusDotColor = riskAssessment.colorHex;
  }

  const handleItemClick = (key: NavItemKey) => {
    setIsMobileMenuOpen(false);
    if (onNavClick) {
      onNavClick(key);
    }
  };

  return (
    <header className={clsx('dh-topnav', className)}>
      <div className="dh-topnav__container">
        {/* Left: Product Identity Lockup */}
        <div
          className="dh-topnav__brand"
          onClick={() => handleItemClick('home')}
          role="button"
          tabIndex={0}
          title="Return to Drishti Himalaya Home"
        >
          <div className="dh-topnav__mark" aria-hidden="true">
            <Mountain size={18} className="dh-topnav__mark-icon" />
          </div>
          <div className="dh-topnav__identity">
            <h1 className="dh-topnav__title">DRISHTI-HIMALAYA</h1>
            <span className="dh-topnav__subtitle">ROAD HAZARD DECISION SUPPORT</span>
          </div>
        </div>

        {/* Center: Desktop Navigation Bar */}
        <nav className="dh-topnav__nav" aria-label="Primary Navigation">
          <ul className="dh-topnav__nav-list">
            {NAV_ITEMS.map((item) => {
              const isActive = normalizedActiveKey === item.key;
              return (
                <li key={item.key} className="dh-topnav__nav-item">
                  <button
                    type="button"
                    className={clsx('dh-topnav__nav-btn', {
                      'dh-topnav__nav-btn--active': isActive,
                      'dh-topnav__nav-btn--inactive': !item.isAvailable,
                    })}
                    onClick={() => handleItemClick(item.key)}
                    aria-current={isActive ? 'page' : undefined}
                    aria-disabled={!item.isAvailable ? 'true' : undefined}
                  >
                    <span className="dh-topnav__btn-icon" aria-hidden="true">
                      {item.icon}
                    </span>
                    <span>{item.label}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* Right: Technical System State Indicator & Mobile Toggle */}
        <div className="dh-topnav__right-group">
          {/* Network / Telemetry Status (Honest Offline Caveat) */}
          <div
            className={clsx('dh-topnav__net-status', {
              'dh-topnav__net-status--online': isOnline,
              'dh-topnav__net-status--offline': !isOnline,
            })}
            title={
              isOnline
                ? 'Network active · Live Open-Meteo & Copernicus DEM telemetry available'
                : 'Connection unavailable · Offline tile caching planned for PWA release'
            }
            role="status"
            aria-label={isOnline ? 'Telemetry online' : 'Connection unavailable'}
          >
            {isOnline ? (
              <>
                <Wifi size={12} className="dh-topnav__net-icon" aria-hidden="true" />
                <span className="dh-topnav__net-text">ONLINE</span>
              </>
            ) : (
              <>
                <WifiOff size={12} className="dh-topnav__net-icon dh-topnav__net-icon--offline" aria-hidden="true" />
                <span className="dh-topnav__net-text">OFFLINE</span>
              </>
            )}
          </div>

          <div className="dh-topnav__status">
            <div
              className="dh-topnav__status-indicator"
              role="status"
              aria-label={`Hazard risk status: ${displayStatusText}`}
            >
              <span
                className="dh-topnav__status-dot"
                style={{
                  backgroundColor: statusDotColor,
                  boxShadow: `0 0 0 2px ${statusDotColor}33`,
                }}
                aria-hidden="true"
              />
              <span className="dh-topnav__status-label">{displayStatusText}</span>
            </div>
          </div>

          {/* Mobile Menu Hamburger Toggle */}
          <button
            type="button"
            className="dh-topnav__mobile-toggle"
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            aria-expanded={isMobileMenuOpen}
            aria-label={isMobileMenuOpen ? 'Close Navigation Menu' : 'Open Navigation Menu'}
          >
            {isMobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>

      {/* Mobile Drawer Navigation Menu */}
      {isMobileMenuOpen && (
        <nav className="dh-topnav__mobile-drawer" aria-label="Mobile Navigation">
          <ul className="dh-topnav__mobile-list">
            {NAV_ITEMS.map((item) => {
              const isActive = normalizedActiveKey === item.key;
              return (
                <li key={item.key} className="dh-topnav__mobile-item">
                  <button
                    type="button"
                    className={clsx('dh-topnav__mobile-btn', {
                      'dh-topnav__mobile-btn--active': isActive,
                    })}
                    onClick={() => handleItemClick(item.key)}
                    aria-current={isActive ? 'page' : undefined}
                  >
                    <span className="dh-topnav__mobile-icon">{item.icon}</span>
                    <span>{item.label}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>
      )}
    </header>
  );
};
