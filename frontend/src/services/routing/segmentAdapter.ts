/**
 * ==============================================================================
 * DRISHTI-HIMALAYA - SEGMENT ADAPTER
 * Bridges backend GeoJSON segment features (from /api/v1/route/analyze)
 * with the frontend CorridorSegmentRisk and map/inspection models.
 * ==============================================================================
 */

import { RouteSegmentFeature, RouteSegmentProperties } from '../api/types';
import { CorridorSegmentRisk, FactorContributionSummary } from '../risk/segmentRiskService';
import { RiskAssessment, RiskFactor, RiskLevel } from '../risk/types';
import { PilotWaypoint } from '../environmental/corridorConstants';

export const RISK_COLOR_MAP: Record<string, string> = {
  LOW: '#10B981',
  MODERATE: '#F59E0B',
  HIGH: '#F97316',
  SEVERE: '#EF4444',
  INDETERMINATE: '#94A3B8',
};

/**
 * Resolves color token from backend risk_category and color_hex.
 * Never treats UNKNOWN/INDETERMINATE/PARTIAL as LOW.
 */
export function getSegmentColor(category?: string | null, colorHex?: string | null): string {
  if (colorHex && colorHex.startsWith('#')) {
    return colorHex;
  }
  const cat = (category || '').toUpperCase();
  return RISK_COLOR_MAP[cat] || '#94A3B8';
}

/**
 * Converts a backend RouteSegmentFeature into a frontend CorridorSegmentRisk object
 * preserving all exact backend attributes without altering risk calculations.
 */
