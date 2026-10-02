"""Unit and integration tests for end-to-end route hazard orchestration and multi-objective Pareto evaluation (Phase 9).

Verifies:
- End-to-end integration of routing, segmentation, GSI KDTree, weather, and risk engine
- Offline DEMO execution with data provenance preservation
- Explicit tracking of data availability and refusal to fabricate terrain or cut-slope
- Complete risk evaluation and Pareto objective optimization when all data inputs are supplied
- Correct application of clear-weather (70/30) vs heavy-rain (20/80) objective weights
- Independent evaluation of alternative corridors without route fabrication
- Route-agnostic statewide execution across arbitrary Uttarakhand coordinates
"""

import math
import numpy as np
import pytest

from backend.app.geospatial.enrichment import DefaultCutSlopeProvider
from backend.app.geospatial.terrain import RasterGridTerrainProvider
from backend.app.risk_engine.constants import (
    PARETO_ALERT_ALPHA,
    PARETO_ALERT_BETA,
    PARETO_CLEAR_ALPHA,
    PARETO_CLEAR_BETA,
)
from backend.app.routing.exceptions import InvalidCoordinateError
from backend.app.routing.models import NormalizedRoute
from backend.app.routing.providers import BaseRoutingProvider, DemoRoutingProvider
from backend.app.routing.service import RoutingService
from backend.app.services.analysis_models import (
    AnalysisResult,
    AnalysisRouteResult,
    AnalysisStatus,
)
from backend.app.services.analysis_service import analyze_route
from backend.app.services.weather_models import WeatherFeatures
from backend.app.services.weather_service import WeatherService


@pytest.fixture
def controlled_terrain_grid():
    """Small controlled 5x5 test DEM covering 78.3° to 78.6°E, 30.1° to 30.3°N."""
    bounds = (78.30, 30.10, 78.60, 30.30)
    grid = np.zeros((5, 5), dtype=np.float64)
    # Tilted slope rising 35 degrees eastward
    phi = math.radians(30.2)
    cell_dx_m = ((78.60 - 78.30) / 4.0) * (math.pi / 180.0) * 6378137.0 * math.cos(phi)
    for r in range(5):
        for c in range(5):
            grid[r, c] = 600.0 + c * cell_dx_m * math.tan(math.radians(35.0))
    return RasterGridTerrainProvider(elevation_grid=grid, bounds_lon_lat=bounds, source_name="TestRasterDEM")


@pytest.fixture
def surveyed_cut_slope_provider():
    """Cut-slope provider returning explicit surveyed road cut status for all segments."""
    # Map first 200 segment indices to True (engineered cut-slope)
    cut_map = {i: True for i in range(300)}
    return DefaultCutSlopeProvider(cut_slope_map=cut_map)


