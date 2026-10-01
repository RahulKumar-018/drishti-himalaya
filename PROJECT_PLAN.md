# DRISHTI HIMALAYA (दृष्टि हिमालय)
## AI-Assisted Himalayan Road Hazard Risk Assessment & Safer Route Recommendation System

---

### Executive Verdict & Scientific Framing
**Drishti-Himalaya** is an explainable, physics-aware, and data-driven decision-support platform engineered specifically for Himalayan transportation corridors—with primary operational focus on the **National Highway 7 (NH-7, Rishikesh to Joshimath)** Char Dham pilgrimage and logistics corridor in Uttarakhand.

> [!IMPORTANT]
> **Judicial Defensibility & Academic Framing:**
> The system adheres strictly to a **decision-support paradigm** estimating **relative, segment-level hazard risk indices**, rather than making scientifically indefensible claims of "deterministic landslide prediction." It bridges the critical operational gap between macro-scale geoscience repositories (NRSC Landslide Atlas, GSI Bhukosh, Copernicus DEM) and consumer vehicular transit safety.

```
                      +------------------------------------------+
                      |         Copernicus DEM (GLO-30)          |
                      |   UTM 44N Reprojection -> Horn's Slope    |
                      +--------------------+---------------------+
                                           |
                                           v
+------------------------+     +------------------------+     +------------------------+
|   Open-Meteo API       |     |  MCDA Risk Engine Core |     |  NRSC Landslide Atlas  |
|  24h/72h Rain & ARI    | --> |  R_seg = 0.35*S_slope  | <-- |  2023 & GSI Inventories|
|  Hourly Spatial Cache  |     |        + 0.30*S_rain   |     |  2D KD-Tree Proximity  |
+------------------------+     |        + 0.20*S_prox   |     +------------------------+
                               |        + 0.10*S_density|
                               |        + 0.05*S_exp    |
                               +-----------+------------+
                                           |
                                           v
+------------------------+     +------------------------+     +------------------------+
| OpenRouteService / OSRM| --> | Shapely 250m Segmenter | --> | Multi-Objective Engine |
| Route Geometry Polylines|    | & Coordinate Profiler  |     | Pareto Cost: Time/Risk |
+------------------------+     +------------------------+     +-----------+------------+
                                                                          |
                                                                          v
                               +------------------------------------------+
                               |     Interactive Leaflet HUD Interface    |
                               |  - Color-Coded Risk Segments (G/Y/O/R)   |
                               |  - Persistent Route Comparison HUD       |
                               |  - Segment Factor Attribution Drawer     |
                               |  - Real-Time Rainfall Stress Slider      |
                               +------------------------------------------+
```

---

### 1. Problem Statement & Geological Context in Uttarakhand

The Himalayan mountain system represents the youngest and most tectonically active collisional orogen on Earth. Within Uttarakhand, geodynamic collision shears bedrock along major regional fault systems: **Main Central Thrust (MCT)**, **Main Boundary Thrust (MBT)**, and local splays (Alaknanda Fault, Vaikrita Thrust).

```
Geomechanical Pathway of Himalayan Road-Cut Failure:
Tectonic Thrusts (MCT/MBT) 
  --> Highly Jointed / Sheared Bedrock 
  --> Anthropogenic Slope Toe Removal (Road Widening >45°) 
  --> Monsoon Runoff Infiltration 
  --> Pore-Water Pressure Surges & Effective Stress Collapses (Terzaghi: σ' = σ - u)
  --> Mass Movement / Debris Avalanches Blocking Highway Corridors
```

#### The Critical Navigation Blindspot
- **Google Maps & MapmyIndia:** Rely purely on reactive probe vehicle velocities and manual closure tags. Motorists are routed into active, unstable canyon corridors during cloudbursts because commercial navigation algorithms are completely oblivious to slope angles, rock cohesion, antecedent rainfall saturation, and historical failure clusters.
- **Over 81% of active slope failures along the Char Dham highway corridors are concentrated within a 100-meter buffer zone directly adjacent to road alignments.**
- **57% of the NH-7 Rishikesh–Joshimath corridor (156 km) is classified as High or Very High Landslide Susceptibility.**

---

### 2. Comparative Analysis of Existing Systems

