"""Health check schema representing system readiness and telemetry status."""

from pydantic import BaseModel, ConfigDict, Field


class HealthResponse(BaseModel):
    """Payload schema for GET /api/v1/health matching API_SPEC.md."""

    model_config = ConfigDict(extra="ignore")

    status: str = Field(default="healthy", description="Overall service health indicator.")
    service: str = Field(default="Drishti-Himalaya API", description="Service identifier.")
    version: str = Field(default="1.0.0", description="API version.")
    data_mode: str = Field(..., description="Active data mode: DEMO or LIVE.")
    database: str = Field(..., description="Database connectivity descriptor.")
    weather_api: str = Field(..., description="Weather API service status descriptor.")
    routing_engine: str = Field(..., description="Routing subsystem status descriptor.")
    cached_landslide_scars: int = Field(
        ...,
        ge=0,
        description="Total count of historical landslide points cached in memory / database.",
    )
    corridor_length_km: float = Field(
        ...,
        ge=0.0,
        description="Total monitored corridor length in kilometers.",
    )
