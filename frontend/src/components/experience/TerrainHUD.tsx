import type { ExperienceMode } from "../../types/route";
import { ModeSelector } from "./ModeSelector";

interface TerrainHUDProps {
  mode: ExperienceMode;
  routeActive: boolean;
  onModeChange: (mode: ExperienceMode) => void;
  analysisMetadata?: {
    totalDistanceKm?: number;
    estimatedTimeMinutes?: number;
    compositeRisk?: number | null;
    scarsCount?: number;
  } | null;
  hideMeta?: boolean;
}

export function TerrainHUD({ mode, routeActive, onModeChange, analysisMetadata, hideMeta = false }: TerrainHUDProps) {
  return (
    <>
      {!hideMeta && (
        <div className="terrain-meta" aria-label="Terrain metadata">
          <span className="eyebrow">UTTARAKHAND / INDIA</span>
          <strong>NH-7 CORRIDOR</strong>
          <span className="meta-note">TERRAIN LAYER · {routeActive ? "ROUTE FOCUS" : "WIDE OVERVIEW"}</span>
        </div>
      )}
      <div className="terrain-controls">
        <ModeSelector value={mode} onChange={onModeChange} disabled={!routeActive} />
        <div className="coordinate-readout">
          <span>{analysisMetadata?.totalDistanceKm ? "EVALUATED SPAN" : "GEOGRAPHIC LAYER"}</span>
          <span>
            {analysisMetadata?.totalDistanceKm
              ? `${analysisMetadata.totalDistanceKm} KM · RISK ${analysisMetadata.compositeRisk != null ? Math.round(analysisMetadata.compositeRisk) : "ASSESSED"}`
              : (analysisMetadata?.scarsCount ? `${analysisMetadata.scarsCount} GSI SCARS · DEM GLO-30` : "WGS84 30.28°N, 78.98°E")}
          </span>
        </div>
      </div>
    </>
  );
}
