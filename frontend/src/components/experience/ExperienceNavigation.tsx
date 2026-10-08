import type { CorridorPoint, VisualTheme } from "../../types/route";
import { TelemetryStatus } from "./TelemetryStatus";
import type { EnvironmentalTelemetry } from "../../types/environment";

export type ActiveView = "3D" | "2D" | "dashboard" | "calculator" | "alerts" | "about";

interface ExperienceNavigationProps {
  start: CorridorPoint | null;
  destination: CorridorPoint | null;
  telemetry: EnvironmentalTelemetry;
  routeActive: boolean;
  theme: VisualTheme;
  onThemeChange: (theme: VisualTheme) => void;
  backendOnline?: boolean;
  riskEngineCalculated?: boolean;
  viewMode?: ActiveView;
  onViewModeChange?: (mode: ActiveView) => void;
}

export function ExperienceNavigation({
  start,
  destination,
  telemetry,
  routeActive,
  theme,
  onThemeChange,
  backendOnline = false,
  riskEngineCalculated = false,
  viewMode = "3D",
  onViewModeChange,
}: ExperienceNavigationProps) {
  return (
    <header className="top-navigation">
      <div 
        className="wordmark" 
        aria-label="Drishti Himalaya" 
        onClick={() => onViewModeChange?.("3D")}
        style={{ cursor: 'pointer', pointerEvents: 'auto' }}
      >
        <span className="wordmark-notch" aria-hidden="true" />
        <div>
          <span className="wordmark-primary">DRISHTI</span>
          <span className="wordmark-secondary">HIMALAYA</span>
        </div>
        <span className="wordmark-descriptor">HIMALAYAN ROAD INTELLIGENCE</span>
      </div>

      <div className="corridor-context" style={{ pointerEvents: 'auto' }}>
        <span className="eyebrow">NH-7 / SELECTED CORRIDOR</span>
        <strong>{routeActive && start && destination ? `${start.label} → ${destination.label}` : "SELECT YOUR CORRIDOR"}</strong>
        <span className="context-subline">{routeActive ? "LIVE ENVIRONMENTAL TELEMETRY" : "START POINT + DESTINATION"}</span>

        {onViewModeChange && (
          <nav className="corridor-nav-links" style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '8px' }}>
            <button 
              type="button" 
              className={viewMode === "3D" ? "theme-button theme-button--active" : "theme-button"} 
              onClick={() => onViewModeChange("3D")}
              style={{ letterSpacing: '0.14em', fontSize: '9px', fontWeight: viewMode === "3D" ? 600 : 400 }}
            >
              3D TERRAIN
            </button>
            <span className="theme-divider">/</span>
            <button 
              type="button" 
              className={viewMode === "2D" ? "theme-button theme-button--active" : "theme-button"} 
              onClick={() => onViewModeChange("2D")}
              style={{ letterSpacing: '0.14em', fontSize: '9px', fontWeight: viewMode === "2D" ? 600 : 400 }}
            >
              2D GIS MAP
            </button>
            <span className="theme-divider">/</span>
            <button 
              type="button" 
              className={viewMode === "dashboard" ? "theme-button theme-button--active" : "theme-button"} 
              onClick={() => onViewModeChange("dashboard")}
              style={{ letterSpacing: '0.14em', fontSize: '9px', fontWeight: viewMode === "dashboard" ? 600 : 400 }}
            >
              DASHBOARD
            </button>
            <span className="theme-divider">/</span>
            <button 
              type="button" 
              className={viewMode === "calculator" ? "theme-button theme-button--active" : "theme-button"} 
              onClick={() => onViewModeChange("calculator")}
              style={{ letterSpacing: '0.14em', fontSize: '9px', fontWeight: viewMode === "calculator" ? 600 : 400 }}
            >
              CALCULATOR
            </button>
            <span className="theme-divider">/</span>
            <button 
              type="button" 
              className={viewMode === "alerts" ? "theme-button theme-button--active" : "theme-button"} 
              onClick={() => onViewModeChange("alerts")}
              style={{ letterSpacing: '0.14em', fontSize: '9px', fontWeight: viewMode === "alerts" ? 600 : 400 }}
            >
              ALERTS
            </button>
            <span className="theme-divider">/</span>
            <button 
              type="button" 
              className={viewMode === "about" ? "theme-button theme-button--active" : "theme-button"} 
              onClick={() => onViewModeChange("about")}
              style={{ letterSpacing: '0.14em', fontSize: '9px', fontWeight: viewMode === "about" ? 600 : 400 }}
            >
              ABOUT
            </button>
          </nav>
        )}
      </div>

      <div className="system-status" aria-label="System status">
        <span className="eyebrow">SYSTEM STATUS</span>
        <div className="status-row"><span className={`status-dot status-dot--${backendOnline ? "online" : "offline"}`} /> <span>BACKEND</span><strong>{backendOnline ? "ONLINE" : "OFFLINE"}</strong></div>
        <TelemetryStatus telemetry={telemetry} compact />
        <div className="status-row"><span className={`status-dot status-dot--${riskEngineCalculated ? "calculated" : "unassessed"}`} /> <span>RISK ENGINE</span><strong>{riskEngineCalculated ? "CALCULATED" : "UNASSESSED"}</strong></div>
        
        {onViewModeChange && (
          <div className="theme-switch" role="group" aria-label="View mode">
            <span className="theme-switch-label">PERSPECTIVE</span>
            <button type="button" className={viewMode === "3D" ? "theme-button theme-button--active" : "theme-button"} onClick={() => onViewModeChange("3D")} aria-pressed={viewMode === "3D"}>3D</button>
            <span className="theme-divider">/</span>
            <button type="button" className={viewMode === "2D" ? "theme-button theme-button--active" : "theme-button"} onClick={() => onViewModeChange("2D")} aria-pressed={viewMode === "2D"}>2D</button>
          </div>
        )}

        <div className="theme-switch" role="group" aria-label="Visual theme">
          <span className="theme-switch-label">ATMOSPHERE</span>
          <button type="button" className={theme === "dark" ? "theme-button theme-button--active" : "theme-button"} onClick={() => onThemeChange("dark")} aria-pressed={theme === "dark"}>DARK</button>
          <span className="theme-divider">/</span>
          <button type="button" className={theme === "bright" ? "theme-button theme-button--active" : "theme-button"} onClick={() => onThemeChange("bright")} aria-pressed={theme === "bright"}>BRIGHT</button>
        </div>
      </div>
    </header>
  );
}
