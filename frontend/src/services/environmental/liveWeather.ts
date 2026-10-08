import type { CorridorPoint } from "../../types/route";
import type { EnvironmentalTelemetry } from "../../types/environment";
import { createUnavailableTelemetry, normalizeOpenMeteoTelemetry } from "./telemetry";

interface OpenMeteoResponse {
  current?: { time?: string; precipitation?: number; rain?: number; weather_code?: number };
  hourly?: { precipitation_probability?: number[] };
  elevation?: number;
}

export async function fetchOpenMeteoTelemetry(point: CorridorPoint, signal?: AbortSignal): Promise<EnvironmentalTelemetry> {
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", String(point.latitude));
  url.searchParams.set("longitude", String(point.longitude));
  url.searchParams.set("current", "precipitation,rain,weather_code");
  url.searchParams.set("hourly", "precipitation_probability");
  url.searchParams.set("forecast_days", "1");
  url.searchParams.set("timezone", "Asia/Kolkata");

  try {
    const response = await fetch(url, { signal });
    if (!response.ok) throw new Error(`Open-Meteo HTTP ${response.status}`);
    const data = (await response.json()) as OpenMeteoResponse;
    return normalizeOpenMeteoTelemetry({
      source: "Open-Meteo",
      state: "LIVE",
      updatedAt: data.current?.time ?? new Date().toISOString(),
      precipitationMm24h: data.current?.precipitation ?? null,
      rainMm24h: data.current?.rain ?? null,
      probabilityPercent: data.hourly?.precipitation_probability?.[0] ?? null,
      elevationMeters: data.elevation ?? null,
      weatherCode: data.current?.weather_code ?? null,
    });
  } catch {
    return createUnavailableTelemetry("Open-Meteo / unavailable");
  }
}
