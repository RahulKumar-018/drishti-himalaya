"""Tests for Phase 12: Documented Partial-Data Scoring Policy for Drishti-Himalaya.

Verifies:
A. Full-data risk calculation remains exactly unchanged.
B. Partial calculation works when only is_cut_slope is null (denominator 0.95).
C. Partial calculation never treats null cut-slope as false.
D. Partial score remains strictly bounded between 0 and 100.
E. Route aggregation works with partial segment scores.
F. Rishikesh -> Joshimath style route returns numeric route-risk fields while status remains PARTIAL.
"""

import pytest
from fastapi.testclient import TestClient

from backend.app.main import app
from backend.app.risk_engine.aggregation import calculate_route_risk
from backend.app.risk_engine.constants import (
    COLOR_LOW,
    COLOR_MODERATE,
    COLOR_SEVERE,
    PARTIAL_WEIGHT_DENOMINATOR,
    WEIGHT_DENSITY,
    WEIGHT_EXPOSURE,
    WEIGHT_PROXIMITY,
    WEIGHT_RAIN,
    WEIGHT_SLOPE,
)
from backend.app.risk_engine.scoring import calculate_segment_risk
from backend.app.schemas.common import RiskTier
from backend.app.services.analysis_models import AnalysisStatus
from backend.app.services.analysis_service import analyze_route


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)


class TestFullDataScoringPreservation:
    """Requirement 12.A: Verify full-data risk calculation remains exactly unchanged."""

    def test_full_data_risk_calculation_remains_exactly_unchanged(self) -> None:
        """Full 5-factor formula unchanged when is_cut_slope is provided."""
        # Baseline inputs: slope 35 deg, p24 75mm, p72 0, ari 0, dist 350m, density 4/km^2
        res_false = calculate_segment_risk(
            slope_deg=35.0,
            p24_mm=75.0,
            p72_mm=0.0,
            ari_mm=0.0,
            dist_scar_m=350.0,
            scar_density_1km=4.0,
            is_cut_slope=False,
        )
        # Expected composite: 0.35*50 + 0.30*50 + 0.20*36.7879 + 0.10*50 + 0.05*20 = 45.86
        assert pytest.approx(res_false.risk_score, abs=0.01) == 45.86
        assert res_false.risk_category == RiskTier.MODERATE
        assert res_false.color_hex == COLOR_MODERATE
        assert res_false.is_partial is False
        assert "exp" in res_false.sub_scores
        assert "exp" in res_false.weighted_contributions
        assert "exp" in res_false.factor_details
        assert res_false.factor_details["exp"].weight == WEIGHT_EXPOSURE
        assert res_false.factor_details["exp"].sub_score == 20.0

        res_true = calculate_segment_risk(
            slope_deg=35.0,
            p24_mm=75.0,
            p72_mm=0.0,
            ari_mm=0.0,
            dist_scar_m=350.0,
            scar_density_1km=4.0,
            is_cut_slope=True,
        )
        # Expected composite: 0.35*50 + 0.30*50 + 0.20*36.7879 + 0.10*50 + 0.05*100 = 49.86
        assert pytest.approx(res_true.risk_score, abs=0.01) == 49.86
        assert res_true.risk_category == RiskTier.MODERATE
        assert res_true.is_partial is False
        assert res_true.factor_details["exp"].sub_score == 100.0


class TestPartialDataScoringLogic:
    """Requirements 12.B, 12.C, 12.D: Verify partial scoring calculation when is_cut_slope is null."""

    def test_partial_calculation_works_when_only_is_cut_slope_is_null(self) -> None:
        """12.B: Partial calculation evaluates 4-factor sum divided by 0.95."""
        assert PARTIAL_WEIGHT_DENOMINATOR == 0.95

        res = calculate_segment_risk(
            slope_deg=35.0,
            p24_mm=75.0,
            p72_mm=0.0,
            ari_mm=0.0,
            dist_scar_m=350.0,
            scar_density_1km=4.0,
            is_cut_slope=None,
        )
        # Numerator: 0.35*50 + 0.30*50 + 0.20*36.787944 + 0.10*50 = 44.8575888
        # R_partial: 44.8575888 / 0.95 = 47.2185... -> 47.22
        expected_score = round(44.8575888 / 0.95, 2)
        assert res.risk_score == expected_score
        assert res.risk_category == RiskTier.MODERATE
        assert res.is_partial is True

        # S_exp must NOT be fabricated
        assert "exp" not in res.sub_scores
        assert "exp" not in res.weighted_contributions
        assert "exp" not in res.factor_details

        # Verified factors are populated
        assert set(res.factor_details.keys()) == {"slope", "rain", "prox", "density"}
        assert res.factor_details["slope"].weight == WEIGHT_SLOPE
        assert res.factor_details["rain"].weight == WEIGHT_RAIN
        assert res.factor_details["prox"].weight == WEIGHT_PROXIMITY
        assert res.factor_details["density"].weight == WEIGHT_DENSITY

    def test_partial_calculation_never_treats_null_cut_slope_as_false(self) -> None:
        """12.C: Partial calculation never treats null cut-slope as false."""
        res_partial = calculate_segment_risk(
            slope_deg=35.0,
            p24_mm=75.0,
            p72_mm=0.0,
            ari_mm=0.0,
            dist_scar_m=350.0,
            scar_density_1km=4.0,
            is_cut_slope=None,
        )
        res_false = calculate_segment_risk(
            slope_deg=35.0,
            p24_mm=75.0,
            p72_mm=0.0,
            ari_mm=0.0,
            dist_scar_m=350.0,
            scar_density_1km=4.0,
            is_cut_slope=False,
        )
        res_true = calculate_segment_risk(
            slope_deg=35.0,
            p24_mm=75.0,
            p72_mm=0.0,
            ari_mm=0.0,
            dist_scar_m=350.0,
            scar_density_1km=4.0,
            is_cut_slope=True,
        )

        # 47.22 != 45.86 and 47.22 != 49.86
        assert res_partial.risk_score != res_false.risk_score
        assert res_partial.risk_score != res_true.risk_score
        assert res_partial.risk_score == 47.22
        assert res_false.risk_score == 45.86
        assert res_true.risk_score == 49.86

    def test_partial_score_strictly_bounded_between_zero_and_hundred(self) -> None:
        """12.D: Partial score remains strictly bounded in [0.0, 100.0]."""
        # Minimum possible hazard inputs
        min_res = calculate_segment_risk(
            slope_deg=5.0,
            p24_mm=0.0,
            p72_mm=0.0,
            ari_mm=0.0,
            dist_scar_m=10000.0,
            scar_density_1km=0,
            is_cut_slope=None,
        )
        assert 0.0 <= min_res.risk_score <= 100.0
        assert min_res.risk_score == 0.0
        assert min_res.risk_category == RiskTier.LOW
        assert min_res.color_hex == COLOR_LOW

        # Extreme maximum hazard inputs
        max_res = calculate_segment_risk(
            slope_deg=65.0,
            p24_mm=200.0,
            p72_mm=300.0,
            ari_mm=400.0,
            dist_scar_m=0.0,
            scar_density_1km=20,
            is_cut_slope=None,
        )
        assert 0.0 <= max_res.risk_score <= 100.0
        assert max_res.risk_category == RiskTier.SEVERE
        assert max_res.color_hex == COLOR_SEVERE


