# DRISHTI-HIMALAYA - END-TO-END SYSTEM ARCHITECTURE

## 1. High-Level System Architecture Diagram

```
+-----------------------------------------------------------------------------------+
|                            PRESENTATION TIER (Frontend)                           |
|                                                                                   |
|   +---------------------------------------------------------------------------+   |
|   |                  Drishti-Himalaya Geospatial Command HUD                  |   |
|   |                                                                           |   |
|   |  +--------------------+  +----------------------+  +-------------------+  |   |
|   |  | Route Search Bar   |  | Route Comparison HUD |  | Rainfall Slider   |  |   |
|   |  | (Origin/Dest/Pref) |  | (Route A vs Route B) |  | (0-150 mm/day)    |  |   |
|   |  +---------+----------+  +----------+-----------+  +---------+---------+  |   |
|   +------------|------------------------|------------------------|------------+   |
|                |                        |                        |                |
|                |                        v                        v                |
|                |             +---------------------+  +---------------------+     |
|                |             | Leaflet Map Canvas  |  | Segment Attribution |     |
|                |             | Multi-colored paths |  | Drawer (Inspector)  |     |
|                +------------>| (Green/Yellow/Red)  |  +---------------------+     |
|                              +----------+----------+                              |
+-----------------------------------------|-----------------------------------------+
                                          | HTTPS POST /api/v1/route/analyze
                                          v
+-----------------------------------------------------------------------------------+
|                        APPLICATION TIER (FastAPI ASGI Server)                     |
|                                                                                   |
|   +-------------------+     +---------------------+     +---------------------+   |
|   | Pydantic Request  | --> | Routing Coordinator | --> | Shapely 250m        |   |
|   | Sanitizer & Guard |     | (ORS API or OSRM)   |     | Polyline Segmenter  |   |
|   +-------------------+     +---------------------+     +----------+----------+   |
|                                                                    |              |
|   +----------------------------------------------------------------+              |
|   |                                                                               |
|   v                                                                               |
|   +-------------------------- GEOSPATIAL FEATURE ENRICHMENT ------------------+   |
|   |                                                                           |   |
|   |  * Terrain Slope & Elevation: Copernicus DEM GLO-30 (Rasterio / Horn)     |   |
|   |  * Hydro-Meteorological Saturation: Open-Meteo Hourly Grid (24h/72h/ARI)  |   |
|   |  * Historical Landslide Proximity & Density: NRSC Atlas (2D KD-Tree)     |   |
|   |  * Anthropogenic Cut-Slope Exposure: Highway Corridor Buffer Model        |   |
|   +------------------------------------+--------------------------------------+   |
|                                        |                                          |
|                                        v                                          |
|   +------------------------ MECHANISTIC RISK ENGINE CORE ---------------------+   |
|   |                                                                           |   |
|   |  1. S_slope = Sigmoidal(15° - 60°)                                        |   |
|   |  2. S_rain  = LANDSLIP Threshold Function (P24, P72, ARI)                 |   |
|   |  3. S_prox  = Exponential Distance Decay (d0 = 350m)                      |   |
|   |  4. S_density = Circular Cluster Density (Ncrit = 8 scars/km²)            |   |
|   |  5. S_exp   = Cut-Slope Highway Interaction Modifier                      |   |
|   |                                                                           |   |
|   |  R_seg = 0.35*S_slope + 0.30*S_rain + 0.20*S_prox + 0.10*S_density + 0.05 |   |
|   +------------------------------------+--------------------------------------+   |
|                                        |                                          |
|                                        v                                          |
|   +------------------ MULTI-OBJECTIVE ROUTE AGGREGATION ----------------------+   |
|   |                                                                           |   |
|   |  * Bottleneck Penalty: R_route = 0.40 * R_avg + 0.60 * max(R_i)           |   |
|   |  * Pareto Trade-off: min J(P) = alpha*(Time/T_norm) + beta*(Risk/R_norm)  |   |
|   +------------------------------------+--------------------------------------+   |
|                                        |                                          |
|                                        v                                          |
|   +---------------------------------------------------------------------------+   |
|   | GeoJSON Compiler: Packs geometry, risk colors, attribution into FeatureCol |   |
+---|---------------------------------------------------------------------------|---+
    |                                                                               |
    +-------------------------------------------------------------------------------+
                                         |
                                         v
+-----------------------------------------------------------------------------------+
|                            DATA & PERSISTENCE TIER                                |
|                                                                                   |
|   DEMO MODE (Default Hackathon Setup):                                            |
|   - Pre-computed high-resolution NH-7 terrain profile and NRSC landslide scars    |
|   - Zero-dependency local JSON/SQLite cache; 100% offline resilient               |
|                                                                                   |
|   LIVE / PRODUCTION MODE:                                                         |
|   - PostgreSQL 15 + PostGIS (Spatial indexing: GIST idx on point and polygon)     |
|   - Redis in-memory cache for Open-Meteo hourly weather grids                     |
|   - Upstream OpenRouteService REST API for dynamic worldwide routes               |
+-----------------------------------------------------------------------------------+
```

---

## 2. End-to-End Request/Execution Dataflow

