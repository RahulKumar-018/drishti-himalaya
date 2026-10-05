"""Pydantic schemas for Phase 2B environmental and geospatial API contracts."""

from datetime import date, datetime
from typing import Any, Dict, List, Optional
import uuid

from pydantic import BaseModel, ConfigDict, Field, field_validator


class LocationCreate(BaseModel):
    """Payload to register a new geographic reference point."""

    model_config = ConfigDict(extra="ignore")

    name: str = Field(..., min_length=1, max_length=255, description="Location name or landmark")
    latitude: float = Field(..., description="Latitude in decimal degrees [-90, 90]")
    longitude: float = Field(..., description="Longitude in decimal degrees [-180, 180]")
    elevation: Optional[float] = Field(None, description="Optional elevation in meters (auto-sampled if omitted)")
    administrative_metadata: Optional[Dict[str, Any]] = Field(default_factory=dict, description="Administrative metadata")

    @field_validator("latitude")
    @classmethod
    def validate_latitude(cls, v: float) -> float:
        if not (-90.0 <= v <= 90.0):
            raise ValueError(f"Latitude out of bounds [-90, 90]: {v}")
        return v

    @field_validator("longitude")
    @classmethod
    def validate_longitude(cls, v: float) -> float:
        if not (-180.0 <= v <= 180.0):
            raise ValueError(f"Longitude out of bounds [-180, 180]: {v}")
        return v


class LocationResponse(BaseModel):
    """Serialized Location representation."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    latitude: float
    longitude: float
    elevation: Optional[float] = None
    administrative_metadata: Optional[Dict[str, Any]] = None
    created_at: datetime
    updated_at: datetime


class LocationListResponse(BaseModel):
    """Paginated list of locations."""

    total: int
    locations: List[LocationResponse]


class TerrainObservationResponse(BaseModel):
    """Topographic and geomorphological metrics response."""

    model_config = ConfigDict(from_attributes=True)

    id: Optional[str] = None
    location_id: Optional[str] = None
    elevation_m: Optional[float] = None
    slope_degrees: Optional[float] = None
    aspect_degrees: Optional[float] = None
    terrain_class: Optional[str] = None
    source: str
    source_reference: Optional[str] = None
    observation_time: Optional[datetime] = None


class DisasterEventResponse(BaseModel):
    """Historical or documented disaster event response."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    location_id: Optional[str] = None
    event_type: str
    event_date: Optional[date] = None
    severity: Optional[str] = None
    source: str
    source_reference: Optional[str] = None
    description: Optional[str] = None
    latitude: float
    longitude: float
    is_historical: bool
    created_at: datetime


class WeatherObservationResponse(BaseModel):
    """Meteorological telemetry response with explicit data provenance."""

    latitude: float
    longitude: float
    observation_time: datetime
    forecast_time: Optional[datetime] = None
    rainfall_mm: Optional[float] = None
    temperature_c: Optional[float] = None
    humidity_percent: Optional[float] = None
    wind_speed_kmh: Optional[float] = None
    precipitation_probability: Optional[float] = None
    weather_source: str
    source_type: str  # historical_dataset | weather_api | manual | simulated
    is_live: bool = False
    p24_mm: Optional[float] = None
    p72_mm: Optional[float] = None
    ari_mm: Optional[float] = None
    wind_gusts_kmh: Optional[float] = None
    weather_code: Optional[int] = None
    retrieved_at: Optional[datetime] = None


class LocationEnvironmentResponse(BaseModel):
    """Comprehensive 7-signal environmental bundle for future risk engine."""

    location: LocationResponse
    terrain: TerrainObservationResponse
    historical_disasters: Dict[str, Any]
    weather: WeatherObservationResponse
    provenance: Dict[str, Any]