class TestDemoRouteAnalysisCore:
    """Core tests for DEMO mode end-to-end execution."""

    def test_demo_route_analysis_starts_successfully(self):
        """DEMO route analysis completes without internet and returns structured AnalysisResult."""
        res = analyze_route((78.35, 30.12), (78.55, 30.28), data_mode="DEMO")
        assert isinstance(res, AnalysisResult)
        assert res.query_id is not None
        assert res.data_mode == "DEMO"
        assert res.execution_duration_ms > 0.0
        assert len(res.routes) >= 1

    def test_routing_provider_returns_normalized_routes(self):
        """Routing provider yields valid NormalizedRoute instances."""
        res = analyze_route((78.35, 30.12), (78.55, 30.28), data_mode="DEMO")
        for r in res.routes:
            assert isinstance(r, AnalysisRouteResult)
            assert r.route_id in ("primary_route", "alternative_route_1")
            assert r.total_distance_km > 0.0
            assert r.estimated_time_minutes > 0.0

    def test_phase5_segmentation_is_invoked(self):
        """Routes are segmented into ~250m discrete intervals with valid geometries."""
        res = analyze_route((78.35, 30.12), (78.55, 30.28), data_mode="DEMO")
        route0 = res.routes[0]
        assert len(route0.segments) > 0
        seg0 = route0.segments[0]
        assert pytest.approx(seg0.segment_length_m, abs=5.0) == 250.0
        assert len(seg0.geometry_coords) >= 2
        assert seg0.end_chainage_km > seg0.start_chainage_km

    def test_gsi_kdtree_is_reused(self):
        """GSI KDTree spatial queries populate distance and scar density for all segments."""
        res = analyze_route((78.35, 30.12), (78.55, 30.28), data_mode="DEMO")
        assert res.data_availability.landslide_inventory is True
        for seg in res.routes[0].segments:
            assert seg.distance_to_historic_scar_m > 0.0
            assert seg.scar_density_1km >= 0

    def test_weather_service_is_invoked(self):
        """Weather telemetry populates P24, P72, and ARI across all segment midpoints."""
        res = analyze_route((78.35, 30.12), (78.55, 30.28), data_mode="DEMO")
        assert res.data_availability.weather is True
        for seg in res.routes[0].segments:
            assert seg.p24_mm is not None
            assert seg.p72_mm is not None
            assert seg.ari_mm is not None

    def test_p24_p72_ari_propagate_correctly(self):
        """Weather parameters propagate accurately from baseline fixture to segments."""
        res = analyze_route((78.35, 30.12), (78.55, 30.28), data_mode="DEMO")
        seg = res.routes[0].segments[0]
        assert pytest.approx(seg.p24_mm, abs=1e-2) == 35.5
        assert pytest.approx(seg.p72_mm, abs=1e-2) == 68.2
        assert seg.ari_mm > 0.0

    def test_simulated_rainfall_override_precedence(self):
        """Explicit simulated_rainfall_mm overrides P24 while preserving P72 and ARI."""
        res = analyze_route(
            (78.35, 30.12),
            (78.55, 30.28),
            simulated_rainfall_mm=65.0,
            data_mode="DEMO",
        )
        assert "SIMULATED(65.0mm)" in res.data_provenance.weather_source
        seg = res.routes[0].segments[0]
        # P24 is overridden to 65.0 mm
        assert seg.p24_mm == 65.0
        # P72 and ARI remain intact from baseline
        assert pytest.approx(seg.p72_mm, abs=1e-2) == 68.2
        assert seg.ari_mm > 0.0

    def test_demo_provenance_is_preserved(self):
        """DEMO sources are explicitly tracked without falsely claiming live status."""
        res = analyze_route((78.35, 30.12), (78.55, 30.28), data_mode="DEMO")
        assert res.data_provenance.routing_source == "DEMO_FIXTURE"
        assert res.data_provenance.weather_source == "DEMO_BASELINE"
        assert res.data_provenance.landslide_source == "GSI"
        assert res.data_provenance.terrain_source is None


class TestTerrainAndCutSlopeSafety:
    """Tests confirming strict refusal to fabricate missing terrain or cut-slope values."""

    def test_missing_dem_is_explicitly_reported(self):
        """When local DEM tiles are absent, terrain is marked unavailable and missing features are reported."""
        res = analyze_route((78.35, 30.12), (78.55, 30.28), data_mode="DEMO")
        assert res.data_availability.terrain is False
        assert "elevation_m" in res.data_availability.missing_features
        assert "slope_degrees" in res.data_availability.missing_features

    def test_missing_terrain_does_not_fabricate_slope(self):
        """Elevation and slope must strictly remain None when DEM is absent."""
        res = analyze_route((78.35, 30.12), (78.55, 30.28), data_mode="DEMO")
        for seg in res.routes[0].segments:
            assert seg.elevation_m is None
            assert seg.slope_degrees is None

    def test_missing_cut_slope_does_not_fabricate_exposure(self):
        """Cut-slope status must strictly remain None when survey metadata is unprovided."""
        res = analyze_route((78.35, 30.12), (78.55, 30.28), data_mode="DEMO")
        for seg in res.routes[0].segments:
            assert seg.is_cut_slope is None

    def test_partial_analysis_state_is_represented_clearly(self):
        """When terrain is missing, status is PARTIAL, route risk is None, and recommendation is unavailable."""
        res = analyze_route((78.35, 30.12), (78.55, 30.28), data_mode="DEMO")
        assert res.status == AnalysisStatus.PARTIAL
        assert res.recommendation_available is False
        assert res.recommended_route_id is None
        for r in res.routes:
            assert r.status == AnalysisStatus.PARTIAL
            assert r.route_risk is None
            assert r.objective is None
            assert r.recommendation_text == "PARTIAL_ASSESSMENT_MISSING_DATA"


