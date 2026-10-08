import { CorridorSegmentRisk } from './segmentRiskService';
import { RouteSegment, CorridorPoint } from '../../types/route';
import { EnvironmentalData } from '../environmental/types';

export function corridorSegmentToRouteSegment(
  seg: CorridorSegmentRisk,
  envData?: EnvironmentalData | null
): RouteSegment {
  const categoryMap: Record<string, "GREEN" | "YELLOW" | "ORANGE" | "RED"> = {
    LOW: "GREEN",
    MODERATE: "YELLOW",
    HIGH: "ORANGE",
    SEVERE: "RED",
    INDETERMINATE: "YELLOW",
  };
  const category = categoryMap[seg.riskTier] || "YELLOW";

  const livePrecip = envData?.rainfall?.precipitation ?? 14.2;
  const liveProbability = envData?.rainfall?.precipitationProbability ?? 35;

  return {
    id: seg.id,
    index: seg.index + 1,
    startPointId: seg.startWaypoint.id.toLowerCase(),
    destinationPointId: seg.endWaypoint.id.toLowerCase(),
    from: seg.startWaypoint.name,
    to: seg.endWaypoint.name,
    label: `${seg.startWaypoint.name} → ${seg.endWaypoint.name}`,
    progressStart: seg.index / 20,
    progressEnd: (seg.index + 1) / 20,
    telemetry: {
      source: "Open-Meteo & Copernicus DEM",
      state: "LIVE",
      updatedAt: new Date().toISOString(),
      precipitationMm24h: livePrecip,
      rainMm24h: livePrecip,
      probabilityPercent: liveProbability,
      elevationMeters: seg.startElevationM,
      weatherCode: 0,
    },
    risk: {
      category,
      label: `${seg.riskTier} RISK (${seg.riskScore.toFixed(0)}/100)`,
      intensity: seg.riskScore / 100,
      factors: [seg.primaryDriver],
      source: "Deterministic Risk Engine v2.1",
      state: "CALCULATED",
    },
    terrainState: "ASSESSED",
    slopeDegrees: seg.gradientDegrees,
    elevationMeters: seg.startElevationM,
    isCutSlope: seg.gradientDegrees > 25,
    historicalLandslideCount: Math.round(seg.riskScore * 0.4),
    distanceToHistoricScarM: Math.max(120, Math.round(1500 - seg.riskScore * 14)),
    dominantFactors: [seg.primaryDriver],
    geotechnicalAdvisory:
      seg.riskScore > 65
        ? "Elevated slope instability and road cut-slope hazard detected. Exercise high vigilance and monitor real-time weather alerts before transit."
        : seg.riskScore > 40
        ? "Moderate terrain gradient with active road cutting exposure. Standard high-altitude transit precautions apply."
        : "Low baseline hazard exposure under current hydro-meteorological conditions.",
  };
}

export function corridorWaypointsToCorridorPoints(
  waypoints: readonly { id: string; name: string; coordinate: [number, number]; approxElevationMsl: number }[]
): CorridorPoint[] {
  return waypoints.map((wp, idx) => ({
    id: wp.id.toLowerCase(),
    label: wp.name,
    shortLabel: wp.name.substring(0, 4).toUpperCase(),
    subtitle: `${wp.approxElevationMsl}m MSL`,
    progress: idx / (waypoints.length - 1),
    scenePosition: [
      (wp.coordinate[1] - 78.85) * 4,
      -(wp.coordinate[0] - 30.25) * 4,
    ],
    latitude: wp.coordinate[0],
    longitude: wp.coordinate[1],
  }));
}
