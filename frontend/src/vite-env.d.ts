/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_OPEN_METEO_WEATHER_BASE_URL?: string;
  readonly VITE_OPEN_METEO_ELEVATION_BASE_URL?: string;
  readonly VITE_ENVIRONMENTAL_API_TIMEOUT_MS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
