"""Comprehensive deterministic unit tests for Drishti-Himalaya Risk Engine."""

import math
import pytest

from backend.app.risk_engine import (
    COLOR_HIGH,
    COLOR_LOW,
    COLOR_MODERATE,
    COLOR_SEVERE,
    calculate_ari,
    calculate_route_objective,
    calculate_route_risk,
    calculate_segment_risk,
    density_score,
    exposure_score,
    get_risk_tier_and_color,
    proximity_score,
    rainfall_score,
    slope_score,
)
from backend.app.schemas.common import RiskTier


class TestSlopeScore:
    """Test suite for slope_score() sigmoidal response."""

    def test_slope_below_15_gives_zero(self) -> None:
        """1. Slope below 15 degrees yields 0.0."""
        assert slope_score(0.0) == 0.0
        assert slope_score(10.0) == 0.0
        assert slope_score(14.99) == 0.0

    def test_slope_at_15_is_valid(self) -> None:
        """2. Slope at 15 degrees enters logistic curve and is valid (> 0)."""
        score = slope_score(15.0)
        assert score > 0.0
        # 100 / (1 + exp(-0.18 * (15 - 35))) = 100 / (1 + exp(3.6)) ≈ 2.66
        assert pytest.approx(score, rel=1e-2) == 2.66

    def test_slope_at_35_produces_50(self) -> None:
        """3. Slope at 35 degrees (natural angle of repose) produces exactly 50.0."""
        score = slope_score(35.0)
        assert pytest.approx(score, abs=1e-5) == 50.0

    def test_slope_above_60_capped_at_90(self) -> None:
        """4. Slope above 60 degrees (rock cliff face) caps at 90.0."""
        assert slope_score(60.1) == 90.0
        assert slope_score(75.0) == 90.0
        assert slope_score(90.0) == 90.0

    def test_slope_invalid_inputs_rejected(self) -> None:
        """Invalid slope angles (negative, >90, NaN, Inf) raise ValueError."""
        with pytest.raises(ValueError):
            slope_score(-1.0)
        with pytest.raises(ValueError):
            slope_score(95.0)
        with pytest.raises(ValueError):
            slope_score(float("nan"))
        with pytest.raises(ValueError):
            slope_score(float("inf"))


class TestRainfallScore:
    """Test suite for rainfall_score() and calculate_ari()."""

    def test_zero_rainfall_gives_zero(self) -> None:
        """5. Zero rainfall + zero ARI gives zero score."""
        assert rainfall_score(p24=0.0, p72=0.0, ari=0.0) == 0.0

    def test_increasing_rainfall_increases_score(self) -> None:
        """6. Increasing rainfall strictly increases the rainfall score."""
        score_low = rainfall_score(p24=15.0, p72=30.0, ari=40.0)
        score_high = rainfall_score(p24=45.0, p72=90.0, ari=120.0)
        assert score_high > score_low

    def test_rainfall_score_capped_at_100(self) -> None:
        """7. Excessive rainfall exceeding initiation thresholds is capped at 100.0."""
        # Baseline initiation thresholds: P24=75, P72=140, ARI=200 gives exactly 100
        exact_threshold = rainfall_score(p24=75.0, p72=140.0, ari=200.0)
        assert pytest.approx(exact_threshold, abs=1e-5) == 100.0

        # Extreme cloudburst (200mm in 24h)
        extreme_score = rainfall_score(p24=200.0, p72=350.0, ari=400.0)
        assert extreme_score == 100.0

    def test_ari_calculation_follows_decay_rule(self) -> None:
        """8. ARI calculation follows lambda=0.82 daily decay over 15 days."""
        # 1 day of 100mm rainfall yesterday
        ari_1d = calculate_ari([100.0])
        # (0.82)^1 * 100.0 = 82.0
        assert pytest.approx(ari_1d, abs=1e-4) == 82.0

        # 2 days: yesterday 10mm, 2 days ago 10mm
        # (0.82)^1 * 10 + (0.82)^2 * 10 = 8.2 + 6.724 = 14.924
        ari_2d = calculate_ari([10.0, 10.0])
        assert pytest.approx(ari_2d, abs=1e-4) == 14.924

    def test_rainfall_invalid_inputs_rejected(self) -> None:
        """Negative precipitation values or non-finite inputs raise ValueError."""
        with pytest.raises(ValueError):
            rainfall_score(p24=-5.0, p72=10.0, ari=0.0)
        with pytest.raises(ValueError):
            rainfall_score(p24=10.0, p72=-1.0, ari=0.0)
        with pytest.raises(ValueError):
            rainfall_score(p24=10.0, p72=10.0, ari=-1.0)
        with pytest.raises(ValueError):
            rainfall_score(p24=float("nan"), p72=0.0, ari=0.0)


