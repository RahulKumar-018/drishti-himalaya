"""Core mathematical scoring functions for the Drishti-Himalaya Risk Engine.

Implements all 5 MCDA sub-scores, sigmoidal slope response, LANDSLIP hydro-meteorological
thresholds, exponential scar proximity decay, cluster density, cut-slope interaction,
and factor explainability as specified in RISK_ENGINE.md.
"""

import math
from typing import Sequence

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
    EXPOSURE_SLOPE_THRESHOLD_DEG,
    PROXIMITY_DECAY_SCALE_D0_M,
    SLOPE_CLIFF_CAP_SCORE,
    SLOPE_LOGISTIC_STEEPNESS,
    SLOPE_MAX_THRESHOLD_DEG,
    SLOPE_MIN_THRESHOLD_DEG,
    SLOPE_REPOSE_ANGLE_DEG,
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
    WEIGHT_RAIN_ARI,
    WEIGHT_RAIN_P24,
    WEIGHT_RAIN_P72,
    WEIGHT_SLOPE,
)
from backend.app.risk_engine.models import FactorScoreBreakdown, SegmentRiskResult
from backend.app.schemas.common import RiskTier


def _validate_finite(value: float, name: str) -> None:
    """Validate that a numerical input is finite and not NaN."""
    if not math.isfinite(value):
        raise ValueError(f"Parameter '{name}' must be a finite real number, got: {value}")


def slope_score(theta: float) -> float:
    """Calculate topographic slope hazard sub-score S_slope in [0, 100].

    Piecewise sigmoidal curve:
    - theta < 15°: negligible slope hazard (0.0)
    - 15° <= theta <= 60°: logistic escalation around 35° natural angle of repose
    - theta > 60°: bare bedrock cliff cap (90.0)
    """
    _validate_finite(theta, "theta")
    if theta < 0.0 or theta > 90.0:
        raise ValueError(f"Topographic slope angle must be in [0, 90] degrees, got: {theta}")

    if theta < SLOPE_MIN_THRESHOLD_DEG:
        return 0.0
    if theta > SLOPE_MAX_THRESHOLD_DEG:
        return SLOPE_CLIFF_CAP_SCORE

    # Sigmoid: 100 / (1 + exp(-0.18 * (theta - 35)))
    exponent = -SLOPE_LOGISTIC_STEEPNESS * (theta - SLOPE_REPOSE_ANGLE_DEG)
    score = 100.0 / (1.0 + math.exp(exponent))
    return max(0.0, min(100.0, score))


def calculate_ari(
    daily_rainfall_history_mm: Sequence[float],
    decay_factor: float = ARI_DRAINAGE_LAMBDA,
    window_days: int = ARI_WINDOW_DAYS,
) -> float:
    """Calculate 15-day Antecedent Rainfall Index (ARI) with daily drainage decay.

    ARI_t = sum_{i=1}^{15} (lambda)^i * P_{t-i}
    where P_{t-1} is yesterday's rainfall, P_{t-2} is 2 days ago, etc.
    """
    _validate_finite(decay_factor, "decay_factor")
    if not (0.0 < decay_factor < 1.0):
        raise ValueError(f"Drainage decay factor must be in (0, 1), got: {decay_factor}")

    ari = 0.0
    max_days = min(len(daily_rainfall_history_mm), window_days)
    for i in range(max_days):
        day_index = i + 1  # 1-indexed days prior
        p_val = daily_rainfall_history_mm[i]
        _validate_finite(p_val, f"daily_rainfall[{i}]")
        if p_val < 0.0:
            raise ValueError(f"Daily precipitation cannot be negative, got: {p_val}")
        ari += (decay_factor**day_index) * p_val

    return ari


