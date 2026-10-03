"""FastAPI REST API and OpenAPI contract tests for Drishti-Himalaya (Phase 10)."""

import uuid
from unittest.mock import patch
import pytest
from fastapi.testclient import TestClient

from backend.app.core.config import settings
from backend.app.main import app
from backend.app.schemas.health import HealthResponse
from backend.app.services.segment_repository import get_segment_repository


@pytest.fixture
def client() -> TestClient:
    """Provide reusable test client instance."""
    return TestClient(app)


class TestAPIInfrastructure:
    """Test suite for app initialization, documentation, and OpenAPI contract."""

    def test_01_app_imports_successfully(self) -> None:
        """1. Verify FastAPI app imports and has correct metadata."""
        assert app is not None
        assert app.title == "Drishti-Himalaya Hazard Routing API"
        assert app.version == "1.0.0"

    def test_02_docs_reachable(self, client: TestClient) -> None:
        """2. Verify /docs Swagger UI is reachable."""
        response = client.get("/docs")
        assert response.status_code == 200
        assert "swagger-ui" in response.text.lower()

    def test_03_openapi_json_reachable(self, client: TestClient) -> None:
        """3. Verify /openapi.json schema document is reachable."""
        response = client.get("/openapi.json")
        assert response.status_code == 200
        data = response.json()
        assert "openapi" in data
        assert data["info"]["title"] == "Drishti-Himalaya Hazard Routing API"
        assert "paths" in data

    def test_04_health_returns_valid_response(self, client: TestClient) -> None:
        """4. Verify /api/v1/health returns valid response matching HealthResponse."""
        response = client.get("/api/v1/health")
        assert response.status_code == 200
        data = response.json()
        validated = HealthResponse.model_validate(data)
        assert validated.service == "Drishti-Himalaya API"
        assert validated.data_mode == "DEMO"
        assert "connected" in validated.database.lower()
        assert validated.cached_landslide_scars == 5206
        assert validated.corridor_length_km > 0.0

    def test_20_cors_middleware_installed(self, client: TestClient) -> None:
        """20. Verify CORS middleware is properly installed and responds to preflight."""
        response = client.options(
            "/api/v1/health",
            headers={
                "Origin": "http://localhost:5173",
                "Access-Control-Request-Method": "GET",
            },
        )
        assert response.status_code == 200
        assert response.headers.get("access-control-allow-origin") == "http://localhost:5173"

    def test_22_openapi_contains_all_required_endpoints(self, client: TestClient) -> None:
        """22. Verify OpenAPI spec defines all required endpoints and methods."""
        response = client.get("/openapi.json")
        assert response.status_code == 200
        paths = response.json()["paths"]

        assert "/api/v1/route/analyze" in paths
        assert "post" in paths["api/v1/route/analyze".replace("api", "/api")] or "/api/v1/route/analyze" in paths
        assert "post" in paths["/api/v1/route/analyze"]

        assert "/api/v1/hazard/segment/{segment_id}" in paths
        assert "get" in paths["/api/v1/hazard/segment/{segment_id}"]

        assert "/api/v1/weather/corridor-summary" in paths
        assert "get" in paths["/api/v1/weather/corridor-summary"]

        assert "/api/v1/health" in paths
        assert "get" in paths["/api/v1/health"]