class TestCompleteRiskAndMultiObjectiveEvaluation:
    """Tests verifying complete MCDA risk, route risk aggregation, and Pareto optimization when all inputs exist."""

    def test_complete_risk_calculation_works_when_all_feature_inputs_are_supplied(
        self, controlled_terrain_grid, surveyed_cut_slope_provider
    ):
        """Supplying verified terrain and cut-slope data triggers full MCDA risk evaluation."""
        res = analyze_route(
            (78.35, 30.12),
            (78.55, 30.28),
            terrain_provider=controlled_terrain_grid,
            cut_slope_provider=surveyed_cut_slope_provider,
            data_mode="DEMO",
        )
        assert res.status == AnalysisStatus.COMPLETE
        assert res.recommendation_available is True
        assert res.recommended_route_id is not None

        route0 = res.routes[0]
        assert route0.status == AnalysisStatus.COMPLETE
        assert route0.route_risk is not None
        assert 0.0 <= route0.route_risk.composite_route_risk <= 100.0
        assert route0.objective is not None

        for seg in route0.segments:
            assert seg.is_risk_complete is True
            assert seg.risk_result is not None
            assert 0.0 <= seg.risk_result.risk_score <= 100.0

    def test_route_aggregation_uses_existing_40_60_formula(
        self, controlled_terrain_grid, surveyed_cut_slope_provider
    ):
        """Route risk must strictly adhere to R_route = 0.40 * R_avg + 0.60 * R_max."""
        res = analyze_route(
            (78.35, 30.12),
            (78.55, 30.28),
            terrain_provider=controlled_terrain_grid,
            cut_slope_provider=surveyed_cut_slope_provider,
            data_mode="DEMO",
        )
        route_risk = res.routes[0].route_risk
        assert route_risk is not None

        expected_composite = 0.40 * route_risk.average_risk + 0.60 * route_risk.max_bottleneck_risk
        assert pytest.approx(route_risk.composite_route_risk, abs=0.05) == expected_composite

    def test_objective_uses_clear_weather_weights(
        self, controlled_terrain_grid, surveyed_cut_slope_provider
    ):
        """Clear weather (P24 <= 50mm) activates speed-priority Pareto weights (alpha=0.70, beta=0.30)."""
        res = analyze_route(
            (78.35, 30.12),
            (78.55, 30.28),
            simulated_rainfall_mm=25.0,  # <= 50mm clear weather
            terrain_provider=controlled_terrain_grid,
            cut_slope_provider=surveyed_cut_slope_provider,
            data_mode="DEMO",
        )
        obj = res.routes[0].objective
        assert obj is not None
        assert obj.alpha == PARETO_CLEAR_ALPHA  # 0.70
        assert obj.beta == PARETO_CLEAR_BETA    # 0.30
        assert obj.is_heavy_rain_mode is False

    def test_objective_uses_heavy_rain_weights(
        self, controlled_terrain_grid, surveyed_cut_slope_provider
    ):
        """Heavy rain (P24 > 50mm) activates hazard-priority Pareto weights (alpha=0.20, beta=0.80)."""
        res = analyze_route(
            (78.35, 30.12),
            (78.55, 30.28),
            simulated_rainfall_mm=85.0,  # > 50mm heavy rain alert
            terrain_provider=controlled_terrain_grid,
            cut_slope_provider=surveyed_cut_slope_provider,
            data_mode="DEMO",
        )
        obj = res.routes[0].objective
        assert obj is not None
        assert obj.alpha == PARETO_ALERT_ALPHA  # 0.20
        assert obj.beta == PARETO_ALERT_BETA    # 0.80
        assert obj.is_heavy_rain_mode is True

    def test_multiple_routes_are_evaluated_independently(
        self, controlled_terrain_grid, surveyed_cut_slope_provider
    ):
        """Alternative corridors are independently evaluated and ranked by Pareto objective cost."""
        res = analyze_route(
            (78.35, 30.12),
            (78.55, 30.28),
            alternatives=1,
            terrain_provider=controlled_terrain_grid,
            cut_slope_provider=surveyed_cut_slope_provider,
            data_mode="DEMO",
        )
        assert len(res.routes) == 2
        r0 = res.routes[0]
        r1 = res.routes[1]
        assert r0.route_id != r1.route_id
        assert r0.objective is not None
        assert r1.objective is not None

        # Exactly one route is marked as recommended
        recommended_count = sum(1 for r in res.routes if r.is_recommended)
        assert recommended_count == 1
        assert res.recommended_route_id in (r0.route_id, r1.route_id)

    def test_alternative_route_is_not_fabricated(
        self, controlled_terrain_grid, surveyed_cut_slope_provider
    ):
        """When alternatives=0 is requested, only the primary route is returned without artificial routes."""
        res = analyze_route(
            (78.35, 30.12),
            (78.55, 30.28),
            alternatives=0,
            terrain_provider=controlled_terrain_grid,
            cut_slope_provider=surveyed_cut_slope_provider,
            data_mode="DEMO",
        )
        assert len(res.routes) == 1
        assert res.routes[0].route_id == "primary_route"


