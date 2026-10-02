"""Request and response schemas for route analysis and hazard evaluation."""

from pydantic import BaseModel, ConfigDict, Field

from backend.app.schemas.common import CoordinatePoint
from backend.app.schemas.geojson import GeoJSONFeatureCollection


class AnalyzeRouteRequest(BaseModel):
    """Payload schema for POST /api/v1/route/analyze."""

    model_config = ConfigDict(extra="ignore")

    origin: CoordinatePoint = Field(..., description="Origin waypoint with coordinates in Uttarakhand.")
    destination: CoordinatePoint = Field(..., description="Destination waypoint with coordinates in Uttarakhand.")
    preference_weight_safety: float = Field(
        default=0.50,
        ge=0.0,
        le=1.0,
        description="Beta parameter [0.0 - 1.0]. Higher values prioritize safety over transit duration.",
        examples=[0.50],
    )
    simulated_rainfall_mm: float | None = Field(
        default=None,
        ge=0.0,
        le=150.0,
        description="Optional uniform rainfall override [0.0 - 150.0 mm] for dynamic stress simulation.",
        examples=[None],
    )


class RouteInfo(BaseModel):
    """Detailed summary and segmented GeoJSON for an individual route alternative."""

    model_config = ConfigDict(extra="ignore")

    route_id: str = Field(..., description="Unique route identifier (e.g. primary_nh7, alt_crest_corridor).")
    summary: str = Field(..., description="Human-readable corridor route description.")
    is_recommended: bool = Field(..., description="True if selected as the optimal route by the Pareto optimizer.")
    total_distance_km: float = Field(..., description="Total route alignment distance in kilometers.")
    estimated_time_minutes: float = Field(..., description="Estimated travel time under current conditions in minutes.")
    composite_route_risk: float | None = Field(
        default=None,
        ge=0.0,
        le=100.0,
        description="Bottleneck-penalized composite route hazard score [0, 100], or None if incomplete.",
    )
    max_bottleneck_risk: float | None = Field(
        default=None,
        ge=0.0,
        le=100.0,
        description="Maximum single segment hazard score along the route [0, 100], or None if incomplete.",
    )
    average_segment_risk: float | None = Field(
        default=None,
        ge=0.0,
        le=100.0,
        description="Length-weighted arithmetic mean of segment risk scores, or None if incomplete.",
    )
    high_risk_segment_count: int = Field(
        default=0,
        ge=0,
        description="Number of segments classified as HIGH risk (50.0 - 74.9).",
    )
    severe_risk_segment_count: int = Field(
        default=0,
        ge=0,
        description="Number of segments classified as SEVERE hazard (75.0 - 100.0).",
    )
    recommendation: str = Field(
        ...,
        description="Operational advisory token (e.g. RECOMMENDED_SAFER_ROUTE, CAUTION_HIGH_RISK).",
    )
    advisory_text: str = Field(..., description="Detailed textual safety guidance for drivers.")
    geojson: GeoJSONFeatureCollection = Field(
        ...,
        description="GeoJSON FeatureCollection containing all 250m evaluated segments.",
    )


class AnalyzeRouteResponse(BaseModel):
    """Top-level response payload for POST /api/v1/route/analyze."""

    model_config = ConfigDict(extra="ignore")

    status: str = Field(default="success", description="Response status indicator: COMPLETE, PARTIAL, or UNAVAILABLE.")
    query_id: str = Field(..., description="UUID tracking this specific route analysis query.")
    execution_duration_ms: float = Field(..., description="Processing time in milliseconds.")
    data_mode: str = Field(..., description="Runtime data mode: DEMO or LIVE.")
    corridor: str = Field(..., description="Target transit corridor descriptor.")
    routes: list[RouteInfo] = Field(..., description="Evaluated route alternatives ranked by Pareto objective.")
    recommended_route_id: str | None = Field(default=None, description="Recommended route ID if complete analysis available.")
    recommendation_available: bool = Field(default=False, description="True if complete information was available to evaluate.")
    data_availability: dict | None = Field(default=None, description="State of data inputs across the pipeline.")
    data_provenance: dict | None = Field(default=None, description="Data source provenance metadata.")
