# Phase 2B — Environmental & Geospatial Data Pipeline

**Status:** Complete
**Depends on:** Phase 2A (PostGIS schema foundation)
**Feeds into:** Phase 2C (Risk Engine)

---

## 1. Overview

Phase 2B builds the environmental and geospatial data pipeline on top of the Phase 2A PostgreSQL/PostGIS persistence foundation.

It ingests, validates, and exposes **7 environmental signals** required by the downstream risk engine:

| # | Signal | Source |
|---|--------|--------|
| 1 | Elevation (m) | Copernicus DEM GLO-30 |
| 2 | Slope (degrees) | Horn (1981) algorithm on DEM |
| 3 | Terrain characteristics | Geomorphological classification |
| 4 | Historical disaster information | GSI / SDMA / field surveys |
| 5 | Rainfall / weather structure | IMD climate normals baseline |
| 6 | Location / geospatial information | PostGIS Point (EPSG:4326) |
| 7 | Data quality and provenance metadata | Captured in every response |

---

## 2. Architecture

```
External Sources
  Copernicus DEM GLO-30 (raster GeoTIFF)
  OpenStreetMap (OSM PBF: india-180101.osm.pbf, northern-zone-latest.osm.pbf)
  GSI / SDMA disaster catalogs
  IMD climate normals (offline baseline)
          |
          v
DEM Preprocessing (Horn 1981 slope algorithm)
          |
          v
PostGIS / SQLite (via SQLAlchemy)
  - locations
  - terrain_observations
  - disaster_events
  - weather_observations
          |
          v
Environmental Services Layer
  - GeospatialService   (location CRUD, 7-signal aggregation)
  - TerrainService      (DEM sampling, terrain persistence)
  - DisasterDataService (event CRUD, spatial proximity queries)
  - WeatherDataService  (multi-provider weather with provenance)
          |
          v
REST API  (FastAPI)
  GET  /api/locations
  POST /api/locations
  GET  /api/locations/{id}
  GET  /api/locations/{id}/terrain
  GET  /api/locations/{id}/disasters
  GET  /api/locations/{id}/weather
  GET  /api/locations/{id}/environment
  GET  /api/health
```

---

## 3. Database Schema

All tables use EPSG:4326 (WGS84) coordinate reference system.
Geometry columns use geometry(Point, 4326) via GeoAlchemy2.

### 3.1 locations

| Column | Type | Notes |
|--------|------|-------|
| id | UUID (PK) | Auto-generated |
| name | VARCHAR(255) | Location or landmark name |
| latitude | FLOAT | Range: [-90, 90] |
| longitude | FLOAT | Range: [-180, 180] |
| elevation | FLOAT | Optional; auto-sampled from DEM if absent |
| location_geometry | GEOMETRY(POINT,4326) | GIST spatial index |
| administrative_metadata | JSONB | district, state, tehsil, corridor, etc. |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | |

Constraints: chk_location_lat_bounds, chk_location_lon_bounds
Indexes: idx_locations_lat_lon, idx_locations_name, GIST on geometry

---

### 3.2 terrain_observations

Slope unit: degrees (0.0 to 90.0)
Algorithm: Horn (1981) 3x3 finite-difference on DEM raster

| Column | Type | Notes |
|--------|------|-------|
| id | UUID (PK) | |
| location_id | UUID (FK -> locations) | CASCADE DELETE |
| elevation | FLOAT | Meters (EGM2008 orthometric) |
| slope | FLOAT | Degrees [0.0, 90.0] |
| aspect | FLOAT | Degrees [0.0, 360.0], clockwise from North; NULL if flat |
| terrain_class | VARCHAR(50) | flat / gentle_slope / moderate_slope / steep_slope / cliff_escarpment |
| source | VARCHAR(100) | e.g. Copernicus DEM GLO-30 |
| source_reference | VARCHAR(255) | e.g. EPSG:4326/Horn-1981 |
| observation_time | TIMESTAMPTZ | |
| created_at | TIMESTAMPTZ | |

Constraints: chk_terrain_slope_bounds, chk_terrain_aspect_bounds
Indexes: idx_terrain_obs_location_id, idx_terrain_obs_created_at

---

### 3.3 disaster_events

Supports multi-hazard event types:
landslide | flash_flood | rockfall | avalanche | debris_flow | road_subsidence | other

| Column | Type | Notes |
|--------|------|-------|
| id | UUID (PK) | |
| location_id | UUID (FK -> locations, nullable) | SET NULL on delete |
| event_type | VARCHAR(50) | Constrained to supported types |
| event_date | DATE | NULL if exact date unknown |
| severity | VARCHAR(50) | Qualitative (e.g. severe, moderate) |
| source | VARCHAR(100) | GSI, SDMA, field survey, etc. |
| source_reference | VARCHAR(255) | Catalog ID, DOI, report reference |
| description | TEXT | Free text |
| latitude / longitude | FLOAT | Validated bounds |
| location_geometry | GEOMETRY(POINT,4326) | GIST spatial index |
| is_historical | BOOLEAN | True for historical catalog records |
| metadata | JSONB | Extra provenance or field data |
| created_at | TIMESTAMPTZ | |

