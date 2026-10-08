"""GeoJSON schemas tailored for 250m road segment features and collections."""

from typing import Literal
from pydantic import BaseModel, ConfigDict, Field

from backend.app.schemas.common import RiskTier


class LineStringGeometry(BaseModel):
    """GeoJSON LineString geometry representation."""

    model_config = ConfigDict(extra="ignore")

    type: Literal["LineString"] = "LineString"
    coordinates: list[list[float]] = Field(
        ...,
        description="Array of [longitude, latitude] coordinate pairs defining the segment line.",
        examples=[[[79.3124, 30.3951], [79.3142, 30.3962]]],
    )


class SegmentProperties(BaseModel):
    """Geotechnical and meteorological attributes for a 250m road segment."""

    model_config = ConfigDict(extra="ignore")

    segment_index: int = Field(..., description="0-indexed sequence along the highway corridor.")
    segment_length_m: float = Field(default=250.0, description="Segment length in meters.")
    start_km: float = Field(..., description="Cumulative distance from corridor origin to start of segment.")
    end_km: float = Field(..., description="Cumulative distance from corridor origin to end of segment.")
    slope_degrees: float | None = Field(default=None, description="Mean slope gradient in degrees derived from Copernicus DEM.")
    elevation_m: float | None = Field(default=None, description="Mean elevation in meters above sea level.")
    precipitation_24h_mm: float | None = Field(default=None, description="24-hour cumulative rainfall in mm.")
    distance_to_historic_scar_m: float = Field(..., description="Euclidean distance to nearest mapped landslide scar in meters.")
    scar_density_1km: float = Field(..., description="Historical landslide scar count within 1 km radius.")
    is_cut_slope: bool | None = Field(default=None, description="True if within active anthropogenic road-cut excavation buffer.")
    segment_risk_score: float | None = Field(default=None, ge=0.0, le=100.0, description="Calculated MCDA composite hazard score [0, 100].")
    risk_category: RiskTier | None = Field(default=None, description="Geotechnical risk tier classification.")
    color_hex: str | None = Field(default=None, description="Hex color token for map visualization (e.g. #10B981, #EF4444).")
    midpoint: list[float] | None = Field(default=None, description="[lon, lat] of midpoint.")
    p24_mm: float | None = Field(default=None, description="24h rainfall in mm.")
    p72_mm: float | None = Field(default=None, description="72h rainfall in mm.")
    ari_mm: float | None = Field(default=None, description="ARI index in mm.")
    is_risk_complete: bool = Field(default=False, description="True if all factors were present.")
    missing_features: list[str] = Field(default_factory=list, description="Unpopulated factors preventing full evaluation.")


class SegmentFeature(BaseModel):
    """GeoJSON Feature representing a single evaluated highway segment."""

    model_config = ConfigDict(extra="ignore")

    type: Literal["Feature"] = "Feature"
    id: str | None = Field(default=None, description="Unique segment identifier (e.g. seg_nh7_042).")
    properties: SegmentProperties = Field(..., description="Geotechnical and risk attributes of the segment.")
    geometry: LineStringGeometry = Field(..., description="LineString geometry of the segment.")


class GeoJSONFeatureCollection(BaseModel):
    """GeoJSON FeatureCollection aggregating road segment features for map rendering."""

    model_config = ConfigDict(extra="ignore")

    type: Literal["FeatureCollection"] = "FeatureCollection"
    features: list[SegmentFeature] = Field(
        default_factory=list,
        description="List of GeoJSON segment features.",
    )
