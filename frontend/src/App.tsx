import React, { useState } from 'react';
import {
  Badge,
  Button,
  Card,
  Container,
  Divider,
  Stack,
} from './components/common';
import { Compass, Play, RefreshCw, AlertTriangle, ShieldCheck } from 'lucide-react';
import './App.css';

export default function App(): React.JSX.Element {
  const [interactiveLoading, setInteractiveLoading] = useState(false);

  const toggleInteractiveLoading = () => {
    setInteractiveLoading(true);
    setTimeout(() => setInteractiveLoading(false), 2000);
  };

  return (
    <div className="dh-shell">
      {/* Top Application Header */}
      <header className="dh-shell__header">
        <Container size="lg" gutter>
          <Stack
            direction="row"
            justify="between"
            align="center"
            wrap
            gap="sm"
          >
            <div className="dh-shell__branding">
              <Stack direction="row" align="center" gap="sm" wrap>
                <h1 className="dh-shell__app-name">Drishti-Himalaya</h1>
                <Badge variant="accent" size="sm" showDot>
                  Phase 1A.3 — Shared UI Primitives
                </Badge>
              </Stack>
              <p className="dh-shell__app-desc">
                AI-Assisted Himalayan Road Hazard Risk Assessment &amp; Safer Route Recommendation System
              </p>
            </div>
            <div className="dh-shell__meta">
              <span className="dh-shell__corridor-tag">Pilot: NH-7 (Rishikesh – Joshimath)</span>
            </div>
          </Stack>
        </Container>
      </header>

      {/* Main Content Area */}
      <main className="dh-shell__main">
        <Container size="lg" gutter>
          <Stack direction="column" gap="lg">
            {/* Card 1: Action Primitives (Button) */}
            <Card
              variant="default"
              title="Action Primitives — Button"
              subtitle="Accessible, typed button components supporting 4 variants, 3 sizes, icon slots, and operational states"
              headerAction={
                <Badge variant="default" size="sm">
                  Atomic Components
                </Badge>
              }
            >
              <Stack direction="column" gap="md">
                {/* Variant Row */}
                <div>
                  <h4 className="dh-demo__group-title">Style Variants</h4>
                  <Stack direction="row" align="center" gap="sm" wrap>
                    <Button
                      variant="primary"
                      leadingIcon={<Play />}
                    >
                      Primary Action
                    </Button>
                    <Button
                      variant="secondary"
                      leadingIcon={<Compass />}
                    >
                      Secondary Action
                    </Button>
                    <Button variant="ghost">
                      Ghost Utility
                    </Button>
                    <Button
                      variant="danger"
                      leadingIcon={<AlertTriangle />}
                    >
                      Danger Action
                    </Button>
                  </Stack>
                </div>

                <Divider orientation="horizontal" variant="subtle" />

                {/* Size Row */}
                <div>
                  <h4 className="dh-demo__group-title">Size Hierarchy</h4>
                  <Stack direction="row" align="center" gap="sm" wrap>
                    <Button
                      size="sm"
                      variant="secondary"
                    >
                      Small (30px)
                    </Button>
                    <Button
                      size="md"
                      variant="secondary"
                    >
                      Medium (38px)
                    </Button>
                    <Button
                      size="lg"
                      variant="secondary"
                      trailingIcon={<ShieldCheck />}
                    >
                      Large (44px)
                    </Button>
                  </Stack>
                </div>

                <Divider orientation="horizontal" variant="subtle" />

                {/* Operational States */}
                <div>
                  <h4 className="dh-demo__group-title">Operational &amp; Interactive States</h4>
                  <Stack direction="row" align="center" gap="sm" wrap>
                    <Button
                      variant="primary"
                      loading={true}
                      loadingText="Processing..."
                    >
                      Loading Static
                    </Button>
                    <Button
                      variant="secondary"
                      disabled
                      leadingIcon={<Compass />}
                    >
                      Disabled State
                    </Button>
                    <Button
                      variant="secondary"
                      loading={interactiveLoading}
                      loadingText="Simulating (2s)..."
                      leadingIcon={<RefreshCw />}
                      onClick={toggleInteractiveLoading}
                    >
                      Click to Test Loading
                    </Button>
                  </Stack>
                </div>
              </Stack>
            </Card>

            {/* Card 2: Layout & Separation Primitives (Container, Stack, Divider) */}
            <Card
              variant="default"
              title="Layout Primitives — Container, Stack &amp; Divider"
              subtitle="Predictable 1D flex spacing, responsive max-width containers, and accessible separators"
            >
              <Stack direction="column" gap="md">
                <div>
                  <h4 className="dh-demo__group-title">Stack Alignment &amp; Vertical Separators</h4>
                  <div className="dh-demo__stack-preview">
                    <Stack
                      direction="row"
                      align="center"
                      justify="between"
                      wrap
                      gap="sm"
                    >
                      <Stack direction="row" align="center" gap="xs">
                        <span className="dh-demo__chip-label">CORRIDOR</span>
                        <span className="dh-demo__chip-val">NH-7 / Rishikesh</span>
                      </Stack>
                      <Divider orientation="vertical" variant="default" />
                      <Stack direction="row" align="center" gap="xs">
                        <span className="dh-demo__chip-label">ELEVATION GAIN</span>
                        <span className="dh-demo__chip-val">+1,420 m</span>
                      </Stack>
                      <Divider orientation="vertical" variant="default" />
                      <Stack direction="row" align="center" gap="xs">
                        <span className="dh-demo__chip-label">TOTAL SEGMENTS</span>
                        <span className="dh-demo__chip-val">184 Elements</span>
                      </Stack>
                      <Divider orientation="vertical" variant="default" />
                      <Badge variant="low" size="sm" showDot>
                        Grid Stable
                      </Badge>
                    </Stack>
                  </div>
                </div>

                <Divider
                  orientation="horizontal"
                  variant="subtle"
                  label="Container Width Tiers"
                />

                <Stack direction="column" gap="xs">
                  <div className="dh-demo__container-tier">
                    <span className="dh-demo__tier-label">sm (640px)</span>
                    <div className="dh-demo__tier-bar dh-demo__tier-bar--sm" />
                  </div>
                  <div className="dh-demo__container-tier">
                    <span className="dh-demo__tier-label">md (840px)</span>
                    <div className="dh-demo__tier-bar dh-demo__tier-bar--md" />
                  </div>
                  <div className="dh-demo__container-tier">
                    <span className="dh-demo__tier-label">lg (1080px — Standard)</span>
                    <div className="dh-demo__tier-bar dh-demo__tier-bar--lg" />
                  </div>
                </Stack>
              </Stack>
            </Card>

            {/* Card 3: Preserved Geotechnical Hazard Risk Classification Scale (Phase 1A.2) */}
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

            {/* Card 4: Preserved Subgrid for Specifications & Telemetry (Phase 1A.2) */}
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
                    <span className="dh-demo__spec-label">Component Primitives</span>
                    <span className="dh-demo__spec-val">Badge, Card, Button, Container, Stack, Divider</span>
                  </div>
                  <div className="dh-demo__spec-row">
                    <span className="dh-demo__spec-label">Accessibility</span>
                    <span className="dh-demo__spec-val">WCAG Focus Rings &amp; ARIA Roles</span>
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
          </Stack>
        </Container>
      </main>

      {/* Subtle Engineering Footer */}
      <footer className="dh-shell__footer">
        <Container size="lg" gutter>
          <Stack direction="row" justify="center" align="center" gap="sm" wrap>
            <span>Drishti-Himalaya Decision Support Platform</span>
            <Divider orientation="vertical" variant="subtle" />
            <span>Phase 1A.3 Verified Shared UI Primitives</span>
          </Stack>
        </Container>
      </footer>
    </div>
  );
}
