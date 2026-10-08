import React, { useState, useMemo, useEffect, useCallback } from 'react';
import {
  DashboardPage,
  RiskAnalysisPage,
  AlertsPage,
  AboutPage,
} from './pages';
import { useEnvironmentalData, useRiskAssessment, useLocationSelection } from './hooks';
import {
  calculateCorridorSegmentRisks,
  CorridorSegmentRisk,
} from './services/risk';
import { corridorSegmentToRouteSegment } from './services/risk/segmentAdapter';
import { corridorPoints } from './data/corridor';
import { UTTARAKHAND_LOCATIONS } from './data/locations/uttarakhandLocations';
import { CorridorPoint, RouteSegment } from './types/route';
import { EnvironmentalTelemetry } from './types/environment';
import { MonitoringTripApiResponse, TripAlertApiResponse } from './services/api/types';
import { apiClient } from './services/api/apiClient';
import {
  ExperienceProvider,
  useExperience,
} from './components/experience/ExperienceContext';
import { ExperienceNavigation, ActiveView } from './components/experience/ExperienceNavigation';
import { RouteSelector } from './components/experience/RouteSelector';
import { TerrainHUD } from './components/experience/TerrainHUD';
import { IntelligencePanel } from './components/experience/IntelligencePanel';
import { GISIntelligencePanel, InspectedHazardEntity } from './components/experience/GISIntelligencePanel';
import { LocationPoint } from './types/location';
import { SegmentOverlay } from './components/experience/SegmentOverlay';
import { MapModeFallback } from './components/experience/MapModeFallback';
import { IntroSequence } from './components/experience/IntroSequence';
import { DrishtiTerrainScene } from './components/visualization/DrishtiTerrainScene';
import './App.css';

