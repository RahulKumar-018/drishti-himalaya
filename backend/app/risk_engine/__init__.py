"""Mechanistic MCDA Hazard Risk Engine for Drishti-Himalaya."""

from backend.app.risk_engine.aggregation import (
    calculate_route_objective,
    calculate_route_risk,
)
from backend.app.risk_engine.base import (
    BaseRiskModel,
    RiskEvaluationResult,
)
from backend.app.risk_engine.config import (
    DEFAULT_RISK_CONFIG,
    RiskModelConfig,
)
from backend.app.risk_engine.constants import (
    ARI_DRAINAGE_LAMBDA,
    ARI_WINDOW_DAYS,
    COLOR_HIGH,
    COLOR_LOW,
    COLOR_MODERATE,
    COLOR_SEVERE,
    DENSITY_CRITICAL_NCRIT,
    EXPOSURE_BASELINE_SCORE,
    EXPOSURE_HIGH_SCORE,
    PARETO_ALERT_ALPHA,
    PARETO_ALERT_BETA,
    PARETO_CLEAR_ALPHA,
    PARETO_CLEAR_BETA,
    PARETO_R_NORM,
    PARETO_T_NORM_MINUTES,
    PARTIAL_WEIGHT_DENOMINATOR,
    PROXIMITY_DECAY_SCALE_D0_M,
    RISK_TIER_COLORS,
    THRESHOLD_ARI_MM,
    THRESHOLD_P24_MM,
    THRESHOLD_P72_MM,
    TIER_HIGH_MAX,
    TIER_LOW_MAX,
    TIER_MODERATE_MAX,
    WEIGHT_DENSITY,
    WEIGHT_EXPOSURE,
    WEIGHT_PROXIMITY,
    WEIGHT_RAIN,
    WEIGHT_ROUTE_AVG,
    WEIGHT_ROUTE_MAX_BOTTLENECK,
    WEIGHT_SLOPE,
)
from backend.app.risk_engine.features import (
    DataQuality,
    EnvironmentalFeatureVector,
)
from backend.app.risk_engine.heuristic_model import HeuristicRiskModel
from backend.app.risk_engine.ml_model import MLRiskModel
from backend.app.risk_engine.models import (
    FactorScoreBreakdown,
    RouteObjectiveResult,
    RouteRiskResult,
    SegmentRiskResult,
)
from backend.app.risk_engine.scoring import (
    calculate_ari,
    calculate_segment_risk,
    density_score,
    exposure_score,
    get_risk_tier_and_color,
    proximity_score,
    rainfall_score,
    slope_score,
)


def __getattr__(name: str):
    """Lazy-load service classes to prevent circular import during package initialization."""
    if name in ("SpatialRiskService", "get_spatial_risk_service"):
        from backend.app.risk_engine.service import (
            SpatialRiskService,
            get_spatial_risk_service,
        )
        if name == "SpatialRiskService":
            return SpatialRiskService
        return get_spatial_risk_service
    raise AttributeError(f"module '{__name__}' has no attribute '{name}'")


__all__ = [
    # Scoring Functions
    "slope_score",
    "calculate_ari",
    "rainfall_score",
    "proximity_score",
    "density_score",
    "exposure_score",
    "get_risk_tier_and_color",
    "calculate_segment_risk",
    # Aggregation & Optimization
    "calculate_route_risk",
    "calculate_route_objective",
    # Models & Dataclasses
    "FactorScoreBreakdown",
    "SegmentRiskResult",
    "RouteRiskResult",
    "RouteObjectiveResult",
    # Calibration Constants & Thresholds
    "WEIGHT_SLOPE",
    "WEIGHT_RAIN",
    "WEIGHT_PROXIMITY",
    "WEIGHT_DENSITY",
    "WEIGHT_EXPOSURE",
    "WEIGHT_ROUTE_AVG",
    "WEIGHT_ROUTE_MAX_BOTTLENECK",
    "THRESHOLD_P24_MM",
    "THRESHOLD_P72_MM",
    "THRESHOLD_ARI_MM",
    "ARI_DRAINAGE_LAMBDA",
    "ARI_WINDOW_DAYS",
    "PROXIMITY_DECAY_SCALE_D0_M",
    "DENSITY_CRITICAL_NCRIT",
    "EXPOSURE_BASELINE_SCORE",
    "EXPOSURE_HIGH_SCORE",
    "PARETO_T_NORM_MINUTES",
    "PARETO_R_NORM",
    "PARETO_CLEAR_ALPHA",
    "PARETO_CLEAR_BETA",
    "PARETO_ALERT_ALPHA",
    "PARETO_ALERT_BETA",
    "PARTIAL_WEIGHT_DENOMINATOR",
    "TIER_LOW_MAX",
    "TIER_MODERATE_MAX",
    "TIER_HIGH_MAX",
    "COLOR_LOW",
    "COLOR_MODERATE",
    "COLOR_HIGH",
    "COLOR_SEVERE",
    "RISK_TIER_COLORS",
    # Phase 2C Architecture & Models
    "RiskModelConfig",
    "DEFAULT_RISK_CONFIG",
    "EnvironmentalFeatureVector",
    "DataQuality",
    "BaseRiskModel",
    "RiskEvaluationResult",
    "HeuristicRiskModel",
    "MLRiskModel",
    "SpatialRiskService",
    "get_spatial_risk_service",
]