class TestProximityScore:
    """Test suite for proximity_score() exponential decay."""

    def test_zero_distance_gives_100(self) -> None:
        """9. Zero distance directly on historical scar gives 100.0."""
        assert proximity_score(0.0) == 100.0

    def test_increasing_distance_decreases_score(self) -> None:
        """10. Increasing distance exponentially decreases the proximity score."""
        score_0 = proximity_score(0.0)
        score_100 = proximity_score(100.0)
        score_350 = proximity_score(350.0)
        score_700 = proximity_score(700.0)

        assert score_0 > score_100 > score_350 > score_700
        # At d0 = 350m: 100 * exp(-1) ≈ 36.7879
        assert pytest.approx(score_350, abs=1e-2) == 36.79

    def test_score_approaches_zero_at_large_distance(self) -> None:
        """11. Score approaches zero at large distances (>1600m)."""
        score_1600 = proximity_score(1600.0)
        assert score_1600 < 1.1
        score_5000 = proximity_score(5000.0)
        assert score_5000 < 0.001

    def test_proximity_negative_distance_rejected(self) -> None:
        """Negative distances raise ValueError."""
        with pytest.raises(ValueError):
            proximity_score(-10.0)
        with pytest.raises(ValueError):
            proximity_score(float("nan"))


class TestDensityScore:
    """Test suite for density_score() clustering response."""

    def test_zero_scars_gives_zero(self) -> None:
        """12. Zero scars within 1 km circle gives 0.0."""
        assert density_score(0) == 0.0
        assert density_score(0.0) == 0.0

    def test_eight_scars_gives_100(self) -> None:
        """13. 8 scars (Ncrit = 8 scars/km²) gives exactly 100.0."""
        assert density_score(8) == 100.0
        assert density_score(4) == 50.0

    def test_more_than_eight_scars_capped_at_100(self) -> None:
        """14. More than 8 scars remains capped at 100.0."""
        assert density_score(12) == 100.0
        assert density_score(50) == 100.0

    def test_density_negative_count_rejected(self) -> None:
        """Negative scar counts raise ValueError."""
        with pytest.raises(ValueError):
            density_score(-1)
        with pytest.raises(ValueError):
            density_score(float("nan"))


class TestExposureScore:
    """Test suite for exposure_score() anthropogenic cut-slope rule."""

    def test_slope_over_30_and_cut_slope_gives_100(self) -> None:
        """15. Slope > 30° and is_cut_slope True yields 100.0."""
        assert exposure_score(theta=31.0, is_cut_slope=True) == 100.0
        assert exposure_score(theta=45.0, is_cut_slope=True) == 100.0

    def test_other_combinations_give_20(self) -> None:
        """16. Non-cut slopes or low slope angles yield 20.0 baseline."""
        assert exposure_score(theta=25.0, is_cut_slope=True) == 20.0
        assert exposure_score(theta=45.0, is_cut_slope=False) == 20.0
        assert exposure_score(theta=10.0, is_cut_slope=False) == 20.0

    def test_exposure_invalid_slope_rejected(self) -> None:
        """Negative slope angle raises ValueError."""
        with pytest.raises(ValueError):
            exposure_score(theta=-5.0, is_cut_slope=True)


class TestSegmentRiskCalculation:
    """Test suite for calculate_segment_risk() composite formulation."""

    def test_weighted_formula_weights_sum_and_contribution(self) -> None:
        """17. Verify exact weighted calculation: 0.35*S_slope + 0.30*S_rain + 0.20*S_prox + 0.10*S_density + 0.05*S_exp."""
        res = calculate_segment_risk(
            slope_deg=35.0,        # S_slope = 50.0  -> 0.35 * 50 = 17.5
            p24_mm=75.0,           # S_rain = 50.0 (only P24 at threshold, P72=0, ARI=0)
            p72_mm=0.0,
            ari_mm=0.0,            # 0.30 * 50.0 = 15.0
            dist_scar_m=350.0,     # S_prox = 36.7879 -> 0.20 * 36.7879 ≈ 7.3576
            scar_density_1km=4.0,  # S_density = 50.0 -> 0.10 * 50 = 5.0
            is_cut_slope=False,    # S_exp = 20.0 -> 0.05 * 20 = 1.0
        )
        # Expected composite: 17.5 + 15.0 + 7.3576 + 5.0 + 1.0 = 45.8576 ≈ 45.86
        assert pytest.approx(res.risk_score, abs=0.05) == 45.86
        assert res.risk_category == RiskTier.MODERATE
        assert res.color_hex == COLOR_MODERATE

    def test_final_score_is_bounded_zero_to_hundred(self) -> None:
        """18. Final score is strictly bounded in [0.0, 100.0]."""
        # Minimum baseline
        min_res = calculate_segment_risk(
            slope_deg=5.0,
            p24_mm=0.0,
            p72_mm=0.0,
            ari_mm=0.0,
            dist_scar_m=10000.0,
            scar_density_1km=0,
            is_cut_slope=False,
        )
        assert min_res.risk_score >= 0.0
        assert min_res.risk_category == RiskTier.LOW
        assert min_res.color_hex == COLOR_LOW

        # Extreme maximum
        max_res = calculate_segment_risk(
            slope_deg=50.0,
            p24_mm=150.0,
            p72_mm=200.0,
            ari_mm=300.0,
            dist_scar_m=0.0,
            scar_density_1km=15,
            is_cut_slope=True,
        )
        assert max_res.risk_score <= 100.0
        assert max_res.risk_category == RiskTier.SEVERE
        assert max_res.color_hex == COLOR_SEVERE

    def test_correct_risk_tiers_and_colors(self) -> None:
        """19 & 20. Verify mapping across all 4 risk tiers and color codes."""
        tier_low, color_low = get_risk_tier_and_color(15.0)
        assert tier_low == RiskTier.LOW
        assert color_low == COLOR_LOW

        tier_mod, color_mod = get_risk_tier_and_color(35.0)
        assert tier_mod == RiskTier.MODERATE
        assert color_mod == COLOR_MODERATE

        tier_high, color_high = get_risk_tier_and_color(60.0)
        assert tier_high == RiskTier.HIGH
        assert color_high == COLOR_HIGH

        tier_sev, color_sev = get_risk_tier_and_color(85.0)
        assert tier_sev == RiskTier.SEVERE
        assert color_sev == COLOR_SEVERE


