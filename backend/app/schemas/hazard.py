"""Schemas for geotechnical hazard attribution and segment explainability."""

from pydantic import BaseModel, ConfigDict, Field

from backend.app.schemas.common import CoordinatePoint, RiskTier


class SlopeFactorAttribution(BaseModel):
    """Explainability metrics for topographic slope factor (35% weight)."""

    model_config = ConfigDict(extra="ignore")

    value_degrees: float = Field(..., description="Topographic slope angle in degrees.")
    sub_score: float = Field(..., ge=0.0, le=100.0, description="Normalized slope sub-score [0, 100].")
    weight: float = Field(default=0.35, description="Factor weight (35%).")
    weighted_contribution: float = Field(..., description="Contribution to composite score: sub_score * weight.")
    status: str = Field(..., description="Qualitative status (e.g. NORMAL, ELEVATED, CRITICAL).")
    description: str = Field(..., description="Geotechnical explanation of the slope risk.")


class RainfallFactorAttribution(BaseModel):
    """Explainability metrics for hydro-meteorological saturation factor (30% weight)."""

    model_config = ConfigDict(extra="ignore")

    precipitation_24h_mm: float = Field(..., description="24-hour cumulative rainfall in mm.")
    precipitation_72h_mm: float = Field(..., description="72-hour cumulative rainfall in mm.")
    antecedent_rain_index: float = Field(..., description="15-day Antecedent Rainfall Index (ARI) in mm.")
    sub_score: float = Field(..., ge=0.0, le=100.0, description="Normalized rainfall sub-score [0, 100].")
    weight: float = Field(default=0.30, description="Factor weight (30%).")
    weighted_contribution: float = Field(..., description="Contribution to composite score: sub_score * weight.")
    status: str = Field(..., description="Qualitative status (e.g. LOW, NEAR_THRESHOLD, CRITICAL).")
    description: str = Field(..., description="Geotechnical explanation of the rainfall trigger.")


class ProximityFactorAttribution(BaseModel):
    """Explainability metrics for historical landslide proximity factor (20% weight)."""

    model_config = ConfigDict(extra="ignore")

    distance_meters: float = Field(..., ge=0.0, description="Euclidean distance to nearest historical scar in meters.")
    sub_score: float = Field(..., ge=0.0, le=100.0, description="Normalized proximity sub-score [0, 100].")
    weight: float = Field(default=0.20, description="Factor weight (20%).")
    weighted_contribution: float = Field(..., description="Contribution to composite score: sub_score * weight.")
    status: str = Field(..., description="Qualitative status (e.g. LOW, MODERATE, HIGH).")
    description: str = Field(..., description="Geotechnical context of the proximity to mapped failures.")


class DensityFactorAttribution(BaseModel):
    """Explainability metrics for local landslide scar density factor (10% weight)."""

    model_config = ConfigDict(extra="ignore")

    scars_per_sq_km: float = Field(..., ge=0.0, description="Historical landslide scars per square km within 1 km radius.")
    sub_score: float = Field(..., ge=0.0, le=100.0, description="Normalized density sub-score [0, 100].")
    weight: float = Field(default=0.10, description="Factor weight (10%).")
    weighted_contribution: float = Field(..., description="Contribution to composite score: sub_score * weight.")
    status: str = Field(..., description="Qualitative status (e.g. LOW, MODERATE, HIGH).")
    description: str = Field(..., description="Tectonic and geomorphic clustering context.")


class ExposureFactorAttribution(BaseModel):
    """Explainability metrics for anthropogenic road-cut exposure factor (5% weight)."""

    model_config = ConfigDict(extra="ignore")

    is_exposed: bool = Field(..., description="True if slope toe has been excavated or modified for highway.")
    sub_score: float = Field(..., ge=0.0, le=100.0, description="Normalized exposure sub-score [0, 100].")
    weight: float = Field(default=0.05, description="Factor weight (5%).")
    weighted_contribution: float = Field(..., description="Contribution to composite score: sub_score * weight.")
    status: str = Field(..., description="Qualitative status (e.g. LOW, HIGH).")
    description: str = Field(..., description="Anthropogenic excavation risk description.")


class FactorAttribution(BaseModel):
    """Composite container for all 5 MCDA factor attribution breakdowns."""

    model_config = ConfigDict(extra="ignore")

    slope: SlopeFactorAttribution
    rainfall: RainfallFactorAttribution
    proximity_to_scars: ProximityFactorAttribution
    landslide_density: DensityFactorAttribution
    cut_slope_exposure: ExposureFactorAttribution


class SegmentAttributionResponse(BaseModel):
    """Full factor attribution and geotechnical advisory response for a specific road segment."""

    model_config = ConfigDict(extra="ignore")

    segment_id: str = Field(..., description="Unique segment identifier (e.g. seg_nh7_042).")
    corridor: str = Field(..., description="Corridor name (e.g. NH-7).")
    chainage_km: float = Field(..., description="Chainage position from corridor origin in km.")
    coordinates: CoordinatePoint = Field(..., description="Representative coordinate of segment midpoint.")
    overall_risk_score: float | None = Field(default=None, ge=0.0, le=100.0, description="Overall segment hazard score [0, 100], or None if incomplete.")
    risk_tier: RiskTier | None = Field(default=None, description="Risk tier classification, or None if incomplete.")
    color_hex: str | None = Field(default=None, description="Hex color token corresponding to the risk tier, or None if incomplete.")
    factor_attribution: FactorAttribution | None = Field(default=None, description="Breakdown of all 5 contributing risk factors, or None if incomplete.")
    geotechnical_advisory: str = Field(..., description="Actionable geotechnical advisory for transit decision support.")
    is_risk_complete: bool = Field(default=True, description="Whether all 5 factors were available to evaluate risk.")
    missing_features: list[str] = Field(default_factory=list, description="Missing features if evaluation is partial.")
