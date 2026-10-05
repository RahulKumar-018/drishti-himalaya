"""Standardized feature vector and data quality evaluation for the risk engine.

Normalizes environmental, topographic, meteorological, and historical features,
handles missing values cleanly with documented fallback policies, and computes
an honest data-quality classification without fabricating confidence scores.
"""

from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from enum import Enum
import math
from typing import Any, Dict, List, Optional, Tuple


class DataQuality(str, Enum):
    """Categorical data quality classification based on feature completeness and reliability."""

    HIGH = "HIGH"        # All critical signals (slope/terrain, rainfall, historical scars) are present.
    MEDIUM = "MEDIUM"    # One critical signal is missing or derived from fallback estimation.
    LOW = "LOW"          # Multiple critical signals are unavailable; risk estimation is degraded.


@dataclass
class EnvironmentalFeatureVector:
    """Standardized input feature vector for risk evaluation models."""

    # -------------------------------------------------------------------------
    # Geographic Location & Temporal Context
    # -------------------------------------------------------------------------
    latitude: float
    longitude: float
    timestamp: datetime = field(default_factory=lambda: datetime.now(timezone.utc))

    # -------------------------------------------------------------------------
    # Topographic & Terrain Features (Copernicus DEM GLO-30 / Field InSAR)
    # -------------------------------------------------------------------------
    elevation_m: Optional[float] = None
    slope_deg: Optional[float] = None
    aspect_deg: Optional[float] = None
    terrain_class: Optional[str] = None

    # -------------------------------------------------------------------------
    # Meteorological & Hydrological Features (LANDSLIP / Multi-Source)
    # -------------------------------------------------------------------------
    rainfall_mm: Optional[float] = None
    rainfall_intensity_mmh: Optional[float] = None
    p24_mm: Optional[float] = None
    p72_mm: Optional[float] = None
    ari_mm: Optional[float] = None
    temperature_c: Optional[float] = None
    humidity_percent: Optional[float] = None
    precipitation_probability: Optional[float] = None

    # -------------------------------------------------------------------------
    # Historical Landslide & Multi-Hazard Evidence (GSI Catalog / Database)
    # -------------------------------------------------------------------------
    distance_to_historical_events_m: Optional[float] = None
    historical_landslide_count_1km: Optional[int] = None
    historical_event_severity: Optional[str] = None
    disaster_events_nearby_count: Optional[int] = None

    # -------------------------------------------------------------------------
    # Geospatial & Anthropogenic Context
    # -------------------------------------------------------------------------
    distance_to_road_m: Optional[float] = None
    distance_to_river_m: Optional[float] = None
    drainage_characteristics: Optional[str] = None
    is_cut_slope: Optional[bool] = None

    # -------------------------------------------------------------------------
    # Provenance & Source Metadata
    # -------------------------------------------------------------------------
    weather_source: str = "historical_dataset"
    is_live_weather: bool = False
    terrain_source: str = "Copernicus DEM GLO-30"
    historical_source: str = "GSI National Landslide Inventory"

    def __post_init__(self) -> None:
        """Validate finite coordinates and physical ranges."""
        if math.isnan(self.latitude) or math.isinf(self.latitude):
            raise ValueError(f"Latitude must be a finite number: {self.latitude}")
        if math.isnan(self.longitude) or math.isinf(self.longitude):
            raise ValueError(f"Longitude must be a finite number: {self.longitude}")
        if not (-90.0 <= self.latitude <= 90.0):
            raise ValueError(f"Latitude {self.latitude} outside valid range [-90.0, 90.0]")
        if not (-180.0 <= self.longitude <= 180.0):
            raise ValueError(f"Longitude {self.longitude} outside valid range [-180.0, 180.0]")

        if self.slope_deg is not None:
            if math.isnan(self.slope_deg) or math.isinf(self.slope_deg):
                raise ValueError("Slope gradient must be a finite number")
            if not (0.0 <= self.slope_deg <= 90.0):
                raise ValueError(f"Slope {self.slope_deg}° is outside physically valid range [0.0°, 90.0°]")

        if self.rainfall_mm is not None:
            if math.isnan(self.rainfall_mm) or math.isinf(self.rainfall_mm):
                raise ValueError("Rainfall must be a finite number")
            if self.rainfall_mm < 0.0:
                raise ValueError(f"Rainfall amount cannot be negative: {self.rainfall_mm} mm")

        # Hydrate p24_mm from rainfall_mm if p24_mm was omitted
        if self.p24_mm is None and self.rainfall_mm is not None:
            self.p24_mm = max(0.0, float(self.rainfall_mm))

        # Default p72 and ari conservatively if only 24h rainfall is present
        if self.p72_mm is None and self.p24_mm is not None:
            # Under single-point observations, 72h accumulation is conservatively >= 24h
            self.p72_mm = self.p24_mm
        if self.ari_mm is None and self.p24_mm is not None:
            # Baseline antecedent wetness estimated from recent 24h rainfall
            self.ari_mm = self.p24_mm * 0.82

    def evaluate_data_quality(self) -> Tuple[DataQuality, List[str]]:
        """Evaluate data quality rating and generate descriptive caveats.

        Rules:
        - HIGH: Slope/terrain, rainfall, and historical scar distance are all present.
        - MEDIUM: Exactly one critical signal is missing and filled via fallback.
        - LOW: Two or more critical signals are missing.
        """
        missing_signals: List[str] = []

        if self.slope_deg is None:
            missing_signals.append("Topographic slope gradient missing (using regional flat/gentle terrain fallback)")
        if self.rainfall_mm is None and self.p24_mm is None:
            missing_signals.append("Precipitation telemetry missing (using dry baseline 0.0mm)")
        if self.distance_to_historical_events_m is None:
            missing_signals.append("Historical landslide scar proximity missing (using conservative catalog fallback)")

        if len(missing_signals) == 0:
            rating = DataQuality.HIGH
        elif len(missing_signals) == 1:
            rating = DataQuality.MEDIUM
        else:
            rating = DataQuality.LOW

        return rating, missing_signals

    def to_dict(self) -> Dict[str, Any]:
        """Convert feature vector to dictionary representation."""
        data = asdict(self)
        data["timestamp"] = self.timestamp.isoformat()
        return data
