export type DataState =
  | "LIVE"
  | "CALCULATED"
  | "UNASSESSED"
  | "FUTURE/PLANNED"
  | "STALE"
  | "ERROR"
  | "UNAVAILABLE"
  | "PARTIAL"
  | "ONLINE"
  | "OFFLINE";

export interface EnvironmentalTelemetry {
  source: string;
  state: DataState;
  updatedAt: string | null;
  precipitationMm24h: number | null;
  rainMm24h: number | null;
  probabilityPercent: number | null;
  elevationMeters: number | null;
  weatherCode: number | null;
}

export const DATA_UNAVAILABLE = "DATA UNAVAILABLE";