class TestRouteAnalysisValidation:
    """Test suite for coordinate and parameter validation in POST /api/v1/route/analyze."""

    def test_06_invalid_latitude_rejected(self, client: TestClient) -> None:
        """6. Verify out-of-bounds latitude (< 28.7 or > 31.5) is rejected with HTTP 422."""
        payload = {
            "origin": {"latitude": 27.5, "longitude": 78.2947},
            "destination": {"latitude": 30.5526, "longitude": 79.5684},
        }
        res = client.post("/api/v1/route/analyze", json=payload)
        assert res.status_code == 422
        body = res.json()
        assert body["error"] == "VALIDATION_ERROR"
        assert "errors" in body["details"]

    def test_07_invalid_longitude_rejected(self, client: TestClient) -> None:
        """7. Verify out-of-bounds longitude (< 77.5 or > 81.1) is rejected with HTTP 422."""
        payload = {
            "origin": {"latitude": 30.1033, "longitude": 76.9},
            "destination": {"latitude": 30.5526, "longitude": 79.5684},
        }
        res = client.post("/api/v1/route/analyze", json=payload)
        assert res.status_code == 422
        body = res.json()
        assert body["error"] == "VALIDATION_ERROR"

    def test_08_invalid_safety_preference_rejected(self, client: TestClient) -> None:
        """8. Verify safety preference outside [0.0, 1.0] is rejected with HTTP 422."""
        payload = {
            "origin": {"latitude": 30.1033, "longitude": 78.2947},
            "destination": {"latitude": 30.5526, "longitude": 79.5684},
            "preference_weight_safety": 1.5,
        }
        res = client.post("/api/v1/route/analyze", json=payload)
        assert res.status_code == 422
        body = res.json()
        assert body["error"] == "VALIDATION_ERROR"

    def test_09_invalid_simulated_rainfall_rejected(self, client: TestClient) -> None:
        """9. Verify simulated rainfall outside [0.0, 150.0] is rejected with HTTP 422."""
        payload = {
            "origin": {"latitude": 30.1033, "longitude": 78.2947},
            "destination": {"latitude": 30.5526, "longitude": 79.5684},
            "simulated_rainfall_mm": 200.0,
        }
        res = client.post("/api/v1/route/analyze", json=payload)
        assert res.status_code == 422
        body = res.json()
        assert body["error"] == "VALIDATION_ERROR"