class TestRouteRiskAggregation:
    """Test suite for calculate_route_risk()."""

    def test_length_weighted_average_calculation(self) -> None:
        """21. Length-weighted average properly weights longer segments."""
        # 100m segment at risk 20, 900m segment at risk 40
        # Weighted mean: (20*100 + 40*900) / 1000 = (2000 + 36000) / 1000 = 38.0
        res = calculate_route_risk(
            segment_risks=[20.0, 40.0],
            segment_lengths_m=[100.0, 900.0],
        )
        assert pytest.approx(res.average_risk, abs=1e-2) == 38.0

    def test_bottleneck_penalty_uses_max_risk(self) -> None:
        """22. Max segment risk correctly detects the worst bottleneck."""
        res = calculate_route_risk(
            segment_risks=[10.0, 15.0, 95.0, 12.0],
            segment_lengths_m=[250.0, 250.0, 250.0, 250.0],
        )
        assert res.max_bottleneck_risk == 95.0

    def test_composite_route_risk_uses_40_60_formula(self) -> None:
        """23. Composite route risk equals 0.40 * R_avg + 0.60 * R_max."""
        # Uniform segments: average = (20 + 80) / 2 = 50.0, max = 80.0
        # R_route = 0.40 * 50.0 + 0.60 * 80.0 = 20.0 + 48.0 = 68.0
        res = calculate_route_risk(segment_risks=[20.0, 80.0])
        assert res.average_risk == 50.0
        assert res.max_bottleneck_risk == 80.0
        assert res.composite_route_risk == 68.0

    def test_route_risk_empty_list_rejected(self) -> None:
        """Empty segment list raises ValueError."""
        with pytest.raises(ValueError):
            calculate_route_risk([])


class TestRouteOptimizationObjective:
    """Test suite for calculate_route_objective()."""

    def test_clear_weather_weights_are_70_30(self) -> None:
        """24. In clear weather (P24 <= 50mm), alpha=0.70 and beta=0.30."""
        # 360 mins travel time (norm 360 -> 1.0), risk 50 (norm 100 -> 0.5)
        # J = 0.70 * 1.0 + 0.30 * 0.5 = 0.70 + 0.15 = 0.85
        obj = calculate_route_objective(
            travel_time_minutes=360.0,
            composite_route_risk=50.0,
            p24_mm=10.0,
        )
        assert obj.alpha == 0.70
        assert obj.beta == 0.30
        assert not obj.is_heavy_rain_mode
        assert pytest.approx(obj.cost, abs=1e-4) == 0.85

    def test_heavy_rain_weights_are_20_80(self) -> None:
        """25. Under heavy rain (P24 > 50mm), alpha=0.20 and beta=0.80."""
        # 360 mins travel time (norm 1.0), risk 50 (norm 0.5)
        # J = 0.20 * 1.0 + 0.80 * 0.5 = 0.20 + 0.40 = 0.60
        obj = calculate_route_objective(
            travel_time_minutes=360.0,
            composite_route_risk=50.0,
            p24_mm=65.0,
        )
        assert obj.alpha == 0.20
        assert obj.beta == 0.80
        assert obj.is_heavy_rain_mode
        assert pytest.approx(obj.cost, abs=1e-4) == 0.60

    def test_custom_override_weights_normalized(self) -> None:
        """Custom alpha and beta weights are accepted and normalized."""
        obj = calculate_route_objective(
            travel_time_minutes=180.0,
            composite_route_risk=40.0,
            alpha=0.5,
            beta=0.5,
        )
        assert obj.alpha == 0.50
        assert obj.beta == 0.50
        # Time norm = 180 / 360 = 0.5
        # Risk norm = 40 / 100 = 0.4
        # Cost = 0.5*0.5 + 0.5*0.4 = 0.25 + 0.20 = 0.45
        assert pytest.approx(obj.cost, abs=1e-4) == 0.45
