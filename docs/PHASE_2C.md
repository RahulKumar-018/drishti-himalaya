# Phase 2C — Risk Assessment Engine

**Status:** Complete
**Depends on:** Phase 2A (PostGIS persistence foundation), Phase 2B (Environmental & geospatial data pipeline)
**Feeds into:** Phase 3 (Frontend visualization, live alerting, and route optimization)

---

## 1. Executive Summary

Phase 2C establishes the **Drishti-Himalaya Risk Assessment Engine**. The system synthesizes topographic, hydro-meteorological, geotechnical, and historical ground evidence into an explainable, normalized risk score ($[0, 100]$) and categorical hazard tier (`LOW`, `MEDIUM`, `HIGH`, `CRITICAL`).

### Core Engineering Principles
1. **Scientific Honesty:** No pseudo-AI models trained on unlabelled or positive-only datasets. The active production engine uses a verified, transparent Multi-Criteria Decision Analysis (MCDA) formulation grounded in Himalayan geomorphology.
2. **ML-Ready Architecture:** An abstract polymorphic contract (`BaseRiskModel`) decouples API endpoints and spatial pipelines from the scoring model, allowing future trained machine-learning models to be plugged in seamlessly without modifying client interfaces.
3. **Traceable Explainability:** Every prediction produces a complete audit of contributing factors, sub-scores, weights, and natural-language justifications.
4. **Data Quality vs Confidence:** Clear separation between **data quality** (`HIGH`, `MEDIUM`, `LOW`) and statistical confidence. No fabricated probabilities (e.g. "92% confidence") are ever emitted without an empirical validation basis.

---

## 2. System Architecture

```
                    Geospatial & Environmental Inputs
     +--------------------------------------------------------------+
     | Copernicus DEM | Open-Meteo / IMD | GSI Landslide Inventory |
     | (Elevation/    | (Rainfall / ARI /| (5,206 Historical Scars |
     |  Horn 1981)    |  Saturation)     |  KDTree Index)          |
     +--------------------------------------------------------------+
                                    |
                                    v
                     SpatialRiskService & Aggregation
     +--------------------------------------------------------------+
     | - Coordinate bounds validation (WGS84)                       |
     | - PostGIS spatial querying & Great-Circle distance lookups   |
     | - KDTree nearest-scar distance & 1km radius density queries  |
     | - TTLSpatialCache (in-memory LRU with coordinate rounding)   |
     +--------------------------------------------------------------+
                                    |
                                    v
                       EnvironmentalFeatureVector
     +--------------------------------------------------------------+
     | - slope_deg, elevation_m, aspect_deg, terrain_class          |
     | - rainfall_mm, p24_mm, p72_mm, ari_mm, weather_source        |
     | - dist_scar_m, scar_density_1km, disaster_events_count       |
     | - DataQuality evaluation (HIGH / MEDIUM / LOW)               |
     +--------------------------------------------------------------+
                                    |
                                    v
                       BaseRiskModel (Interface)
                                    |
                +-------------------+-------------------+
                |                                       |
                v                                       v
      HeuristicRiskModel                         MLRiskModel
  (Active Deterministic MCDA)               (Future ML Pipeline)
  - Configurable RiskModelConfig            - Plug-in interface
  - 5-factor normalized scoring             - Detects trained artifacts
  - Explicit contributing factors           - Transparent heuristic fallback
                |                                       |
                +-------------------+-------------------+
                                    |
                                    v
                         RiskEvaluationResult
                                    |
                                    v
                   FastAPI Presentation Layer
       POST /api/risk/predict      POST /api/v1/risk/predict
       GET  /api/risk/zones        GET  /api/v1/risk/zones
       GET  /api/risk/model/info   GET  /api/v1/risk/model/info
```

---

## 3. Standardized Feature Engineering

All environmental signals are normalized into the immutable `EnvironmentalFeatureVector`:

| Feature Domain | Variable Name | Physical Unit | Description / Source |
|---|---|---|---|
| **Topographic** | `slope_deg` | Degrees $[0, 90]$ | Topographic slope gradient via Horn (1981) 3x3 finite-difference on Copernicus DEM |
| | `elevation_m` | Meters MSL | Orthometric height relative to EGM2008 geoid |
| | `aspect_deg` | Degrees $[0, 360]$ | Compass aspect clockwise from North |
| | `terrain_class` | Categorical | Geomorphological landform classification |
| **Meteorological** | `rainfall_mm` | mm | Current/recent precipitation |
| | `p24_mm` | mm | 24-hour cumulative precipitation |
| | `p72_mm` | mm | 72-hour storm cumulative precipitation |
| | `ari_mm` | mm | 15-day Antecedent Rainfall Index with $\lambda = 0.82$ daily drainage decay |
| | `temperature_c` | °C | Ambient air temperature $[-60, 60]$ |
| | `humidity_percent`| % | Relative atmospheric humidity $[0, 100]$ |
| **Historical** | `dist_scar_m` | Meters | Metric Euclidean distance to nearest GSI landslide failure scar (UTM Zone 44N) |
| | `scar_density_1km`| Count | Number of mapped historical failure scars within a 1.0 km radius |
| | `disaster_events` | Count | Recorded multi-hazard historical events within 10 km corridor |
| **Anthropogenic** | `is_cut_slope` | Boolean / None | 2018 OSM hillside highway cutting toe excavation flag |
| **Provenance** | `weather_source` | String | `manual` \| `simulated` \| `historical_dataset` \| `weather_api` |

### Missing Data & Fallback Policies
- **Missing Slope:** If DEM coverage is unavailable, slope defaults to neutral terrain with a descriptive caveat, and data quality is downgraded.
- **Missing Rainfall:** Defaults to dry baseline ($0.0\text{ mm}$), documented in response caveats.
- **Missing Historical Evidence:** Assumed clear of recent scars ($>10\text{ km}$ fallback), preventing false emergency alerts.
- **Missing Cut-Slope Status (`None`):** Automatically triggers the partial-data weight re-normalization formula without fabricating anthropogenic excavation.

---

## 4. Risk Scoring Engine Formulation

The deterministic heuristic model implements a Multi-Criteria Decision Analysis (MCDA) framework configured via `RiskModelConfig`.

### Configurable Weights
Core weights sum to $1.00$ in the baseline configuration:
$$W_{\text{slope}} = 0.35, \quad W_{\text{rain}} = 0.30, \quad W_{\text{prox}} = 0.20, \quad W_{\text{density}} = 0.10, \quad W_{\text{exp}} = 0.05$$

### Full-Data Composite Scoring Formula
When anthropogenic cut-slope status is known (`is_cut_slope` is `True` or `False`):
$$R_{\text{composite}} = 0.35 \cdot S_{\text{slope}} + 0.30 \cdot S_{\text{rain}} + 0.20 \cdot S_{\text{prox}} + 0.10 \cdot S_{\text{density}} + 0.05 \cdot S_{\text{exp}}$$

### Documented Partial-Data Formula
When anthropogenic cut-slope status is unassessed (`is_cut_slope` is `None`):
$$R_{\text{partial}} = \frac{0.35 \cdot S_{\text{slope}} + 0.30 \cdot S_{\text{rain}} + 0.20 \cdot S_{\text{prox}} + 0.10 \cdot S_{\text{density}}}{0.35 + 0.30 + 0.20 + 0.10} = \frac{\text{Numerator}}{0.95}$$
The remaining 4 factors are dynamically scaled so that the final score strictly spans $[0, 100]$ without assuming the slope is artificially safe or dangerous.

---

## 5. Mathematical Factor Transformations

### 1. Topographic Slope Sub-Score ($S_{\text{slope}}$)
Himalayan colluvium typically exhibits a natural angle of repose around $\theta_{\text{repose}} = 35^\circ$. Slopes below $15^\circ$ possess negligible gravitational shear instability, while slopes exceeding $60^\circ$ represent bare bedrock cliffs with thin regolith:
$$S_{\text{slope}}(\theta) = \begin{cases}
0.0 & \text{if } \theta < 15.0^\circ \\
90.0 & \text{if } \theta > 60.0^\circ \\
\frac{100}{1 + \exp\left(-0.18 \cdot (\theta - 35.0)\right)} & \text{if } 15.0^\circ \le \theta \le 60.0^\circ
\end{cases}$$

