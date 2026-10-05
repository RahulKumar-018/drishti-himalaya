"""Abstract Base Class and result contracts for Drishti-Himalaya Risk Models.

Establishes a pluggable, ML-ready contract (IRiskModel) ensuring that future
machine learning or hybrid models can seamlessly replace or complement
the deterministic MCDA model without modifying downstream APIs or services.
"""

from abc import ABC, abstractmethod
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from backend.app.risk_engine.config import DEFAULT_RISK_CONFIG, RiskModelConfig
from backend.app.risk_engine.features import DataQuality, EnvironmentalFeatureVector


@dataclass
class RiskEvaluationResult:
    """Consolidated result produced by any compliant RiskModel implementation."""

    risk_score: float
    risk_level: str  # "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"
    color_hex: str
    factors: Dict[str, float]  # Normalized sub-scores in [0, 100]
    weighted_contributions: Dict[str, float]
    factor_details: Dict[str, Any]
    explanation: str
    contributing_factors: List[str]
    weather_source: str
    model_type: str
    model_version: str
    data_quality: DataQuality
    data_caveats: List[str]
    generated_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))

    def to_dict(self) -> Dict[str, Any]:
        """Convert evaluation result to dictionary representation."""
        res = asdict(self)
        res["data_quality"] = self.data_quality.value
        res["generated_at"] = self.generated_at.isoformat()
        return res


class BaseRiskModel(ABC):
    """Abstract interface for all hazard risk evaluation models."""

    def __init__(self, config: Optional[RiskModelConfig] = None) -> None:
        self.config = config or DEFAULT_RISK_CONFIG
        self.config.validate()

    @property
    @abstractmethod
    def model_type(self) -> str:
        """Type identifier (e.g. 'heuristic_mcda', 'logistic_regression', 'random_forest')."""
        pass

    @property
    @abstractmethod
    def model_version(self) -> str:
        """Version string of the model."""
        pass

    @abstractmethod
    def evaluate(self, features: EnvironmentalFeatureVector) -> RiskEvaluationResult:
        """Evaluate hazard exposure for the given standardized feature vector.

        Must return a valid RiskEvaluationResult with:
        - risk_score clamped to [0.0, 100.0]
        - risk_level categorized into LOW, MEDIUM, HIGH, or CRITICAL
        - explainable contributing factors
        - data quality indicator
        """
        pass