class TestRouteAnalysisExecution:
    """Test suite for execution, honesty, and schema compliance in POST /api/v1/route/analyze."""

    @pytest.fixture
    def pilot_payload(self) -> dict:
        return {
            "origin": {
                "latitude": 30.1033,
                "longitude": 78.2947,
                "name": "Rishikesh",
            },
            "destination": {
                "latitude": 30.5526,
                "longitude": 79.5684,
                "name": "Joshimath",
            },
            "preference_weight_safety": 0.50,
            "simulated_rainfall_mm": 50.0,
        }

    def test_05_valid_route_analyze_returns_200(self, client: TestClient, pilot_payload: dict) -> None:
        """5. Verify valid route analysis returns HTTP 200."""
        res = client.post("/api/v1/route/analyze", json=pilot_payload)
        assert res.status_code == 200
        data = res.json()
        assert "routes" in data
        assert len(data["routes"]) >= 1

    def test_10_route_analysis_returns_query_id(self, client: TestClient, pilot_payload: dict) -> None:
        """10. Verify response contains a valid UUID query_id."""
        res = client.post("/api/v1/route/analyze", json=pilot_payload)
        assert res.status_code == 200
        qid = res.json()["query_id"]
        # Must be valid UUID
        parsed = uuid.UUID(qid)
        assert str(parsed) == qid

    def test_11_route_analysis_returns_data_mode(self, client: TestClient, pilot_payload: dict) -> None:
        """11. Verify route analysis returns runtime data_mode (DEMO)."""
        res = client.post("/api/v1/route/analyze", json=pilot_payload)
        assert res.status_code == 200
        assert res.json()["data_mode"] == "DEMO"

    def test_12_route_analysis_preserves_partial_status_when_dem_missing(
        self, client: TestClient, pilot_payload: dict
    ) -> None:
        """12. Verify analysis preserves PARTIAL status when Copernicus DEM is missing."""
        from backend.app.geospatial.terrain import CopernicusDEMProvider
        with patch("backend.app.api.v1.route_analysis.analyze_route") as mock_analyze:
            from backend.app.services.analysis_service import analyze_route as real_analyze
            mock_analyze.side_effect = lambda *args, **kwargs: real_analyze(
                *args, **{**kwargs, "terrain_provider": CopernicusDEMProvider(dem_dir="non_existent_dem_dir")}
            )
            res = client.post("/api/v1/route/analyze", json=pilot_payload)
            assert res.status_code == 200
            data = res.json()
            assert data["status"] == "PARTIAL"
            assert data["recommendation_available"] is False
            assert "elevation_m" in data["data_availability"]["missing_features"]
            assert "slope_degrees" in data["data_availability"]["missing_features"]

    def test_13_route_analysis_does_not_fabricate_slope_when_dem_missing(
        self, client: TestClient, pilot_payload: dict
    ) -> None:
        """13. Verify route analysis does not fabricate fake slope values when DEM is absent."""
        from backend.app.geospatial.terrain import CopernicusDEMProvider
        with patch("backend.app.api.v1.route_analysis.analyze_route") as mock_analyze:
            from backend.app.services.analysis_service import analyze_route as real_analyze
            mock_analyze.side_effect = lambda *args, **kwargs: real_analyze(
                *args, **{**kwargs, "terrain_provider": CopernicusDEMProvider(dem_dir="non_existent_dem_dir")}
            )
            res = client.post("/api/v1/route/analyze", json=pilot_payload)
            assert res.status_code == 200
            route = res.json()["routes"][0]
            features = route["geojson"]["features"]
            assert len(features) > 0
            for feat in features:
                props = feat["properties"]
                assert props["slope_degrees"] is None
                assert props["elevation_m"] is None

    def test_13b_route_analysis_with_real_copernicus_dem_populates_elevation_and_slope(
        self, client: TestClient, pilot_payload: dict
    ) -> None:
        """13b. Verify route analysis with real Copernicus DEM populates valid elevation and slope."""
        res = client.post("/api/v1/route/analyze", json=pilot_payload)
        assert res.status_code == 200
        data = res.json()
        assert data["data_availability"]["terrain"] is True
        assert data["data_provenance"]["terrain_source"] == "Copernicus DEM GLO-30"
        route = data["routes"][0]
        first_feature_props = route["geojson"]["features"][0]["properties"]
        assert first_feature_props["elevation_m"] is not None
        assert first_feature_props["elevation_m"] > 0.0
        assert first_feature_props["slope_degrees"] is not None
        assert first_feature_props["slope_degrees"] >= 0.0

    def test_14_route_analysis_does_not_fabricate_route_risk(
        self, client: TestClient, pilot_payload: dict
    ) -> None:
        """14. Verify composite route risk remains None when terrain features are missing."""
        res = client.post("/api/v1/route/analyze", json=pilot_payload)
        assert res.status_code == 200
        route = res.json()["routes"][0]
        assert route["composite_route_risk"] is None
        assert route["max_bottleneck_risk"] is None
        assert route["average_segment_risk"] is None
        assert route["recommendation"] == "PARTIAL_ASSESSMENT_MISSING_DATA"

    def test_15_multi_route_response_serializes_correctly(
        self, client: TestClient, pilot_payload: dict
    ) -> None:
        """15. Verify route response structure adheres to API contract."""
        res = client.post("/api/v1/route/analyze", json=pilot_payload)
        assert res.status_code == 200
        data = res.json()
        assert isinstance(data["routes"], list)
        route = data["routes"][0]
        for field in [
            "route_id",
            "summary",
            "is_recommended",
            "total_distance_km",
            "estimated_time_minutes",
            "high_risk_segment_count",
            "severe_risk_segment_count",
            "recommendation",
            "advisory_text",
            "geojson",
        ]:
            assert field in route

    def test_16_geojson_feature_collection_serializes_correctly(
        self, client: TestClient, pilot_payload: dict
    ) -> None:
        """16. Verify GeoJSON FeatureCollection serializes with valid LineString geometry."""
        res = client.post("/api/v1/route/analyze", json=pilot_payload)
        assert res.status_code == 200
        route = res.json()["routes"][0]
        geojson = route["geojson"]
        assert geojson["type"] == "FeatureCollection"
        assert len(geojson["features"]) > 0

        first_feat = geojson["features"][0]
        assert first_feat["type"] == "Feature"
        assert first_feat["geometry"]["type"] == "LineString"
        assert len(first_feat["geometry"]["coordinates"]) >= 2
        assert "start_km" in first_feat["properties"]
        assert "end_km" in first_feat["properties"]
        assert "distance_to_historic_scar_m" in first_feat["properties"]