Indexes: idx_disaster_events_loc_id, idx_disaster_events_type, idx_disaster_events_date, idx_disaster_events_source

---

### 3.4 weather_observations

WARNING: No live Weather API is currently guaranteed.
The source_type field explicitly records the data origin.
The system NEVER claims live data unless ExternalWeatherProvider successfully connects.

Supported source_type values: historical_dataset | weather_api | manual | simulated

| Column | Type | Notes |
|--------|------|-------|
| id | UUID (PK) | |
| location_id | UUID (FK -> locations, nullable) | |
| latitude / longitude | FLOAT | Observation point |
| location_geometry | GEOMETRY(POINT,4326) | GIST spatial index |
| rainfall_mm | FLOAT | Non-negative; NULL if unknown |
| temperature_c | FLOAT | Range: [-60, 60]; NULL if unknown |
| humidity_percent | FLOAT | Range: [0, 100]; NULL if unknown |
| wind_speed_kmh | FLOAT | Non-negative; NULL if unknown |
| precipitation_probability | FLOAT | Range: [0, 100]; NULL if unknown |
| observation_time | TIMESTAMPTZ | Required |
| forecast_time | TIMESTAMPTZ | NULL for observations |
| source | VARCHAR(100) | Provider name |
| source_type | VARCHAR(50) | Constrained to supported types |
| raw_payload | JSONB | Original API response or metadata |
| created_at | TIMESTAMPTZ | |

Constraints: bounds checks on all numeric fields, source_type constraint
Indexes: idx_wobs_location_id, idx_wobs_obs_time, idx_wobs_source_type, idx_wobs_coords

---

## 4. DEM / Terrain Pipeline

### Source
- Copernicus DEM GLO-30 (European Space Agency / Airbus Defence and Space)
- Resolution: ~30 metres (1 arc-second)
- Format: GeoTIFF (.tif)
- CRS: EPSG:4326 (WGS84 geographic)
- Vertical datum: EGM2008 geoid
- License: Open data / CC BY 4.0

### Processing Algorithm
- Horn (1981) 3x3 finite-difference method applied to elevation raster neighbourhood
- Horizontal distances converted from arc-degrees to metres at query latitude:
  - dx = cell_size_lon * (pi/180) * 6378137.0 * cos(latitude)
  - dy = cell_size_lat * (pi/180) * 6378137.0

### Pipeline Design

```
DEM raster (GeoTIFF)
      |
      v
RasterGridTerrainProvider / CopernicusDEMProvider
      |   (get_terrain_metrics)
      v
TerrainService.sample_terrain()     <- lazy, per-coordinate
      |
      v
TerrainService.record_terrain_observation()  <- persists to terrain_observations
      |
      v
PostGIS -> API -> Risk Engine
```

DEM processing is NOT performed inside API requests.
Elevation and slope values are derived once and cached in terrain_observations.

### Directory Structure

```
data/raw/dem/           <- GeoTIFF tiles (not committed to git)
data/processed/         <- derived terrain datasets
```

---

## 5. OSM Integration

Two OSM datasets are present in the repository:

| File | Size | Coverage |
|------|------|----------|
| india-180101.osm.pbf | ~453 MB | All India (January 2018 snapshot) |
| northern-zone-latest.osm.pbf | ~224 MB | Northern Zone (current) |

### Extracted Layers
- Cuttings (OSM man_made=cutting / cutting=yes): Persisted in cuttings table (Phase 2A)
- Historical cuttings 2018: data/fixtures/uttarakhand_cuttings_2018.json

CRS for all spatial data: EPSG:4326 (WGS84)

---

## 6. Services Architecture

```
backend/app/services/environmental/
  __init__.py               -- exports all services
  geospatial_service.py     -- GeospatialService, GeospatialValidation
  terrain_service.py        -- TerrainService
  disaster_service.py       -- DisasterDataService, haversine_distance_m
  weather_provider.py       -- BaseWeatherProvider, HistoricalWeatherProvider,
                               ManualWeatherProvider, ExternalWeatherProvider
  weather_service.py        -- WeatherDataService
```

### GeospatialValidation

Static validation class with strict domain checks:
- Coordinates: lat in [-90, 90], lon in [-180, 180], no NaN/Inf
- Slope: [0.0 degrees, 90.0 degrees]
- Rainfall: non-negative
- Temperature: [-60 C, 60 C]
- Humidity: [0%, 100%]

---

## 7. Weather Architecture

