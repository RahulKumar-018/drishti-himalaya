"""Data models and result containers for the Drishti-Himalaya Risk Engine."""

from dataclasses import asdict, dataclass
from typing import Any

from backend.app.schemas.common import RiskTier


@dataclass(frozen=True)
class FactorScoreBreakdown:
    """Individual factor score, assigned weight, and weighted contribution."""

    sub_score: float
    weight: float
    weighted_contribution: float
    status: str
    description: str


@dataclass(frozen=True)
class SegmentRiskResult:
    """Structured result of a single 250m road segment hazard evaluation."""

    risk_score: float
    risk_category: RiskTier
    color_hex: str
    sub_scores: dict[str, float]
    weighted_contributions: dict[str, float]
    factor_details: dict[str, FactorScoreBreakdown]
    is_partial: bool = False

    def to_dict(self) -> dict[str, Any]:
        """Convert result to dictionary matching RISK_ENGINE.md format."""
        return {
            "risk_score": self.risk_score,
            "risk_category": self.risk_category.value,
            "color_hex": self.color_hex,
            "sub_scores": self.sub_scores,
            "weighted_contributions": self.weighted_contributions,
            "is_partial": self.is_partial,
        }

    def __getitem__(self, item: str) -> Any:
        """Allow dictionary-style subscript access."""
        return getattr(self, item)


@dataclass(frozen=True)
class RouteRiskResult:
    """Result of length-weighted, bottleneck-penalized composite route hazard calculation."""

    average_risk: float
    max_bottleneck_risk: float
    composite_route_risk: float
    segment_count: int
    total_length_m: float

    def to_dict(self) -> dict[str, Any]:
        """Convert route aggregation result to dictionary."""
        return asdict(self)


@dataclass(frozen=True)
class RouteObjectiveResult:
    """Multi-objective Pareto optimization evaluation result."""

    cost: float
    alpha: float
    beta: float
    normalized_time: float
    normalized_risk: float
    is_heavy_rain_mode: bool

    def to_dict(self) -> dict[str, Any]:
        """Convert optimization result to dictionary."""
        return asdict(self)
