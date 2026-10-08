"""Common schemas, enums, and coordinate primitives for Drishti-Himalaya."""

from enum import Enum
from pydantic import BaseModel, ConfigDict, Field, field_validator

from backend.app.core.config import settings


class RiskTier(str, Enum):
    """Documented geotechnical hazard tiers."""

    LOW = "LOW"
    MODERATE = "MODERATE"
    HIGH = "HIGH"
    SEVERE = "SEVERE"
    INDETERMINATE = "INDETERMINATE"


class AlertLevel(str, Enum):
    """Regional and corridor meteorological alert statuses."""

    GREEN = "GREEN"
    YELLOW = "YELLOW"
    ORANGE = "ORANGE"
    RED = "RED"
    UNKNOWN = "UNKNOWN"


class CoordinatePoint(BaseModel):
    """Geographic coordinate representation validated against the Uttarakhand bounding box."""

    model_config = ConfigDict(extra="ignore")

    latitude: float = Field(
        ...,
        description=f"Latitude in decimal degrees (must be within Uttarakhand: {settings.LAT_MIN} to {settings.LAT_MAX}).",
        examples=[30.1033],
    )
    longitude: float = Field(
        ...,
        description=f"Longitude in decimal degrees (must be within Uttarakhand: {settings.LON_MIN} to {settings.LON_MAX}).",
        examples=[78.2947],
    )
    name: str | None = Field(
        default=None,
        description="Optional human-readable landmark or waypoint label.",
        examples=["Rishikesh"],
    )

    @field_validator("latitude")
    @classmethod
    def validate_latitude(cls, v: float) -> float:
        """Validate latitude strictly within Uttarakhand bounds."""
        if v < settings.LAT_MIN or v > settings.LAT_MAX:
            raise ValueError(
                f"Latitude {v} is outside the valid Uttarakhand bounding box ({settings.LAT_MIN} to {settings.LAT_MAX})."
            )
        return v

    @field_validator("longitude")
    @classmethod
    def validate_longitude(cls, v: float) -> float:
        """Validate longitude strictly within Uttarakhand bounds."""
        if v < settings.LON_MIN or v > settings.LON_MAX:
            raise ValueError(
                f"Longitude {v} is outside the valid Uttarakhand bounding box ({settings.LON_MIN} to {settings.LON_MAX})."
            )
        return v