1. **User Initiation (Frontend):**
   - The user selects an origin and destination (default preset: **Rishikesh to Joshimath along NH-7**) and adjusts the Safety Preference weight ($\alpha$ vs $\beta$).
   - The client issues an HTTP `POST /api/v1/route/analyze` request.

2. **Input Validation (Backend Guard):**
   - FastAPI validates the payload against Pydantic schemas.
   - Coordinates are confirmed within the Uttarakhand spatial bounding box ($28.7^\circ \text{N} - 31.5^\circ \text{N}, 77.5^\circ \text{E} - 81.1^\circ \text{E}$).

3. **Route Extraction & Disaggregation:**
   - In **LIVE mode**, the backend queries OpenRouteService for driving routes. In **DEMO mode**, the backend utilizes pre-validated topological coordinates for the NH-7 primary route and the southern crest alternative.
   - Using **Shapely**, the polyline geometry is split into uniform **250-meter** discrete linear segments. Each segment has a computed midpoint, elevation delta, and length.

4. **Spatial Feature Enrichment:**
   - **Slope Extraction:** Segment midpoints query the Copernicus DEM raster grid (or pre-sampled terrain cache) to obtain slope gradient in degrees using Horn's algorithm.
   - **Landslide Proximity & Density:** A 2D spatial `scipy.spatial.KDTree` queries the 11,219 mapped landslide failure locations from the NRSC Landslide Atlas of India, returning Euclidean distance ($d_{\min}$) and local density ($N_{\text{scars}}$ within 1 km).
   - **Meteorological Saturation:** The segment queries the Open-Meteo hourly weather cache for 24h rainfall ($P_{24}$), 72h rainfall ($P_{72}$), and 15-day Antecedent Rainfall Index ($\text{ARI}$).

5. **Mechanistic Risk Scoring (MCDA Core):**
   - The modular risk engine computes five sub-scores:
     - $S_{\text{slope}}$ via sigmoidal piecewise curve
     - $S_{\text{rain}}$ via LANDSLIP threshold ratios
     - $S_{\text{prox}}$ via exponential decay ($d_0 = 350\text{ m}$)
     - $S_{\text{density}}$ via critical cluster density
     - $S_{\text{exp}}$ via cut-slope buffer presence
   - The composite segment hazard score $R_{\text{seg}} \in [0, 100]$ is computed and mapped to a risk tier and hex color:
     - **0.0 – 24.9:** Low (`#10B981`, Green)
     - **25.0 – 49.9:** Moderate (`#EAB308`, Yellow)
     - **50.0 – 74.9:** High (`#F97316`, Orange)
     - **75.0 – 100.0:** Severe (`#EF4444`, Red)

6. **Route Aggregation & Pareto Optimization:**
   - The route risk is computed using the bottleneck penalty formula:
     $$R_{\text{route}} = 0.40 \cdot R_{\text{avg}} + 0.60 \cdot \max(R_i)$$
   - Both Route A (Primary NH-7) and Route B (Safer Alternative) are ranked by composite risk and travel time.

7. **GeoJSON Response & Map Rendering:**
   - The backend packages the results into a valid GeoJSON `FeatureCollection` with embedded styling attributes.
   - The frontend Leaflet map renders the multi-colored segmented polyline at 60 FPS.
   - The persistent HUD displays comparative metrics and recommendations.
   - Clicking any segment opens the Factor Attribution Drawer with detailed progress bars and geotechnical advisories.

8. **Dynamic Client-Side Simulation:**
   - When the user drags the **Rainfall Simulation Slider** (0 to 150 mm/day), the client re-evaluates the segment scores locally using the exact mathematical formulation, recoloring the map in sub-second time without flooding the backend API.

---

## 3. Dual-Mode Data Strategy

| Dimension | DEMO Mode (Default Hackathon) | LIVE Mode (Production Integration) |
| :--- | :--- | :--- |
| **Activation** | `DATA_MODE=DEMO` in `.env` | `DATA_MODE=LIVE` in `.env` |
| **External Dependencies**| Zero. Works completely offline. | OpenRouteService, Open-Meteo, PostgreSQL/PostGIS. |
| **Route Geometry** | High-precision GeoJSON coordinates for NH-7 and crest alternative. | Upstream OpenRouteService REST API calls. |
| **Landslide Scars** | Bundled GeoJSON / KD-Tree fixture from NRSC Atlas. | PostGIS spatial queries on `landslide_inventory`. |
| **Meteorological Data** | Deterministic baseline scenario + client stress slider. | Hourly asynchronous polling of Open-Meteo API. |
| **Failure Recovery** | Not applicable (local data is deterministic). | Falls back to cached weather snapshot if API is unreachable. |
| **UI Indicator** | Banner indicates: `[DEMO DATA MODE: Deterministic NH-7 Corridor]`. | Banner indicates: `[LIVE TELEMETRY: Open-Meteo Hourly Feed]`. |

---

## 4. Resilience & Error Handling Principles

1. **No Silent Failures:** If external APIs are unavailable, the backend logs a structured warning and activates fallback data with a clear disclaimer in the API response.
2. **Strict Geofencing:** Incoming queries outside the Uttarakhand bounding box are rejected with an informative HTTP 422 error.
3. **Sub-400ms Response Time:** In-memory caching and spatial indexing guarantee that route evaluation executes in less than 400 milliseconds.
