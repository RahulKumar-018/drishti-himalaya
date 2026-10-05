# PHASE 2A — SUPABASE POSTGRESQL + POSTGIS PERSISTENCE FOUNDATION

## Drishti Himalaya Geotechnical Disaster-Risk Intelligence Platform

---

## 1. Executive Summary

Phase 2A establishes the enterprise persistence and spatial database foundation for **Drishti Himalaya** using **Supabase**, **PostgreSQL**, and **PostGIS**. It cleanly bridges the approved Phase 1 analytical backend (Copernicus GLO-30 DEM, Geological Survey of India historical landslide inventory, 2018 historical OpenStreetMap road-cutting features, Open-Meteo weather telemetry, and Pareto multi-objective routing) with a scalable, relational, and spatially-indexed database architecture.

Phase 2A delivers:
1. **Centralized Database Management**: Synchronous (Alembic/sync service) and asynchronous (`asyncpg`) database engines with resilience probes.
2. **Deterministic DEMO / Offline Mode**: Complete operational compatibility when running locally without live PostgreSQL credentials.
3. **10 Production-Grade Spatial Tables**: Relational models for users, routes, 250m route segments, explainable risk assessments, weather snapshots, hazard alerts, community reports, traveler feedback, historical landslides, and historical road cuttings.
4. **PostGIS Spatial Architecture**: Geographic storage in WGS84 (EPSG:4326) with GiST spatial indexing, keeping metric calculations in UTM Zone 44N (EPSG:32644) inside the analysis engine.
5. **Explainable MCDA Component Storage**: Preservation of the 5 mechanistic factor scores and locked MCDA weights ($0.35$ slope, $0.30$ rain, $0.20$ proximity, $0.10$ density, $0.05$ cut-slope exposure).
6. **Alembic Migration & Supabase SQL**: Deterministic, reversible schema migrations and standalone SQL scripts for direct execution in the Supabase SQL Editor.
7. **Repository & Service Layer**: Decoupled repository patterns and transactional persistence services isolating analytical logic from database drivers.
8. **Historical Data Provenance & Anti-Hallucination Integrity**: Strict enforcement of the project rule: **"NO DATA → NO FALSE CLAIM"**. Historical datasets (GSI 5,206 points and OSM 2018 2 ways) are explicitly labeled as historical reference data and never misrepresented as live hazards.

---

## 2. Target Architecture

```text
React Frontend (Leaflet / MapTiler)
              │
              ▼
FastAPI Application Layer (/api/v1)
              │
              ▼
Service Layer (Analysis, Weather, Inventory, PersistenceService)
              │
              ▼
MCDA Risk Engine (Deterministic Mathematical Formulation)
              │
              ▼
Repository Layer (BaseRepository, Route, Risk, Historical, Alert)
              │
              ▼
PostgreSQL + PostGIS (Hosted on Supabase)
```

### Architectural Separation
* **API Layer**: Exposes RESTful endpoints, performs Pydantic request/response validation, and reports health/readiness.
* **Service Layer**: Orchestrates corridor segmentation, DEM elevation sampling, weather retrieval, risk evaluation, and initiates persistence.
* **Risk Engine**: Pure, deterministic, stateless mathematical calculation. **Executes zero SQL.**
* **Repository Layer**: Encapsulates all query construction, spatial filtering, bulk inserts, and transactional sessions.
* **Supabase PostgreSQL / PostGIS**: Manages persistent storage, spatial indexing (GiST), relational foreign keys, and check constraints.

---

## 3. Database Schema & Tables

All primary keys for application entities use standard UUIDv4 (`GUID`). External identifiers (such as OSM way IDs) preserve native numerical types (`BIGINT`). All timestamps are stored with time zone (`TIMESTAMPTZ`) in UTC.

### Summary of Tables Created

| Table Name | Primary Key | Geometry Column (SRID 4326) | Primary Purpose |
| :--- | :--- | :--- | :--- |
| `user_profiles` | UUID | None | Future user profile, roles, and analyst preferences (Phase 2A establishes persistence boundary; no auth/login implemented). |
| `saved_routes` | UUID | `route_geometry` (LineString) | Persists evaluated corridor routes, distances, overall risk scores, and Pareto recommendations. |
| `route_segments` | UUID | `midpoint` (Point), `geometry` (LineString) | Persists discrete 250m intervals with chainages, bearings, and segment-level risk tiers. |
| `risk_assessments` | UUID | None | Persists the 5 explainable MCDA factor scores and locked factor weights for routes and individual segments. |
| `weather_snapshots` | UUID | None | Timestamped weather observations/forecasts from Open-Meteo with deduplication constraints and JSONB payloads. |
| `hazard_alerts` | UUID | `location_geometry` (Point) | Future alert persistence with strict classification: `OBSERVED`, `CALCULATED`, or `HISTORICAL`. |
| `community_hazard_reports` | UUID | `location_geometry` (Point) | Traveler-submitted field reports (rockfall, mudslide, washouts) with status tracking. |
| `feedback` | UUID | None | Traveler feedback and route rating (validated 1–5 scale). |
| `landslides` | UUID | `location_geometry` (Point) | Geological Survey of India (GSI) historical landslide inventory (5,206 validated points, `is_historical=TRUE`). |
| `cuttings` | UUID | `geometry` (LineString) | Historical OpenStreetMap road-cutting features (2018 snapshot, exactly 2 ways: `225786479` and `343144200`, `is_historical=TRUE`). |

