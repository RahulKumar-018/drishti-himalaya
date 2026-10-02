/**
 * ==============================================================================
 * DRISHTI-HIMALAYA - SEGMENT RISK SERVICE
 * Authoritative corridor segmentation, terrain gradient derivation, and
 * deterministic risk scoring per corridor sector.
 *
 * SCIENTIFIC CAVEAT & TERMINOLOGY:
 * - Terminology: "Terrain Corridor Risk" / "Corridor Segment Risk".
 * - This evaluates terrain gradient along the straight control-point polyline
 *   between corridor waypoints, combined with live environmental telemetry.
 * - This does NOT represent physical road alignment gradient or predict landslides.
 * - Hydro-meteorological inputs are shared corridor-wide while terrain varies by segment.
 * ==============================================================================
 */

import { EnvironmentalData } from '../environmental/types';
import {
  PILOT_CORRIDOR_WAYPOINTS,
  PilotWaypoint,
} from '../environmental/corridorConstants';
import { haversineDistance } from '../environmental/terrainService';
import { deterministicRiskEngine } from './deterministicRiskEngine';
import { RISK_TIER_CONFIG } from './riskConfig';
import { RiskAssessment, RiskLevel } from './types';

export interface FactorContributionSummary {
  readonly id: string;
  readonly name: string;
  readonly score: number | null;
  readonly weightPercent: number;
  readonly contribution: number | null;
  readonly unit: string;
}

export interface CorridorSegmentRisk {
  readonly id: string; // e.g. "SEGMENT 01"
  readonly index: number; // 0..19
  readonly name: string; // e.g. "Rishikesh → Shivpuri"
  readonly startWaypoint: PilotWaypoint;
  readonly endWaypoint: PilotWaypoint;
  readonly coordinates: [number, number][]; // Leaflet Polyline coordinates
  readonly distanceKm: number;
  readonly gradientDegrees: number;
  readonly gradientPercent: number;
  readonly startElevationM: number;
  readonly endElevationM: number;
  readonly minElevationM: number;
  readonly maxElevationM: number;
  readonly riskAssessment: RiskAssessment;
  readonly riskScore: number;
  readonly riskTier: RiskLevel;
  readonly colorHex: string;
  readonly primaryDriver: string;
  readonly factorContributions: readonly FactorContributionSummary[];
  readonly dataQualityRating: string;
  readonly activeFactorsRatio: string;
  readonly disclaimer: string;
}

/**
 * Calculates deterministic risk and terrain metrics for each segment along the pilot corridor.
 *
 * @param envData Current environmental telemetry (live or synthetic)
 * @param scenarioPrecipitationMmH Optional what-if rainfall intensity override
 */
