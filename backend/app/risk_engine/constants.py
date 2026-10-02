"""Constants and weight calibrations for the Drishti-Himalaya Risk Engine.

Based directly on RISK_ENGINE.md and peer-reviewed Himalayan geomorphology.
"""

from backend.app.schemas.common import RiskTier

# MCDA Factor Weights (sum = 1.00)
WEIGHT_SLOPE: float = 0.35
WEIGHT_RAIN: float = 0.30
WEIGHT_PROXIMITY: float = 0.20
WEIGHT_DENSITY: float = 0.10
WEIGHT_EXPOSURE: float = 0.05

# Slope Sigmoidal Parameters
SLOPE_MIN_THRESHOLD_DEG: float = 15.0
SLOPE_MAX_THRESHOLD_DEG: float = 60.0
SLOPE_REPOSE_ANGLE_DEG: float = 35.0
SLOPE_LOGISTIC_STEEPNESS: float = 0.18
SLOPE_CLIFF_CAP_SCORE: float = 90.0

# Rainfall Initiation Thresholds (LANDSLIP / Garhwal baseline)
THRESHOLD_P24_MM: float = 75.0
THRESHOLD_P72_MM: float = 140.0
THRESHOLD_ARI_MM: float = 200.0
ARI_DRAINAGE_LAMBDA: float = 0.82
ARI_WINDOW_DAYS: int = 15

# Rainfall sub-component weights (sum = 1.00)
WEIGHT_RAIN_P24: float = 0.50
WEIGHT_RAIN_P72: float = 0.30
WEIGHT_RAIN_ARI: float = 0.20

# Historical Landslide Proximity Parameters
PROXIMITY_DECAY_SCALE_D0_M: float = 350.0

# Landslide Scar Density Parameters
DENSITY_CRITICAL_NCRIT: float = 8.0

# Anthropogenic Road-Cut Exposure Parameters
EXPOSURE_SLOPE_THRESHOLD_DEG: float = 30.0
EXPOSURE_HIGH_SCORE: float = 100.0
EXPOSURE_BASELINE_SCORE: float = 20.0

# Route Risk Aggregation Weights (sum = 1.00)
WEIGHT_ROUTE_AVG: float = 0.40
WEIGHT_ROUTE_MAX_BOTTLENECK: float = 0.60

# Multi-Objective Pareto Normalization Constants
PARETO_T_NORM_MINUTES: float = 360.0
PARETO_R_NORM: float = 100.0

# Weather-Adaptive Pareto Weights
PARETO_CLEAR_ALPHA: float = 0.70
PARETO_CLEAR_BETA: float = 0.30
PARETO_ALERT_P24_THRESHOLD_MM: float = 50.0
PARETO_ALERT_ALPHA: float = 0.20
PARETO_ALERT_BETA: float = 0.80

# Risk Tier Thresholds
TIER_LOW_MAX: float = 25.0
TIER_MODERATE_MAX: float = 50.0
TIER_HIGH_MAX: float = 75.0

# Visual Color Tokens
COLOR_LOW: str = "#10B981"       # Green
COLOR_MODERATE: str = "#EAB308"  # Yellow
COLOR_HIGH: str = "#F97316"      # Orange
COLOR_SEVERE: str = "#EF4444"    # Red

RISK_TIER_COLORS: dict[RiskTier, str] = {
    RiskTier.LOW: COLOR_LOW,
    RiskTier.MODERATE: COLOR_MODERATE,
    RiskTier.HIGH: COLOR_HIGH,
    RiskTier.SEVERE: COLOR_SEVERE,
}
