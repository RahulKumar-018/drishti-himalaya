"""Phase 2C Comprehensive Test Suite for Drishti-Himalaya Risk Assessment Engine.

Verifies:
1. Risk calculation
2. Risk thresholds
3. Rainfall component
4. Slope component
5. Historical component
6. Missing data
7. Invalid coordinates & edge cases (lat=-90, 90, lon=-180, 180)
8. API contract (POST /api/risk/predict and POST /api/v1/risk/predict)
9. GeoJSON output (GET /api/risk/zones and GET /api/v1/risk/zones)
10. Database spatial lookup
11. Data quality classification (HIGH, MEDIUM, LOW)
12. Model versioning and BaseRiskModel polymorphic interface
13. Error handling and exception resilience
"""

from datetime import datetime, timezone
import math
import pytest
from fastapi.testclient import TestClient

from backend.app.main import app
from backend.app.risk_engine.base import BaseRiskModel, RiskEvaluationResult
from backend.app.risk_engine.config import DEFAULT_RISK_CONFIG, RiskModelConfig
from backend.app.risk_engine.features import DataQuality, EnvironmentalFeatureVector
from backend.app.risk_engine.heuristic_model import HeuristicRiskModel
from backend.app.risk_engine.ml_model import MLRiskModel
from backend.app.risk_engine.service import SpatialRiskService, get_spatial_risk_service
from backend.app.schemas.risk import RiskPredictRequest, RiskPredictResponse

client = TestClient(app)


# =============================================================================
# 1. RISK CALCULATION
# =============================================================================
class TestRiskCalculation:
    """Tests for multi-factor synthesis and score bounds."""

    def test_baseline_zero_inputs_yield_low_score(self):
        model = HeuristicRiskModel()
        features = EnvironmentalFeatureVector(
            latitude=30.0,
            longitude=79.0,
            slope_deg=0.0,
            rainfall_mm=0.0,
            distance_to_historical_events_m=20000.0,
            historical_landslide_count_1km=0,
        )
        res = model.evaluate(features)
        assert res.risk_score >= 0.0
        assert res.risk_score <= 30.0
        assert res.risk_level == "LOW"
        assert res.factors["slope"] == 0.0
        assert res.factors["rainfall"] == 0.0

    def test_severe_compound_conditions_yield_high_or_critical_score(self):
        model = HeuristicRiskModel()
        features = EnvironmentalFeatureVector(
            latitude=30.5,
            longitude=79.5,
            slope_deg=45.0,  # Steep slope
            rainfall_mm=95.0,  # Extreme rainfall exceeding threshold
            p24_mm=95.0,
            p72_mm=160.0,
            ari_mm=210.0,
            distance_to_historical_events_m=50.0,  # 50m from mapped failure
            historical_landslide_count_1km=9,
            is_cut_slope=True,
        )
        res = model.evaluate(features)
        assert res.risk_score >= 70.0
        assert res.risk_level in ("HIGH", "CRITICAL")
        assert len(res.contributing_factors) >= 3

    def test_risk_score_is_strictly_clamped_between_0_and_100(self):
        model = HeuristicRiskModel()
        # Extreme inputs
        features_max = EnvironmentalFeatureVector(
            latitude=30.0,
            longitude=79.0,
            slope_deg=90.0,
            rainfall_mm=500.0,
            p24_mm=500.0,
            p72_mm=1000.0,
            ari_mm=1000.0,
            distance_to_historical_events_m=0.0,
            historical_landslide_count_1km=50,
            is_cut_slope=True,
        )
        res = model.evaluate(features_max)
        assert res.risk_score <= 100.0
        assert res.risk_score >= 0.0


