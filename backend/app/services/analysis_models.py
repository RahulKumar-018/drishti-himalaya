"""Normalized data models and result representations for end-to-end route hazard analysis."""

from enum import Enum
from typing import Any, List, Optional, Tuple
from pydantic import BaseModel, ConfigDict, Field

from backend.app.risk_engine.models import RouteObjectiveResult, RouteRiskResult, SegmentRiskResult


class AnalysisStatus(str, Enum):
    """Execution status and completeness of route hazard analysis."""

    COMPLETE = "COMPLETE"
    PARTIAL = "PARTIAL"
    UNAVAILABLE = "UNAVAILABLE"


class DataProvenance(BaseModel):
    """Tracking of source provenance across all data layers."""

    model_config = ConfigDict(frozen=True, extra="ignore")

    routing_source: str = Field(..., description="Provider source for route alignment (e.g. 'OPENROUTESERVICE', 'DEMO_FIXTURE').")
    weather_source: str = Field(..., description="Provider source for weather telemetry (e.g. 'OPEN_METEO', 'DEMO_BASELINE').")
    landslide_source: str = Field(..., description="Provider source for landslide catalog (e.g. 'GSI').")
    terrain_source: Optional[str] = Field(default=None, description="DEM raster source (e.g. 'COPERNICUS_DEM_GLO30') or None if absent.")
    cut_slope_source: Optional[str] = Field(default=None, description="Engineering survey source for road-cuts or None if absent.")


class DataAvailability(BaseModel):
    """Detailed capability and missing-feature tracking."""

    model_config = ConfigDict(frozen=True, extra="ignore")

    routing: bool = Field(..., description="True if route alignment is available.")
    landslide_inventory: bool = Field(..., description="True if GSI landslide spatial index is loaded.")
    weather: bool = Field(..., description="True if precipitation telemetry was retrieved.")
    terrain: bool = Field(..., description="True if digital elevation and slope raster data are loaded.")
    cut_slope: bool = Field(..., description="True if road cut engineering survey metadata is present.")
    missing_features: List[str] = Field(
        default_factory=list,
        description="List of feature names required for complete risk calculation that are currently unavailable.",
    )


class AnalysisSegmentResult(BaseModel):
    """Evaluated 250m road segment combining geometry, physical features, weather, and risk."""

    model_config = ConfigDict(frozen=True, extra="ignore")

    segment_index: int = Field(..., ge=0, description="0-based sequential segment index along the route.")
    geometry_coords: List[Tuple[float, float]] = Field(..., min_length=2, description="WGS84 [lon, lat] coordinate pairs.")
    segment_length_m: float = Field(..., gt=0.0, description="Metric length of segment in meters.")
    start_chainage_km: float = Field(..., ge=0.0, description="Distance from origin to segment start in km.")
    end_chainage_km: float = Field(..., ge=0.0, description="Distance from origin to segment end in km.")
    midpoint: Tuple[float, float] = Field(..., description="(longitude, latitude) of the geometric midpoint.")
    elevation_m: Optional[float] = Field(default=None, description="DEM elevation in meters (None if unavailable).")
    slope_degrees: Optional[float] = Field(default=None, description="DEM slope gradient in degrees (None if unavailable).")
    p24_mm: Optional[float] = Field(default=None, description="24h cumulative rainfall in mm.")
    p72_mm: Optional[float] = Field(default=None, description="72h cumulative rainfall in mm.")
    ari_mm: Optional[float] = Field(default=None, description="Antecedent Rainfall Index (15-day) in mm.")
    distance_to_historic_scar_m: float = Field(..., ge=0.0, description="Distance to nearest mapped scar in meters.")
    scar_density_1km: float | int = Field(..., ge=0.0, description="Scar count within 1 km radius.")
    is_cut_slope: Optional[bool] = Field(default=None, description="True if engineered road-cut, False if natural, None if unknown.")
    risk_result: Optional[SegmentRiskResult] = Field(default=None, description="MCDA composite risk result (None if partial).")
    is_risk_complete: bool = Field(default=False, description="True if all required factors were available to evaluate risk.")
    missing_features: List[str] = Field(default_factory=list, description="Unpopulated factors preventing full evaluation.")

    def to_geojson_feature(self) -> dict[str, Any]:
        """Convert to GeoJSON Feature with physical and risk properties."""
        props: dict[str, Any] = {
            "segment_index": self.segment_index,
            "segment_length_m": round(self.segment_length_m, 2),
            "start_km": round(self.start_chainage_km, 4),
            "end_km": round(self.end_chainage_km, 4),
            "midpoint": [self.midpoint[0], self.midpoint[1]],
            "elevation_m": round(self.elevation_m, 1) if self.elevation_m is not None else None,
            "slope_degrees": round(self.slope_degrees, 2) if self.slope_degrees is not None else None,
            "p24_mm": round(self.p24_mm, 2) if self.p24_mm is not None else None,
            "precipitation_24h_mm": round(self.p24_mm, 2) if self.p24_mm is not None else None,
            "p72_mm": round(self.p72_mm, 2) if self.p72_mm is not None else None,
            "ari_mm": round(self.ari_mm, 2) if self.ari_mm is not None else None,
            "distance_to_historic_scar_m": round(self.distance_to_historic_scar_m, 2),
            "scar_density_1km": self.scar_density_1km,
            "is_cut_slope": self.is_cut_slope,
            "is_risk_complete": self.is_risk_complete,
            "missing_features": list(self.missing_features),
        }
        if self.risk_result is not None:
            props["segment_risk_score"] = self.risk_result.risk_score
            props["risk_category"] = self.risk_result.risk_category.value
            props["color_hex"] = self.risk_result.color_hex

        return {
            "type": "Feature",
            "id": f"seg_{self.segment_index}",
            "geometry": {
                "type": "LineString",
                "coordinates": [list(c) for c in self.geometry_coords],
            },
            "properties": props,
        }


