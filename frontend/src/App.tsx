import React from 'react';
import { Badge, Card } from './components/common';
import './App.css';

export default function App(): React.JSX.Element {
  return (
    <div className="dh-shell">
      {/* Top Application Header */}
      <header className="dh-shell__header">
        <div className="dh-shell__header-inner">
          <div className="dh-shell__branding">
            <div className="dh-shell__title-row">
              <h1 className="dh-shell__app-name">Drishti-Himalaya</h1>
              <Badge variant="accent" size="sm" showDot>
                Phase 1A.2 — Visual Foundation
              </Badge>
            </div>
            <p className="dh-shell__app-desc">
              AI-Assisted Himalayan Road Hazard Risk Assessment &amp; Safer Route Recommendation System
            </p>
          </div>
          <div className="dh-shell__meta">
            <span className="dh-shell__corridor-tag">Pilot: NH-7 (Rishikesh – Joshimath)</span>
          </div>
        </div>
      </header>

      {/* Main Content Demonstrating Design System */}
      <main className="dh-shell__main">
        <div className="dh-shell__container">
          {/* Primary Demonstration Surface */}
          <Card
            variant="default"
            title="Geotechnical Hazard Risk Classification Scale"
            subtitle="Standardized 250m segment scoring tiers anchored in peer-reviewed Himalayan slope stability thresholds"
            headerAction={
              <Badge variant="default" size="sm">
                MCDA Framework
              </Badge>
            }
          >
            <div className="dh-demo__risk-grid">
              <div className="dh-demo__risk-item">
                <div className="dh-demo__badge-col">
                  <Badge variant="low" size="md" showDot>
                    LOW
                  </Badge>
                </div>
                <div className="dh-demo__risk-info">
                  <span className="dh-demo__risk-range">0.0 – 24.9</span>
                  <span className="dh-demo__risk-desc">Normal mountain travel conditions; stable bedrock slope.</span>
                </div>
              </div>

              <div className="dh-demo__risk-item">
                <div className="dh-demo__badge-col">
                  <Badge variant="moderate" size="md" showDot>
                    MODERATE
                  </Badge>
                </div>
                <div className="dh-demo__risk-info">
                  <span className="dh-demo__risk-range">25.0 – 49.9</span>
                  <span className="dh-demo__risk-desc">Active slope monitoring advised; minor ravelling possible.</span>
                </div>
              </div>

              <div className="dh-demo__risk-item">
                <div className="dh-demo__badge-col">
                  <Badge variant="high" size="md" showDot>
                    HIGH
                  </Badge>
                </div>
                <div className="dh-demo__risk-info">
                  <span className="dh-demo__risk-range">50.0 – 74.9</span>
                  <span className="dh-demo__risk-desc">Debris falls likely under rain; transit delays expected.</span>
                </div>
              </div>

              <div className="dh-demo__risk-item">
                <div className="dh-demo__badge-col">
                  <Badge variant="severe" size="md" showDot>
                    SEVERE
                  </Badge>
                </div>
                <div className="dh-demo__risk-info">
                  <span className="dh-demo__risk-range">75.0 – 100.0</span>
                  <span className="dh-demo__risk-desc">Imminent failure potential; transit strongly discouraged.</span>
                </div>
              </div>
            </div>
          </Card>

          {/* Secondary Demonstration Grid: Surface Elevation & Typography */}
          <div className="dh-demo__subgrid">
            <Card
              variant="elevated"
              title="Design System Specifications"
              subtitle="CSS custom property tokens and typography hierarchy"
            >
              <div className="dh-demo__spec-list">
                <div className="dh-demo__spec-row">
                  <span className="dh-demo__spec-label">Aesthetic Paradigm</span>
                  <span className="dh-demo__spec-val">Dark Geospatial Command Center</span>
                </div>
                <div className="dh-demo__spec-row">
                  <span className="dh-demo__spec-label">Color Standard</span>
                  <span className="dh-demo__spec-val">Locked Geotechnical RGB Palette</span>
                </div>
                <div className="dh-demo__spec-row">
                  <span className="dh-demo__spec-label">Font Family</span>
                  <span className="dh-demo__spec-val">Modern System Sans-Serif Stack</span>
                </div>
                <div className="dh-demo__spec-row">
                  <span className="dh-demo__spec-label">Elevation</span>
                  <span className="dh-demo__spec-val">Restrained 3-tier Surface Depth</span>
                </div>
              </div>
            </Card>

            <Card
              variant="muted"
              title="Telemetry Typography Preview"
              subtitle="Data display format for numerical coordinates and sensor values"
            >
              <div className="dh-demo__telemetry-preview">
                <div className="dh-demo__telemetry-cell">
                  <span className="dh-demo__telemetry-label">SLOPE (HORN)</span>
                  <span className="dh-demo__telemetry-value">44.20°</span>
                </div>
                <div className="dh-demo__telemetry-cell">
                  <span className="dh-demo__telemetry-label">24H RAIN</span>
                  <span className="dh-demo__telemetry-value">68.50 mm</span>
                </div>
                <div className="dh-demo__telemetry-cell">
                  <span className="dh-demo__telemetry-label">SCAR PROX</span>
                  <span className="dh-demo__telemetry-value">85.00 m</span>
                </div>
              </div>
            </Card>
          </div>
        </div>
      </main>

      {/* Subtle Engineering Footer */}
      <footer className="dh-shell__footer">
        <div className="dh-shell__footer-inner">
          <span>Drishti-Himalaya Decision Support Platform</span>
          <span className="dh-shell__footer-sep">•</span>
          <span>Phase 1A.2 Verified Design Tokens</span>
        </div>
      </footer>
    </div>
  );
}
