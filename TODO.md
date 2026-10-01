# DRISHTI-HIMALAYA - MASTER DEVELOPMENT ROADMAP (PHASES 0 TO 11)

---

## Progress Overview

- [x] **PHASE 0: Project Initialization & Architectural Blueprint**
- [ ] **PHASE 1: Frontend Foundation**
- [ ] **PHASE 2: Interactive Map and Dashboard**
- [ ] **PHASE 3: Backend API**
- [ ] **PHASE 4: Risk Engine**
- [ ] **PHASE 5: Route Analysis**
- [ ] **PHASE 6: Weather Simulation**
- [ ] **PHASE 7: Database / Data Integration**
- [ ] **PHASE 8: Frontend-Backend Integration**
- [ ] **PHASE 9: Testing and Reliability**
- [ ] **PHASE 10: Deployment**
- [ ] **PHASE 11: Hackathon Demo Polish**

---

## Detailed Phase Breakdown

### PHASE 0 — Project Initialization (CURRENT)
- [x] Inspect workspace and initialize clean root structure.
- [x] Create core architectural specifications:
  - [x] `PROJECT_PLAN.md`: Research background, problem context, target personas, judicial defense.
  - [x] `TECH_STACK.md`: Architectural justification matrix and ₹0.00 budget analysis.
  - [x] `ARCHITECTURE.md`: Frontend -> Backend -> Geospatial -> Risk Engine flow diagram.
  - [x] `API_SPEC.md`: REST endpoints, Pydantic schemas, and sample JSON payloads.
  - [x] `DATABASE_SCHEMA.md`: PostGIS production DDL and SQLite/GeoJSON fallback model.
  - [x] `RISK_ENGINE.md`: Mathematical definitions for all 5 sub-scores, aggregation, and Pareto routing.
  - [x] `TODO.md`: 12-phase development roadmap.
  - [x] `README.md`: Developer quick-start guide and repository onboarding.
  - [x] `.env.example`: Root template separating DEMO and LIVE modes.
  - [x] `.gitignore`: Comprehensive exclusions for Python, Node, and heavy raster caches.
- [x] Create modular folder hierarchy (`frontend/`, `backend/`, `data/`, `docs/`, `scripts/`, `tests/`).

---

### PHASE 1 — Frontend Foundation
- [ ] Initialize Vite + React 19 + TypeScript application in `/frontend`.
- [ ] Configure `package.json` with Leaflet, Lucide icons, and clsx.
- [ ] Set up modern CSS design tokens in `frontend/src/styles/`:
  - [ ] Glacier dark surface (`#080D1A`), glassmorphism card styles, glowing cyan accent borders.
  - [ ] Four risk tier color tokens: Low (`#10B981`), Moderate (`#EAB308`), High (`#F97316`), Severe (`#EF4444`).
- [ ] Define shared TypeScript interfaces in `frontend/src/types/index.ts`.
- [ ] Build reusable atomic components in `frontend/src/components/common/` (`Button`, `Badge`, `Card`, `Drawer`).
- [ ] Create layout frame (`Navbar`, `LayoutShell`) with live corridor and status indicators.

---

### PHASE 2 — Interactive Map and Dashboard
- [ ] Implement Leaflet map component in `frontend/src/components/map/MapView.tsx` centered on Garhwal Himalayas (`30.35° N, 79.20° E`).
- [ ] Add dual tile layers: Topographic Terrain + CartoDB Dark Matter.
- [ ] Build Persistent Route Comparison HUD (`frontend/src/components/dashboard/RouteComparisonHUD.tsx`) showing Route A vs Route B.
- [ ] Build Segment Factor Attribution Drawer (`frontend/src/components/dashboard/SegmentDrawer.tsx`) showing slope, rainfall, and scar distance breakdown.
- [ ] Build dynamic risk legend (`LOW`, `MODERATE`, `HIGH`, `SEVERE`).

---

### PHASE 3 — Backend API
- [ ] Initialize FastAPI application in `backend/app/main.py` with CORS middleware.
- [ ] Create Pydantic schemas in `backend/app/schemas/` matching `API_SPEC.md`.
- [ ] Implement modular API router in `backend/app/api/v1/`:
  - [ ] `POST /api/v1/route/analyze`
  - [ ] `GET /api/v1/hazard/segment/{segment_id}`
  - [ ] `GET /api/v1/weather/corridor-summary`
  - [ ] `GET /api/v1/health`