export function convertBackendFeatureToSegmentRisk(
  feature: RouteSegmentFeature
): CorridorSegmentRisk & { backendProperties: RouteSegmentProperties } {
  const p = feature.properties;
  const coords: [number, number][] = feature.geometry.coordinates.map(
    (pt) => [pt[1], pt[0]] as [number, number]
  );

  const startCoord = coords[0] || [0, 0];
  const endCoord = coords[coords.length - 1] || startCoord;

  const startWp: PilotWaypoint = {
    id: `WP-SEG-${p.segment_index}-START`,
    name: `Km ${p.start_km.toFixed(1)}`,
    coordinate: [startCoord[0], startCoord[1]],
    approxElevationMsl: p.elevation_m ?? 0,
  };

  const endWp: PilotWaypoint = {
    id: `WP-SEG-${p.segment_index}-END`,
    name: `Km ${p.end_km.toFixed(1)}`,
    coordinate: [endCoord[0], endCoord[1]],
    approxElevationMsl: p.elevation_m ?? 0,
  };

  const riskTier = (p.risk_category as RiskLevel) || 'INDETERMINATE';
  const colorHex = getSegmentColor(p.risk_category, p.color_hex);
  const score = p.segment_risk_score ?? 0;

  const factorContributions: FactorContributionSummary[] = [
    {
      id: 'slope',
      name: 'DEM Slope Gradient',
      score: p.slope_degrees ?? null,
      weightPercent: 25,
      contribution: null,
      unit: '°',
    },
    {
      id: 'rainfall',
      name: '24h Precipitation',
      score: p.precipitation_24h_mm ?? p.p24_mm ?? null,
      weightPercent: 25,
      contribution: null,
      unit: 'mm',
    },
    {
      id: 'scars',
      name: 'Historical Landslide Proximity',
      score: p.distance_to_historic_scar_m ?? null,
      weightPercent: 25,
      contribution: null,
      unit: 'm',
    },
    {
      id: 'density',
      name: 'Landslide Density (1km)',
      score: p.scar_density_1km ?? null,
      weightPercent: 15,
      contribution: null,
      unit: 'scars/km²',
    },
    {
      id: 'cut_slope',
      name: 'Road-Cut Slope',
      score: p.is_cut_slope === true ? 100 : p.is_cut_slope === false ? 0 : null,
      weightPercent: 10,
      contribution: null,
      unit: '',
    },
  ];

  const syntheticFactors: RiskFactor[] = [
    {
      id: 'terrain_slope_gradient',
      name: 'DEM Slope Gradient',
      category: 'topographic',
      status: p.slope_degrees !== null && p.slope_degrees !== undefined ? 'active' : 'unavailable',
      score: p.slope_degrees ?? null,
      rawWeight: 0.25,
      normalizedWeight: 0.25,
      weightedContribution: null,
      rawValue: p.slope_degrees ?? null,
      unit: 'degrees',
      thresholdReference: 'Copernicus DEM 30m',
      isProvisional: false,
      explanation: `Slope gradient: ${p.slope_degrees ?? 'Unavailable'}°`,
    },
    {
      id: 'precipitation_intensity',
      name: 'Precipitation (24h)',
      category: 'meteorological',
      status: p.precipitation_24h_mm !== null && p.precipitation_24h_mm !== undefined ? 'active' : 'unavailable',
      score: p.precipitation_24h_mm ?? p.p24_mm ?? null,
      rawWeight: 0.25,
      normalizedWeight: 0.25,
      weightedContribution: null,
      rawValue: p.precipitation_24h_mm ?? p.p24_mm ?? null,
      unit: 'mm',
      thresholdReference: 'Open-Meteo Telemetry',
      isProvisional: false,
      explanation: `Precipitation: ${p.precipitation_24h_mm ?? p.p24_mm ?? 'Unavailable'} mm`,
    },
    {
      id: 'scar_proximity',
      name: 'Landslide Scar Proximity',
      category: 'geotechnical',
      status: 'active',
      score: p.distance_to_historic_scar_m ?? null,
      rawWeight: 0.25,
      normalizedWeight: 0.25,
      weightedContribution: null,
      rawValue: p.distance_to_historic_scar_m ?? null,
      unit: 'm',
      thresholdReference: 'GSI Catalog KD-Tree',
      isProvisional: false,
      explanation: `Distance to scar: ${p.distance_to_historic_scar_m} m`,
    },
  ];

  const syntheticAssessment: RiskAssessment = {
    score: p.segment_risk_score ?? null,
    level: riskTier,
    colorHex: colorHex,
    primaryFactor: syntheticFactors[0],
    factors: syntheticFactors,
    summaryExplanation: p.is_risk_complete
      ? 'Full geotechnical multi-criteria hazard evaluation.'
      : 'Partial hazard evaluation: one or more factors unavailable.',
    dataQuality: {
      rating: p.is_risk_complete ? 'HIGH' : 'MODERATE',
      completenessPercent: p.is_risk_complete ? 100 : 80,
      activeFactorsCount: p.is_risk_complete ? 5 : 4,
      unavailableFactorsCount: p.is_risk_complete ? 0 : 1,
      futureUnassessedFactorsCount: 0,
      telemetryFreshnessSeconds: 0,
      isStale: false,
      caveats: p.missing_features?.length
        ? [`Missing factors: ${p.missing_features.join(', ')}`]
        : [],
    },
    evaluatedAt: new Date().toISOString(),
  };

  const primaryDriver =
    p.is_cut_slope === true
      ? 'Road-Cut Toe Excavation'
      : (p.slope_degrees ?? 0) > 30
      ? 'Critical Slope Gradient (>30°)'
      : (p.distance_to_historic_scar_m ?? 9999) < 250
      ? 'Historical Landslide Proximity'
      : (p.precipitation_24h_mm ?? 0) > 20
      ? 'Precipitation Saturation'
      : 'Baseline Topographic Relief';

  const segmentNumStr = String(p.segment_index + 1).padStart(3, '0');
  const disclaimerText = p.missing_features?.length
    ? `Partial assessment: ${p.missing_features.join(', ')} unavailable. No missing factor assumed safe.`
    : 'Full deterministic geotechnical hazard evaluation.';

  return {
    id: feature.id || `seg_${p.segment_index}`,
    index: p.segment_index,
    name: `Segment #${segmentNumStr} (${p.start_km.toFixed(2)}–${p.end_km.toFixed(2)} km)`,
    startWaypoint: startWp,
    endWaypoint: endWp,
    coordinates: coords,
    distanceKm: p.segment_length_m / 1000,
    gradientDegrees: p.slope_degrees ?? 0,
    gradientPercent: Math.round(Math.tan(((p.slope_degrees ?? 0) * Math.PI) / 180) * 100),
    startElevationM: p.elevation_m ?? 0,
    endElevationM: p.elevation_m ?? 0,
    minElevationM: p.elevation_m ?? 0,
    maxElevationM: p.elevation_m ?? 0,
    riskAssessment: syntheticAssessment,
    riskScore: score,
    riskTier: riskTier,
    colorHex: colorHex,
    primaryDriver: primaryDriver,
    factorContributions: factorContributions,
    dataQualityRating: p.is_risk_complete ? 'FULL' : 'PARTIAL',
    activeFactorsRatio: p.is_risk_complete ? '5/5 Factors' : '4/5 Factors',
    disclaimer: disclaimerText,
    backendProperties: p,
  };
}