# =============================================================================
# 2. RISK THRESHOLDS
# =============================================================================
class TestRiskThresholds:
    """Tests for threshold classification and configurability."""

    def test_default_threshold_boundaries(self):
        model = HeuristicRiskModel()
        assert model.classify_risk_tier(0.0)[0] == "LOW"
        assert model.classify_risk_tier(30.0)[0] == "LOW"
        assert model.classify_risk_tier(30.1)[0] == "MEDIUM"
        assert model.classify_risk_tier(60.0)[0] == "MEDIUM"
        assert model.classify_risk_tier(60.1)[0] == "HIGH"
        assert model.classify_risk_tier(80.0)[0] == "HIGH"
        assert model.classify_risk_tier(80.1)[0] == "CRITICAL"
        assert model.classify_risk_tier(100.0)[0] == "CRITICAL"

    def test_custom_configurable_thresholds(self):
        custom_config = RiskModelConfig(
            low_max=20.0,
            medium_max=50.0,
            high_max=70.0,
            critical_max=100.0,
        )
        model = HeuristicRiskModel(config=custom_config)
        assert model.classify_risk_tier(25.0)[0] == "MEDIUM"
        assert model.classify_risk_tier(55.0)[0] == "HIGH"
        assert model.classify_risk_tier(75.0)[0] == "CRITICAL"

    def test_invalid_monotonic_thresholds_rejected(self):
        with pytest.raises(ValueError, match="strictly monotonic"):
            invalid_config = RiskModelConfig(
                low_max=60.0,
                medium_max=40.0,  # Invalid inversion
                high_max=80.0,
            )
            invalid_config.validate()


# =============================================================================
# 3. RAINFALL COMPONENT
# =============================================================================
class TestRainfallComponent:
    """Tests for hydro-meteorological saturation calculations and provenance."""

    def test_zero_rainfall_gives_zero_score(self):
        model = HeuristicRiskModel()
        score, status, desc = model.calculate_rainfall_score(0.0, 0.0, 0.0)
        assert score == 0.0
        assert status == "LOW"

    def test_heavy_rainfall_saturation(self):
        model = HeuristicRiskModel()
        score, status, desc = model.calculate_rainfall_score(75.0, 140.0, 200.0)
        # At exactly threshold values, sum = 0.50*1 + 0.30*1 + 0.20*1 = 1.0 -> 100.0
        assert pytest.approx(score, rel=1e-2) == 100.0
        assert status == "CRITICAL"

    def test_single_rainfall_mm_fallback_hydration(self):
        features = EnvironmentalFeatureVector(
            latitude=30.0,
            longitude=79.0,
            rainfall_mm=50.0,
        )
        assert features.p24_mm == 50.0
        assert features.p72_mm == 50.0
        assert pytest.approx(features.ari_mm, rel=1e-2) == 50.0 * 0.82

    def test_weather_source_provenance_preserved(self):
        model = HeuristicRiskModel()
        for src in ("manual", "simulated", "historical_dataset", "open_meteo"):
            features = EnvironmentalFeatureVector(
                latitude=30.0,
                longitude=79.0,
                weather_source=src,
            )
            res = model.evaluate(features)
            assert res.weather_source == src


# =============================================================================
# 4. SLOPE COMPONENT
# =============================================================================
class TestSlopeComponent:
    """Tests for topographic slope transformation."""

    def test_flat_and_gentle_slope_yields_zero_hazard(self):
        model = HeuristicRiskModel()
        # slope = 0
        s0, status0, _ = model.calculate_slope_score(0.0)
        assert s0 == 0.0
        assert status0 == "LOW"

        # slope = 14° (below 15° threshold)
        s14, status14, _ = model.calculate_slope_score(14.0)
        assert s14 == 0.0
        assert status14 == "LOW"

    def test_slope_at_angle_of_repose_35_deg(self):
        model = HeuristicRiskModel()
        score, status, desc = model.calculate_slope_score(35.0)
        # At natural angle of repose, sigmoid center: 100 / (1 + exp(0)) = 50.0
        assert pytest.approx(score, rel=1e-2) == 50.0
        assert "exceeding 35° natural angle of repose" in desc

    def test_slope_at_max_valid_value_90_deg(self):
        model = HeuristicRiskModel()
        score, status, desc = model.calculate_slope_score(90.0)
        assert score == model.config.slope_cliff_cap  # 90.0
        assert status == "CRITICAL"

    def test_invalid_negative_or_excessive_slope_rejected(self):
        with pytest.raises(ValueError):
            EnvironmentalFeatureVector(latitude=30.0, longitude=79.0, slope_deg=-5.0)


