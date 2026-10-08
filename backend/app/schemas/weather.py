"""Schemas for regional weather summaries and corridor monitoring nodes."""

from pydantic import BaseModel, ConfigDict, Field

from backend.app.schemas.common import AlertLevel


class WeatherMonitoringNode(BaseModel):
    """Meteorological reading at an individual highway telemetry node."""

    model_config = ConfigDict(extra="ignore")

    node_name: str = Field(..., description="Name of the monitoring location (e.g. Rishikesh, Pipalkoti).")
    latitude: float = Field(..., description="Latitude coordinate of the node.")
    longitude: float = Field(..., description="Longitude coordinate of the node.")
    rain_24h_mm: float | None = Field(default=None, ge=0.0, description="24-hour cumulative precipitation in mm, or None if unavailable.")
    status: AlertLevel = Field(..., description="Weather alert color code (GREEN, YELLOW, ORANGE, RED, UNKNOWN).")


class CorridorWeatherSummaryResponse(BaseModel):
    """Response payload for GET /api/v1/weather/corridor-summary."""

    model_config = ConfigDict(extra="ignore")

    corridor: str = Field(..., description="Corridor name (e.g. NH-7 (Rishikesh to Joshimath)).")
    data_mode: str = Field(..., description="Telemetry source mode: DEMO or LIVE.")
    last_updated: str = Field(..., description="ISO 8601 timestamp of last observation.")
    average_rainfall_24h_mm: float | None = Field(default=None, ge=0.0, description="Mean 24h precipitation across all nodes in mm, or None if unavailable.")
    max_rainfall_24h_mm: float | None = Field(default=None, ge=0.0, description="Peak 24h precipitation recorded in corridor in mm, or None if unavailable.")
    average_rainfall_72h_mm: float | None = Field(
        default=None,
        ge=0.0,
        description="Optional 72h corridor average precipitation in mm.",
    )
    active_alert_level: AlertLevel = Field(..., description="Highest active regional alert level.")
    weather_status: str = Field(default="available", description="Telemetry status: available, degraded, or unavailable.")
    monitoring_nodes: list[WeatherMonitoringNode] = Field(
        default_factory=list,
        description="List of regional monitoring stations along the corridor.",
    )