def rainfall_score(p24: float, p72: float, ari: float) -> float:
    """Calculate hydro-meteorological saturation sub-score S_rain in [0, 100].

    S_rain = min(100, (0.50 * P24/75 + 0.30 * P72/140 + 0.20 * ARI/200) * 100)
    """
    _validate_finite(p24, "p24")
    _validate_finite(p72, "p72")
    _validate_finite(ari, "ari")

    if p24 < 0.0:
        raise ValueError(f"24h precipitation cannot be negative, got: {p24}")
    if p72 < 0.0:
        raise ValueError(f"72h precipitation cannot be negative, got: {p72}")
    if ari < 0.0:
        raise ValueError(f"Antecedent rainfall index cannot be negative, got: {ari}")

    ratio_sum = (
        WEIGHT_RAIN_P24 * (p24 / THRESHOLD_P24_MM)
        + WEIGHT_RAIN_P72 * (p72 / THRESHOLD_P72_MM)
        + WEIGHT_RAIN_ARI * (ari / THRESHOLD_ARI_MM)
    )
    score = ratio_sum * 100.0
    return max(0.0, min(100.0, score))


def proximity_score(d_min: float) -> float:
    """Calculate historical landslide proximity sub-score S_prox in [0, 100].

    S_prox = 100 * exp(-d_min / 350)
    where d_min is Euclidean distance to nearest mapped historical scar in meters.
    """
    _validate_finite(d_min, "d_min")
    if d_min < 0.0:
        raise ValueError(f"Distance to nearest scar cannot be negative, got: {d_min}")

    score = 100.0 * math.exp(-d_min / PROXIMITY_DECAY_SCALE_D0_M)
    return max(0.0, min(100.0, score))


def density_score(n_scars_1km: float | int) -> float:
    """Calculate historical landslide density sub-score S_density in [0, 100].

    S_density = min(100, (N_scars / 8.0) * 100)
    where N_scars is the scar count within a 1.0 km radius.
    """
    _validate_finite(float(n_scars_1km), "n_scars_1km")
    if n_scars_1km < 0:
        raise ValueError(f"Landslide scar count cannot be negative, got: {n_scars_1km}")

    score = (float(n_scars_1km) / DENSITY_CRITICAL_NCRIT) * 100.0
    return max(0.0, min(100.0, score))


def exposure_score(theta: float, is_cut_slope: bool) -> float:
    """Calculate anthropogenic cut-slope exposure sub-score S_exp in [0, 100].

    S_exp = 100.0 if theta > 30° and is_cut_slope is True, else 20.0.
    """
    _validate_finite(theta, "theta")
    if theta < 0.0 or theta > 90.0:
        raise ValueError(f"Slope angle must be in [0, 90] degrees, got: {theta}")

    if theta > EXPOSURE_SLOPE_THRESHOLD_DEG and is_cut_slope:
        return EXPOSURE_HIGH_SCORE
    return EXPOSURE_BASELINE_SCORE


def get_risk_tier_and_color(risk_score: float) -> tuple[RiskTier, str]:
    """Map a composite hazard score [0, 100] to its qualitative tier and hex color."""
    if risk_score < TIER_LOW_MAX:
        return RiskTier.LOW, COLOR_LOW
    if risk_score < TIER_MODERATE_MAX:
        return RiskTier.MODERATE, COLOR_MODERATE
    if risk_score < TIER_HIGH_MAX:
        return RiskTier.HIGH, COLOR_HIGH
    return RiskTier.SEVERE, COLOR_SEVERE


