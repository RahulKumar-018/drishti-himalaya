# Drishti-Himalaya (दृष्टि हिमालय)

### AI-Assisted Himalayan Road Hazard Risk Assessment & Safer Route Recommendation System

[![FastAPI](https://img.shields.io/badge/Backend-FastAPI_0.110+-009688.svg?logo=fastapi)](https://fastapi.tiangolo.com)
[![React](https://img.shields.io/badge/Frontend-React_19_TypeScript-61DAFB.svg?logo=react)](https://react.dev)
[![Vite](https://img.shields.io/badge/Bundler-Vite_6.0+-646CFF.svg?logo=vite)](https://vitejs.dev)
[![Leaflet](https://img.shields.io/badge/GIS-Leaflet_1.9+-199900.svg?logo=leaflet)](https://leafletjs.com)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Zero-Rupee Budget](https://img.shields.io/badge/Budget-₹0.00_(Open_Data)-green.svg)]()

---

## 1. Project Overview & Scientific Framing

**Drishti-Himalaya** is an explainable, physics-aware, and data-driven decision-support system engineered specifically for high-risk Himalayan transportation corridors.

Its primary operational pilot corridor is **National Highway 7 (NH-7, Rishikesh to Joshimath, 156 km)** along the Alaknanda River valley in Uttarakhand, India—the primary access artery for the Char Dham pilgrimage (Badrinath, Kedarnath) and high-altitude logistics.

> [!IMPORTANT]
> **Scientific Defensibility & Decision-Support Principle:**
> Drishti-Himalaya adheres strictly to a **decision-support paradigm**. It estimates **relative, segment-level hazard risk indices**, rather than claiming "deterministic prediction" of the exact timing of slope failures. It bridges the critical operational gap between macro-scale scientific geoscience data (Copernicus DEM, NRSC Landslide Atlas, GSI Bhukosh) and actionable vehicular transit safety.

---

## 2. Core Mathematical Risk Formulation

The platform disaggregates highway alignments into uniform **250-meter** discrete linear segments. Each segment is evaluated via a Mechanistic Multi-Criteria Decision Analysis (MCDA) model:

$$R_{\text{seg}} = 0.35 \cdot S_{\text{slope}} + 0.30 \cdot S_{\text{rain}} + 0.20 \cdot S_{\text{prox}} + 0.10 \cdot S_{\text{density}} + 0.05 \cdot S_{\text{exp}}$$

| Sub-Score | Weight | Key Variables & Scientific Basis |
| :--- | :---: | :--- |
| **Topographic Slope ($S_{\text{slope}}$)** | **35%** | Horn's slope from 30m Copernicus DEM; sigmoidal response ($15^\circ - 60^\circ$). |
| **Dynamic Rainfall ($S_{\text{rain}}$)** | **30%** | Hourly Open-Meteo precipitation ($P_{24}$ threshold 75mm, $P_{72}$ threshold 140mm, ARI threshold 200mm). |
| **Historical Scar Proximity ($S_{\text{prox}}$)** | **20%** | Euclidean distance to nearest mapped failure (11,219 NRSC/ISRO scars) with $d_0 = 350\text{ m}$ exponential decay. |
| **Landslide Scar Density ($S_{\text{density}}$)** | **10%** | Spatial clustering within 1 km radius circle (critical threshold $N_{\text{crit}} = 8\text{ scars/km}^2$). |
| **Cut-Slope Exposure ($S_{\text{exp}}$)** | **5%** | Anthropogenic toe excavation and steep road-cut interaction ($>30^\circ$ slope in cut-slope buffer). |

### Risk Tiers & Visual Coding
- `0.0 – 24.9`: **LOW RISK** (`#10B981` Green) — Normal mountain travel conditions.
- `25.0 – 49.9`: **MODERATE RISK** (`#EAB308` Yellow) — Active monitoring; minor ravelling possible.
- `50.0 – 74.9`: **HIGH RISK** (`#F97316` Orange) — Debris falls likely under rain; delays expected.
- `75.0 – 100.0`: **SEVERE HAZARD** (`#EF4444` Red) — Imminent failure potential; travel strongly discouraged.

### Bottleneck-Penalized Route Aggregation
To prevent dangerous arithmetic masking (where a deadly 500m failure zone gets hidden inside a 100km average):
$$R_{\text{route}} = 0.40 \cdot R_{\text{avg}} + 0.60 \cdot \max(R_i)$$

---

## 3. Repository Architecture

```
drishti-himalya/
├── frontend/                     # React 19 + TypeScript + Vite + Leaflet UI
│   ├── src/
│   │   ├── components/           # map, dashboard, route, risk, common
│   │   ├── pages/                # Main dashboard page
│   │   ├── services/             # API client
│   │   ├── hooks/                # Custom React hooks
│   │   ├── types/                # TypeScript interfaces
│   │   ├── utils/                # Coordinate math & formatters
│   │   ├── data/                 # Client fixtures
│   │   ├── App.tsx
│   │   └── main.tsx
│   └── package.json
├── backend/                      # Python 3.10+ FastAPI Application
│   ├── app/
│   │   ├── main.py               # ASGI application entrypoint
│   │   ├── api/v1/               # REST router endpoints
│   │   ├── core/                 # Settings, config, database
│   │   ├── models/               # SQLAlchemy models
│   │   ├── schemas/              # Pydantic request/response schemas
│   │   ├── services/             # Routing, weather, simulation services
│   │   ├── risk_engine/          # Modular MCDA functions
│   │   ├── routing/              # ORS & Shapely polyline segmenter
│   │   ├── geospatial/           # DEM Horn slope & KD-Tree spatial index
│   │   └── data/                 # Fixtures & static caches
│   ├── tests/                    # PyTest test suite
│   └── requirements.txt
├── data/                         # Geospatial datasets (raw, processed, fixtures)
├── docs/                         # Extended documentation
├── scripts/                      # Helper & data preprocessing scripts
├── tests/                        # Integration test suite
├── PROJECT_PLAN.md               # Master engineering blueprint
├── TECH_STACK.md                 # Technology rationale & budget analysis
├── ARCHITECTURE.md               # Dataflow & component interactions
├── API_SPEC.md                   # OpenAPI schemas & endpoint contracts
├── DATABASE_SCHEMA.md            # PostGIS & SQLite fallback schemas
├── RISK_ENGINE.md                # Mathematical formulas & edge cases
├── TODO.md                       # Phase 0 to 11 development roadmap
├── README.md                     # This file
├── .env.example                  # Environment template (DEMO vs LIVE)
└── .gitignore                    # Version control exclusions
```

---

## 4. Quick Start Guide

### Prerequisites
- **Node.js:** v18.0.0 or higher (v24 recommended)
- **npm:** v9.0.0 or higher
- **Python:** v3.10 or higher (v3.14 verified)

### Step 1: Clone & Configure Environment
```bash
# Copy environment configuration
cp .env.example .env
```
*(By default, `DATA_MODE=DEMO` is enabled for instant, zero-dependency offline execution).*

### Step 2: Install Backend Dependencies & Run Server
```bash
# Setup Python virtual environment
python -m venv venv

# Activate virtual environment
# Windows PowerShell:
.\venv\Scripts\Activate.ps1
# Linux / macOS:
source venv/bin/activate

# Install dependencies
pip install -r backend/requirements.txt

# Start FastAPI development server
uvicorn backend.app.main:app --reload --port 8000
```
- API Base: `http://localhost:8000`
- Interactive Swagger UI: `http://localhost:8000/docs`

### Step 3: Install Frontend Dependencies & Run Web App
```bash
cd frontend
npm install
npm run dev
```
- Web Application: `http://localhost:5173`

---

## 5. Development Phases

The project is built phase by phase with verification gates:

- **Phase 0:** Project Initialization & Blueprint (Done)
- **Phase 1:** Frontend Foundation (Vite, TS, Design System)
- **Phase 2:** Interactive Map & Dashboard
- **Phase 3:** Backend API
- **Phase 4:** Risk Engine
- **Phase 5:** Route Analysis
- **Phase 6:** Weather Simulation
- **Phase 7:** Database / Data Integration
- **Phase 8:** Frontend-Backend Integration
- **Phase 9:** Testing & Reliability
- **Phase 10:** Deployment
- **Phase 11:** Hackathon Demo Polish

---

## 6. Key Documentation Links

- [PROJECT_PLAN.md](file:///d:/Projetcs/drishti-himalya/PROJECT_PLAN.md) — Comprehensive problem context, target users, and judicial defense.
- [TECH_STACK.md](file:///d:/Projetcs/drishti-himalya/TECH_STACK.md) — Rationale for all technology choices.
- [ARCHITECTURE.md](file:///d:/Projetcs/drishti-himalya/ARCHITECTURE.md) — Complete request lifecycle and dataflow pipeline.
- [API_SPEC.md](file:///d:/Projetcs/drishti-himalya/API_SPEC.md) — REST API schemas, endpoints, and status codes.
- [DATABASE_SCHEMA.md](file:///d:/Projetcs/drishti-himalya/DATABASE_SCHEMA.md) — PostgreSQL/PostGIS and SQLite schemas.
- [RISK_ENGINE.md](file:///d:/Projetcs/drishti-himalya/RISK_ENGINE.md) — Mathematical risk scoring specifications.
- [TODO.md](file:///d:/Projetcs/drishti-himalya/TODO.md) — Phase-by-phase development task checklist.