- [ ] Write unit test harness in `backend/tests/test_api.py`.

---

### PHASE 4 — Risk Engine
- [ ] Implement modular sub-score functions in `backend/app/risk_engine/`:
  - [ ] `slope_score(theta)`: Sigmoidal scaling ($15^\circ - 60^\circ$).
  - [ ] `rainfall_score(p24, p72, ari)`: LANDSLIP empirical thresholds ($T_{24}=75, T_{72}=140, T_{\text{ARI}}=200$).
  - [ ] `proximity_score(d_min)`: Exponential decay ($d_0 = 350\text{ m}$).
  - [ ] `density_score(n_scars_1km)`: Critical density ($N_{\text{crit}} = 8\text{ scars/km}^2$).
  - [ ] `exposure_score(theta, is_cut_slope)`: Cut-slope interaction.
- [ ] Implement `calculate_segment_risk()` returning normalized score [0, 100], risk tier, and hex color.
- [ ] Implement `calculate_route_risk()` with bottleneck penalty ($0.40 R_{\text{avg}} + 0.60 \max(R_i)$).
- [ ] Implement `calculate_route_objective()` for Pareto time vs risk optimization.
- [ ] Write independent unit tests in `backend/tests/test_risk_engine.py`.

---

### PHASE 5 — Route Analysis
- [ ] Implement Shapely polyline segmenter: splits route into uniform 250m elements.
- [ ] Integrate OpenRouteService API client with deterministic local NH-7 fallback route generator.
- [ ] Extract midpoint coordinates, elevation change, and segment headings.
- [ ] Package evaluated segments into standard GeoJSON `FeatureCollection` with embedded styling.

---

### PHASE 6 — Weather Simulation
- [ ] Implement Open-Meteo weather client in `backend/app/services/weather_service.py`.
- [ ] Implement in-memory weather cache with 3-hour TTL.
- [ ] Build interactive frontend Rainfall Simulation Slider (`0` to `150 mm/day`).
- [ ] Enable client-side instantaneous risk recalculation without flooding backend requests.

---

### PHASE 7 — Database / Data Integration
- [ ] Set up SQLAlchemy ORM models in `backend/app/models/` for PostgreSQL and SQLite.
- [ ] Ingest NRSC Landslide Atlas 2023 dataset (11,219 mapped points in Uttarakhand).
- [ ] Build in-memory 2D KD-Tree (`scipy.spatial.KDTree`) for sub-millisecond nearest scar distance queries.
- [ ] Ingest and sample Copernicus DEM GLO-30 slope data for the NH-7 corridor.

---

### PHASE 8 — Frontend-Backend Integration
- [ ] Connect Frontend API service (`services/api.ts`) to FastAPI endpoints.
- [ ] Connect route selector to map: rendering segmented multi-colored polylines on user action.
- [ ] Wire segment click listener to open Factor Attribution Drawer with live data.
- [ ] Verify seamless coordination between HUD metrics and map highlights.

---

### PHASE 9 — Testing and Reliability
- [ ] Execute complete backend test suite (`pytest backend/tests/`).
- [ ] Validate geographic bounding box sanitization (rejecting points outside Uttarakhand).
- [ ] Run frontend production build check (`npm run build`).
- [ ] Validate zero console errors and 60 FPS map panning performance.

---

### PHASE 10 — Deployment
- [ ] Create `Dockerfile` and `docker-compose.yml` for unified execution.
- [ ] Configure static SPA bundle serving from FastAPI static directory for single-port deployment.
- [ ] Document Render / cloud deployment steps.

---

### PHASE 11 — Hackathon Demo Polish
- [ ] Implement quick-demo corridor presets ("Rishikesh to Joshimath", "Devprayag to Srinagar", "Rudraprayag to Chamoli").
- [ ] Polish UI micro-interactions: neon hazard glow, smooth camera fly-to animations on route click.
- [ ] Rehearse the 4-minute pitch script (The Dilemma -> Route Comparison -> Explainability Drawer -> Cloudburst Slider -> Defensible Conclusion).
- [ ] Review defense against the 30 judicial cross-examination questions.