class TestWeatherAndHazardEndpoints:
    """Test suite for weather summaries, hazard drilldown, and error handling."""

    def test_17_weather_corridor_summary_works_in_demo_mode(self, client: TestClient) -> None:
        """17. Verify GET /api/v1/weather/corridor-summary returns stations and averages in DEMO."""
        res = client.get("/api/v1/weather/corridor-summary?corridor=NH7")
        assert res.status_code == 200
        data = res.json()
        assert "NH7" in data["corridor"]
        assert data["data_mode"] == "DEMO"
        assert data["average_rainfall_24h_mm"] >= 0.0
        assert data["max_rainfall_24h_mm"] >= 0.0
        assert len(data["monitoring_nodes"]) == 5

    def test_18_weather_response_preserves_data_mode(self, client: TestClient) -> None:
        """18. Verify weather summary correctly preserves data_mode."""
        res = client.get("/api/v1/weather/corridor-summary?corridor=NH-7")
        assert res.status_code == 200
        assert res.json()["data_mode"] == settings.DATA_MODE.upper()

    def test_19_missing_hazard_segment_returns_404(self, client: TestClient) -> None:
        """19. Verify requesting an unknown segment ID returns structured HTTP 404."""
        res = client.get("/api/v1/hazard/segment/non_existent_segment_id")
        assert res.status_code == 404
        body = res.json()
        assert body["error"] == "NOT_FOUND"
        assert "non_existent_segment_id" in body["message"]

    def test_hazard_segment_drilldown_after_analysis(self, client: TestClient) -> None:
        """Verify analyzed segments can be drilled down via GET /api/v1/hazard/segment/{id}."""
        # 1. Run analysis to populate repository
        client.post(
            "/api/v1/route/analyze",
            json={
                "origin": {"latitude": 30.1033, "longitude": 78.2947},
                "destination": {"latitude": 30.5526, "longitude": 79.5684},
            },
        )
        # 2. Drilldown into seg_0
        res = client.get("/api/v1/hazard/segment/seg_0")
        assert res.status_code == 200
        data = res.json()
        assert data["segment_id"] == "seg_0"
        assert data["coordinates"]["latitude"] > 0
        assert "is_cut_slope" in data["missing_features"]

    def test_21_unexpected_service_error_becomes_structured_http_error(self) -> None:
        """21. Verify unhandled backend exceptions produce structured HTTP 500 without leaking stack traces."""
        error_client = TestClient(app, raise_server_exceptions=False)
        with patch("backend.app.api.v1.route_analysis.analyze_route", side_effect=RuntimeError("Simulated internal fault")):
            res = error_client.post(
                "/api/v1/route/analyze",
                json={
                    "origin": {"latitude": 30.1033, "longitude": 78.2947},
                    "destination": {"latitude": 30.5526, "longitude": 79.5684},
                },
            )
            assert res.status_code == 500
            body = res.json()
            assert body["error"] == "INTERNAL_SERVER_ERROR"
            assert "unexpected" in body["message"].lower()
            assert "Simulated internal fault" not in body["message"]


class TestStatewideCapability:
    """Test suite ensuring API supports arbitrary Uttarakhand coordinates, not just NH-7."""

    def test_statewide_arbitrary_coordinates(self, client: TestClient) -> None:
        """Verify the API accepts arbitrary valid Uttarakhand coordinates across districts."""
        # Dehradun to Mussoorie
        payload = {
            "origin": {"latitude": 30.3165, "longitude": 78.0322, "name": "Dehradun"},
            "destination": {"latitude": 30.4598, "longitude": 78.0644, "name": "Mussoorie"},
        }
        res = client.post("/api/v1/route/analyze", json=payload)
        assert res.status_code == 200
        data = res.json()
        assert data["status"] == "PARTIAL"
        assert "Dehradun to Mussoorie" in data["corridor"]
        assert len(data["routes"]) >= 1
