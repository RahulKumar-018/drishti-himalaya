import { createUnavailableTelemetry } from "../services/environmental/telemetry";
import type { CorridorPoint, RouteSegment } from "../types/route";

/**
 * These are interface anchors for the initial visualization only.
 * Replace scenePosition and route geometry with the project's real route data when available.
 */
export const corridorPoints: CorridorPoint[] = [
  { id: "rishikesh", label: "Rishikesh", shortLabel: "RISHI", subtitle: "Gateway / south", progress: 0.05, scenePosition: [-5.7, 1.1], latitude: 30.0869, longitude: 78.2676 },
  { id: "devprayag", label: "Devprayag", shortLabel: "DEV", subtitle: "Confluence / anchor", progress: 0.19, scenePosition: [-3.8, 0.05], latitude: 30.1460, longitude: 78.5980 },
  { id: "srinagar", label: "Srinagar", shortLabel: "SRIN", subtitle: "Valley / corridor", progress: 0.33, scenePosition: [-2.1, -0.8], latitude: 30.2220, longitude: 78.7830 },
  { id: "rudraprayag", label: "Rudraprayag", shortLabel: "RUDRA", subtitle: "Junction / anchor", progress: 0.49, scenePosition: [-0.2, 0.15], latitude: 30.2844, longitude: 78.9811 },
  { id: "karnaprayag", label: "Karnaprayag", shortLabel: "KARNA", subtitle: "Confluence / north", progress: 0.65, scenePosition: [1.55, -0.7], latitude: 30.2588, longitude: 79.2669 },
  { id: "chamoli", label: "Chamoli", shortLabel: "CHAM", subtitle: "Upper valley", progress: 0.80, scenePosition: [3.25, 0.25], latitude: 30.4040, longitude: 79.3200 },
  { id: "joshimath", label: "Joshimath", shortLabel: "JOSH", subtitle: "High corridor", progress: 0.85, scenePosition: [5.05, -0.65], latitude: 30.5560, longitude: 79.5640 },
  { id: "badrinath", label: "Badrinath", shortLabel: "BADRI", subtitle: "Alaknanda shrine / terminus", progress: 0.98, scenePosition: [6.1, 0.4], latitude: 30.7433, longitude: 79.4938 },
];

export const corridorSegments: RouteSegment[] = corridorPoints.slice(0, -1).map((point, index) => {
  const destination = corridorPoints[index + 1];
  return {
    id: `nh7-segment-${String(index + 1).padStart(2, "0")}`,
    index: index + 1,
    startPointId: point.id,
    destinationPointId: destination.id,
    from: point.label,
    to: destination.label,
    label: `${point.label} → ${destination.label}`,
    progressStart: point.progress,
    progressEnd: destination.progress,
    telemetry: createUnavailableTelemetry("Open-Meteo / awaiting connection"),
    risk: null,
    terrainState: "UNASSESSED",
  };
});

export function findPoint(id: string | null) {
  return corridorPoints.find((point) => point.id === id) ?? null;
}

export function getSegmentSpan(startPointId: string, destinationPointId: string) {
  const startIndex = corridorPoints.findIndex((point) => point.id === startPointId);
  const destinationIndex = corridorPoints.findIndex((point) => point.id === destinationPointId);
  if (startIndex < 0 || destinationIndex < 0 || startIndex === destinationIndex) return [];
  const lower = Math.min(startIndex, destinationIndex);
  const upper = Math.max(startIndex, destinationIndex);
  return corridorSegments.filter((segment) => segment.index >= lower + 1 && segment.index <= upper);
}