# =============================================================================
# 5. HISTORICAL COMPONENT
# =============================================================================
class TestHistoricalComponent:
    """Tests for GSI historical landslide proximity and clustering density."""

    def test_immediate_proximity_to_scar_gives_max_score(self):
        model = HeuristicRiskModel()
        score, status, _ = model.calculate_historical_proximity_score(0.0)
        assert score == 100.0
        assert status == "CRITICAL"

    def test_distance_decay_matches_exponential_formula(self):
        model = HeuristicRiskModel()
        # at d = 350m (d0), score should be 100 * exp(-1) = 36.79
        score, _, _ = model.calculate_historical_proximity_score(350.0)
        assert pytest.approx(score, rel=1e-2) == 36.79

    def test_far_distance_gives_negligible_score(self):
        model = HeuristicRiskModel()
        score, status, _ = model.calculate_historical_proximity_score(5000.0)
        assert score < 0.1
        assert status == "LOW"

    def test_scar_density_scaling(self):
        model = HeuristicRiskModel()
        # 0 scars -> 0
        s0, _, _ = model.calculate_historical_density_score(0)
        assert s0 == 0.0

        # 4 scars out of 8 critical -> 50%
        s4, _, _ = model.calculate_historical_density_score(4)
        assert pytest.approx(s4, rel=1e-2) == 50.0

        # 8 or more -> capped at 100%
        s12, _, _ = model.calculate_historical_density_score(12)
        assert s12 == 100.0


# =============================================================================
# 6. MISSING DATA HANDLING
# =============================================================================
class TestMissingDataHandling:
    """Tests for robust handling of omitted or unmeasured features."""

    def test_missing_slope_handled_gracefully(self):
        model = HeuristicRiskModel()
        features = EnvironmentalFeatureVector(
            latitude=30.0,
            longitude=79.0,
            slope_deg=None,
            rainfall_mm=25.0,
            distance_to_historical_events_m=500.0,
        )
        res = model.evaluate(features)
        assert res.risk_score >= 0.0
        assert res.factors["slope"] == 0.0
        assert res.data_quality in (DataQuality.MEDIUM, DataQuality.LOW)

    def test_missing_rainfall_handled_gracefully(self):
        model = HeuristicRiskModel()
        features = EnvironmentalFeatureVector(
            latitude=30.0,
            longitude=79.0,
            slope_deg=30.0,
            rainfall_mm=None,
            p24_mm=None,
        )
        res = model.evaluate(features)
        assert res.factors["rainfall"] == 0.0
        assert "Precipitation telemetry missing" in " ".join(res.data_caveats)

    def test_missing_cut_slope_triggers_partial_weight_normalization(self):
        model = HeuristicRiskModel()
        features = EnvironmentalFeatureVector(
            latitude=30.0,
            longitude=79.0,
            slope_deg=35.0,
            rainfall_mm=50.0,
            is_cut_slope=None,
        )
        res = model.evaluate(features)
        assert res.factor_details["cut_slope_exposure"]["weight"] == 0.0
        assert res.risk_score > 0.0


