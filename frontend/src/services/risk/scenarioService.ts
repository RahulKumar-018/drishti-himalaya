/**
 * ==============================================================================
 * DRISHTI-HIMALAYA - WHAT-IF SCENARIO SIMULATION SERVICE
 * Pure deterministic calculation for hypothetical hydro-meteorological stress tests.
 *
 * SCIENTIFIC CAVEAT & TERMINOLOGY:
 * - "What-If Rainfall Scenario": Pure stress-test simulation, NOT a weather forecast.
 * - Does not mutate live environmental telemetry state.
 * - Evaluates simulated precipitation against existing deterministic thresholds.
 * - Does not predict landslides or model physical slope failure mechanics.
 * ==============================================================================
 */

import { EnvironmentalData } from '../environmental/types';
import { deterministicRiskEngine } from './deterministicRiskEngine';
import { RiskAssessment } from './types';

/**
 * Evaluates hypothetical rainfall intensity against the deterministic risk engine
 * without mutating live telemetry or triggering network requests.
 *
 * @param liveData Live observed environmental telemetry (unmutated)
 * @param scenarioPrecipitationMmH Simulated rainfall rate in mm/h (0 to 100)
 */
export function evaluateRainfallScenario(
  liveData: EnvironmentalData | null,
  scenarioPrecipitationMmH: number
): RiskAssessment {
  const clampedPrecip = Math.max(0, Math.min(150, scenarioPrecipitationMmH));

  if (!liveData) {
    // Construct minimal synthetic telemetry for standalone simulation
    const syntheticData: EnvironmentalData = {
      location: {
        latitude: 30.32,
        longitude: 78.92,
        name: 'NH-7 Corridor Pilot Sector',
      },
      rainfall: {
        latitude: 30.32,
        longitude: 78.92,
        timestamp: new Date().toISOString(),
        precipitation: clampedPrecip,
        precipitationUnit: 'mm/h',
        rain: clampedPrecip,
        showers: 0,
        precipitationProbability: 35,
        weatherCode: clampedPrecip > 25 ? 65 : 61,
        weatherDescription: `Simulated precipitation: ${clampedPrecip.toFixed(1)} mm/h`,
        dailyPrecipitationSum: clampedPrecip * 1.5,
        source: 'What-If Simulation (Not a Forecast)',
        fetchedAt: new Date().toISOString(),
      },
      terrain: null,
      status: 'success',
      error: null,
      metadata: {
        fetchedAt: new Date().toISOString(),
        sources: ['Simulation Stress Test Model'],
      },
    };

    return deterministicRiskEngine.evaluate(syntheticData);
  }

  // Create isolated scenario payload preserving terrain and location, overriding rainfall
  const scenarioTelemetry: EnvironmentalData = {
    ...liveData,
    rainfall: liveData.rainfall
      ? {
          ...liveData.rainfall,
          precipitation: clampedPrecip,
          rain: clampedPrecip,
          dailyPrecipitationSum: Math.max(
            liveData.rainfall.dailyPrecipitationSum ?? 0,
            clampedPrecip * 1.2
          ),
          weatherCode: clampedPrecip >= 25 ? 65 : liveData.rainfall.weatherCode,
          source: 'What-If Simulation (Not a Forecast)',
          weatherDescription: `Simulated precipitation scenario: ${clampedPrecip.toFixed(1)} mm/h`,
        }
      : {
          latitude: liveData.location.latitude,
          longitude: liveData.location.longitude,
          timestamp: new Date().toISOString(),
          precipitation: clampedPrecip,
          precipitationUnit: 'mm/h',
          rain: clampedPrecip,
          showers: 0,
          precipitationProbability: 35,
          weatherCode: clampedPrecip > 25 ? 65 : 61,
          weatherDescription: `Simulated precipitation scenario: ${clampedPrecip.toFixed(1)} mm/h`,
          dailyPrecipitationSum: clampedPrecip * 1.2,
          source: 'What-If Simulation (Not a Forecast)',
          fetchedAt: new Date().toISOString(),
        },
  };

  return deterministicRiskEngine.evaluate(scenarioTelemetry);
}