def calculate_segment_risk(
    slope_deg: float,
    p24_mm: float,
    p72_mm: float,
    ari_mm: float,
    dist_scar_m: float,
    scar_density_1km: float | int,
    is_cut_slope: bool = True,
) -> SegmentRiskResult:
    """Evaluate 250m road segment hazard exposure using MCDA mechanistic formulation.

    R_seg = 0.35*S_slope + 0.30*S_rain + 0.20*S_prox + 0.10*S_density + 0.05*S_exp
    """
    s_slope = slope_score(slope_deg)
    s_rain = rainfall_score(p24_mm, p72_mm, ari_mm)
    s_prox = proximity_score(dist_scar_m)
    s_density = density_score(scar_density_1km)
    s_exp = exposure_score(slope_deg, is_cut_slope)

    w_slope = WEIGHT_SLOPE * s_slope
    w_rain = WEIGHT_RAIN * s_rain
    w_prox = WEIGHT_PROXIMITY * s_prox
    w_density = WEIGHT_DENSITY * s_density
    w_exp = WEIGHT_EXPOSURE * s_exp

    r_seg = w_slope + w_rain + w_prox + w_density + w_exp
    r_seg_clamped = max(0.0, min(100.0, r_seg))

    tier, color = get_risk_tier_and_color(r_seg_clamped)

    # Factor explainability and qualitative status attribution
    status_slope = "CRITICAL" if s_slope >= 85.0 else ("ELEVATED" if s_slope >= 50.0 else "NORMAL")
    desc_slope = (
        f"Steep cut-slope ({slope_deg:.1f}°) exceeding 35° natural angle of repose"
        if slope_deg >= 35.0
        else f"Stable topographic terrain gradient ({slope_deg:.1f}°)"
    )

    status_rain = "CRITICAL" if s_rain >= 80.0 else ("ELEVATED" if s_rain >= 40.0 else "LOW")
    desc_rain = (
        f"Rainfall approaching initiation threshold (24h: {p24_mm:.1f}mm, 72h: {p72_mm:.1f}mm)"
        if s_rain >= 50.0
        else f"Sub-threshold precipitation (24h: {p24_mm:.1f}mm)"
    )

    status_prox = "HIGH" if dist_scar_m <= 150.0 else ("MODERATE" if dist_scar_m <= 350.0 else "LOW")
    desc_prox = (
        f"Within {dist_scar_m:.1f}m of mapped historical landslide failure"
        if dist_scar_m <= 350.0
        else f"Well clear of historical landslide scars ({dist_scar_m:.1f}m distance)"
    )

    status_density = "HIGH" if scar_density_1km >= 5.0 else ("MODERATE" if scar_density_1km >= 2.0 else "LOW")
    desc_density = (
        f"Elevated failure clustering near tectonic thrust zone ({scar_density_1km:.1f} scars/km²)"
        if scar_density_1km >= 3.0
        else f"Sparse historical failure density ({scar_density_1km:.1f} scars/km²)"
    )

    status_exp = "HIGH" if (is_cut_slope and slope_deg > 30.0) else "LOW"
    desc_exp = (
        "Active anthropogenic highway cut-slope toe excavation zone"
        if (is_cut_slope and slope_deg > 30.0)
        else "Natural slope or low-angle road alignment"
    )

    factor_details = {
        "slope": FactorScoreBreakdown(
            sub_score=round(s_slope, 2),
            weight=WEIGHT_SLOPE,
            weighted_contribution=round(w_slope, 2),
            status=status_slope,
            description=desc_slope,
        ),
        "rain": FactorScoreBreakdown(
            sub_score=round(s_rain, 2),
            weight=WEIGHT_RAIN,
            weighted_contribution=round(w_rain, 2),
            status=status_rain,
            description=desc_rain,
        ),
        "prox": FactorScoreBreakdown(
            sub_score=round(s_prox, 2),
            weight=WEIGHT_PROXIMITY,
            weighted_contribution=round(w_prox, 2),
            status=status_prox,
            description=desc_prox,
        ),
        "density": FactorScoreBreakdown(
            sub_score=round(s_density, 2),
            weight=WEIGHT_DENSITY,
            weighted_contribution=round(w_density, 2),
            status=status_density,
            description=desc_density,
        ),
        "exp": FactorScoreBreakdown(
            sub_score=round(s_exp, 2),
            weight=WEIGHT_EXPOSURE,
            weighted_contribution=round(w_exp, 2),
            status=status_exp,
            description=desc_exp,
        ),
    }

    return SegmentRiskResult(
        risk_score=round(r_seg_clamped, 2),
        risk_category=tier,
        color_hex=color,
        sub_scores={k: round(v.sub_score, 2) for k, v in factor_details.items()},
        weighted_contributions={k: round(v.weighted_contribution, 2) for k, v in factor_details.items()},
        factor_details=factor_details,
    )