| Platform | Organization | Main Function | Real-Time Capability | Routing Optimization | Critical Operational Limitation |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Bhuvan Disaster Services** | NRSC / ISRO | Post-disaster damage & susceptibility | No (multi-day satellite latency) | None | Static viewing portal; no routing APIs or dynamic warnings. |
| **LANDSLIP LEWS** | GSI & BGS | Regional landslide early warning | Yes (daily forecast bulletins) | None | Operates at broad district/block level; lacks road-segment resolution. |
| **USDMA Disaster Portal** | Uttarakhand SDMA | Emergency monitoring & road closures | Semi-real-time (manual updates) | None | Highly fragmented tabular reporting with 6 to 24-hour latency. |
| **Google Maps** | Google LLC | Vehicular navigation & transit ETA | Real-time traffic flow | Yes (time-optimal Dijkstra/A*) | **Purely reactive:** oblivious to geotechnical slope instability and rainfall saturation. |
| **Drishti-Himalaya** *(This Project)* | Engineering Team | **Road-segment hazard estimation & risk-aware routing** | **Yes (hourly rainfall + live stress slider)** | **Yes (Pareto risk-time routing)** | Optimized for the NH-7 pilot corridor using verified open datasets. |

---

### 3. Target Users & Personas

1. **Pilgrims & Tourists (Char Dham Yatra):** Navigating the Rishikesh-Joshimath-Badrinath/Kedarnath routes; require advance warning to avoid entering steep canyon choke points under heavy rain.
2. **Uttarakhand Transport Corporation (UTC) & Logistics Haulers:** Commercial drivers requiring route safety comparisons and bottleneck risk ratings before dispatch.
3. **Disaster Management Authorities (SDRF / NDRF / DDMAs):** Incident commanders who need a segment-level situational awareness tool to position earthmovers and rescue teams at predicted bottlenecks.
4. **Local Commuters & Hill Dwellers:** Villagers and taxi operators needing transparent explanation of why a road section is hazardous.

---

### 4. Mathematical Risk Formulation & Geotechnical Weight Calibration

The core risk engine evaluates discrete **250-meter road segments** using a multi-criteria decision analysis (MCDA) framework anchored in peer-reviewed Himalayan geomorphology:

$$R_{\text{seg}} = 0.35 \cdot S_{\text{slope}} + 0.30 \cdot S_{\text{rain}} + 0.20 \cdot S_{\text{prox}} + 0.10 \cdot S_{\text{density}} + 0.05 \cdot S_{\text{exp}}$$

Subject to $\sum_{j=1}^5 w_j = 1.0$, mapping to a continuous score $R_{\text{seg}} \in [0, 100]$.

#### Factor 1: Topographic Slope Gradient ($S_{\text{slope}}$, 35% Weight)
Computed via Horn's algorithm on UTM Zone 44N reprojected Copernicus DEM (GLO-30). Modeled via a piecewise sigmoidal function:
$$S_{\text{slope}} = \begin{cases} 
0 & \theta < 15^\circ \\
\frac{100}{1 + e^{-0.18(\theta - 35^\circ)}} & 15^\circ \le \theta \le 60^\circ \\
90 & \theta > 60^\circ \text{ (dominated by rockfall/reduced regolith)}
\end{cases}$$

#### Factor 2: Dynamic Rainfall Saturation ($S_{\text{rain}}$, 30% Weight)
Derived from the LANDSLIP project and operational Himalayan warning thresholds:
$$S_{\text{rain}} = \min\left(100, \left(0.50 \frac{P_{24}}{T_{24}} + 0.30 \frac{P_{72}}{T_{72}} + 0.20 \frac{\text{ARI}}{T_{\text{ARI}}}\right) \times 100\right)$$
- Baseline initiation thresholds: $T_{24} = 75\text{ mm}$, $T_{72} = 140\text{ mm}$, $T_{\text{ARI}} = 200\text{ mm}$.
- Antecedent Rainfall Index (15-day window, $\lambda = 0.82$ daily drainage decay):
  $$\text{ARI}_t = \sum_{i=1}^{15} \lambda^i P_{t-i}$$

