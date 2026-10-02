"""Route risk aggregation and multi-objective Pareto optimization functions.

Implements length-weighted bottleneck-penalized route hazard calculation (R_route)
and weather-adaptive transit duration vs hazard trade-off optimization (J(P)).
"""

import math
from typing import Sequence

from backend.app.risk_engine.constants import (
    PARETO_ALERT_ALPHA,
    PARETO_ALERT_BETA,
    PARETO_ALERT_P24_THRESHOLD_MM,
    PARETO_CLEAR_ALPHA,
    PARETO_CLEAR_BETA,
    PARETO_R_NORM,
    PARETO_T_NORM_MINUTES,
    WEIGHT_ROUTE_AVG,
    WEIGHT_ROUTE_MAX_BOTTLENECK,
)
from backend.app.risk_engine.models import RouteObjectiveResult, RouteRiskResult


def calculate_route_risk(
    segment_risks: Sequence[float],
    segment_lengths_m: Sequence[float] | None = None,
    default_segment_length_m: float = 250.0,
) -> RouteRiskResult:
    """Aggregate individual segment hazard scores using bottleneck-penalized formulation.

    R_route = 0.40 * R_avg + 0.60 * max(R_i)
    where R_avg is the length-weighted mean across all corridor segments.
    """
    if not segment_risks:
        raise ValueError("Cannot calculate route risk for empty segment list.")

    for i, r in enumerate(segment_risks):
        if not math.isfinite(r) or r < 0.0 or r > 100.0:
            raise ValueError(f"Segment risk at index {i} must be in [0, 100], got: {r}")

    n = len(segment_risks)

    if segment_lengths_m is not None:
        if len(segment_lengths_m) != n:
            raise ValueError(
                f"Length mismatch: {n} segment risks vs {len(segment_lengths_m)} segment lengths."
            )
        total_length = sum(segment_lengths_m)
        if total_length <= 0.0 or not math.isfinite(total_length):
            raise ValueError("Total route length must be positive and finite.")
        for i, length in enumerate(segment_lengths_m):
            if length <= 0.0 or not math.isfinite(length):
                raise ValueError(f"Segment length at index {i} must be positive, got: {length}")

        weighted_sum = sum(r * length for r, length in zip(segment_risks, segment_lengths_m))
        r_avg = weighted_sum / total_length
    else:
        total_length = float(n * default_segment_length_m)
        r_avg = sum(segment_risks) / float(n)

    r_max = max(segment_risks)
    r_route = (WEIGHT_ROUTE_AVG * r_avg) + (WEIGHT_ROUTE_MAX_BOTTLENECK * r_max)
    r_route_clamped = max(0.0, min(100.0, r_route))

    return RouteRiskResult(
        average_risk=round(r_avg, 2),
        max_bottleneck_risk=round(r_max, 2),
        composite_route_risk=round(r_route_clamped, 2),
        segment_count=n,
        total_length_m=round(total_length, 2),
    )


def calculate_route_objective(
    travel_time_minutes: float,
    composite_route_risk: float,
    p24_mm: float = 0.0,
    alpha: float | None = None,
    beta: float | None = None,
) -> RouteObjectiveResult:
    """Evaluate Pareto dual-objective optimization cost function J(P).

    min J(P) = alpha * (T / T_norm) + beta * (R_route / R_norm)
    subject to alpha + beta = 1.0.

    When alpha and beta are not explicitly overridden:
    - Clear Weather (P24 <= 50mm): alpha = 0.70, beta = 0.30 (Transit speed priority)
    - Heavy Rain / Monsoon (P24 > 50mm): alpha = 0.20, beta = 0.80 (Slope stability priority)
    """
    if not math.isfinite(travel_time_minutes) or travel_time_minutes < 0.0:
        raise ValueError(f"Travel time must be non-negative and finite, got: {travel_time_minutes}")
    if not math.isfinite(composite_route_risk) or composite_route_risk < 0.0 or composite_route_risk > 100.0:
        raise ValueError(f"Composite route risk must be in [0, 100], got: {composite_route_risk}")
    if not math.isfinite(p24_mm) or p24_mm < 0.0:
        raise ValueError(f"Precipitation must be non-negative, got: {p24_mm}")

    is_heavy_rain = p24_mm > PARETO_ALERT_P24_THRESHOLD_MM

    if alpha is None or beta is None:
        if is_heavy_rain:
            effective_alpha = PARETO_ALERT_ALPHA
            effective_beta = PARETO_ALERT_BETA
        else:
            effective_alpha = PARETO_CLEAR_ALPHA
            effective_beta = PARETO_CLEAR_BETA
    else:
        if not math.isfinite(alpha) or not math.isfinite(beta) or alpha < 0.0 or beta < 0.0:
            raise ValueError(f"Weights alpha and beta must be non-negative, got: alpha={alpha}, beta={beta}")
        weight_sum = alpha + beta
        if weight_sum <= 0.0:
            raise ValueError("Sum of alpha and beta must be strictly positive.")
        effective_alpha = alpha / weight_sum
        effective_beta = beta / weight_sum

    norm_time = travel_time_minutes / PARETO_T_NORM_MINUTES
    norm_risk = composite_route_risk / PARETO_R_NORM

    cost = (effective_alpha * norm_time) + (effective_beta * norm_risk)

    return RouteObjectiveResult(
        cost=round(cost, 4),
        alpha=round(effective_alpha, 2),
        beta=round(effective_beta, 2),
        normalized_time=round(norm_time, 4),
        normalized_risk=round(norm_risk, 4),
        is_heavy_rain_mode=is_heavy_rain,
    )