---

## 4. PostGIS Geospatial Architecture

### 4.1 Coordinate Reference System (CRS) Strategy
* **EPSG:4326 (WGS84)**: Used for all persisted PostGIS geometry columns and GeoJSON API contracts `[longitude, latitude]`.
* **EPSG:32644 (UTM Zone 44N)**: Used exclusively within the analytical backend for precise metric calculations (250m geodesic route segmentation, Euclidean distance to nearest scar, 1 km radial density search, and elevation gradient sampling).
* **Rationale**: Decoupling the storage CRS (standard WGS84) from the analytical metric projection (UTM 44N) ensures GeoJSON compatibility for web maps (Leaflet/MapTiler) without introducing distortion into spatial metric algorithms.

### 4.2 Spatial GiST Indexing
Spatial queries are accelerated using PostgreSQL Generalized Search Tree (GiST) indexes:
* `idx_saved_routes_geom` ON `saved_routes USING GIST (route_geometry)`
* `idx_route_segments_midpoint` ON `route_segments USING GIST (midpoint)`
* `idx_route_segments_geometry` ON `route_segments USING GIST (geometry)`
* `idx_hazard_alerts_location` ON `hazard_alerts USING GIST (location_geometry)`
* `idx_community_reports_location` ON `community_hazard_reports USING GIST (location_geometry)`
* `idx_landslides_geom` ON `landslides USING GIST (location_geometry)`
* `idx_cuttings_geom` ON `cuttings USING GIST (geometry)`

---

## 5. Explainable MCDA Risk Persistence

Drishti Himalaya avoids black-box risk scoring. The database stores both the aggregated score and the individual factor contributions.

### Segment Risk Formula
$$R_{\text{seg}} = 0.35 \cdot S_{\text{slope}} + 0.30 \cdot S_{\text{rain}} + 0.20 \cdot S_{\text{prox}} + 0.10 \cdot S_{\text{density}} + 0.05 \cdot S_{\text{exp}}$$

### Weight Verification in `risk_assessments`
* `slope_weight`: $0.35$ (Sigmoidal topographic slope response around $35^\circ$ repose angle)
* `rain_weight`: $0.30$ (LANDSLIP Antecedent Rainfall Index + 24h/72h cumulative thresholds)
* `proximity_weight`: $0.20$ (Exponential decay from nearest historical scar, $d_0 = 100\text{ m}$)
* `density_weight`: $0.10$ (1 km radial historical scar cluster count normalized to $N_{\text{crit}} = 5$)
* `exposure_weight`: $0.05$ (Engineered road-cut slope interaction)

### Partial Data Handling
When cut-slope or DEM data is unavailable, the system marks the assessment as `PARTIAL` and renormalizes verified factors. Missing features are never silently converted to zero hazard.

---

## 6. Migration & Deployment System

### 6.1 Alembic Migration
Alembic is configured in `alembic.ini` and `alembic/env.py`. PostGIS internal tables (`spatial_ref_sys`, `geometry_columns`, etc.) are filtered out of schema comparisons.

Migration file:
* `alembic/versions/001_phase_2a_postgis_schema.py`
  - Runs `CREATE EXTENSION IF NOT EXISTS postgis;`
  - Creates all 10 tables with check constraints, foreign keys, and indexes
  - Provides safe `downgrade()` implementation

### 6.2 Standalone Supabase SQL Migration
For environments deploying directly via the Supabase Dashboard SQL Editor, a generated SQL migration is available:
* `docs/backend/migrations/001_phase_2a_postgis_schema.sql`

To deploy in Supabase:
1. Open the Supabase Project Dashboard.
2. Navigate to **SQL Editor**.
3. Paste the contents of `001_phase_2a_postgis_schema.sql` and run.
4. Verify all tables in the **Table Editor**.

---

## 7. Configuration & Environment Variables

Environment variables are managed centrally in `backend/app/core/config.py`:

```env
# Supabase & PostgreSQL Configuration
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-supabase-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key

# Direct PostgreSQL Connection Strings
DATABASE_URL=postgresql+psycopg://postgres:[PASSWORD]@db.[PROJECT_REF].supabase.co:5432/postgres
DATABASE_ENABLED=true
```