export function calculateCorridorSegmentRisks(
  envData: EnvironmentalData | null,
  scenarioPrecipitationMmH?: number | null
): CorridorSegmentRisk[] {
  const waypoints = PILOT_CORRIDOR_WAYPOINTS;
  const denseSamples = envData?.terrain?.terrainProfile?.samples;

  const segments: CorridorSegmentRisk[] = [];

  for (let i = 0; i < waypoints.length - 1; i++) {
    const wpStart = waypoints[i];
    const wpEnd = waypoints[i + 1];

    const startCoord = wpStart.coordinate;
    const endCoord = wpEnd.coordinate;

    // 1. Resolve geometry and distance
    const distMeters = haversineDistance(
      startCoord[0],
      startCoord[1],
      endCoord[0],
      endCoord[1]
    );
    const distanceKm = Math.round((distMeters / 1000) * 10) / 10;

    // 2. Extract or interpolate elevations from DEM dense profile or waypoint benchmarks
    let startElev = wpStart.approxElevationMsl;
    let endElev = wpEnd.approxElevationMsl;
    let intermediateCoords: [number, number][] = [startCoord, endCoord];

    if (denseSamples && denseSamples.length > 0) {
      // Find samples along this corridor segment by proximity
      const sectorSamples = denseSamples.filter((s) => {
        const dToStart = haversineDistance(
          s.coordinate.latitude,
          s.coordinate.longitude,
          startCoord[0],
          startCoord[1]
        );
        const dToEnd = haversineDistance(
          s.coordinate.latitude,
          s.coordinate.longitude,
          endCoord[0],
          endCoord[1]
        );
        // Sample lies within the bounding sphere of the segment with a slight buffer
        return dToStart + dToEnd <= distMeters * 1.08;
      });

      if (sectorSamples.length >= 2) {
        const first = sectorSamples[0];
        const last = sectorSamples[sectorSamples.length - 1];
        if (first.elevation !== null) startElev = Math.round(first.elevation);
        if (last.elevation !== null) endElev = Math.round(last.elevation);

        intermediateCoords = [
          startCoord,
          ...sectorSamples.map((s): [number, number] => [
            s.coordinate.latitude,
            s.coordinate.longitude,
          ]),
          endCoord,
        ];
      }
    }

    const minElev = Math.min(startElev, endElev);
    const maxElev = Math.max(startElev, endElev);
    const avgElev = Math.round((startElev + endElev) / 2);

    // 3. Derive terrain slope gradient along the straight chord segment
    const deltaH = Math.abs(endElev - startElev);
    const gradientRatio = distMeters > 0 ? deltaH / distMeters : 0;
    const gradientPercent = Math.round(gradientRatio * 100 * 10) / 10;
    const gradientRad = Math.atan(gradientRatio);
    const gradientDegrees = Math.round((gradientRad * (180 / Math.PI)) * 10) / 10;

    // 4. Construct segment-specific environmental data model
    // Environmental inputs (rainfall, forecast) are shared corridor-wide,
    // while terrain gradient and elevation relief are specific to this segment.
    const isScenarioActive =
      scenarioPrecipitationMmH !== undefined &&
      scenarioPrecipitationMmH !== null &&
      Number.isFinite(scenarioPrecipitationMmH);

    const effectivePrecipitation = isScenarioActive
      ? Math.max(0, scenarioPrecipitationMmH)
      : (envData?.rainfall?.precipitation ?? 0);

    const segmentEnvData: EnvironmentalData = {
      location: {
        latitude: (startCoord[0] + endCoord[0]) / 2,
        longitude: (startCoord[1] + endCoord[1]) / 2,
        name: `${wpStart.name} → ${wpEnd.name}`,
      },
      rainfall: {
        latitude: (startCoord[0] + endCoord[0]) / 2,
        longitude: (startCoord[1] + endCoord[1]) / 2,
        timestamp: envData?.rainfall?.timestamp ?? new Date().toISOString(),
        precipitation: effectivePrecipitation,
        precipitationUnit: 'mm/h',
        rain: effectivePrecipitation,
        showers: 0,
        precipitationProbability: envData?.rainfall?.precipitationProbability ?? 20,
        weatherCode: envData?.rainfall?.weatherCode ?? 0,
        weatherDescription: isScenarioActive
          ? 'Simulated Precipitation Scenario'
          : (envData?.rainfall?.weatherDescription ?? 'Clear / Telemetry Active'),
        dailyPrecipitationSum: envData?.rainfall?.dailyPrecipitationSum ?? 0,
        source: isScenarioActive
          ? 'Simulation Model (What-if Scenario)'
          : (envData?.rainfall?.source ?? 'Open-Meteo Weather API'),
        fetchedAt: envData?.rainfall?.fetchedAt ?? new Date().toISOString(),
      },
      terrain: {
        elevation: {
          latitude: (startCoord[0] + endCoord[0]) / 2,
          longitude: (startCoord[1] + endCoord[1]) / 2,
          elevation: avgElev,
          elevationUnit: 'm',
          source: 'Copernicus DEM (GLO-90)',
          fetchedAt: new Date().toISOString(),
        },
        slopeDegrees: gradientDegrees,
        routeProfile: {
          totalDistance: distMeters,
          minElevation: minElev,
          maxElevation: maxElev,
          elevationGain: Math.max(0, endElev - startElev),
          elevationLoss: Math.abs(Math.min(0, endElev - startElev)),
          meanGradientPercent: gradientPercent,
          meanGradientDegrees: gradientDegrees,
          peakGradientPercent: gradientPercent,
          peakGradientDegrees: gradientDegrees,
          peakGradientSegmentIndex: 0,
          sampleCount: intermediateCoords.length,
          totalDistanceM: distMeters,
          minElevationMsl: minElev,
          maxElevationMsl: maxElev,
          elevationGainM: Math.max(0, endElev - startElev),
          elevationLossM: Math.abs(Math.min(0, endElev - startElev)),
          meanRouteGradientDegrees: gradientDegrees,
          meanRouteGradientPercent: gradientPercent,
          peakRouteGradientDegrees: gradientDegrees,
          peakRouteGradientPercent: gradientPercent,
          segments: [],
        },
      },
      status: 'success',
      error: null,
      metadata: {
        fetchedAt: new Date().toISOString(),
        sources: ['Copernicus DEM (GLO-90)', 'Open-Meteo Telemetry'],
      },
    };

    // 5. Authoritative deterministic risk evaluation
    const segmentAssessment = deterministicRiskEngine.evaluate(segmentEnvData);

    const riskScore = segmentAssessment.score ?? 0;
    const riskTier = segmentAssessment.level;
    const tierConfig = RISK_TIER_CONFIG[riskTier] || RISK_TIER_CONFIG.LOW;
    const colorHex = tierConfig.colorHex;

    const primaryDriver =
      segmentAssessment.primaryFactor?.name ?? 'Terrain Slope Gradient';

    // 6. Summarize factor contributions
    const factorContributions: FactorContributionSummary[] = segmentAssessment.factors
      .filter((f) => f.status === 'active')
      .map((f) => ({
        id: f.id,
        name: f.name,
        score: f.score,
        weightPercent: Math.round(f.normalizedWeight * 100),
        contribution: f.weightedContribution,
        unit: f.unit,
      }));

    const activeCount = segmentAssessment.dataQuality.activeFactorsCount;
    const totalCount =
      segmentAssessment.dataQuality.activeFactorsCount +
      segmentAssessment.dataQuality.unavailableFactorsCount;
    const activeFactorsRatio = `${activeCount}/${totalCount} Active Telemetry`;

    segments.push({
      id: `SEGMENT ${String(i + 1).padStart(2, '0')}`,
      index: i,
      name: `${wpStart.name} → ${wpEnd.name}`,
      startWaypoint: wpStart,
      endWaypoint: wpEnd,
      coordinates: intermediateCoords,
      distanceKm,
      gradientDegrees,
      gradientPercent,
      startElevationM: startElev,
      endElevationM: endElev,
      minElevationM: minElev,
      maxElevationM: maxElev,
      riskAssessment: segmentAssessment,
      riskScore,
      riskTier,
      colorHex,
      primaryDriver,
      factorContributions,
      dataQualityRating: segmentAssessment.dataQuality.rating,
      activeFactorsRatio,
      disclaimer:
        'Deterministic corridor decision support proxy based on live telemetry and DEM elevation. Does not predict landslides or assess unmeasured geotechnical slope stability.',
    });
  }

  return segments;
}
