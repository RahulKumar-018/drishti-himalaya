import React, { useState, useMemo } from 'react';
import { MotionConfig } from 'motion/react';
import { AppShell, NavItemKey } from './components/shell';
import {
  HomePage,
  DashboardPage,
  MapWorkspacePage,
  RiskAnalysisPage,
  AlertsPage,
  AboutPage,
} from './pages';
import { useEnvironmentalData, useRiskAssessment, useLocationSelection } from './hooks';
import {
  evaluateRainfallScenario,
  calculateCorridorSegmentRisks,
  CorridorSegmentRisk,
} from './services/risk';
import { CorridorSector } from './components/dashboard/AffectedAreasTable';
import { HazardAlert } from './components/alerts/AlertCard';
import './App.css';

export default function App(): React.JSX.Element {
  // Navigation State
  const [activeTab, setActiveTab] = useState<NavItemKey>('home');

  // Single Authoritative Telemetry & Risk Source of Truth
  const {
    data: envData,
    isLoading,
    isRefreshing,
    isError,
    error,
    lastUpdated,
    refresh,
  } = useEnvironmentalData();

  const liveRiskAssessment = useRiskAssessment(envData);

  // Dynamic Location Selection State (Phase 1 & 2)
  const locationSelection = useLocationSelection();

  // What-If Rainfall Scenario Simulation State (Phase 6)
  const [scenarioPrecipitation, setScenarioPrecipitation] = useState<number | null>(null);

  // Selected Segment State for Interactive Map (Phase 3)
  const [selectedSegment, setSelectedSegment] = useState<CorridorSegmentRisk | null>(null);

  // Pure deterministic scenario evaluation (Zero network requests)
  const scenarioRiskAssessment = useMemo(() => {
    return scenarioPrecipitation !== null
      ? evaluateRainfallScenario(envData, scenarioPrecipitation)
      : null;
  }, [envData, scenarioPrecipitation]);

  // Dynamic corridor risk segmentation (Phase 2 & 3)
  const segments = useMemo(() => {
    return calculateCorridorSegmentRisks(envData, scenarioPrecipitation);
  }, [envData, scenarioPrecipitation]);

  // Navigation Handler with contextual payload routing
  const handleNavigate = (tab: string, context?: unknown) => {
    const targetKey = tab as NavItemKey;
    setActiveTab(targetKey);
    window.scrollTo({ top: 0, behavior: 'smooth' });

    if (context && typeof context === 'object') {
      const ctx = context as { targetSector?: CorridorSector; targetAlert?: HazardAlert };
      if (ctx.targetSector) {
        locationSelection.setDestination({
          id: ctx.targetSector.id,
          name: ctx.targetSector.name,
          latitude: ctx.targetSector.coordinates[0],
          longitude: ctx.targetSector.coordinates[1],
          state: 'Uttarakhand',
          district: ctx.targetSector.district,
          category: 'PILGRIMAGE',
          source: 'curated',
          elevationM: ctx.targetSector.elevationM,
        });
      } else if (ctx.targetAlert) {
        locationSelection.setDestination({
          id: ctx.targetAlert.id,
          name: ctx.targetAlert.location,
          latitude: ctx.targetAlert.coordinates[0],
          longitude: ctx.targetAlert.coordinates[1],
          state: 'Uttarakhand',
          category: 'ROUTE_NODE',
          source: 'custom',
        });
      }
    }
  };

  return (
    <MotionConfig reducedMotion="user">
      <AppShell
        activeNav={activeTab}
        onNavClick={(key) => handleNavigate(key)}
        riskAssessment={liveRiskAssessment}
        isLoadingRisk={isLoading}
        isRiskError={isError}
        showCorridorStatus={activeTab === 'map' || activeTab === 'corridor'}
        segments={segments}
        selectedSegmentId={selectedSegment?.id ?? null}
        onSelectSegment={setSelectedSegment}
      >
        {activeTab === 'home' && (
          <HomePage
            onNavigate={handleNavigate}
            riskAssessment={liveRiskAssessment}
            envData={envData}
            segments={segments}
            selectedSegmentId={selectedSegment?.id ?? null}
            onSelectSegment={setSelectedSegment}
            scenarioPrecipitation={scenarioPrecipitation}
            onScenarioChange={setScenarioPrecipitation}
            scenarioRiskAssessment={scenarioRiskAssessment}
            locationSelection={locationSelection}
          />
        )}

        {activeTab === 'dashboard' && (
          <DashboardPage
            envData={envData}
            riskAssessment={liveRiskAssessment}
            segments={segments}
            isLoading={isLoading}
            isRefreshing={isRefreshing}
            isError={isError}
            lastUpdated={lastUpdated}
            onRefresh={refresh}
            onNavigate={handleNavigate}
          />
        )}

        {(activeTab === 'map' || activeTab === 'corridor') && (
          <MapWorkspacePage
            envData={envData}
            riskAssessment={liveRiskAssessment}
            isLoading={isLoading}
            isRefreshing={isRefreshing}
            isError={isError}
            error={error}
            lastUpdated={lastUpdated}
            onRefresh={refresh}
            segments={segments}
            selectedSegmentId={selectedSegment?.id ?? null}
            onSelectSegment={setSelectedSegment}
            scenarioPrecipitation={scenarioPrecipitation}
            onScenarioChange={setScenarioPrecipitation}
            scenarioRiskAssessment={scenarioRiskAssessment}
            locationSelection={locationSelection}
          />
        )}

        {(activeTab === 'risk-analysis' || activeTab === 'overview') && (
          <RiskAnalysisPage
            riskAssessment={liveRiskAssessment}
            envData={envData}
            scenarioPrecipitation={scenarioPrecipitation}
            onScenarioChange={setScenarioPrecipitation}
          />
        )}

        {activeTab === 'alerts' && (
          <AlertsPage onNavigate={handleNavigate} />
        )}

        {activeTab === 'about' && (
          <AboutPage onNavigate={handleNavigate} />
        )}
      </AppShell>
    </MotionConfig>
  );
}