### Security Safeguards
* **Zero Secret Leakage**: Database URLs, passwords, and service role keys are excluded from API responses, health endpoints, and application logs.
* **Backend-Only Service Role**: The Supabase service role key is strictly confined to the backend server and never passed to the frontend.
* **DEMO Fallback**: If `DATABASE_URL` is omitted or unconfigured, the application defaults to `sqlite:///:memory:` with mock spatial shims, allowing offline test and DEMO operations without crashes.

---

## 8. Database Health & Readiness Integration

### Health Probe (`GET /api/v1/health`)
Returns live connectivity state without throwing exceptions:
```json
{
  "status": "healthy",
  "service": "Drishti-Himalaya API",
  "version": "1.0.0",
  "data_mode": "DEMO",
  "database": "connected (SQLite DEMO mode)",
  "weather_api": "active (DEMO baseline fixture)",
  "routing_engine": "active (deterministic DEMO corridor)",
  "cached_landslide_scars": 5206,
  "corridor_length_km": 156.4
}
```

### Readiness Probe (`GET /api/v1/ready`)
Reports individual subsystem readiness, including the database:
```json
{
  "status": "ready",
  "ready": true,
  "service": "Drishti-Himalaya API",
  "data_mode": "DEMO",
  "checks": {
    "terrain_dem": true,
    "landslide_inventory": true,
    "weather": true,
    "routing": true,
    "historical_cuttings": true,
    "database": true
  },
  "message": "All critical local and mock dependencies are initialized."
}
```

---

## 9. Data Provenance & Anti-Hallucination Integrity

The Drishti Himalaya platform adheres strictly to: **NO DATA → NO FALSE CLAIM**.

### Verified Scientific Sources
1. **Copernicus GLO-30 DEM**: 30m digital elevation model for terrain, elevation, and slope gradient sampling. (Raster files remain in filesystem/object storage; rasters are not duplicated into PostgreSQL).
2. **Geological Survey of India (GSI) Historical Landslide Inventory**: Exactly **5,206 validated points** across Uttarakhand. Categorized as `is_historical=TRUE`.
3. **Historical OpenStreetMap Road Cuttings**: Exactly **2 verified ways** (`225786479`, `343144200`) from the verified 2018 snapshot. Categorized as `is_historical=TRUE`.
4. **Open-Meteo**: Dynamic weather telemetry provider for 24h, 72h rainfall and 15-day Antecedent Rainfall Index (ARI).
5. **OSRM / OpenRouteService**: Highway network routing engines.

### Alert Classification Integrity
The `hazard_alerts.origin_type` column strictly enforces:
* `HISTORICAL`: Historical reference data (GSI records, 2018 OSM cuttings). Never labeled as an active incident.
* `CALCULATED`: Synthetic threshold breaches computed deterministically by the risk engine.
* `OBSERVED`: Verified empirical hazard events from authorized real-world agencies.

---

## 10. CURRENT vs FUTURE Capabilities

| Capability | Status | Phase | Notes |
| :--- | :--- | :--- | :--- |
| PostgreSQL + PostGIS Schema | **COMPLETED** | Phase 2A | 10 tables, spatial GiST indexes, foreign keys, constraints. |
| Alembic Migrations | **COMPLETED** | Phase 2A | Reversible migrations and standalone SQL script. |
| Repository & Persistence Services | **COMPLETED** | Phase 2A | Decoupled CRUD, bulk insertion, transactional persistence. |
| Batch Importers (GSI & OSM) | **COMPLETED** | Phase 2A | Validated importers with idempotency and coordinate checks. |
| Offline DEMO Mode Compatibility | **COMPLETED** | Phase 2A | Unbroken local execution and test suite green. |
| Alert Engine & Real-Time Monitoring | *PLANNED* | Phase 2B | Automated hazard alert generation from weather thresholds. |
| Firebase Cloud Messaging (FCM) | *PLANNED* | Phase 2C | Push notifications, device tokens, traveler alerts. |
| User Authentication & Login | *PLANNED* | Later Phase | Supabase Auth integration with `user_profiles`. |
| Machine Learning Predictive Layer | *PLANNED* | Later Phase | Data-driven failure probability factor supplementing MCDA. |
| IoT Sensors & InSAR Telemetry | *PLANNED* | Future | Real-time pore pressure, soil moisture, and ground displacement. |

---

## 11. Verification & Test Suite Results

The Phase 2A persistence implementation was verified using the project's Pytest suite:

```text
Platform: win32 -- Python 3.14.0, pytest-9.1.1, pluggy-1.6.0
Test Result: 343 passed, 15 skipped, 2 warnings in 56.95s
Status: 100% GREEN (Zero Failures)
```

* **Existing Phase 1 Tests**: 324 passed (all routing, MCDA, DEM, weather, and API tests remained completely green).
* **New Phase 2A Database Tests**: 19 passed (covering models, constraints, repositories, persistence service, and shims).
* **Live PostGIS Integration Tests**: 2 skipped cleanly when live PostgreSQL credentials are not configured.
