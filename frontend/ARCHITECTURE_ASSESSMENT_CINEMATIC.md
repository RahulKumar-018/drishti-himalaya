# Architecture Assessment: Cinematic Three.js Terrain Intelligence Interface

## 1. Existing Architecture Overview
The current Drishti-Himalaya frontend has a foundational split between React UI and a newly scaffolded Three.js background:
- **React UI**: `AppShell` manages navigation (`TopNav`), views (`HomePage`, `DashboardPage`, `MapWorkspacePage`, `RiskAnalysisPage`), and the global state.
- **Three.js Layer**: `DrishtiTerrainScene` exists as a global fixed background under `AppShell`, containing a procedural `Terrain3D`, `CinematicAtmosphere`, and `CorridorPath3D`.
- **Leaflet Layer**: `InteractiveMap` is nested deeply inside `MapWorkspacePage` and currently renders a traditional 2D map on top of the background.

## 2. Alignment with Cinematic Brief
The brief mandates a "Cinematic Three.js Terrain Intelligence Interface" where the **landscape is the interface**. 
Currently, the UI is still a traditional dashboard that happens to have a 3D background. 
- **Missing Cinematic Intro**: The app loads instantly into the dashboard layout. The required boot sequence ("DRISHTI HIMALAYA -> Terrain Emerges") is absent.
- **HUD Clutter**: The `TopNav`, `Footer`, and large panels are visible immediately. The brief requires a "minimal HUD" initially, with progressive disclosure.
- **Layer Integration**: Leaflet and Three.js are currently decoupled. The brief requires them to feel like one system. 

## 3. Phase 1 Implementation Plan (Visual Foundation)
For Phase 1, we will focus strictly on the **Visual Foundation**:
1. **Intro Sequence Management**: 
   - Introduce an `IntroSequence` component that manages the boot sequence ("DRISHTI HIMALAYA", "LOADING CORRIDOR").
   - Update `AppShell` state to handle `cameraState = "intro" | "overview"`.
2. **Minimal HUD Refactor**:
   - Hide the `TopNav` and traditional `Footer` during the overview mode.
   - Introduce the "Top Left", "Top Center", "Top Right" minimal HUD elements defined in the brief for the cinematic overview mode.
3. **Three.js Enhancements**:
   - Enhance `DrishtiTerrainScene` and `Terrain3D` to support the cinematic fade-in.
   - Improve the atmospheric fog and lighting to match the "deep charcoal / near-black" premium aesthetic.
   - Adjust `SceneControls` to support smooth cinematic easing (`lerp`, `easeInOutCubic`) between intro and overview states.
4. **Data Isolation**: 
   - Ensure no fake risk/telemetry is used. The intro will just show "INITIALIZING TERRAIN" and "CONNECTING ENVIRONMENTAL TELEMETRY".

## 4. Future Phases Strategy (2-6)
- **Phase 2 (Route Integration)**: Enhance `CorridorPath3D` to be the primary interaction path, with hover/select logic that triggers camera moves.
- **Phase 3 & 4 (Environmental & Risk)**: Inject the real `envData` and `riskAssessment` (already available at the `App` level) into the Three.js materials/particles.
- **Phase 5 (Intelligence Panel)**: Repurpose the existing `AnalysisPanel` to be the slide-in right-side intelligence panel.
- **Phase 6 (Polish)**: Fine-tune performance, reduce motion fallback, and mobile responsiveness.

## Conclusion
The repository already contains the building blocks (`Canvas`, `Terrain3D`, `AppShell`). The immediate goal for Phase 1 is to **re-orchestrate** these blocks into a cinematic sequence, suppressing the traditional dashboard UI in favor of the minimal terrain HUD.