#### Factor 3: Historical Landslide Proximity ($S_{\text{prox}}$, 20% Weight)
Evaluated via exponential distance decay from verified NRSC/GSI mapped landslide scars:
$$S_{\text{prox}} = 100 \cdot \exp\left(-\frac{d_{\min}}{d_0}\right)$$
- $d_{\min}$: Euclidean distance in meters to nearest historical failure point (queried via 2D spatial KD-Tree).
- $d_0 = 350\text{ meters}$: spatial scale decay constant reflecting typical Himalayan debris runout.

#### Factor 4: Historical Landslide Density ($S_{\text{density}}$, 10% Weight)
Spatial clustering indicates local tectonic shear damage (e.g. proximity to MCT):
$$S_{\text{density}} = \min\left(100, \frac{N_{\text{scars}}}{N_{\text{crit}}} \times 100\right)$$
- $N_{\text{scars}}$: Count of mapped scars within a 1.0 km radius.
- $N_{\text{crit}} = 8\text{ scars/km}^2$: critical density threshold observed in Rudraprayag district.

#### Factor 5: Anthropogenic Road-Cut Exposure ($S_{\text{exp}}$, 5% Weight)
$$S_{\text{exp}} = \begin{cases} 100 & \theta > 30^\circ \text{ within cut-slope buffer} \\ 20 & \text{otherwise} \end{cases}$$

---

### 5. Advisory Risk Tiers & Color Hierarchy

| Risk Score ($R_{\text{seg}}$) | Classification | Hex Code | Advisory & Operational Meaning |
| :---: | :---: | :---: | :--- |
| **0.0 – 24.9** | **Low Risk** | `#10B981` (Green) | Normal mountain travel conditions; stable slopes. |
| **25.0 – 49.9** | **Moderate Risk** | `#EAB308` (Yellow) | Active slope monitoring advised; minor ravelling possible. |
| **50.0 – 74.9** | **High Risk** | `#F97316` (Orange) | Debris falls likely under rain; transit delays expected. |
| **75.0 – 100.0** | **Severe Hazard** | `#EF4444` (Red) | Imminent failure potential; travel strongly discouraged. |

---

### 6. Route Risk Aggregation & Multi-Objective Recommendation

#### Bottleneck-Penalized Composite Route Risk ($R_{\text{route}}$)
Naive arithmetic averaging masks deadly 500-meter failure zones along 100-km routes. Drishti-Himalaya implements a bottleneck-penalized composite route hazard function:

$$R_{\text{route}} = 0.40 \cdot R_{\text{avg}} + 0.60 \cdot \max(R_i)$$
*(or fully penalized: $R_{\text{route}} = \gamma \frac{\sum R_i l_i}{\sum l_i} + (1-\gamma)\max(R_i) + \kappa \frac{\sum_{k \in \mathcal{H}} l_k}{L_{\text{total}}}$ where $\gamma=0.40, \kappa=20.0$)*

#### Multi-Objective Route Optimization
$$\min_P J(P) = \alpha \left(\frac{T(P)}{T_{\text{norm}}}\right) + \beta \left(\frac{R_{\text{route}}(P)}{R_{\text{norm}}}\right) \quad (\alpha + \beta = 1.0)$$
- **Dry / Clear Weather:** $\alpha = 0.70, \beta = 0.30$ (Efficiency priority).
- **Heavy Rain / Alert Mode ($P_{24} > 50\text{ mm}$):** $\alpha = 0.20, \beta = 0.80$ (Safety priority: redirects motorists toward ridge/crest alignments bypassing gorge bottlenecks).

---

### 7. Machine Learning Baseline & Geospatial Leakage Control

- **Role:** Offline Random Forest / XGBoost classifier trained on static geomorphic factors to validate feature importance and refine baseline susceptibility weights.
- **Spatial Block Cross-Validation:** Training and testing sets are partitioned into distinct geographic blocks (e.g. training on Tehri/Rudraprayag, testing on Chamoli) to prevent spatial autocorrelation leakage.
- **Pseudo-Absence Sampling:** Non-landslide points are sampled strictly within the 50m–1500m highway buffer on stable slopes ($\theta < 12^\circ$), forcing the model to learn fine-grained geotechnical distinctions rather than coarse topography.
- **Tuned for Recall (>88%):** Minimizing False Negatives (Type II errors) is critical; false positives are accepted to preserve human life.