function MainApp(): React.JSX.Element {
  const {
    mode: experienceMode,
    setMode: setExperienceMode,
    theme,
    setTheme,
    setCameraState,
    isPanelOpen,
    setPanelOpen,
    isIntroComplete,
    setIntroComplete,
  } = useExperience();

  // Active view: default is the cinematic 3D Terrain!
  const [viewMode, setViewMode] = useState<ActiveView>('3D');

  const handleViewModeChange = (mode: ActiveView) => {
    setViewMode(mode);
    if (mode !== '3D') {
      setIntroComplete(true);
    }
  };

  // Single Authoritative Telemetry & Risk Source of Truth
  const {
    data: envData,
    isLoading,
    isRefreshing,
    isError,
    lastUpdated,
    refresh,
  } = useEnvironmentalData();

  const liveRiskAssessment = useRiskAssessment(envData);

  // Dynamic Location Selection State (GPS, Search, Real Road Routing)
  const locationSelection = useLocationSelection();

  const [monitoringTrip, setMonitoringTrip] = useState<MonitoringTripApiResponse | null>(null);
  const [monitoringAlerts, setMonitoringAlerts] = useState<TripAlertApiResponse[]>([]);
  const [isMonitoringBusy, setIsMonitoringBusy] = useState(false);
  const [monitoringError, setMonitoringError] = useState<string | null>(null);

  // Set default origin (Rishikesh) and destination (Badrinath) on initial mount if empty
  useEffect(() => {
    if (!locationSelection.origin) {
      const rishi = UTTARAKHAND_LOCATIONS.find((l) => l.id === 'rishikesh');
      if (rishi) locationSelection.setOrigin(rishi);
    }
    if (!locationSelection.destination) {
      const badri = UTTARAKHAND_LOCATIONS.find((l) => l.id === 'badrinath');
      if (badri) locationSelection.setDestination(badri);
    }
  }, [locationSelection]);

  // What-If Rainfall Scenario Simulation State
  const [scenarioPrecipitation, setScenarioPrecipitation] = useState<number | null>(null);

  // Selected Segment State for Interactive Inspection
  const [selectedSegment, setSelectedSegment] = useState<CorridorSegmentRisk | null>(null);
  const [hoveredSegmentId, setHoveredSegmentId] = useState<string | null>(null);

  // Phase 2 Interactive GIS Inspection State (Point of Interest or Hazard Entity)
  const [inspectedLocation, setInspectedLocation] = useState<LocationPoint | null>(null);
  const [inspectedHazard, setInspectedHazard] = useState<InspectedHazardEntity | null>(null);

  // Dynamic corridor risk segmentation (20 segments along NH-7)
  const segments = useMemo(() => {
    return calculateCorridorSegmentRisks(envData, scenarioPrecipitation);
  }, [envData, scenarioPrecipitation]);

  // Adapted segments for SegmentOverlay
  const adaptedRouteSegments: RouteSegment[] = useMemo(() => {
    return segments.map((seg) => corridorSegmentToRouteSegment(seg, envData));
  }, [segments, envData]);

  // Sync selected segment if intelligence panel opened
  useEffect(() => {
    if (isPanelOpen && !selectedSegment && segments.length > 0) {
      setSelectedSegment(segments[0]);
    }
  }, [isPanelOpen, selectedSegment, segments]);

  // Origin & destination corridor point representation for ExperienceNavigation
  const originCorridorPoint: CorridorPoint | null = useMemo(() => {
    if (!locationSelection.origin) return null;
    return {
      id: locationSelection.origin.id,
      label: locationSelection.origin.name,
      shortLabel: locationSelection.origin.name.substring(0, 4).toUpperCase(),
      subtitle: `${locationSelection.origin.district || 'Origin'} / ${
        locationSelection.origin.elevationM ? `${locationSelection.origin.elevationM}m` : 'Himalayas'
      }`,
      progress: 0.05,
      scenePosition: [-5.7, 1.1],
      latitude: locationSelection.origin.latitude,
      longitude: locationSelection.origin.longitude,
    };
  }, [locationSelection.origin]);

  const destCorridorPoint: CorridorPoint | null = useMemo(() => {
    if (!locationSelection.destination) return null;
    return {
      id: locationSelection.destination.id,
      label: locationSelection.destination.name,
      shortLabel: locationSelection.destination.name.substring(0, 4).toUpperCase(),
      subtitle: `${locationSelection.destination.district || 'Destination'} / ${
        locationSelection.destination.elevationM ? `${locationSelection.destination.elevationM}m` : 'Himalayas'
      }`,
      progress: 0.94,
      scenePosition: [5.05, -0.65],
      latitude: locationSelection.destination.latitude,
      longitude: locationSelection.destination.longitude,
    };
  }, [locationSelection.destination]);

  // Environmental telemetry adapter for ExperienceNavigation
  const adaptedTelemetry: EnvironmentalTelemetry = useMemo(() => {
    const livePrecip = envData?.rainfall?.precipitation ?? null;
    return {
      source: 'Open-Meteo & Copernicus DEM',
      state: isError ? 'UNAVAILABLE' : isLoading ? 'PARTIAL' : 'LIVE',
      updatedAt: lastUpdated || new Date().toISOString(),
      precipitationMm24h: livePrecip,
      rainMm24h: livePrecip,
      probabilityPercent: envData?.rainfall?.precipitationProbability ?? null,
      elevationMeters: envData?.terrain?.elevation?.elevation ?? null,
      weatherCode: envData?.rainfall?.weatherCode ?? null,
    };
  }, [envData, isError, isLoading, lastUpdated]);

  const handleSelectSegment = (seg: CorridorSegmentRisk | null) => {
    setSelectedSegment(seg);
    if (seg) {
      setCameraState('segment-focus');
      setPanelOpen(true);
    }
  };

  const handleAnalyzeRoute = () => {
    locationSelection.analyzeRoute();
    setCameraState('route-focus');
  };

  const refreshMonitoringAlerts = useCallback(async () => {
    if (!monitoringTrip) return;
    const alerts = await apiClient.getTripAlerts(monitoringTrip.id);
    if (alerts) {
      setMonitoringAlerts(alerts);
      setMonitoringError(null);
    } else {
      setMonitoringError('Unable to refresh trip alerts.');
    }
  }, [monitoringTrip]);

  const startMonitoring = useCallback(async () => {
    if (!locationSelection.origin || !locationSelection.destination || !locationSelection.activeRoute) {
      setMonitoringError('Analyze a route before starting trip monitoring.');
      return;
    }
    setIsMonitoringBusy(true);
    setMonitoringError(null);
    const trip = await apiClient.createMonitoredTrip({
      origin: {
        latitude: locationSelection.origin.latitude,
        longitude: locationSelection.origin.longitude,
        name: locationSelection.origin.name,
      },
      destination: {
        latitude: locationSelection.destination.latitude,
        longitude: locationSelection.destination.longitude,
        name: locationSelection.destination.name,
      },
    });
    if (!trip) {
      setMonitoringError('Trip monitoring could not be started.');
      setIsMonitoringBusy(false);
      return;
    }
    setMonitoringTrip(trip);
    const reassessment = await apiClient.reassessMonitoredTrip(trip.id);
    if (reassessment?.alert) {
      setMonitoringAlerts([reassessment.alert]);
    } else {
      const alerts = await apiClient.getTripAlerts(trip.id);
      setMonitoringAlerts(alerts ?? []);
    }
    if (!reassessment) {
      setMonitoringError('Monitoring started, but the first risk reassessment is unavailable.');
    }
    setIsMonitoringBusy(false);
  }, [locationSelection.origin, locationSelection.destination, locationSelection.activeRoute, refreshMonitoringAlerts]);

  const updateMonitoringStatus = useCallback(async (status: 'ACTIVE' | 'PAUSED' | 'COMPLETED') => {
    if (!monitoringTrip) return;
    setIsMonitoringBusy(true);
    const updated = await apiClient.updateMonitoredTripStatus(monitoringTrip.id, status);
    if (updated) {
      setMonitoringTrip(updated);
      setMonitoringError(null);
    } else {
      setMonitoringError('Monitoring status could not be updated.');
    }
    setIsMonitoringBusy(false);
  }, [monitoringTrip]);

  useEffect(() => {
    if (!monitoringTrip || monitoringTrip.status !== 'ACTIVE' || (viewMode !== '2D' && viewMode !== 'alerts')) {
      return;
    }
    let cancelled = false;
    const poll = async () => {
      if (cancelled) return;
      await refreshMonitoringAlerts();
    };
    void poll();
    const intervalId = window.setInterval(() => void poll(), 45_000);
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [monitoringTrip, viewMode, refreshMonitoringAlerts]);

  const handleStartChange = (id: string) => {
    const loc = UTTARAKHAND_LOCATIONS.find(
      (l) => l.id === id || l.name.toLowerCase() === id.toLowerCase()
    );
    if (loc) {
      locationSelection.setOrigin(loc);
    } else if (id) {
      locationSelection.setOrigin({
        id,
        name: id,
        latitude: 30.0869,
        longitude: 78.2676,
        state: 'Uttarakhand',
        category: 'ROUTE_NODE',
        source: 'custom',
      });
    }
  };

  const handleDestinationChange = (id: string) => {
    const loc = UTTARAKHAND_LOCATIONS.find(
      (l) => l.id === id || l.name.toLowerCase() === id.toLowerCase()
    );
    if (loc) {
      locationSelection.setDestination(loc);
    } else if (id) {
      locationSelection.setDestination({
        id,
        name: id,
        latitude: 30.7433,
        longitude: 79.4938,
        state: 'Uttarakhand',
        category: 'ROUTE_NODE',
        source: 'custom',
      });
    }
  };

  // 1. Auxiliary Page: Dashboard
  if (viewMode === 'dashboard') {
    return (
      <div className={`experience-shell ${theme === 'bright' ? 'experience-shell--bright' : ''}`}>
        <ExperienceNavigation
          start={originCorridorPoint}
          destination={destCorridorPoint}
          telemetry={adaptedTelemetry}
          routeActive={Boolean(locationSelection.activeRoute || (locationSelection.origin && locationSelection.destination))}
          theme={theme}
          onThemeChange={setTheme}
          backendOnline={!locationSelection.isBackendDegraded}
          riskEngineCalculated={Boolean(liveRiskAssessment?.score !== null)}
          viewMode={viewMode}
          onViewModeChange={handleViewModeChange}
        />
        <div style={{ paddingTop: '120px', height: '100dvh', overflowY: 'auto', background: 'var(--charcoal)', paddingBottom: '60px' }}>
          <DashboardPage
            envData={envData}
            riskAssessment={liveRiskAssessment}
            segments={segments}
            origin={locationSelection.origin}
            destination={locationSelection.destination}
            isLoading={isLoading}
            isRefreshing={isRefreshing}
            isError={isError}
            lastUpdated={lastUpdated}
            onRefresh={refresh}
            onNavigate={(tab) => {
              if (tab === 'map') setViewMode('2D');
              else if (tab === 'home' || tab === 'terrain') setViewMode('3D');
              else setViewMode(tab as ActiveView);
            }}
          />
        </div>
      </div>
    );
  }

  // 2. Auxiliary Page: Risk Calculator
  if (viewMode === 'calculator') {
    return (
      <div className={`experience-shell ${theme === 'bright' ? 'experience-shell--bright' : ''}`}>
        <ExperienceNavigation
          start={originCorridorPoint}
          destination={destCorridorPoint}
          telemetry={adaptedTelemetry}
          routeActive={Boolean(locationSelection.activeRoute || (locationSelection.origin && locationSelection.destination))}
          theme={theme}
          onThemeChange={setTheme}
          backendOnline={!locationSelection.isBackendDegraded}
          riskEngineCalculated={Boolean(liveRiskAssessment?.score !== null)}
          viewMode={viewMode}
          onViewModeChange={handleViewModeChange}
        />
        <div style={{ paddingTop: '120px', height: '100dvh', overflowY: 'auto', background: 'var(--charcoal)', paddingBottom: '60px' }}>
          <RiskAnalysisPage
            riskAssessment={liveRiskAssessment}
            envData={envData}
            origin={locationSelection.origin}
            destination={locationSelection.destination}
            activeRoute={locationSelection.activeRoute}
            segments={segments}
            scenarioPrecipitation={scenarioPrecipitation}
            onScenarioChange={setScenarioPrecipitation}
          />
        </div>
      </div>
    );
  }

  // 3. Auxiliary Page: Alerts
  if (viewMode === 'alerts') {
    return (
      <div className={`experience-shell ${theme === 'bright' ? 'experience-shell--bright' : ''}`}>
        <ExperienceNavigation
          start={originCorridorPoint}
          destination={destCorridorPoint}
          telemetry={adaptedTelemetry}
          routeActive={Boolean(locationSelection.activeRoute || (locationSelection.origin && locationSelection.destination))}
          theme={theme}
          onThemeChange={setTheme}
          backendOnline={!locationSelection.isBackendDegraded}
          riskEngineCalculated={Boolean(liveRiskAssessment?.score !== null)}
          viewMode={viewMode}
          onViewModeChange={handleViewModeChange}
        />
        <div style={{ paddingTop: '120px', height: '100dvh', overflowY: 'auto', background: 'var(--charcoal)', paddingBottom: '60px' }}>
          <AlertsPage
            alerts={monitoringAlerts}
            monitoringTrip={monitoringTrip}
            isLoading={isMonitoringBusy}
            error={monitoringError}
            onRetry={refreshMonitoringAlerts}
            onNavigate={(tab) => {
              if (tab === 'map') setViewMode('2D');
              else if (tab === 'home' || tab === 'terrain') setViewMode('3D');
              else setViewMode(tab as ActiveView);
            }}
          />
        </div>
      </div>
    );
  }

  // 4. Auxiliary Page: About
  if (viewMode === 'about') {
    return (
      <div className={`experience-shell ${theme === 'bright' ? 'experience-shell--bright' : ''}`}>
        <ExperienceNavigation
          start={originCorridorPoint}
          destination={destCorridorPoint}
          telemetry={adaptedTelemetry}
          routeActive={Boolean(locationSelection.activeRoute || (locationSelection.origin && locationSelection.destination))}
          theme={theme}
          onThemeChange={setTheme}
          backendOnline={!locationSelection.isBackendDegraded}
          riskEngineCalculated={Boolean(liveRiskAssessment?.score !== null)}
          viewMode={viewMode}
          onViewModeChange={handleViewModeChange}
        />
        <div style={{ paddingTop: '120px', height: '100dvh', overflowY: 'auto', background: 'var(--charcoal)', paddingBottom: '60px' }}>
          <AboutPage
            onNavigate={(tab) => {
              if (tab === 'map') setViewMode('2D');
              else if (tab === 'home' || tab === 'terrain') setViewMode('3D');
              else setViewMode(tab as ActiveView);
            }}
          />
        </div>
      </div>
    );
  }

  // 5. 2D Leaflet GIS Map with Split Workspace (Map Left 68% / Intelligence Right 32%)
  if (viewMode === '2D') {
    return (
      <div className={`experience-shell ${theme === 'bright' ? 'experience-shell--bright' : ''} experience-shell--map`}>
        {/* Top Experience Navigation */}
        <ExperienceNavigation
          start={originCorridorPoint}
          destination={destCorridorPoint}
          telemetry={adaptedTelemetry}
          routeActive={Boolean(locationSelection.activeRoute || (locationSelection.origin && locationSelection.destination))}
          theme={theme}
          onThemeChange={setTheme}
          backendOnline={!locationSelection.isBackendDegraded}
          riskEngineCalculated={Boolean(liveRiskAssessment?.score !== null)}
          viewMode={viewMode}
          onViewModeChange={handleViewModeChange}
        />

        <div className="gis-split-workspace">
          {/* Dominant GIS Map Workspace */}
          <div className="gis-map-pane">
            <div className="gis-map-canvas-container">
              <MapModeFallback
                originOverride={locationSelection.origin}
                destinationOverride={locationSelection.destination}
                activeRoute={locationSelection.activeRoute}
                segments={segments}
                selectedSegmentId={selectedSegment?.id ?? null}
                onSelectSegment={handleSelectSegment}
                onSetOrigin={(loc) => locationSelection.setOrigin(loc)}
                onSetDestination={(loc) => locationSelection.setDestination(loc)}
                onSelectLocation={(loc) => {
                  setInspectedLocation(loc);
                  setInspectedHazard(null);
                }}
                onSelectHazardEntity={(ent) => {
                  setInspectedHazard(ent);
                  setInspectedLocation(null);
                }}
                liveLocation={locationSelection.liveLocation}
                mode={experienceMode}
              />
            </div>

            {/* Docked Route Selector in 2D Map Pane (Below Map Canvas, Not Obstructing) */}
            <div className="gis-docked-selector-bar">
              <RouteSelector
                startId={locationSelection.origin?.id || 'rishikesh'}
                destinationId={locationSelection.destination?.id || 'badrinath'}
                onStartChange={handleStartChange}
                onDestinationChange={handleDestinationChange}
                onAnalyze={handleAnalyzeRoute}
                routeActive={Boolean(locationSelection.activeRoute)}
                isAnalyzing={locationSelection.isRouting}
                onUseMyLocation={() => locationSelection.useLiveLocationAsOrigin()}
                isLocating={locationSelection.isLocating}
                locationError={locationSelection.locationError}
                validationError={locationSelection.validationError}
              />
            </div>
          </div>

          {/* Right Risk Intelligence Pane (Authoritative Telemetry, MCDA Factors, Weather, Segments) */}
          <div className="gis-intelligence-pane">
            <GISIntelligencePanel
              origin={locationSelection.origin}
              destination={locationSelection.destination}
              activeRoute={locationSelection.activeRoute}
              riskAssessment={liveRiskAssessment}
              envData={envData}
              segments={segments}
              selectedSegment={selectedSegment}
              onSelectSegment={handleSelectSegment}
              theme={theme}
              selectedLocation={inspectedLocation}
              onClearSelectedLocation={() => setInspectedLocation(null)}
              onSetOrigin={(loc) => {
                locationSelection.setOrigin(loc);
                setInspectedLocation(null);
              }}
              onSetDestination={(loc) => {
                locationSelection.setDestination(loc);
                setInspectedLocation(null);
              }}
              inspectedHazard={inspectedHazard}
              onClearInspectedHazard={() => setInspectedHazard(null)}
              isRouting={locationSelection.isRouting}
              routingError={locationSelection.routingError}
              lastUpdated={lastUpdated}
              monitoringTrip={monitoringTrip}
              monitoringAlerts={monitoringAlerts}
              isMonitoringBusy={isMonitoringBusy}
              monitoringError={monitoringError}
              onStartMonitoring={startMonitoring}
              onUpdateMonitoringStatus={updateMonitoringStatus}
            />
          </div>
        </div>
      </div>
    );
  }

  // 6. PRIMARY CINEMATIC 3D HIMALAYAN TERRAIN EXPERIENCE
  return (
    <div className={`experience-shell ${theme === 'bright' ? 'experience-shell--bright' : ''}`}>
      {!isIntroComplete && <IntroSequence />}

      {/* Geospatial 3D Three.js Terrain Stage */}
      <div className="terrain-canvas">
        <DrishtiTerrainScene
          segments={segments}
          selectedSegmentId={selectedSegment?.id ?? null}
          onSelectSegment={handleSelectSegment}
          precipitationMm={envData?.rainfall?.precipitation ?? null}
        />
      </div>
      <div className="terrain-vignette" />
      <div className="grain-layer" />

      {/* Cinematic HUD Layer */}
      <div className="experience-ui experience-ui--ready">
        {/* Top Experience Navigation */}
        <ExperienceNavigation
          start={originCorridorPoint}
          destination={destCorridorPoint}
          telemetry={adaptedTelemetry}
          routeActive={Boolean(locationSelection.activeRoute || (locationSelection.origin && locationSelection.destination))}
          theme={theme}
          onThemeChange={setTheme}
          backendOnline={!locationSelection.isBackendDegraded}
          riskEngineCalculated={Boolean(liveRiskAssessment?.score !== null)}
          viewMode={viewMode}
          onViewModeChange={handleViewModeChange}
        />

        <div className="vertical-rule vertical-rule--left" />
        <div className="vertical-rule vertical-rule--right" />

        {/* Cinematic Hero Copy on overview state in 3D */}
        {!locationSelection.activeRoute && (
          <div className="hero-copy">
            <span className="eyebrow">HIMALAYAN CORRIDOR RISK INTELLIGENCE</span>
            <h1>
              Autonomous route <em>safety</em> in high-relief terrain
            </h1>
            <p>
              Precision hydro-meteorological telemetry, slope stability, and landslide risk scoring across Uttarakhand.
            </p>
          </div>
        )}

        {/* 3D Segment Marker Overlay */}
        <SegmentOverlay
          points={corridorPoints}
          segments={adaptedRouteSegments}
          startId={locationSelection.origin?.id ?? null}
          destinationId={locationSelection.destination?.id ?? null}
          selectedId={selectedSegment?.id ?? null}
          hoveredId={hoveredSegmentId}
          onHover={setHoveredSegmentId}
          onSelect={(rSeg) => {
            const matched = segments.find((s) => s.id === rSeg.id);
            handleSelectSegment(matched || segments[rSeg.index - 1] || null);
          }}
        />

        {/* Bottom Floating Route Selector */}
        <RouteSelector
          startId={locationSelection.origin?.id || 'rishikesh'}
          destinationId={locationSelection.destination?.id || 'badrinath'}
          onStartChange={handleStartChange}
          onDestinationChange={handleDestinationChange}
          onAnalyze={handleAnalyzeRoute}
          routeActive={Boolean(locationSelection.activeRoute)}
          isAnalyzing={locationSelection.isRouting}
          onUseMyLocation={() => locationSelection.useLiveLocationAsOrigin()}
          isLocating={locationSelection.isLocating}
          locationError={locationSelection.locationError}
          validationError={locationSelection.validationError}
        />

        {/* Bottom Terrain HUD & Mode Selector */}
        <TerrainHUD
          mode={experienceMode}
          routeActive={Boolean(locationSelection.activeRoute)}
          hideMeta={false}
          onModeChange={(m) => setExperienceMode(m)}
          analysisMetadata={{
            totalDistanceKm: locationSelection.activeRoute?.metrics.totalDistanceKm || 240,
            compositeRisk: liveRiskAssessment.score,
            scarsCount: 5206,
          }}
        />

        {/* Slide-In Intelligence Panel with Real Backend Telemetry & Risk */}
        {selectedSegment && (
          <IntelligencePanel
            segment={corridorSegmentToRouteSegment(selectedSegment, envData)}
            onClose={() => {
              setSelectedSegment(null);
              setPanelOpen(false);
            }}
          />
        )}
      </div>

      {/* Cinematic Scroll Story */}
      <div className="scroll-story">
        <section className="story-section">
          <span className="eyebrow">PILOT CORRIDOR · NH-7</span>
          <h2>A 240-kilometer arterial lifeline through active Himalayan geology</h2>
          <p>
            Connecting Rishikesh to Joshimath, Badrinath, and border passes across the Alaknanda canyon system.
          </p>
        </section>
        <section className="story-section story-section--plan">
          <span className="eyebrow">HYPSOMETRIC ANALYSIS</span>
          <h2>Precision slope gradient and rainfall saturation intelligence</h2>
          <p>
            Copernicus DEM 30m high-resolution elevation profiling combined with hourly Open-Meteo precipitation streams.
          </p>
        </section>
        <section className="story-section story-section--understand">
          <span className="eyebrow">FIELD SAFETY ASSURANCE</span>
          <h2>Deterministic risk evaluation without speculative claims</h2>
          <p>
            Authoritative multi-criteria decision support calibrated against 5,206 GSI landslide scars and historical road excavations.
          </p>
        </section>
      </div>
    </div>
  );
}

export default function App(): React.JSX.Element {
  return (
    <ExperienceProvider>
      <MainApp />
    </ExperienceProvider>
  );
}
