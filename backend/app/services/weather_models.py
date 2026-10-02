"""Data models and representations for meteorological features and telemetry."""

from typing import Any, List, Optional
from pydantic import BaseModel, ConfigDict, Field

from backend.app.risk_engine.scoring import rainfall_score


class WeatherFeatures(BaseModel):
    """Normalized hydro-meteorological parameters required for landslide hazard evaluation."""

    model_config = ConfigDict(frozen=True, extra="ignore")

    p24_mm: float = Field(
        ...,
        ge=0.0,
        description="24-hour cumulative precipitation in millimeters.",
    )
    p72_mm: float = Field(
        ...,
        ge=0.0,
        description="72-hour cumulative precipitation in millimeters.",
    )
    ari_mm: float = Field(
        ...,
        ge=0.0,
        description="Antecedent Rainfall Index in mm (15-day window, lambda=0.82 daily decay).",
    )
    daily_history_mm: List[float] = Field(
        default_factory=list,
        description="Precipitation amounts for the prior 15 days [P_{t-1}, P_{t-2}, ..., P_{t-15}] in mm.",
    )
    observed_at: str = Field(
        ...,
        description="ISO 8601 UTC timestamp of observation or telemetry reading.",
    )
    source: str = Field(
        ...,
        description="Provenance of meteorological data: 'OPEN_METEO' (live) or 'DEMO_BASELINE' (offline demo).",
    )

    @property
    def rainfall_score(self) -> float:
        """Evaluate hydro-meteorological saturation sub-score S_rain in [0, 100] using Phase-3 MCDA formula."""
        return rainfall_score(self.p24_mm, self.p72_mm, self.ari_mm)

    def to_dict(self) -> dict[str, Any]:
        """Serialize features dictionary."""
        return {
            "p24_mm": round(self.p24_mm, 2),
            "p72_mm": round(self.p72_mm, 2),
            "ari_mm": round(self.ari_mm, 2),
            "rainfall_score": round(self.rainfall_score, 2),
            "daily_history_mm": [round(x, 2) for x in self.daily_history_mm],
            "observed_at": self.observed_at,
            "source": self.source,
        }


class WeatherQueryResult(BaseModel):
    """Result container for weather service queries."""

    model_config = ConfigDict(frozen=True, extra="ignore")

    is_available: bool = Field(..., description="Whether weather data was successfully obtained.")
    features: Optional[WeatherFeatures] = Field(default=None, description="Extracted weather features if available.")
    error_message: Optional[str] = Field(default=None, description="Diagnostic error description if unavailable.")
    cached: bool = Field(default=False, description="True if result was returned from local in-memory cache.")
