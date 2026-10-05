"""Configuration structure for Drishti-Himalaya Risk Assessment Engine.

Encapsulates all weights, threshold boundaries, physical constants,
and calibration parameters into an explicit, configurable dataclass,
eliminating hard-coded magic numbers throughout the codebase.
"""

from dataclasses import dataclass, field
from typing import Dict, Tuple


@dataclass
class RiskModelConfig:
    """Configurable weights, thresholds, and geomorphological constants for risk scoring."""

    # -------------------------------------------------------------------------
    # MCDA Core Factor Weights (Default normalized sum = 1.00)
    # -------------------------------------------------------------------------
    slope_weight: float = 0.35
    rainfall_weight: float = 0.30
    proximity_weight: float = 0.20
    density_weight: float = 0.10
    exposure_weight: float = 0.05

    # -------------------------------------------------------------------------
    # Risk Level Classification Thresholds (Normalized scale [0, 100])
    # 0 - 30: LOW
    # 31 - 60: MEDIUM
    # 61 - 80: HIGH
    # 81 - 100: CRITICAL
    # -------------------------------------------------------------------------
    low_max: float = 30.0
    medium_max: float = 60.0
    high_max: float = 80.0
    critical_max: float = 100.0

    # -------------------------------------------------------------------------
    # Topographic Slope Sigmoidal Parameters (Garhwal/Kumaon Himalayan baseline)
    # -------------------------------------------------------------------------
    slope_min_deg: float = 15.0       # Slopes below 15° have negligible gravitational shear hazard
    slope_repose_deg: float = 35.0    # Typical natural angle of repose for Himalayan colluvium
    slope_max_deg: float = 60.0       # Bedrock cliff inflection point
    slope_steepness: float = 0.18     # Sigmoidal logistic slope gradient factor
    slope_cliff_cap: float = 90.0     # Cap for bare rock cliffs with low soil mantle

    # -------------------------------------------------------------------------
    # Hydro-meteorological Rainfall Initiation Thresholds (LANDSLIP / UK baseline)
    # -------------------------------------------------------------------------
    threshold_p24_mm: float = 75.0    # 24-hour intense rainfall threshold (mm)
    threshold_p72_mm: float = 140.0   # 72-hour cumulative storm threshold (mm)
    threshold_ari_mm: float = 200.0   # 15-day Antecedent Rainfall Index saturation threshold (mm)
    ari_decay_lambda: float = 0.82    # Daily drainage decay factor lambda in (0, 1)
    ari_window_days: int = 15         # Memory window in days for antecedent moisture

    # Rainfall sub-component weights (sum = 1.00)
    weight_p24: float = 0.50
    weight_p72: float = 0.30
    weight_ari: float = 0.20

    # -------------------------------------------------------------------------
    # Historical Landslide Spatial Parameters
    # -------------------------------------------------------------------------
    proximity_decay_m: float = 350.0  # Characteristic distance d0 in meters for exponential decay
    density_critical_ncrit: float = 8.0  # Critical threshold for scars within 1.0 km radius

    # -------------------------------------------------------------------------
    # Anthropogenic Highway Cut-Slope Exposure Parameters
    # -------------------------------------------------------------------------
    cut_slope_angle_threshold_deg: float = 30.0
    cut_slope_high_score: float = 100.0
    cut_slope_baseline_score: float = 20.0

    # -------------------------------------------------------------------------
    # UI Color Tokens
    # -------------------------------------------------------------------------
    color_low: str = "#10B981"       # Green
    color_medium: str = "#EAB308"    # Yellow
    color_high: str = "#F97316"      # Orange
    color_critical: str = "#EF4444"  # Red

    def validate(self) -> None:
        """Validate weight sums and threshold monotonically increasing ordering."""
        weight_sum = (
            self.slope_weight
            + self.rainfall_weight
            + self.proximity_weight
            + self.density_weight
            + self.exposure_weight
        )
        if not (0.99 <= weight_sum <= 1.01):
            raise ValueError(f"Core factor weights must sum to 1.0, got: {weight_sum:.4f}")

        rain_sum = self.weight_p24 + self.weight_p72 + self.weight_ari
        if not (0.99 <= rain_sum <= 1.01):
            raise ValueError(f"Rainfall sub-weights must sum to 1.0, got: {rain_sum:.4f}")

        if not (0.0 < self.low_max < self.medium_max < self.high_max <= self.critical_max):
            raise ValueError(
                f"Thresholds must be strictly monotonic: 0 < {self.low_max} < {self.medium_max} < {self.high_max} <= {self.critical_max}"
            )

        if not (0.0 < self.ari_decay_lambda < 1.0):
            raise ValueError(f"Drainage decay factor lambda must be in (0, 1), got: {self.ari_decay_lambda}")


# Global default baseline configuration
DEFAULT_RISK_CONFIG = RiskModelConfig()