# =============================================================================
# 7. INVALID COORDINATES & EDGE CASES
# =============================================================================
class TestCoordinatesAndEdgeCases:
    """Tests for edge coordinate validation and extreme geographic limits."""

    def test_valid_extreme_poles_and_antimeridian_accepted(self):
        # lat = -90, 90; lon = -180, 180
        f_north = EnvironmentalFeatureVector(latitude=90.0, longitude=0.0)
        assert f_north.latitude == 90.0

        f_south = EnvironmentalFeatureVector(latitude=-90.0, longitude=0.0)
        assert f_south.latitude == -90.0

        f_east = EnvironmentalFeatureVector(latitude=0.0, longitude=180.0)
        assert f_east.longitude == 180.0

        f_west = EnvironmentalFeatureVector(latitude=0.0, longitude=-180.0)
        assert f_west.longitude == -180.0

    def test_latitude_out_of_bounds_rejected(self):
        with pytest.raises(ValueError, match="outside valid range"):
            EnvironmentalFeatureVector(latitude=90.1, longitude=79.0)

        with pytest.raises(ValueError, match="outside valid range"):
            EnvironmentalFeatureVector(latitude=-90.1, longitude=79.0)

    def test_longitude_out_of_bounds_rejected(self):
        with pytest.raises(ValueError, match="outside valid range"):
            EnvironmentalFeatureVector(latitude=30.0, longitude=180.1)

        with pytest.raises(ValueError, match="outside valid range"):
            EnvironmentalFeatureVector(latitude=30.0, longitude=-180.1)

    def test_nan_and_inf_coordinates_rejected(self):
        with pytest.raises(ValueError, match="finite number"):
            EnvironmentalFeatureVector(latitude=float("nan"), longitude=79.0)

        with pytest.raises(ValueError, match="finite number"):
            EnvironmentalFeatureVector(latitude=30.0, longitude=float("inf"))


# =============================================================================
# 8. API CONTRACT: POST /api/risk/predict
# =============================================================================
class TestRiskPredictAPIContract:
    """Tests for API payload validation, responses, and routes."""

    def test_predict_endpoint_success_json_structure(self):
        payload = {
            "latitude": 30.145,
            "longitude": 79.298,
            "rainfall_mm": 40.0,
            "slope_deg": 32.0,
            "weather_source": "manual",
        }
        # Test /api/risk/predict
        resp = client.post("/api/risk/predict", json=payload)
        assert resp.status_code == 200
        data = resp.json()

        assert "location" in data
        assert data["location"]["latitude"] == 30.145
        assert data["location"]["longitude"] == 79.298
        assert "risk_score" in data
        assert 0.0 <= data["risk_score"] <= 100.0
        assert data["risk_level"] in ("LOW", "MEDIUM", "HIGH", "CRITICAL")
        assert "factors" in data
        assert "rainfall" in data["factors"]
        assert "slope" in data["factors"]
        assert "terrain" in data["factors"]
        assert "historical" in data["factors"]
        assert "explanation" in data
        assert isinstance(data["contributing_factors"], list)
        assert data["weather_source"] == "manual"
        assert "model_type" in data
        assert "model_version" in data
        assert data["data_quality"] in ("HIGH", "MEDIUM", "LOW")
        assert "generated_at" in data

    def test_predict_endpoint_v1_alias_works_identically(self):
        payload = {
            "latitude": 30.2,
            "longitude": 79.1,
            "rainfall_mm": 10.0,
        }
        resp = client.post("/api/v1/risk/predict", json=payload)
        assert resp.status_code == 200
        assert resp.json()["risk_score"] >= 0.0

    def test_predict_endpoint_invalid_coordinates_returns_422(self):
        # Out of bounds latitude 95.0
        resp = client.post(
            "/api/risk/predict",
            json={"latitude": 95.0, "longitude": 79.0},
        )
        assert resp.status_code == 422


# =============================================================================
# 9. GEOJSON OUTPUT: GET /api/risk/zones
# =============================================================================
class TestRiskZonesGeoJSON:
    """Tests for spatial risk zones GeoJSON FeatureCollection endpoint."""

    def test_get_risk_zones_returns_valid_geojson_feature_collection(self):
        resp = client.get("/api/risk/zones")
        assert resp.status_code == 200
        data = resp.json()

        assert data["type"] == "FeatureCollection"
        assert "features" in data
        assert len(data["features"]) >= 1

        first_feature = data["features"][0]
        assert first_feature["type"] == "Feature"
        assert "geometry" in first_feature
        assert first_feature["geometry"]["type"] == "Polygon"
        assert len(first_feature["geometry"]["coordinates"][0]) >= 4  # Closed polygon

        props = first_feature["properties"]
        assert "zone_name" in props
        assert "risk_score" in props
        assert "risk_level" in props
        assert "color_hex" in props
        assert "disclaimer" in props
        assert "MVP visualization" in props["disclaimer"]

    def test_get_risk_zones_v1_alias_works(self):
        resp = client.get("/api/v1/risk/zones")
        assert resp.status_code == 200
        assert resp.json()["type"] == "FeatureCollection"

    def test_risk_zones_bounding_box_filter(self):
        resp = client.get("/api/risk/zones?min_lat=30.4&max_lat=30.8")
        assert resp.status_code == 200
        data = resp.json()
        assert data["total_zones"] <= 6


