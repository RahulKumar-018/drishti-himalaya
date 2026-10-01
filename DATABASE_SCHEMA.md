# DRISHTI-HIMALAYA - DATABASE SCHEMA & DATA TIER SPECIFICATION

This document defines both the **Production PostgreSQL/PostGIS Schema** and the **Zero-Setup Local SQLite / GeoJSON Fallback Model** designed for hackathon demonstration resilience.

---

## 1. Production Spatial Schema (PostgreSQL 15 + PostGIS 3.4)

```
  +-------------------------------------------------------------+
  |                   landslide_inventory                       |
  +-------------------------------------------------------------+
  | id: SERIAL (PK)                                             |
  | source_dataset: VARCHAR(50)                                 |
  | failure_type: VARCHAR(50)                                   |
  | year_recorded: INTEGER                                      |
  | geom: GEOMETRY(Point, 4326) [GIST INDEX]                    |
  +-------------------------------------------------------------+
                                 ^
                                 | spatial proximity query (ST_DWithin)
                                 |
  +------------------------------+------------------------------+
  |                      road_segment_log                       |
  +-------------------------------------------------------------+
  | segment_id: UUID (PK)                                       |
  | query_id: UUID (FK -> route_query.query_id)                 |
  | segment_index: INTEGER                                      |
  | slope_deg: NUMERIC(4, 2)                                    |
  | rain_24h: NUMERIC(6, 2)                                     |
  | dist_to_historic_scar_m: NUMERIC(8, 2)                      |
  | scar_density_1km: NUMERIC(5, 2)                             |
  | segment_risk_score: NUMERIC(5, 2)                           |
  | risk_category: VARCHAR(20)                                  |
  | geom: GEOMETRY(LineString, 4326) [GIST INDEX]               |
  +------------------------------+------------------------------+
                                 |
                                 | belongs to
                                 v
  +-------------------------------------------------------------+
  |                         route_query                         |
  +-------------------------------------------------------------+
  | query_id: UUID (PK)                                         |
  | origin_name: VARCHAR(100)                                   |
  | dest_name: VARCHAR(100)                                     |
  | origin_geom: GEOMETRY(Point, 4326)                          |
  | dest_geom: GEOMETRY(Point, 4326)                            |
  | total_distance_km: NUMERIC(6, 2)                            |
  | travel_time_minutes: NUMERIC(6, 2)                          |
  | mean_route_risk: NUMERIC(5, 2)                              |
  | bottleneck_segment_risk: NUMERIC(5, 2)                      |
  | created_at: TIMESTAMP WITH TIME ZONE                        |
  +-------------------------------------------------------------+
```

### 1.1 Complete DDL Statements

