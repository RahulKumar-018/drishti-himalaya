/**
 * ==============================================================================
 * DRISHTI-HIMALAYA - RISK ASSESSMENT REACT HOOK
 * Pure reactive hook providing deterministic hazard scoring from environmental telemetry.
 * ==============================================================================
 */

import { useMemo } from 'react';
import { EnvironmentalData } from '../services/environmental/types';
import { RiskAssessment, RiskEngineConfig } from '../services/risk/types';
import { deterministicRiskEngine } from '../services/risk/deterministicRiskEngine';

/**
 * Custom hook that evaluates environmental telemetry using the deterministic risk engine.
 * 
 * - Pure calculation inside useMemo; zero side effects.
 * - Zero network requests.
 * - Safely handles null, loading, partial, or error telemetry.
 * - Guarantees data flow: EnvironmentalData -> useRiskAssessment -> deterministicRiskEngine -> RiskAssessment.
 *
 * @param telemetry Live environmental data payload from useEnvironmentalData
 * @param config Optional risk engine parameter overrides
 */
export function useRiskAssessment(
  telemetry: EnvironmentalData | null,
  config?: Partial<RiskEngineConfig>
): RiskAssessment {
  return useMemo(() => {
    return deterministicRiskEngine.evaluate(telemetry, config);
  }, [telemetry, config]);
}