```
BaseWeatherProvider (ABC)
  HistoricalWeatherProvider    source_type = "historical_dataset"  is_live = False
  ManualWeatherProvider        source_type = "manual"              is_live = False
  ExternalWeatherProvider      source_type = "weather_api"         is_live = True
      fallback -> HistoricalWeatherProvider
```

### Provenance Guarantee

- Every WeatherObservation includes source_type and is_live fields
- is_live = True is only set when ExternalWeatherProvider successfully contacts a real live API
- In DEMO mode, ExternalWeatherProvider automatically falls back to HistoricalWeatherProvider
  (source_type = "historical_dataset", is_live = False)

### Adding a Live Weather API

1. Implement or configure ExternalWeatherProvider
2. Set WEATHER_API_KEY and API base URL in .env
3. No database or schema changes are required

---

## 8. API Endpoints

Base prefix: /api (also available at /api/v1)

| Method | Path | Description |
|--------|------|-------------|
| POST | /api/locations | Register a geographic location |
| GET | /api/locations | List locations (paginated, searchable) |
| GET | /api/locations/{id} | Get location by UUID |
| GET | /api/locations/{id}/terrain | Terrain metrics (elevation, slope, aspect, class) |
| GET | /api/locations/{id}/disasters | Historical disaster events |
| GET | /api/locations/{id}/weather | Weather with explicit provenance |
| GET | /api/locations/{id}/environment | Full 7-signal environmental bundle |
| GET | /api/health | System health and subsystem status |

---

## 9. Data Provenance

| Dataset | Source | License | Notes |
|---------|--------|---------|-------|
| Copernicus DEM GLO-30 | ESA / Airbus | Open / CC BY 4.0 | 30m horizontal resolution |
| OSM (India 2018) | OpenStreetMap contributors | ODbL | January 2018 snapshot |
| OSM (Northern Zone) | OpenStreetMap contributors | ODbL | Current extract |
| Landslide catalog | Geological Survey of India (GSI) | Open | National Landslide Susceptibility Inventory |
| Weather normals | India Meteorological Department (IMD) | Open | 1991-2020 district climate normals |

---

## 10. Geospatial Validation Summary

| Field | Rule |
|-------|------|
| latitude | [-90.0, 90.0]; finite number |
| longitude | [-180.0, 180.0]; finite number |
| slope (degrees) | [0.0, 90.0] |
| aspect (degrees) | [0.0, 360.0] |
| rainfall_mm | >= 0.0 |
| temperature_c | [-60.0, 60.0] |
| humidity_percent | [0.0, 100.0] |
| wind_speed_kmh | >= 0.0 |
| precipitation_probability | [0.0, 100.0] |
| source_type | historical_dataset, weather_api, manual, or simulated |
| event_type | landslide, flash_flood, rockfall, avalanche, debris_flow, road_subsidence, or other |

---

## 11. Testing

Phase 2B tests: backend/tests/test_phase_2b.py

| Test Class | Coverage |
|------------|----------|
| TestGeospatialValidation | Coordinate, slope, rainfall, temperature, humidity bounds |
| TestLocationAndTerrainPipeline | Location creation, Horn slope/aspect, geomorphological class, terrain persistence |
| TestDisasterDataService | Event CRUD, all supported types, spatial proximity query |
| TestWeatherProviderAbstraction | Provider hierarchy, provenance enforcement, negative rainfall rejection |
| TestEnvironmentalAPIEndpoints | Full HTTP contract: POST location, GET terrain/disasters/weather/environment/health |

Expected result: 32/32 PASSED

---

## 12. Spatial Indexes

| Table | Column | Index Type |
|-------|--------|------------|
| locations | location_geometry | GIST |
| terrain_observations | location_id, created_at | B-tree |
| disaster_events | location_geometry | GIST |
| disaster_events | event_date, source, location_id | B-tree |
| weather_observations | location_geometry | GIST |
| weather_observations | observation_time, source_type, location_id | B-tree |

---

## 13. Limitations

1. No live Weather API is currently guaranteed. All weather data defaults to
   source_type = "historical_dataset" using IMD climate normals.

2. Copernicus DEM GLO-30 raster tiles must be downloaded manually to data/raw/dem/.
   The system degrades gracefully when DEM tiles are absent (returns null for elevation/slope).

3. disaster_events table is pre-populated separately from Phase 2A landslides table.
   Linking is not automatic — future ingestion scripts would seed disaster_events from GSI catalogs.

4. Proximity queries use Haversine distance approximation (not PostGIS ST_DWithin)
   for SQLite compatibility in DEMO mode.

5. OSM data is read-only; no write-back to OSM from this pipeline.

---

## 14. Phase 2C Dependencies

Phase 2C (Risk Engine) will consume:

- GET /api/locations/{id}/environment -- full 7-signal environmental bundle
- terrain_observations.slope -- slope score input
- weather_observations.rainfall_mm -- rainfall ARI calculation
- disaster_events -- proximity density scoring
- locations.elevation -- exposure scoring
- provenance metadata -- explainability report