### 2. Hydro-Meteorological Saturation Sub-Score ($S_{\text{rain}}$)
Derived from the LANDSLIP early warning thresholds in the Garhwal/Kumaon Himalayas:
$$S_{\text{rain}} = \min\left(100.0, \; \left(0.50 \cdot \frac{P_{24}}{75.0} + 0.30 \cdot \frac{P_{72}}{140.0} + 0.20 \cdot \frac{\text{ARI}}{200.0}\right) \times 100\right)$$
where the 15-day Antecedent Rainfall Index is calculated as:
$$\text{ARI}_t = \sum_{i=1}^{15} (0.82)^i \cdot P_{t-i}$$
If only single 24-hour rainfall ($P_{24}$) is provided, $P_{72}$ is conservatively initialized to $P_{24}$ and $\text{ARI}$ is initialized to $0.82 \cdot P_{24}$.

### 3. Historical Landslide Proximity Sub-Score ($S_{\text{prox}}$)
Proximity hazard decays exponentially with Euclidean distance $d_{\min}$ (in meters) to the nearest mapped GSI failure:
$$S_{\text{prox}} = 100.0 \cdot \exp\left(-\frac{d_{\min}}{350.0}\right)$$
- At $d = 0\text{ m}$: $S_{\text{prox}} = 100.0$
- At $d = 350\text{ m}$: $S_{\text{prox}} \approx 36.8$
- At $d \ge 1,500\text{ m}$: $S_{\text{prox}} \le 1.4$ (negligible)

### 4. Historical Landslide Density Sub-Score ($S_{\text{density}}$)
Measures tectonic clustering and spatial failure frequency within a 1.0 km radius:
$$S_{\text{density}} = \min\left(100.0, \; \frac{N_{\text{scars}}}{8.0} \times 100.0\right)$$
where $N_{\text{scars}}$ is the count of mapped historical scars inside a 1,000 m radius.

### 5. Cut-Slope Exposure Sub-Score ($S_{\text{exp}}$)
Captures anthropogenic highway engineering destabilization:
$$S_{\text{exp}} = \begin{cases}
100.0 & \text{if } \text{is\_cut\_slope is True and } \theta > 30.0^\circ \\
20.0 & \text{otherwise}
\end{cases}$$

---

## 6. Categorical Risk Tiers & Thresholds

Risk thresholds are centralized in `RiskModelConfig` and can be customized at runtime:

| Score Range | Risk Level | Visual Color Hex | Operational Meaning |
|---|---|---|---|
| **0 – 30** | `LOW` | `#10B981` (Green) | Normal terrain and sub-threshold meteorological conditions. |
| **31 – 60** | `MEDIUM` | `#EAB308` (Yellow) | Moderate hillside gradient or light showers; exercise standard caution. |
| **61 – 80** | `HIGH` | `#F97316` (Orange) | Steep slopes, heavy rainfall, or proximity to mapped historical failures. |
| **81 – 100** | `CRITICAL` | `#EF4444` (Red) | Severe compound risk: steep cut-slopes, intense rainfall exceeding initiation threshold. |

---

## 7. Explainability & Transparent Attribution

Drishti-Himalaya rejects opaque "black-box" outputs. Every evaluation produces:
1. **Human-Readable Summary:** A narrative explanation summarizing the primary risk drivers.
2. **Contributing Factors Breakdown:** A list of measurable physical thresholds exceeded (e.g. *"High slope hazard (74.2/100): Steep slope (42.0°) exceeding 35° natural angle of repose"*).
3. **Sub-Score Matrix:** Numerical scores, assigned weights, and weighted contributions for all 5 factors.

---

## 8. Data Quality Rating

Data quality indicates telemetry completeness and freshness, strictly separated from statistical model confidence:

| Rating | Conditions | Natural-Language Policy |
|---|---|---|
| **`HIGH`** | All 3 critical factors (slope, rainfall, historical scars) are present from verified sources. | No caveats emitted. |
| **`MEDIUM`** | Exactly one critical factor is absent and substituted with documented fallback (e.g. flat slope or baseline rainfall). | Clear caveat indicating the estimated signal. |
| **`LOW`** | Two or more critical factors are absent. Risk evaluation operates under degraded telemetry. | Multiple caveats flagging missing inputs. |

---

## 9. Performance & Spatial Caching

To guarantee sub-10ms response times and prevent redundant database/raster lookups:
- **`TTLSpatialCache`:** Thread-safe in-memory LRU cache storing up to 2,000 recent evaluations with a 300-second TTL.
- **Spatial Deduplication:** Coordinates are rounded to 4 decimal places (~11 meters at the equator), coalescing identical spatial queries.
- **Metric KDTree Indexing:** 5,206 GSI historical landslide points are indexed in UTM Zone 44N (`EPSG:32644`), enabling microsecond proximity and density queries without full database scans.

---

## 10. API Specification

All endpoints are available with both `/api/` and `/api/v1/` prefixes.

### 1. Point Risk Prediction
- **Endpoint:** `POST /api/risk/predict` (and `POST /api/v1/risk/predict`)
- **Request Body:**
```json
{
  "latitude": 30.145,
  "longitude": 79.298,
  "rainfall_mm": 45.0,
  "slope_deg": 38.0,
  "weather_source": "manual",
  "model_type": "heuristic"
}
```
- **Response Body (`200 OK`):**
```json
{
  "location": {
    "latitude": 30.145,
    "longitude": 79.298
  },
  "risk_score": 68.42,
  "risk_level": "HIGH",
  "factors": {
    "rainfall": 52.86,
    "slope": 63.18,
    "terrain": 63.18,
    "historical": 85.21,
    "details": {
      "slope": {
        "sub_score": 63.18,
        "weight": 0.35,
        "contribution": 22.11,
        "status": "HIGH",
        "description": "Steep slope (38.0°) exceeding 35° natural angle of repose"
      },
      "rainfall": {
        "sub_score": 52.86,
        "weight": 0.30,
        "contribution": 15.86,
        "status": "HIGH",
        "description": "Heavy rainfall approaching initiation threshold (24h: 45.0mm)"
      }
    }
  },
  "explanation": "Risk Level: HIGH (Score: 68.4/100). High slope hazard (63.2/100) | Elevated precipitation saturation (52.9/100) | Proximity to historical landslide (85.2/100)",
  "contributing_factors": [
    "High slope hazard (63.2/100): Steep slope (38.0°) exceeding 35° natural angle of repose",
    "Elevated precipitation saturation (52.9/100): Heavy rainfall approaching initiation threshold (24h: 45.0mm)",
    "Proximity to historical landslide (85.2/100): Immediate proximity (56m) to verified historical landslide failure scar"
  ],
  "weather_source": "manual",
  "model_type": "heuristic_mcda",
  "model_version": "1.0.0-deterministic",
  "data_quality": "HIGH",
  "data_caveats": [],
  "generated_at": "2026-10-05T14:15:00.000Z"
}
```

### 2. Spatial Hazard Risk Zones
- **Endpoint:** `GET /api/risk/zones` (and `GET /api/v1/risk/zones`)
- **Query Parameters:** `min_lat`, `max_lat`, `min_lon`, `max_lon` (optional bounding box)
- **Response Body (`200 OK`):** GeoJSON FeatureCollection
```json
{
  "type": "FeatureCollection",
  "total_zones": 6,
  "generated_at": "2026-10-05T14:15:00.000Z",
  "model_version": "1.0.0-deterministic",
  "features": [
    {
      "type": "Feature",
      "id": "zone_chamoli_joshimath",
      "geometry": {
        "type": "Polygon",
        "coordinates": [
          [
            [79.50, 30.50],
            [79.62, 30.50],
            [79.62, 30.60],
            [79.50, 30.60],
            [79.50, 30.50]
          ]
        ]
      },
      "properties": {
        "zone_id": "zone_chamoli_joshimath",
        "zone_name": "Chamoli - Joshimath Corridor",
        "risk_score": 72.4,
        "risk_level": "HIGH",
        "color_hex": "#F97316",
        "factors": {
          "rainfall": 52.86,
          "slope": 65.20,
          "terrain": 65.20,
          "historical": 91.40
        },
        "model_version": "1.0.0-deterministic",
        "generated_at": "2026-10-05T14:15:00.000Z",
        "disclaimer": "MVP visualization — not scientifically authoritative hazard boundary"
      }
    }
  ]
}
```

