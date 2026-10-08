/**
 * Atmosphere is currently rendered inside TerrainRenderer so scene lifecycle
 * remains centralized. This named boundary is reserved for future volumetric
 * fog and weather adapters driven by real telemetry.
 */
export interface AtmosphereState {
  precipitationIntensity: number | null;
  mode: "overview" | "environment";
}
