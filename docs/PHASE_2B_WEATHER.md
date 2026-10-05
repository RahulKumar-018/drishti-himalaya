# Phase 2B-W — Open-Meteo Weather Integration

**Status:** Complete & Verified
**Depends on:** Phase 2A (Persistence), Phase 2B (Geospatial & Environmental Pipeline), Phase 2C (Risk Engine)
**Verification:** 433 backend tests passing (0 failed), Live smoke test verified

---

## 1. Executive Summary

Phase 2B-W introduces a production-ready **Open-Meteo weather integration** into Drishti-Himalaya's existing meteorological pipeline.

The integration:
- Adheres strictly to the existing `WeatherProvider` abstraction.
- Preserves the offline `HistoricalWeatherProvider` (IMD climate normals baseline) as an automatic, transparent fallback.
- Derives critical hydro-meteorological indicators: $P_{24}$ (24-hour storm accumulation), $P_{72}$ (72-hour cumulative precipitation), and $ARI$ (15-day Antecedent Rainfall Index with $\lambda = 0.82$ drainage decay).
- Strictly maintains data provenance and distinguishes between current live observations (`is_live = true`, `forecast_time = null`) and future predictions (`is_live = false`, `forecast_time = target_time`).
- Preserves Phase 2C risk assessment formulas and weights ($0.35$ slope, $0.30$ rainfall, $0.20$ historical proximity, $0.10$ historical density, $0.05$ cut-slope exposure) without modification.

---

## 2. Architecture & Data Flow

```text
                        BaseWeatherProvider
                                 │
         ┌───────────────────────┼───────────────────────┐
         ▼                       ▼                       ▼
HistoricalWeatherProvider   ManualWeatherProvider   OpenMeteoProvider
  (IMD Climate Baseline)    (Field Station Report)   (Open-Meteo API)
         │                       │                       │
         └───────────────────────┼───────────────────────┘
                                 ▼
                         WeatherDataService
                    (Centralized Provider Selector)
                                 │
                     ┌───────────┴───────────┐
                     ▼                       ▼
            weather_observations   EnvironmentalFeatureVector
                 (Database)                  │
                                             ▼
                                     SpatialRiskService
                                             │
                                             ▼
                                     HeuristicRiskModel
                                   (Phase 2C Deterministic)
```

The API layer (`/api/locations/{id}/weather`) and the spatial hazard engine (`SpatialRiskService`) communicate exclusively through `WeatherDataService`. No endpoint or risk module instantiates `OpenMeteoProvider` directly.

---

## 3. Provider Implementation (`OpenMeteoProvider`)

### 3.1 Endpoint & Query Configuration

- **API Endpoint:** `https://api.open-meteo.com/v1/forecast`
- **Authentication:** None required (Standard non-commercial Open-Meteo forecast API). No API key or secrets needed.
- **Coordinate Handling:** Completely dynamic; accepts any `(latitude, longitude)` within valid geographic bounds $[-90.0, 90.0] \times [-180.0, 180.0]$. No hard-coded coordinates exist in production code.

### 3.2 Query Parameters

```python
params = {
    "latitude": latitude,
    "longitude": longitude,
    "current": "temperature_2m,relative_humidity_2m,precipitation,rain,snowfall,wind_speed_10m,wind_gusts_10m,weather_code",
    "hourly": "temperature_2m,relative_humidity_2m,precipitation,rain,snowfall,precipitation_probability,wind_speed_10m,wind_gusts_10m,weather_code",
    "past_days": 15,
    "forecast_days": 1,
    "timezone": "auto",
}
```

### 3.3 Metric Units Standard

| Parameter | API Field | Unit | Application Field |
|-----------|-----------|------|-------------------|
| Temperature | `temperature_2m` | °C (Celsius) | `temperature_c` |
| Relative Humidity | `relative_humidity_2m` | % (Percentage) | `humidity_percent` |
| Current Precipitation | `rain` / `precipitation` | mm (Millimeters) | `rainfall_mm` |
| Snowfall | `snowfall` | cm (Centimeters) | `snowfall_cm` |
| Wind Speed | `wind_speed_10m` | km/h (Kilometers/hour) | `wind_speed_kmh` |
| Wind Gusts | `wind_gusts_10m` | km/h (Kilometers/hour) | `wind_gusts_kmh` |
| Weather Condition | `weather_code` | WMO WW Code (0–99) | `weather_code` |
| Precip. Probability | `precipitation_probability` | % (Percentage) | `precipitation_probability` |

---

## 4. Derived Precipitation Features