### 3. Model Information & Configuration
- **Endpoint:** `GET /api/risk/model/info` (and `GET /api/v1/risk/model/info`)
- Returns active model metadata, weights, threshold definitions, and ML readiness status.

---

## 11. Scientific Honesty & ML Roadmap

### Detailed Catalog Inspection
The primary catalog in the repository is the Geological Survey of India (GSI) National Landslide Susceptibility Mapping inventory (`data/processed/landslide_inventory_uttarakhand.geojson`).
- **Sample Count:** 5,206 mapped failure records.
- **Class Balance:** **100% positive historical failure scars. 0% non-landslide negative control samples.**
- **Temporal/Weather Synchronization:** Event dates are historical snapshots (many without precise timestamps); no high-resolution hourly rainfall time-series is paired with each historical event.

### Why No Misleading ML Model Was Trained
Training a binary classifier (Logistic Regression, Random Forest, or XGBoost) exclusively on positive failure scars without negative controls leads to severe sampling bias and artificial 100% sensitivity with zero specificity. Fabricating negative points randomly would introduce false spatial signals.

Therefore, Drishti-Himalaya maintains complete scientific integrity:
1. **Active Model:** The deterministic `HeuristicRiskModel` is the operational predictor.
2. **ML Interface:** `MLRiskModel` implements the `BaseRiskModel` interface and provides a production-grade stub that automatically falls back to the deterministic engine while documenting uncalibrated status.
3. **Future ML Roadmap:**
   - Curate a scientifically validated negative-control dataset (stable slopes with identical lithology).
   - Ingest ERA5-Land reanalysis precipitation time-series for historical failure dates.
   - Train and cross-validate spatial split (avoiding spatial autocorrelation leakage) using Precision-Recall AUC and F1 metrics.

---

## 12. Verification & Test Coverage

The test suite in `backend/tests/test_phase_2c.py` provides 100% pass verification across all 13 required categories:
- **Risk calculation:** Zero-baseline, compound severe conditions, $[0, 100]$ clamping.
- **Risk thresholds:** Default boundaries, custom configurations, monotonic validation.
- **Rainfall component:** Zero-precipitation, LANDSLIP threshold saturation, single rainfall hydration, source provenance.
- **Slope component:** Flat terrain ($0^\circ$), repose angle ($35^\circ$), cliff cap ($90^\circ$), invalid range rejection.
- **Historical component:** Immediate proximity ($0\text{ m}$), exponential distance decay, distant scars, cluster density scaling.
- **Missing data:** Omitted slope, omitted rainfall, omitted cut-slope exposure.
- **Edge coordinates:** Geographic poles ($\pm 90^\circ$), antimeridian ($\pm 180^\circ$), out-of-bounds rejection, NaN/inf rejection.
- **API contracts:** `POST /api/risk/predict`, `POST /api/v1/risk/predict`, 422 error schemas.
- **GeoJSON output:** `GET /api/risk/zones`, `GET /api/v1/risk/zones`, bounding box filters, MVP disclaimers.
- **Model polymorphism:** `BaseRiskModel` abstraction, `HeuristicRiskModel`, `MLRiskModel`.
- **Data quality:** `HIGH`, `MEDIUM`, `LOW` classification with caveats.
- **Spatial caching:** `TTLSpatialCache` deduplication and sub-second reuse.
- **Frontend build:** TypeScript type check and production bundling (`npm run build`) succeeded with 0 errors.
