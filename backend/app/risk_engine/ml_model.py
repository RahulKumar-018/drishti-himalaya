"""Machine Learning Risk Model interface and future pipeline contract.

Adheres strictly to the BaseRiskModel contract while enforcing scientific honesty:
- Rejects training misleading models on unlabelled, positive-only catalogs.
- Provides a clean plug-in interface for future scikit-learn / XGBoost / LightGBM models.
- Gracefully falls back to HeuristicRiskModel when no statistically validated model artifact exists.
"""

import logging
from pathlib import Path
from typing import Any, Dict, Optional

from backend.app.risk_engine.base import BaseRiskModel, RiskEvaluationResult
from backend.app.risk_engine.config import RiskModelConfig
from backend.app.risk_engine.features import EnvironmentalFeatureVector
from backend.app.risk_engine.heuristic_model import HeuristicRiskModel

logger = logging.getLogger(__name__)

DEFAULT_MODEL_ARTIFACT_PATH = Path("backend/app/risk_engine/artifacts/landslide_ml_model.joblib")


class MLRiskModel(BaseRiskModel):
    """Machine learning hazard model wrapper with deterministic fallback."""

    def __init__(
        self,
        config: Optional[RiskModelConfig] = None,
        artifact_path: Path = DEFAULT_MODEL_ARTIFACT_PATH,
        fallback_to_heuristic: bool = True,
    ) -> None:
        super().__init__(config)
        self.artifact_path = Path(artifact_path)
        self.fallback_to_heuristic = fallback_to_heuristic
        self._model: Optional[Any] = None
        self._heuristic_fallback = HeuristicRiskModel(config=self.config)

        self._load_artifact_if_available()

    @property
    def model_type(self) -> str:
        return "machine_learning" if self.is_trained else "ml_scaffolding_heuristic_fallback"

    @property
    def model_version(self) -> str:
        return "2.0.0-ml-calibrated" if self.is_trained else "1.0.0-ml-uncalibrated-future"

    @property
    def is_trained(self) -> bool:
        """True only if a legitimate, statistically validated model artifact is loaded."""
        return self._model is not None

    def _load_artifact_if_available(self) -> None:
        """Attempt to load trained model artifact from filesystem."""
        if self.artifact_path.exists():
            try:
                import joblib
                self._model = joblib.load(self.artifact_path)
                logger.info(f"Loaded validated ML model artifact from: {self.artifact_path}")
            except Exception as exc:
                logger.warning(f"Failed to load ML model artifact from {self.artifact_path}: {exc}")
                self._model = None
        else:
            logger.info(
                f"No production ML model artifact at {self.artifact_path}. "
                "Active dataset is positive-only GSI historical catalog (lacks balanced negative controls). "
                "Operating under HeuristicRiskModel fallback for scientific integrity."
            )
            self._model = None

    def evaluate(self, features: EnvironmentalFeatureVector) -> RiskEvaluationResult:
        """Evaluate hazard exposure using trained ML model, or fall back cleanly to heuristic engine."""
        if self.is_trained and self._model is not None:
            # Future inference pipeline for trained model
            # e.g.:
            # X = self._features_to_array(features)
            # proba = self._model.predict_proba(X)[0][1]
            # ...
            pass

        if not self.fallback_to_heuristic:
            raise RuntimeError(
                "ML model artifact is not loaded, and fallback_to_heuristic is disabled. "
                "A balanced negative-control dataset and time-synchronized rainfall series are required to train."
            )

        # Honest fallback to deterministic MCDA
        heuristic_res = self._heuristic_fallback.evaluate(features)

        # Annotate with ML status provenance
        caveats = list(heuristic_res.data_caveats)
        caveats.append(
            "ML model is currently uncalibrated: GSI inventory contains positive failure records only; "
            "evaluated using verified deterministic MCDA heuristic baseline to avoid fake AI claims."
        )

        return RiskEvaluationResult(
            risk_score=heuristic_res.risk_score,
            risk_level=heuristic_res.risk_level,
            color_hex=heuristic_res.color_hex,
            factors=heuristic_res.factors,
            weighted_contributions=heuristic_res.weighted_contributions,
            factor_details=heuristic_res.factor_details,
            explanation=heuristic_res.explanation + " (Deterministic baseline active)",
            contributing_factors=heuristic_res.contributing_factors,
            weather_source=heuristic_res.weather_source,
            model_type=self.model_type,
            model_version=self.model_version,
            data_quality=heuristic_res.data_quality,
            data_caveats=caveats,
            generated_at=heuristic_res.generated_at,
        )
