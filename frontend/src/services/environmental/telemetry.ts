import type { EnvironmentalTelemetry } from "../../types/environment";

export function createUnavailableTelemetry(source = "Open-Meteo"): EnvironmentalTelemetry {
  return {
    source,
    state: "UNAVAILABLE",
    updatedAt: null,
    precipitationMm24h: null,
    rainMm24h: null,
    probabilityPercent: null,
    elevationMeters: null,
    weatherCode: null,
  };
}

/**
 * Adapter boundary for the existing Open-Meteo service.
 * A real response should be normalized here; missing fields stay null.
 */
export function normalizeOpenMeteoTelemetry(input: Partial<EnvironmentalTelemetry>): EnvironmentalTelemetry {
  return {
    source: input.source ?? "Open-Meteo",
    state: input.state ?? "PARTIAL",
    updatedAt: input.updatedAt ?? null,
    precipitationMm24h: input.precipitationMm24h ?? null,
    rainMm24h: input.rainMm24h ?? null,
    probabilityPercent: input.probabilityPercent ?? null,
    elevationMeters: input.elevationMeters ?? null,
    weatherCode: input.weatherCode ?? null,
  };
}

export function formatTelemetryValue(value: number | null, suffix = "") {
  return value === null ? "DATA UNAVAILABLE" : `${value}${suffix}`;
}