---

### 8. System Architecture & Component Interactions

```
[ User Browser (React 18 + Leaflet HUD) ]
        |  Origin / Destination coords, Safety weight, Rainfall simulation value
        v
[ FastAPI Application Server (Python 3.10+) ]
        |
        +---> [ OpenRouteService / Local OSRM ] (Extract alternative highway polylines)
        |
        +---> [ Shapely Polyline Segmenter ] (Disaggregates paths into uniform 250m elements)
        |
        +---> [ Geospatial Feature Extraction ]
        |       |-- Slope & Elevation: Copernicus DEM GLO-30 (Rasterio)
        |       |-- Historical Scars: NRSC Landslide Atlas (KD-Tree / PostGIS GIST)
        |       +-- Dynamic Rain: Open-Meteo Cache (24h/72h/ARI)
        |
        +---> [ MCDA Mechanistic Risk Engine ] (Calculates R_seg [0-100] per element)
        |
        +---> [ Bottleneck-Penalized Route Aggregator ] (Calculates R_route and Pareto rank)
        |
        v  Returns GeoJSON FeatureCollection with per-segment properties & risk colors
[ Frontend Map Canvas ]
        |-- Multi-colored segmented polylines (Green/Yellow/Orange/Red)
        |-- Persistent Comparative HUD (Route A vs Route B)
        |-- Segment Factor Attribution Drawer (Slope, Rain, Scar dist on click)
        +-- Real-Time Rainfall Stress Testing Slider (0-150 mm)
```

---

### 9. Database Architecture (PostgreSQL/PostGIS & Embedded Fallback)

```sql
-- 1. Historical Landslide Inventory (NRSC / GSI)
CREATE TABLE landslide_inventory (
    id SERIAL PRIMARY KEY,
    source_dataset VARCHAR(50) NOT NULL, -- 'NRSC_ATLAS_2023', 'GSI_NLSM'
    failure_type VARCHAR(50) DEFAULT 'Debris_Slide',
    year_recorded INTEGER,
    geom GEOMETRY(Point, 4326) NOT NULL
);
CREATE INDEX idx_landslide_inventory_geom ON landslide_inventory USING GIST (geom);

-- 2. Hourly Gridded Meteorological Cache (Open-Meteo)
CREATE TABLE weather_cache (
    grid_id SERIAL PRIMARY KEY,
    rain_24h_mm NUMERIC(6, 2) NOT NULL DEFAULT 0.0,
    rain_72h_mm NUMERIC(6, 2) NOT NULL DEFAULT 0.0,
    antecedent_rain_index NUMERIC(6, 2) NOT NULL DEFAULT 0.0,
    last_updated TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    geom GEOMETRY(Polygon, 4326) NOT NULL
);
CREATE INDEX idx_weather_cache_geom ON weather_cache USING GIST (geom);

-- 3. Evaluated Road Segment Cache
CREATE TABLE road_segment_log (
    segment_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    query_id UUID NOT NULL,
    segment_index INTEGER NOT NULL,
    slope_deg NUMERIC(4, 2) NOT NULL,
    rain_24h NUMERIC(6, 2) NOT NULL,
    dist_to_historic_scar_m NUMERIC(8, 2) NOT NULL,
    segment_risk_score NUMERIC(5, 2) NOT NULL,
    risk_category VARCHAR(20) NOT NULL, -- 'LOW', 'MODERATE', 'HIGH', 'SEVERE'
    geom GEOMETRY(LineString, 4326) NOT NULL
);
CREATE INDEX idx_road_segment_log_geom ON road_segment_log USING GIST (geom);
```

> **Hackathon Zero-Setup Strategy:**
> To guarantee immediate, zero-friction execution on any machine, the project includes an embedded SQLite/GeoJSON spatial index with pre-calculated slope rasters and 11,219 NRSC landslide points for the NH-7 corridor.

---

### 10. REST API Specification

