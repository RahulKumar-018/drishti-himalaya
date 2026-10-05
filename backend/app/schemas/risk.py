"""Pydantic schemas for Phase 2C Risk Assessment and Risk Zones API contracts."""

from datetime import datetime, timezone
import math
from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator


class RiskLocation(BaseModel):
    """Geographic coordinate representation."""

    model_config = ConfigDict(extra="ignore")

    latitude: float = Field(..., description="Latitude in decimal degrees [-90, 90]")
    longitude: float = Field(..., description="Longitude in decimal degrees [-180, 180]")


class RiskFactors(BaseModel):
    """Individual normalized factor scores [0, 100]."""

    model_config = ConfigDict(extra="ignore")

    rainfall: float = Field(..., ge=0.0, le=100.0, description="Hydro-meteorological saturation factor")
    slope: float = Field(..., ge=0.0, le=100.0, description="Topographic slope hazard factor")
    terrain: float = Field(..., ge=0.0, le=100.0, description="Geomorphological terrain stability factor")
    historical: float = Field(..., ge=0.0, le=100.0, description="Historical landslide evidence factor")
    details: Optional[Dict[str, Any]] = Field(default=None, description="Detailed sub-factor breakdowns")


class RiskPredictRequest(BaseModel):
    """Payload to evaluate point hazard risk."""

    model_config = ConfigDict(extra="ignore")

    latitude: float = Field(..., description="Latitude in decimal degrees [-90, 90]", examples=[30.145])
    longitude: float = Field(..., description="Longitude in decimal degrees [-180, 180]", examples=[79.298])
    timestamp: Optional[datetime] = Field(default=None, description="Optional evaluation timestamp")
    rainfall_mm: Optional[float] = Field(default=None, ge=0.0, description="Optional manual rainfall override in mm")
    slope_deg: Optional[float] = Field(default=None, ge=0.0, le=90.0, description="Optional manual slope override in degrees")
    weather_source: Optional[str] = Field(default=None, description="Source provenance (manual, simulated, etc.)")
    model_type: Optional[str] = Field(default="heuristic", description="Model selector ('heuristic' or 'ml')")

    @field_validator("latitude")
    @classmethod
    def validate_lat(cls, v: float) -> float:
        if math.isnan(v) or math.isinf(v):
            raise ValueError(f"Latitude must be a finite number: {v}")
        if not (-90.0 <= v <= 90.0):
            raise ValueError(f"Latitude out of bounds [-90, 90]: {v}")
        return v

    @field_validator("longitude")
    @classmethod
    def validate_lon(cls, v: float) -> float:
        if math.isnan(v) or math.isinf(v):
            raise ValueError(f"Longitude must be a finite number: {v}")
        if not (-180.0 <= v <= 180.0):
            raise ValueError(f"Longitude out of bounds [-180, 180]: {v}")
        return v


class RiskPredictResponse(BaseModel):
    """Standardized response from the hazard risk assessment engine."""

    model_config = ConfigDict(from_attributes=True)

    location: RiskLocation
    risk_score: float = Field(..., ge=0.0, le=100.0, description="Normalized risk score [0, 100]")
    risk_level: str = Field(..., description="Categorical risk tier: LOW, MEDIUM, HIGH, CRITICAL")
    factors: RiskFactors
    explanation: str = Field(..., description="Transparent, human-readable summary of risk drivers")
    contributing_factors: List[str] = Field(default_factory=list, description="List of measurable drivers")
    weather_source: str = Field(..., description="Provenance of meteorological data")
    model_type: str = Field(..., description="Model identifier ('heuristic_mcda' or 'machine_learning')")
    model_version: str = Field(..., description="Active version of the scoring model")
    data_quality: str = Field(..., description="Data quality rating: HIGH, MEDIUM, LOW")
    data_caveats: List[str] = Field(default_factory=list, description="Telemetry caveats or gaps")
    generated_at: datetime = Field(..., description="ISO timestamp of evaluation")


class GeoJSONPolygonGeometry(BaseModel):
    """GeoJSON Polygon geometry structure."""

    type: Literal["Polygon"] = "Polygon"
    coordinates: List[List[List[float]]]


class RiskZoneProperties(BaseModel):
    """Properties for a spatial risk zone."""

    zone_id: str
    zone_name: str
    risk_score: float
    risk_level: str
    color_hex: str
    factors: Dict[str, float]
    model_version: str
    generated_at: datetime
    disclaimer: str = "MVP visualization — not scientifically authoritative hazard boundary"


class RiskZoneFeature(BaseModel):
    """GeoJSON Feature representing a hazard risk zone."""

    type: Literal["Feature"] = "Feature"
    id: str
    geometry: GeoJSONPolygonGeometry
    properties: RiskZoneProperties


class RiskZonesGeoJSONResponse(BaseModel):
    """GeoJSON FeatureCollection containing spatial risk zones."""

    type: Literal["FeatureCollection"] = "FeatureCollection"
    features: List[RiskZoneFeature]
    total_zones: int
    generated_at: datetime
    model_version: str
