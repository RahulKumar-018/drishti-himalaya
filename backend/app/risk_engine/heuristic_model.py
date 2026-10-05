"""Deterministic Heuristic MCDA Risk Model for Drishti-Himalaya.

Implements transparent, explainable Multi-Criteria Decision Analysis (MCDA)
combining topographic slope, hydro-meteorological saturation, and GSI historical
failure catalogs into a normalized [0, 100] risk score with explicit contributing factors.
"""

from datetime import datetime, timezone
import math
from typing import Any, Dict, List, Optional, Tuple

from backend.app.risk_engine.base import BaseRiskModel, RiskEvaluationResult
from backend.app.risk_engine.config import RiskModelConfig
from backend.app.risk_engine.features import DataQuality, EnvironmentalFeatureVector


class HeuristicRiskModel(BaseRiskModel):
    """Deterministic Multi-Criteria Decision Analysis (MCDA) hazard model."""

    def __init__(self, config: Optional[RiskModelConfig] = None) -> None:
        super().__init__(config)

    @property
    def model_type(self) -> str:
        return "heuristic_mcda"

    @property
    def model_version(self) -> str:
        return "1.0.0-deterministic"

    # -------------------------------------------------------------------------
    # Mathematical Sub-Score Transformations
    # -------------------------------------------------------------------------

    def calculate_slope_score(self, slope_deg: Optional[float]) -> Tuple[float, str, str]:
        """Transform topographic slope angle into hazard sub-score [0, 100].

        Sigmoidal response:
        - theta < slope_min (15°): 0.0 (negligible gravitational shear hazard)
        - theta > slope_max (60°): capped at slope_cliff_cap (90.0)
        - 15° <= theta <= 60°: logistic escalation around 35° natural angle of repose
        """
        if slope_deg is None:
            return 0.0, "UNKNOWN", "Slope gradient unavailable (assumed negligible fallback)"

        theta = max(0.0, min(90.0, float(slope_deg)))
        if theta < self.config.slope_min_deg:
            score = 0.0
            status = "LOW"
            desc = f"Gentle terrain gradient ({theta:.1f}°) well below critical initiation threshold (15°)"
        elif theta > self.config.slope_max_deg:
            score = self.config.slope_cliff_cap
            status = "CRITICAL"
            desc = f"Steep rock face / cliff escarpment ({theta:.1f}°) capped at bare-rock threshold"
        else:
            exponent = -self.config.slope_steepness * (theta - self.config.slope_repose_deg)
            score = 100.0 / (1.0 + math.exp(exponent))
            score = max(0.0, min(100.0, score))
            if theta >= self.config.slope_repose_deg:
                status = "CRITICAL" if score >= 80.0 else "HIGH"
                desc = f"Steep slope ({theta:.1f}°) exceeding {self.config.slope_repose_deg:.0f}° natural angle of repose"
            else:
                status = "MODERATE"
                desc = f"Moderate hillside slope ({theta:.1f}°) approaching critical angle"

        return round(score, 2), status, desc

    def calculate_rainfall_score(
        self,
        p24: Optional[float],
        p72: Optional[float],
        ari: Optional[float],
    ) -> Tuple[float, str, str]:
        """Transform precipitation metrics into saturation sub-score [0, 100].

        Normalized weighted combination of 24h intensity, 72h storm accumulation,
        and 15-day Antecedent Rainfall Index (ARI):
        S_rain = min(100, (w_p24 * P24/T24 + w_p72 * P72/T72 + w_ari * ARI/T_ari) * 100)
        """
        if p24 is None and p72 is None and ari is None:
            return 0.0, "LOW", "No precipitation recorded (dry baseline)"

        val_p24 = max(0.0, float(p24 or 0.0))
        val_p72 = max(0.0, float(p72 or val_p24))
        val_ari = max(0.0, float(ari or (val_p24 * 0.82)))

        ratio = (
            self.config.weight_p24 * (val_p24 / self.config.threshold_p24_mm)
            + self.config.weight_p72 * (val_p72 / self.config.threshold_p72_mm)
            + self.config.weight_ari * (val_ari / self.config.threshold_ari_mm)
        )
        score = max(0.0, min(100.0, ratio * 100.0))

        if score >= 80.0:
            status = "CRITICAL"
            desc = f"Extreme hydro-meteorological saturation (24h: {val_p24:.1f}mm, 72h: {val_p72:.1f}mm, ARI: {val_ari:.1f}mm)"
        elif score >= 50.0:
            status = "HIGH"
            desc = f"Heavy rainfall approaching initiation threshold (24h: {val_p24:.1f}mm, ARI: {val_ari:.1f}mm)"
        elif score >= 20.0:
            status = "MODERATE"
            desc = f"Moderate antecedent moisture and showers (24h: {val_p24:.1f}mm)"
        else:
            status = "LOW"
            desc = f"Sub-threshold light rainfall or dry conditions (24h: {val_p24:.1f}mm)"

        return round(score, 2), status, desc

    def calculate_historical_proximity_score(
        self,
        dist_scar_m: Optional[float],
    ) -> Tuple[float, str, str]:
        """Transform distance to nearest GSI landslide failure into sub-score [0, 100].

        Exponential decay: S_prox = 100 * exp(-d / d0) where d0 = 350m.
        """
        if dist_scar_m is None:
            # Conservative catalog baseline: distance assumed >= 10km away
            return 0.0, "LOW", "No nearby historical landslide catalog record"

        d = max(0.0, float(dist_scar_m))
        score = 100.0 * math.exp(-d / self.config.proximity_decay_m)
        score = max(0.0, min(100.0, score))

        if d <= 150.0:
            status = "CRITICAL"
            desc = f"Immediate proximity ({d:.0f}m) to verified historical landslide failure scar"
        elif d <= 350.0:
            status = "HIGH"
            desc = f"Close proximity ({d:.0f}m) to mapped historical landslide zone"
        elif d <= 1000.0:
            status = "MODERATE"
            desc = f"Moderate distance ({d:.0f}m) from recorded historical landslide activity"
        else:
            status = "LOW"
            desc = f"Well clear of historical landslide failures ({d:.0f}m distance)"

        return round(score, 2), status, desc

    def calculate_historical_density_score(
        self,
        scar_density_1km: Optional[int],
    ) -> Tuple[float, str, str]:
        """Transform failure cluster density within 1.0 km radius into sub-score [0, 100].

        S_density = min(100, (N / N_crit) * 100) where N_crit = 8.
        """
        if scar_density_1km is None or scar_density_1km <= 0:
            return 0.0, "LOW", "Zero historical landslide scars mapped within 1.0 km radius"

        count = max(0, int(scar_density_1km))
        score = (float(count) / self.config.density_critical_ncrit) * 100.0
        score = max(0.0, min(100.0, score))

        if count >= 6:
            status = "CRITICAL"
            desc = f"Severe landslide clustering ({count} historical scars within 1.0 km)"
        elif count >= 3:
            status = "HIGH"
            desc = f"Elevated landslide density ({count} historical scars within 1.0 km)"
        else:
            status = "MODERATE"
            desc = f"Isolated historical failure history ({count} scar(s) within 1.0 km)"

        return round(score, 2), status, desc

    def calculate_exposure_score(
        self,
        slope_deg: Optional[float],
        is_cut_slope: Optional[bool],
    ) -> Tuple[float, str, str, bool]:
        """Evaluate anthropogenic highway cut-slope toe excavation hazard."""
        if is_cut_slope is None:
            return 0.0, "UNKNOWN", "Cut-slope status unassessed (neutral partial fallback)", False

        theta = slope_deg or 0.0
        if is_cut_slope and theta > self.config.cut_slope_angle_threshold_deg:
            score = self.config.cut_slope_high_score
            status = "CRITICAL"
            desc = f"Active highway cut-slope toe excavation on steep slope ({theta:.1f}°)"
        else:
            score = self.config.cut_slope_baseline_score
            status = "LOW"
            desc = "Natural slope or low-angle road corridor"

        return score, status, desc, True

    def classify_risk_tier(self, score: float) -> Tuple[str, str]:
        """Classify numerical risk score [0, 100] into categorical tier and UI color.

        Thresholds:
        0 - 30: LOW
        31 - 60: MEDIUM
        61 - 80: HIGH
        81 - 100: CRITICAL
        """
        if score <= self.config.low_max:
            return "LOW", self.config.color_low
        elif score <= self.config.medium_max:
            return "MEDIUM", self.config.color_medium
        elif score <= self.config.high_max:
            return "HIGH", self.config.color_high
        else:
            return "CRITICAL", self.config.color_critical

    # -------------------------------------------------------------------------
    # Core Model Evaluation
    # -------------------------------------------------------------------------

    def evaluate(self, features: EnvironmentalFeatureVector) -> RiskEvaluationResult:
        """Evaluate hazard exposure for the given standardized feature vector."""
        # 1. Calculate factor sub-scores
        s_slope, status_slope, desc_slope = self.calculate_slope_score(features.slope_deg)
        s_rain, status_rain, desc_rain = self.calculate_rainfall_score(
            features.p24_mm, features.p72_mm, features.ari_mm
        )
        s_prox, status_prox, desc_prox = self.calculate_historical_proximity_score(
            features.distance_to_historical_events_m
        )
        s_density, status_density, desc_density = self.calculate_historical_density_score(
            features.historical_landslide_count_1km
        )
        s_exp, status_exp, desc_exp, has_exp = self.calculate_exposure_score(
            features.slope_deg, features.is_cut_slope
        )

        # 2. Weighted synthesis (handling full-data vs partial-data dynamically)
        if has_exp:
            w_slope = self.config.slope_weight * s_slope
            w_rain = self.config.rainfall_weight * s_rain
            w_prox = self.config.proximity_weight * s_prox
            w_density = self.config.density_weight * s_density
            w_exp = self.config.exposure_weight * s_exp
            raw_score = w_slope + w_rain + w_prox + w_density + w_exp
        else:
            # Partial data fallback: re-normalize across remaining weights (sum = 0.95)
            denom = (
                self.config.slope_weight
                + self.config.rainfall_weight
                + self.config.proximity_weight
                + self.config.density_weight
            )
            w_slope = (self.config.slope_weight / denom) * s_slope
            w_rain = (self.config.rainfall_weight / denom) * s_rain
            w_prox = (self.config.proximity_weight / denom) * s_prox
            w_density = (self.config.density_weight / denom) * s_density
            w_exp = 0.0
            raw_score = w_slope + w_rain + w_prox + w_density

        clamped_score = max(0.0, min(100.0, raw_score))
        tier, color = self.classify_risk_tier(clamped_score)

        # 3. Contributing factors and human-readable explanation
        contributing_factors: List[str] = []
        if s_slope >= 50.0:
            contributing_factors.append(f"High slope hazard ({s_slope:.1f}/100): {desc_slope}")
        if s_rain >= 40.0:
            contributing_factors.append(f"Elevated precipitation saturation ({s_rain:.1f}/100): {desc_rain}")
        if s_prox >= 40.0:
            contributing_factors.append(f"Proximity to historical landslide ({s_prox:.1f}/100): {desc_prox}")
        if s_density >= 40.0:
            contributing_factors.append(f"Landslide cluster density ({s_density:.1f}/100): {desc_density}")
        if has_exp and s_exp >= 50.0:
            contributing_factors.append(f"Highway cut-slope destabilization: {desc_exp}")

        if not contributing_factors:
            contributing_factors.append("All physical and meteorological factors within normal stable baselines.")

        summary_explanation = f"Risk Level: {tier} (Score: {clamped_score:.1f}/100). " + " | ".join(contributing_factors)

        # 4. Evaluate data quality
        quality_rating, quality_caveats = features.evaluate_data_quality()

        # 5. Composite factors structure matching API requirements
        factors_dict = {
            "rainfall": s_rain,
            "slope": s_slope,
            "terrain": s_slope,  # General terrain factor mapped from topographic slope
            "historical": round(max(s_prox, s_density), 2),  # Composite historical factor
        }

        weighted_contributions = {
            "slope": round(w_slope, 2),
            "rainfall": round(w_rain, 2),
            "historical_proximity": round(w_prox, 2),
            "historical_density": round(w_density, 2),
            "cut_slope_exposure": round(w_exp, 2),
        }

        factor_details = {
            "slope": {
                "sub_score": s_slope,
                "weight": self.config.slope_weight,
                "contribution": round(w_slope, 2),
                "status": status_slope,
                "description": desc_slope,
            },
            "rainfall": {
                "sub_score": s_rain,
                "weight": self.config.rainfall_weight,
                "contribution": round(w_rain, 2),
                "status": status_rain,
                "description": desc_rain,
            },
            "historical_proximity": {
                "sub_score": s_prox,
                "weight": self.config.proximity_weight,
                "contribution": round(w_prox, 2),
                "status": status_prox,
                "description": desc_prox,
            },
            "historical_density": {
                "sub_score": s_density,
                "weight": self.config.density_weight,
                "contribution": round(w_density, 2),
                "status": status_density,
                "description": desc_density,
            },
            "cut_slope_exposure": {
                "sub_score": s_exp if has_exp else None,
                "weight": self.config.exposure_weight if has_exp else 0.0,
                "contribution": round(w_exp, 2),
                "status": status_exp,
                "description": desc_exp,
            },
        }

        return RiskEvaluationResult(
            risk_score=round(clamped_score, 2),
            risk_level=tier,
            color_hex=color,
            factors=factors_dict,
            weighted_contributions=weighted_contributions,
            factor_details=factor_details,
            explanation=summary_explanation,
            contributing_factors=contributing_factors,
            weather_source=features.weather_source,
            model_type=self.model_type,
            model_version=self.model_version,
            data_quality=quality_rating,
            data_caveats=quality_caveats,
            generated_at=datetime.now(timezone.utc),
        )