- `POST /api/v1/route/analyze`
  - **Payload:** `{"origin": {"latitude": 30.1033, "longitude": 78.2947}, "destination": {"latitude": 30.5526, "longitude": 79.5684}, "preference_weight_safety": 0.50, "simulated_rain_mm": null}`
  - **Response:** JSON with execution time, `routes` array (Route ID, summary, distance km, time minutes, `composite_route_risk`, `max_bottleneck_risk`, recommendation string, and a GeoJSON `FeatureCollection` containing segmented lines with `slope_degrees`, `precipitation_24h_mm`, `distance_to_historic_scar_m`, `segment_risk_score`, `risk_category`, `color_hex`).
- `GET /api/v1/hazard/segment/{segment_id}`
  - Returns complete factor attribution profile for the clicked road segment.
- `GET /api/v1/weather/corridor-summary?corridor=NH7`
  - Current meteorological conditions along the Rishikesh–Joshimath highway.
- `GET /api/v1/health`
  - Server status, active database connection, weather API availability, and cached scar count.

---

### 11. Interactive UI & User Experience Flow

1. **Origin/Destination Selection:** Presets for the NH-7 corridor (Rishikesh to Joshimath, Devprayag, Rudraprayag, Pipalkoti, Badrinath) + map-click coordinate picker.
2. **Persistent Comparative HUD:** Displays Route A (Direct NH-7: 156 km, 5h 10m, Composite Risk: 68/100, Bottleneck: 89/100) vs Route B (Alternative Crest: 178 km, 5h 55m, Composite Risk: 32/100, Bottleneck: 42/100) with dynamic safety recommendation.
3. **Segment Factor Attribution Drawer:** Clicking any Red/Orange segment slides open a side panel showing:
   - Slope angle with cut-slope indicator (e.g. `44.2° - Critical Cut-Slope`)
   - 24-Hour Rainfall (e.g. `68.5 mm - Near Initiation Threshold`)
   - Distance to nearest historical failure (e.g. `85 m to 2017 Debris Slide`)
   - Local Landslide Scar Density (e.g. `6.2 scars/km²`)
   - Geotechnical Advisory (e.g. `Elevated planar sliding probability along sheared quartzite`)
4. **Dynamic Rainfall Simulation Slider (0 – 150 mm/day):** Allows judges to drag the rainfall slider and watch segments dynamically recolor from Yellow to Orange to Red in real time.

---

### 12. Technical Boundaries & Prohibited Claims

| Unacceptable / Misleading Claim | Scientifically Defensible Operational Replacement |
| :--- | :--- |
| *"Our deep learning AI predicts landslides with 95% accuracy."* | *"Our system estimates relative, segment-level hazard risk indices using terrain, rainfall, and historical inventories."* |
| *"Our navigation platform guarantees safe passage through mountain routes."* | *"The system acts as a risk-aware decision-support tool to minimize hazard exposure; motorists must obey local administrative directives."* |
| *"We predict exactly when and where a rockfall will strike a vehicle."* | *"We compute probabilistic spatial exposure; deterministic failure timing requires in-situ subsurface sensor arrays."* |
| *"Our system provides real-time geotechnical sensor monitoring across the state."* | *"Dynamic triggers are estimated using hourly satellite-blended meteorological proxies from Open-Meteo."* |
| *"Drishti-Himalaya replaces GSI, IMD, and USDMA warning networks."* | *"The platform complements official district warnings by disaggregating regional alerts into segment-level routing costs."* |

---

### 13. Hackathon Demo Script (4-Minute Presentation Walkthrough)

- **00:00 – 00:45 | The Himalayan Transit Dilemma:** Explain the danger on NH-7 and how Google Maps blindly routes motorists into active disaster zones during rains.
- **00:45 – 01:45 | Baseline Route Generation:** Query Rishikesh to Joshimath. Show Route A (Fast, but High Risk 68.4 with 89.2 bottleneck) vs Route B (45 mins slower, but Low Risk 32.1).
- **01:45 – 02:45 | Segment Explainability Inspection:** Click on the red segment near Pipalkoti. Explain the factor attribution drawer (44.2° slope, 68mm rain, 85m scar proximity).
- **02:45 – 03:30 | Dynamic Weather Stress Testing:** Drag the rainfall simulation slider to 110 mm/day to simulate a cloudburst. Watch sub-second recoloring across the corridor.
- **03:30 – 04:00 | Defensible Conclusion:** Emphasize the decision-support framing, zero-rupee open-data architecture, and social impact.