Landslide initiation in the Himalayas is primarily governed by hydro-meteorological saturation across multiple timescales. Open-Meteo provides 15 past days of hourly precipitation, enabling accurate computation of all three required metrics:

### 4.1 $P_{24}$ — 24-Hour Cumulative Rainfall
Sum of hourly precipitation over the preceding 24 hours up to the current observation hour:
$$P_{24} = \sum_{t=0}^{23} P_{\text{hour}, t} \quad [\text{mm}]$$

### 4.2 $P_{72}$ — 72-Hour Cumulative Rainfall
Sum of hourly precipitation over the preceding 72 hours (3 full days) capturing antecedent storm saturation:
$$P_{72} = \sum_{t=0}^{71} P_{\text{hour}, t} \quad [\text{mm}]$$

### 4.3 Antecedent Rainfall Index ($ARI$)
Reuses the standardized implementation in `backend.app.risk_engine.scoring.calculate_ari`:
$$ARI_t = \sum_{i=1}^{15} \lambda^i \cdot P_{t-i}$$
where:
- $\lambda = 0.82$ (Himalayan soil drainage decay constant per LANDSLIP project standard).
- $P_{t-1}$ is yesterday's 24-hour rainfall total, $P_{t-2}$ is 2 days ago, through $P_{t-15}$ (15 days prior).
- Boundary condition: Missing or negative hourly observations are sanitized to $0.0\,\text{mm}$ without throwing uncaught exceptions.

---

## 5. Strict Provenance & Distinction (Current vs Forecast)

To prevent misrepresenting future numerical weather prediction model runs as verified physical sensor measurements, the system enforces strict provenance semantics:

### 5.1 Current Live Observation
Returned by `OpenMeteoProvider.fetch_weather(lat, lon)`:
```json
{
  "source": "open_meteo",
  "source_type": "weather_api",
  "is_live": true,
  "observation_time": "2026-10-05T20:15:00+00:00",
  "forecast_time": null
}
```

### 5.2 Forecast Prediction
Returned by `OpenMeteoProvider.fetch_forecast(lat, lon, target_time)`:
```json
{
  "source": "open_meteo",
  "source_type": "weather_api",
  "is_live": false,
  "observation_time": "2026-10-05T14:54:12+00:00",
  "forecast_time": "2026-10-06T12:00:00+00:00"
}
```

### 5.3 Historical Baseline Fallback
Returned when the remote Open-Meteo API is unreachable, times out, or fails:
```json
{
  "source": "Historical Uttarakhand Meteorological Baseline",
  "source_type": "historical_dataset",
  "is_live": false,
  "observation_time": "2026-10-05T14:54:12+00:00",
  "forecast_time": null
}
```

---

## 6. Resilient Fallback & HTTP Handling

`OpenMeteoProvider` includes bounded, defensive error handling:
- **Connection & Read Timeout:** 5.0 seconds default.
- **Bounded Retry Logic:** Up to 2 retries with exponential backoff on HTTP 429 (rate limiting) or transient network timeouts. No infinite retry loops.
- **Failure Modes Covered:**
  - HTTP 4xx (client errors / bad requests)
  - HTTP 5xx (upstream server outages)
  - `httpx.TimeoutException`
  - `httpx.RequestError` / Connection refused
  - Malformed JSON responses / missing keys
- **Action on Failure:** Logs warning with diagnostic context and immediately returns `HistoricalWeatherProvider.fetch_weather()` with honest `source_type = "historical_dataset"` and `is_live = false`. Under no circumstance are stack traces leaked to API consumers.

---

## 7. Spatial In-Memory Cache

To minimize redundant network requests across nearby highway segments or repeated location checks:
- **Grid Normalization:** Coordinates are snapped to 2 decimal places ($\approx 1.1\,\text{km}$ resolution): `key = (round(latitude, 2), round(longitude, 2))`.
- **TTL Strategy:** Configurable via `settings.WEATHER_CACHE_TTL_HOURS` (default: 3 hours).
- **Eviction:** Expired entries are discarded upon query lookup. The cache can be manually flushed via `provider.clear_cache()`.
- **Thread Safety:** Thread-safe using `threading.Lock`.

---

## 8. Database Persistence (`weather_observations`)

Observations continue to be stored in the existing Phase 2B `weather_observations` table:
- Direct columns: `latitude`, `longitude`, `location_geometry` (PostGIS `POINT(lon lat)`), `rainfall_mm`, `temperature_c`, `humidity_percent`, `wind_speed_kmh`, `precipitation_probability`, `observation_time`, `forecast_time`, `source`, `source_type`.
- Extended JSON payload (`raw_payload`): stores `p24_mm`, `p72_mm`, `ari_mm`, `wind_gusts_kmh`, `weather_code`, `snowfall_cm`, and `retrieved_at`.
- **Zero Schema Migrations Required:** Reuses the existing PostgreSQL/PostGIS schema cleanly.