```sql
-- Ensure PostGIS spatial extension is active
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Historical Landslide Inventory (NRSC / GSI Ground Truth)
CREATE TABLE landslide_inventory (
    id SERIAL PRIMARY KEY,
    source_dataset VARCHAR(50) NOT NULL, -- 'NRSC_ATLAS_2023', 'GSI_NLSM', 'NASA_GLC'
    failure_type VARCHAR(50) DEFAULT 'Debris_Slide',
    district VARCHAR(50) DEFAULT 'Rudraprayag',
    year_recorded INTEGER,
    geom GEOMETRY(Point, 4326) NOT NULL
);
CREATE INDEX idx_landslide_inventory_geom ON landslide_inventory USING GIST (geom);

-- 2. Hourly Gridded Meteorological Cache
CREATE TABLE weather_cache (
    grid_id SERIAL PRIMARY KEY,
    grid_lat NUMERIC(6, 4) NOT NULL,
    grid_lon NUMERIC(6, 4) NOT NULL,
    rain_24h_mm NUMERIC(6, 2) NOT NULL DEFAULT 0.0,
    rain_72h_mm NUMERIC(6, 2) NOT NULL DEFAULT 0.0,
    antecedent_rain_index NUMERIC(6, 2) NOT NULL DEFAULT 0.0,
    last_updated TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    geom GEOMETRY(Polygon, 4326) NOT NULL
);
CREATE INDEX idx_weather_cache_geom ON weather_cache USING GIST (geom);

-- 3. Topographic DEM Metadata & High-Risk Corridors
CREATE TABLE slope_risk_corridors (
    corridor_id SERIAL PRIMARY KEY,
    corridor_name VARCHAR(100) NOT NULL, -- e.g. 'NH-7 Rishikesh-Joshimath'
    mean_slope_degrees NUMERIC(4, 2) NOT NULL,
    rock_formation VARCHAR(100),
    geom GEOMETRY(MultiLineString, 4326) NOT NULL
);
CREATE INDEX idx_slope_risk_corridors_geom ON slope_risk_corridors USING GIST (geom);

-- 4. Route Query Records
CREATE TABLE route_query (
    query_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    origin_name VARCHAR(100),
    dest_name VARCHAR(100),
    origin_geom GEOMETRY(Point, 4326) NOT NULL,
    dest_geom GEOMETRY(Point, 4326) NOT NULL,
    total_distance_km NUMERIC(6, 2) NOT NULL,
    travel_time_minutes NUMERIC(6, 2) NOT NULL,
    mean_route_risk NUMERIC(5, 2) NOT NULL,
    bottleneck_segment_risk NUMERIC(5, 2) NOT NULL,
    data_mode VARCHAR(20) DEFAULT 'DEMO',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 5. Individual Evaluated Road Segments
CREATE TABLE road_segment_log (
    segment_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    query_id UUID REFERENCES route_query(query_id) ON DELETE CASCADE,
    segment_index INTEGER NOT NULL,
    slope_deg NUMERIC(4, 2) NOT NULL,
    rain_24h NUMERIC(6, 2) NOT NULL,
    dist_to_historic_scar_m NUMERIC(8, 2) NOT NULL,
    scar_density_1km NUMERIC(5, 2) NOT NULL,
    is_cut_slope BOOLEAN DEFAULT TRUE,
    segment_risk_score NUMERIC(5, 2) NOT NULL,
    risk_category VARCHAR(20) NOT NULL, -- 'LOW', 'MODERATE', 'HIGH', 'SEVERE'
    geom GEOMETRY(LineString, 4326) NOT NULL
);
CREATE INDEX idx_road_segment_log_geom ON road_segment_log USING GIST (geom);
```

---

## 2. Zero-Setup Local Fallback Model (SQLite + GeoJSON + KD-Tree)

To ensure that the application runs reliably on any developer machine or hackathon judging workstation without requiring a running PostgreSQL server, Drishti-Himalaya implements a Python-native spatial fallback architecture:

```
backend/app/data/
├── fixtures/
│   ├── nh7_route_geometry.json       # Pre-extracted 156km centerline of NH-7
│   ├── alt_route_geometry.json       # Alternative crest highway centerline
│   ├── nrsc_landslide_scars.json     # 11,219 mapped landslide coordinates
│   └── weather_baseline.json         # Static baseline rainfall values
```

### 2.1 In-Memory KD-Tree Spatial Index
Instead of relying on external database daemons for nearest-neighbor queries:
1. At application startup, `scipy.spatial.KDTree` ingests the landslide coordinates array in WGS84/projected metric coordinates.
2. For each 250m road segment midpoint $(x, y)$, the KD-Tree computes:
   - Nearest scar distance: `d_min, _ = kdtree.query([x, y])` in $\approx 2.5\ \mu\text{s}$.
   - Density within 1km: `len(kdtree.query_ball_point([x, y], r=1000))` in $\approx 8.0\ \mu\text{s}$.
3. This delivers microsecond spatial joins with zero external dependencies.

### 2.2 SQLAlchemy Relational Mapping
SQLAlchemy ORM models in `backend/app/models/` are coded against standard SQL column types (with `JSON` serialization for geometry arrays in SQLite mode), allowing transparent switching via `DATABASE_URL` in `.env`:

```python
# Automatic dialect detection
if DATABASE_URL.startswith("sqlite"):
    # Uses JSON-serialized coordinate arrays
    # Employs Scipy KD-Tree for spatial indexing
else:
    # Uses GeoAlchemy2 Geometry types
    # Employs PostgreSQL PostGIS GIST indexes
```