class AnalysisRouteResult(BaseModel):
    """Complete evaluation of an individual route corridor alignment."""

    model_config = ConfigDict(frozen=True, extra="ignore")

    route_id: str = Field(..., description="Unique route identifier (e.g. 'primary_route').")
    summary: str = Field(default="", description="Corridor summary description.")
    total_distance_km: float = Field(..., gt=0.0, description="Total distance in km.")
    estimated_time_minutes: float = Field(..., gt=0.0, description="Estimated transit time in minutes.")
    status: AnalysisStatus = Field(..., description="Route evaluation status: COMPLETE or PARTIAL.")
    data_availability: DataAvailability = Field(..., description="Feature completeness status.")
    data_provenance: DataProvenance = Field(..., description="Source telemetry metadata.")
    segments: List[AnalysisSegmentResult] = Field(..., description="Ordered list of segmented road intervals.")
    route_risk: Optional[RouteRiskResult] = Field(default=None, description="Bottleneck-penalized route hazard aggregation.")
    objective: Optional[RouteObjectiveResult] = Field(default=None, description="Pareto dual-objective cost evaluation.")
    is_recommended: bool = Field(default=False, description="True if selected by multi-objective optimizer.")
    recommendation_available: bool = Field(default=False, description="True if complete information was available to evaluate.")
    recommendation_text: Optional[str] = Field(default=None, description="Driver safety guidance token or text.")
    high_risk_segment_count: int = Field(default=0, ge=0, description="Count of segments classified as HIGH risk.")
    severe_risk_segment_count: int = Field(default=0, ge=0, description="Count of segments classified as SEVERE hazard.")
    requested_origin: Optional[List[float]] = Field(default=None, description="User requested origin [lon, lat].")
    requested_destination: Optional[List[float]] = Field(default=None, description="User requested destination [lon, lat].")
    snapped_origin: Optional[List[float]] = Field(default=None, description="Actual road access origin [lon, lat].")
    snapped_destination: Optional[List[float]] = Field(default=None, description="Actual road access destination [lon, lat].")
    snapping_distance_origin_m: float = Field(default=0.0, ge=0.0, description="Origin road snapping distance in meters.")
    snapping_distance_destination_m: float = Field(default=0.0, ge=0.0, description="Destination road snapping distance in meters.")
    is_origin_snapped: bool = Field(default=False, description="True if origin required expanded road-snapping.")
    is_destination_snapped: bool = Field(default=False, description="True if destination required expanded road-snapping.")

    def to_geojson(self) -> dict[str, Any]:
        """Export all segment features as standard GeoJSON FeatureCollection."""
        return {
            "type": "FeatureCollection",
            "features": [s.to_geojson_feature() for s in self.segments],
        }


class AnalysisResult(BaseModel):
    """Top-level unified response for end-to-end route hazard orchestration."""

    model_config = ConfigDict(frozen=True, extra="ignore")

    query_id: str = Field(..., description="UUID tracking this analysis execution.")
    status: AnalysisStatus = Field(..., description="Overall analysis status (COMPLETE if all factors present, PARTIAL if missing DEM/cut-slope).")
    data_mode: str = Field(..., description="System data mode: 'DEMO' or 'LIVE'.")
    execution_duration_ms: float = Field(..., ge=0.0, description="Execution time in milliseconds.")
    routes: List[AnalysisRouteResult] = Field(..., min_length=1, description="Evaluated route alignments.")
    recommended_route_id: Optional[str] = Field(default=None, description="ID of Pareto-optimal recommended route.")
    recommendation_available: bool = Field(default=False, description="Whether an authoritative recommendation could be made.")
    data_availability: DataAvailability = Field(..., description="State of data inputs across the pipeline.")
    data_provenance: DataProvenance = Field(..., description="Source provenance across all layers.")