class TestMocksAndErrorHandling:
    """Tests verifying dependency mocking and clean error propagation."""

    def test_live_routing_provider_can_be_mocked(self):
        """Custom routing provider can be injected directly into analysis service."""
        class MockRoutingProvider(BaseRoutingProvider):
            @property
            def provider_name(self) -> str:
                return "MOCK_PROVIDER"

            def get_routes(self, origin, destination, alternatives=1):
                return [
                    NormalizedRoute(
                        route_id="mock_route",
                        geometry_coords=[(78.35, 30.12), (78.45, 30.20), (78.55, 30.28)],
                        total_distance_km=25.0,
                        estimated_time_minutes=40.0,
                        provider=self.provider_name,
                    )
                ]

        mock_routing_svc = RoutingService(provider=MockRoutingProvider())
        res = analyze_route((78.35, 30.12), (78.55, 30.28), routing_service=mock_routing_svc)
        assert res.routes[0].route_id == "mock_route"
        assert res.data_provenance.routing_source == "MOCK_PROVIDER"

    def test_weather_provider_can_be_mocked(self):
        """Custom weather service can be injected directly into analysis service."""
        class MockWeatherService(WeatherService):
            def get_weather_for_segment(self, segment):
                return WeatherFeatures(
                    p24_mm=10.0,
                    p72_mm=25.0,
                    ari_mm=15.0,
                    daily_history_mm=[10.0] + [0.0] * 14,
                    observed_at="2026-10-01T00:00:00Z",
                    source="MOCK_WEATHER",
                )

        mock_weather = MockWeatherService(data_mode="DEMO")
        res = analyze_route(
            (78.35, 30.12),
            (78.55, 30.28),
            weather_service=mock_weather,
            data_mode="DEMO",
        )
        assert res.routes[0].segments[0].p24_mm == 10.0
        assert res.routes[0].segments[0].p72_mm == 25.0

    def test_invalid_coordinates_raise_invalid_coordinate_error(self):
        """Coordinates outside Uttarakhand raise InvalidCoordinateError cleanly."""
        with pytest.raises(InvalidCoordinateError):
            analyze_route((76.0, 30.0), (78.55, 30.28))

    def test_invalid_safety_preference_raises_value_error(self):
        """preference_weight_safety outside [0, 1] raises ValueError."""
        with pytest.raises(ValueError, match="preference_weight_safety"):
            analyze_route((78.35, 30.12), (78.55, 30.28), preference_weight_safety=1.5)

    def test_invalid_simulated_rainfall_raises_value_error(self):
        """simulated_rainfall_mm outside [0, 150] raises ValueError."""
        with pytest.raises(ValueError, match="simulated_rainfall_mm"):
            analyze_route((78.35, 30.12), (78.55, 30.28), simulated_rainfall_mm=250.0)


class TestStatewideRouteAgnosticOrchestration:
    """Verifies that orchestration operates statewide without hardcoding any corridor or district."""

    def test_western_uttarakhand_orchestration(self):
        """Arbitrary waypoints in Western Uttarakhand."""
        res = analyze_route((77.80, 30.30), (78.05, 30.45), data_mode="DEMO")
        assert len(res.routes) >= 1
        assert res.routes[0].total_distance_km > 0.0

    def test_central_uttarakhand_orchestration(self):
        """Arbitrary waypoints in Central Uttarakhand."""
        res = analyze_route((78.80, 30.20), (79.20, 30.35), data_mode="DEMO")
        assert len(res.routes) >= 1
        assert res.routes[0].total_distance_km > 0.0

    def test_eastern_uttarakhand_orchestration(self):
        """Arbitrary waypoints in Eastern Uttarakhand."""
        res = analyze_route((79.80, 29.80), (80.15, 30.05), data_mode="DEMO")
        assert len(res.routes) >= 1
        assert res.routes[0].total_distance_km > 0.0

    def test_geojson_export_compatibility(self):
        """Route result converts to GeoJSON FeatureCollection with per-segment properties."""
        res = analyze_route((78.35, 30.12), (78.55, 30.28), data_mode="DEMO")
        geojson = res.routes[0].to_geojson()
        assert geojson["type"] == "FeatureCollection"
        assert len(geojson["features"]) == len(res.routes[0].segments)
        feat0 = geojson["features"][0]
        assert feat0["type"] == "Feature"
        assert feat0["geometry"]["type"] == "LineString"
        props = feat0["properties"]
        assert "segment_index" in props
        assert "start_km" in props
        assert "end_km" in props
        assert "distance_to_historic_scar_m" in props
        assert "scar_density_1km" in props