---

## 9. Phase 2C Risk Engine Integration

The Phase 2C risk assessment engine remains 100% intact:
1. `SpatialRiskService.assess_point_risk` calls `WeatherDataService.get_weather_for_coordinate(lat, lon)`.
2. Derived metrics (`p24_mm`, `p72_mm`, `ari_mm`, `precipitation_probability`) populate `EnvironmentalFeatureVector`.
3. `HeuristicRiskModel.calculate_rainfall_score` evaluates saturation using the existing formula:
   $$S_{\text{rain}} = \min\left(100, \left(0.50 \cdot \frac{P_{24}}{T_{24}} + 0.30 \cdot \frac{P_{72}}{T_{72}} + 0.20 \cdot \frac{ARI}{T_{ARI}}\right) \cdot 100\right)$$
4. The composite hazard score preserves unchanged MCDA weights:
   $$S = 0.35 \cdot S_{\text{slope}} + 0.30 \cdot S_{\text{rain}} + 0.20 \cdot S_{\text{prox}} + 0.10 \cdot S_{\text{dens}} + 0.05 \cdot S_{\text{cut}}$$

---

## 10. Verification & Test Coverage

### 10.1 Unit & Integration Suite (`backend/tests/test_open_meteo_provider.py`)
- **21 automated tests** covering:
  - Provider properties and coordinate validation (NaN, out-of-bounds).
  - Live telemetry JSON parsing and field mapping.
  - Forecast distinction (`is_live = false`, `forecast_time = target_time`).
  - Spatial cache hits, coordinate snapping, and TTL eviction.
  - Exact accumulation math for $P_{24}$ and $P_{72}$.
  - Zero rainfall baseline ($P_{24}=0, P_{72}=0, ARI=0$).
  - Constant rainfall mathematical convergence against theoretical geometric series ($P=10\,\text{mm} \implies ARI \approx 43.24\,\text{mm}$).
  - Single event decay ($50 \times 0.82^1 = 41.0\,\text{mm}$) and multiple event superposition.
  - Missing and negative value sanitization.
  - HTTP 4xx, 5xx, timeout, connection failure, and malformed JSON fallback.
  - `WeatherDataService` DB persistence and demo mode fallback.
  - API endpoint `GET /api/locations/{id}/weather` response validation.
  - Risk engine integration confirming that rainfall telemetry alters the rainfall factor while slope and MCDA weights remain strictly invariant.
- **Full Backend Suite Status:** **433 passed, 15 skipped, 0 failed** in 84 seconds.

### 10.2 Live Smoke Test (`scripts/smoke_test_open_meteo.py`)
- **Target Coordinate:** Dehradun, Uttarakhand ($30.3165^\circ\text{N}, 78.0322^\circ\text{E}$)
- **HTTP Result:** `200 OK`
- **Output Sample:**
  - Temperature: $23.9^\circ\text{C}$
  - Humidity: $88.0\%$
  - Wind Speed / Gusts: $2.3\,\text{km/h}$ / $5.4\,\text{km/h}$
  - $P_{24}$ Accumulation: $0.6\,\text{mm}$
  - $P_{72}$ Accumulation: $1.6\,\text{mm}$
  - Antecedent Rainfall Index ($ARI$): $13.06\,\text{mm}$
  - Provenance: `source = "open_meteo"`, `source_type = "weather_api"`, `is_live = true`
  - All 8 smoke test assertions passed.

---

## 11. Scientific Limitations & Provider Attribution

### Limitations
1. **Model Forecast vs Ground Truth:** Open-Meteo delivers numerical weather predictions based on global/regional models (such as ECMWF, GFS, and ICON) interpolated to coordinates. It is **not** a direct Doppler weather radar or IMD automatic weather station (AWS) ground observation.
2. **Himalayan Microclimates:** Steep topography can create localized precipitation spikes (cloudbursts) that meso-scale atmospheric models may underestimate.
3. **No Unwarranted Radar/Satellite Claims:** The system explicitly labels Open-Meteo telemetry as `source_type = "weather_api"` and never claims ground sensor certification.

### Attribution & Licensing
Weather forecast data is provided by [Open-Meteo.com](https://open-meteo.com/) under the [Creative Commons Attribution 4.0 International (CC BY 4.0)](https://creativecommons.org/licenses/by/4.0/) license for open data use.
