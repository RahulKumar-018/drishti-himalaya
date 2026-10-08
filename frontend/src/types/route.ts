import type { EnvironmentalTelemetry } from "./environment";
import type { RiskOutput } from "./risk";

export interface CorridorPoint {
  id: string;
  label: string;
  shortLabel: string;
  subtitle: string;
  progress: number;
  scenePosition: [number, number];
  latitude: number;
  longitude: number;
}

export interface RouteSegment {
  id: string;
  index: number;
  startPointId: string;
  destinationPointId: string;
  from: string;
  to: string;
  label: string;
  progressStart: number;
  progressEnd: number;
  telemetry: EnvironmentalTelemetry;
  risk: RiskOutput | null;
  terrainState: "ASSESSED" | "UNASSESSED" | "PARTIAL";
  slopeDegrees?: number | null;
  elevationMeters?: number | null;
  isCutSlope?: boolean;
  historicalLandslideCount?: number | null;
  distanceToHistoricScarM?: number | null;
  dominantFactors?: string[];
  geotechnicalAdvisory?: string | null;
  startChainageKm?: number;
  endChainageKm?: number;
}

export type ExperienceMode = "overview" | "route" | "environment" | "terrain" | "risk";
export type VisualTheme = "dark" | "bright";
export type CameraState = "intro" | "overview" | "route-focus" | "segment-focus";