# =============================================================================
# 10. MODEL INFO & VERSIONING
# =============================================================================
class TestModelInfoAndVersioning:
    """Tests for model metadata and interface polymorphism."""

    def test_model_info_endpoint(self):
        resp = client.get("/api/risk/model/info")
        assert resp.status_code == 200
        data = resp.json()
        assert "active_model_type" in data
        assert "weights" in data
        assert "ml_pipeline_readiness" in data
        assert data["ml_pipeline_readiness"]["interface_ready"] is True

    def test_base_risk_model_polymorphism(self):
        heuristic = HeuristicRiskModel()
        ml = MLRiskModel()

        assert isinstance(heuristic, BaseRiskModel)
        assert isinstance(ml, BaseRiskModel)

        features = EnvironmentalFeatureVector(latitude=30.0, longitude=79.0, slope_deg=25.0)
        h_res = heuristic.evaluate(features)
        ml_res = ml.evaluate(features)

        assert isinstance(h_res, RiskEvaluationResult)
        assert isinstance(ml_res, RiskEvaluationResult)
        assert ml.is_trained is False
        assert "uncalibrated" in ml.model_version


# =============================================================================
# 11. DATA QUALITY CLASSIFICATION
# =============================================================================
class TestDataQualityClassification:
    """Tests for honest data quality evaluation."""

    def test_high_data_quality_when_all_critical_present(self):
        features = EnvironmentalFeatureVector(
            latitude=30.0,
            longitude=79.0,
            slope_deg=28.0,
            rainfall_mm=30.0,
            distance_to_historical_events_m=450.0,
        )
        rating, caveats = features.evaluate_data_quality()
        assert rating == DataQuality.HIGH
        assert len(caveats) == 0

    def test_medium_data_quality_when_one_signal_missing(self):
        features = EnvironmentalFeatureVector(
            latitude=30.0,
            longitude=79.0,
            slope_deg=None,  # 1 missing
            rainfall_mm=30.0,
            distance_to_historical_events_m=450.0,
        )
        rating, caveats = features.evaluate_data_quality()
        assert rating == DataQuality.MEDIUM
        assert len(caveats) == 1

    def test_low_data_quality_when_multiple_missing(self):
        features = EnvironmentalFeatureVector(
            latitude=30.0,
            longitude=79.0,
            slope_deg=None,
            rainfall_mm=None,
            distance_to_historical_events_m=None,
        )
        rating, caveats = features.evaluate_data_quality()
        assert rating == DataQuality.LOW
        assert len(caveats) >= 2


# =============================================================================
# 12. SPATIAL SERVICE & CACHING
# =============================================================================
class TestSpatialServiceAndCaching:
    """Tests for SpatialRiskService in-memory caching and deduplication."""

    def test_service_caches_repeated_evaluations(self):
        svc = get_spatial_risk_service()
        # First call evaluates and populates cache
        res1 = svc.assess_point_risk(
            session=None,
            latitude=30.1234,
            longitude=79.5678,
            rainfall_mm=20.0,
            slope_deg=25.0,
            use_cache=True,
        )
        # Second call should fetch directly from cache
        res2 = svc.assess_point_risk(
            session=None,
            latitude=30.1234,
            longitude=79.5678,
            rainfall_mm=20.0,
            slope_deg=25.0,
            use_cache=True,
        )
        assert res1.risk_score == res2.risk_score
        assert res1.generated_at == res2.generated_at