class TestRouteRiskAggregationWithPartialScores:
    """Requirements 12.E, 12.F: Verify route-level aggregation and end-to-end API response."""

    def test_route_aggregation_works_with_partial_segment_scores(self) -> None:
        """12.E: Route aggregation operates correctly on partial segment scores."""
        segment_scores = [47.22, 65.50, 30.10, 82.00]
        lengths = [250.0, 250.0, 250.0, 250.0]

        result = calculate_route_risk(segment_scores, segment_lengths_m=lengths)

        # Average: (47.22 + 65.50 + 30.10 + 82.00) / 4 = 56.205 -> 56.2 (round-half-to-even)
        # Max: 82.00
        # Composite: 0.40 * 56.205 + 0.60 * 82.00 = 22.482 + 49.20 = 71.682 -> 71.68
        assert pytest.approx(result.average_risk, abs=0.01) == 56.20
        assert result.max_bottleneck_risk == 82.00
        assert result.composite_route_risk == 71.68
        assert result.segment_count == 4
        assert result.total_length_m == 1000.0

    def test_rishikesh_to_joshimath_style_route_returns_numeric_route_risk_while_status_is_partial(
        self, client: TestClient
    ) -> None:
        """12.F: Route with missing cut-slope populates numeric route-risk fields while status remains PARTIAL."""
        payload = {
            "origin": {"latitude": 30.1033, "longitude": 78.2947, "name": "Rishikesh"},
            "destination": {"latitude": 30.5526, "longitude": 79.5684, "name": "Joshimath"},
            "preference_weight_safety": 0.50,
            "simulated_rainfall_mm": 50.0,
        }

        res = client.post("/api/v1/route/analyze", json=payload)
        assert res.status_code == 200
        data = res.json()

        # Status remains PARTIAL because cut-slope data has 0% coverage on route
        assert data["status"] == "PARTIAL"
        assert data["recommendation_available"] is False
        assert data["recommended_route_id"] is None
        assert data["data_availability"]["missing_features"] == ["is_cut_slope"]

        # Provenance must be preserved
        prov = data["data_provenance"]
        assert prov["terrain_source"] == "Copernicus DEM GLO-30"
        assert prov["landslide_source"] == "GSI"
        assert prov["cut_slope_source"] == "OpenStreetMap"

        routes = data["routes"]
        assert len(routes) >= 1
        r0 = routes[0]

        # Numeric route risk fields MUST be populated using verified available factors
        assert r0["composite_route_risk"] is not None
        assert isinstance(r0["composite_route_risk"], float)
        assert 0.0 <= r0["composite_route_risk"] <= 100.0

        assert r0["max_bottleneck_risk"] is not None
        assert isinstance(r0["max_bottleneck_risk"], float)
        assert 0.0 <= r0["max_bottleneck_risk"] <= 100.0

        assert r0["average_segment_risk"] is not None
        assert isinstance(r0["average_segment_risk"], float)
        assert 0.0 <= r0["average_segment_risk"] <= 100.0

        assert r0["high_risk_segment_count"] >= 0
        assert r0["severe_risk_segment_count"] >= 0

        # Advisory text must clearly state partial assessment with verified available factors
        advisory = r0["advisory_text"]
        assert "Risk scores were calculated using verified available factors" in advisory
        assert "Cut-slope information is unavailable for this route" in advisory
        assert "PARTIAL assessment" in advisory
        assert "No missing factor was assumed to be safe" in advisory

        # Segment level verification: is_cut_slope must be None (null), NOT false
        features = r0["geojson"]["features"]
        assert len(features) > 0
        first_props = features[0]["properties"]
        assert first_props["is_cut_slope"] is None
        assert first_props["is_risk_complete"] is False
        assert first_props["segment_risk_score"] is not None
        assert 0.0 <= first_props["segment_risk_score"] <= 100.0
