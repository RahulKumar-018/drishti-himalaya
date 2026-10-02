"""Tests for Pydantic API schemas in Drishti-Himalaya."""

import pytest
from pydantic import ValidationError

from backend.app.schemas import (
    AlertLevel,
    AnalyzeRouteRequest,
    AnalyzeRouteResponse,
    CoordinatePoint,
    CorridorWeatherSummaryResponse,
    DensityFactorAttribution,
    ExposureFactorAttribution,
    FactorAttribution,
    GeoJSONFeatureCollection,
    HealthResponse,
    LineStringGeometry,
    ProximityFactorAttribution,
    RainfallFactorAttribution,
    RiskTier,
    RouteInfo,
    SegmentAttributionResponse,
    SegmentFeature,
    SegmentProperties,
    SlopeFactorAttribution,
    WeatherMonitoringNode,
)


class TestCoordinateSchema:
    """Test suite for CoordinatePoint validation."""

    def test_valid_coordinate_accepted(self) -> None:
        """1. Verify that valid Uttarakhand coordinates are accepted."""
        pt = CoordinatePoint(latitude=30.1033, longitude=78.2947, name="Rishikesh")
        assert pt.latitude == 30.1033
        assert pt.longitude == 78.2947
        assert pt.name == "Rishikesh"

    def test_latitude_below_minimum_rejected(self) -> None:
        """2. Verify that latitude below 28.7 is rejected."""
        with pytest.raises(ValidationError) as exc_info:
            CoordinatePoint(latitude=28.69, longitude=78.2947)
        errors = exc_info.value.errors()
        assert any("latitude" in err["loc"] for err in errors)

    def test_latitude_above_maximum_rejected(self) -> None:
        """3. Verify that latitude above 31.5 is rejected."""
        with pytest.raises(ValidationError) as exc_info:
            CoordinatePoint(latitude=31.51, longitude=78.2947)
        errors = exc_info.value.errors()
        assert any("latitude" in err["loc"] for err in errors)

    def test_longitude_below_minimum_rejected(self) -> None:
        """4. Verify that longitude below 77.5 is rejected."""
        with pytest.raises(ValidationError) as exc_info:
            CoordinatePoint(latitude=30.0, longitude=77.49)
        errors = exc_info.value.errors()
        assert any("longitude" in err["loc"] for err in errors)

    def test_longitude_above_maximum_rejected(self) -> None:
        """5. Verify that longitude above 81.1 is rejected."""
        with pytest.raises(ValidationError) as exc_info:
            CoordinatePoint(latitude=30.0, longitude=81.11)
        errors = exc_info.value.errors()
        assert any("longitude" in err["loc"] for err in errors)


class TestRouteAnalysisRequestSchema:
    """Test suite for AnalyzeRouteRequest validation."""

    def test_valid_route_request_accepted(self) -> None:
        """6. Verify that a complete valid request is accepted."""
        req = AnalyzeRouteRequest(
            origin=CoordinatePoint(latitude=30.1033, longitude=78.2947, name="Rishikesh"),
            destination=CoordinatePoint(latitude=30.5526, longitude=79.5684, name="Joshimath"),
            preference_weight_safety=0.70,
            simulated_rainfall_mm=45.0,
        )
        assert req.origin.name == "Rishikesh"
        assert req.destination.name == "Joshimath"
        assert req.preference_weight_safety == 0.70
        assert req.simulated_rainfall_mm == 45.0

    def test_default_safety_preference_is_half(self) -> None:
        """7. Verify that default safety preference weight is 0.50."""
        req = AnalyzeRouteRequest(
            origin=CoordinatePoint(latitude=30.1033, longitude=78.2947),
            destination=CoordinatePoint(latitude=30.5526, longitude=79.5684),
        )
        assert req.preference_weight_safety == 0.50
        assert req.simulated_rainfall_mm is None

    def test_safety_preference_below_zero_rejected(self) -> None:
        """8. Verify that safety preference < 0.0 is rejected."""
        with pytest.raises(ValidationError) as exc_info:
            AnalyzeRouteRequest(
                origin=CoordinatePoint(latitude=30.1033, longitude=78.2947),
                destination=CoordinatePoint(latitude=30.5526, longitude=79.5684),
                preference_weight_safety=-0.01,
            )
        assert any("preference_weight_safety" in err["loc"] for err in exc_info.value.errors())

    def test_safety_preference_above_one_rejected(self) -> None:
        """9. Verify that safety preference > 1.0 is rejected."""
        with pytest.raises(ValidationError) as exc_info:
            AnalyzeRouteRequest(
                origin=CoordinatePoint(latitude=30.1033, longitude=78.2947),
                destination=CoordinatePoint(latitude=30.5526, longitude=79.5684),
                preference_weight_safety=1.05,
            )
        assert any("preference_weight_safety" in err["loc"] for err in exc_info.value.errors())

    def test_simulated_rainfall_below_zero_rejected(self) -> None:
        """10. Verify that simulated rainfall < 0.0 is rejected."""
        with pytest.raises(ValidationError) as exc_info:
            AnalyzeRouteRequest(
                origin=CoordinatePoint(latitude=30.1033, longitude=78.2947),
                destination=CoordinatePoint(latitude=30.5526, longitude=79.5684),
                simulated_rainfall_mm=-5.0,
            )
        assert any("simulated_rainfall_mm" in err["loc"] for err in exc_info.value.errors())

    def test_simulated_rainfall_above_max_rejected(self) -> None:
        """11. Verify that simulated rainfall > 150.0 is rejected."""
        with pytest.raises(ValidationError) as exc_info:
            AnalyzeRouteRequest(
                origin=CoordinatePoint(latitude=30.1033, longitude=78.2947),
                destination=CoordinatePoint(latitude=30.5526, longitude=79.5684),
                simulated_rainfall_mm=150.1,
            )
        assert any("simulated_rainfall_mm" in err["loc"] for err in exc_info.value.errors())

    def test_required_fields_enforced(self) -> None:
        """12. Verify that missing origin or destination raises validation error."""
        with pytest.raises(ValidationError) as exc_origin:
            AnalyzeRouteRequest.model_validate({"destination": {"latitude": 30.5, "longitude": 79.5}})
        assert any("origin" in err["loc"] for err in exc_origin.value.errors())

        with pytest.raises(ValidationError) as exc_dest:
            AnalyzeRouteRequest.model_validate({"origin": {"latitude": 30.1, "longitude": 78.2}})
        assert any("destination" in err["loc"] for err in exc_dest.value.errors())


class TestResponseModels:
    """Test suite for response schema instantiation and constraints."""

    def test_valid_response_models_can_be_instantiated(self) -> None:
        """13. Verify that all documented response models instantiate properly with valid fixtures."""
        # 1. GeoJSON feature and collection
        props = SegmentProperties(
            segment_index=42,
            segment_length_m=250.0,
            start_km=10.5,
            end_km=10.75,
            slope_degrees=44.2,
            elevation_m=1240.0,
            precipitation_24h_mm=68.5,
            distance_to_historic_scar_m=85.0,
            scar_density_1km=6.2,
            is_cut_slope=True,
            segment_risk_score=89.2,
            risk_category=RiskTier.SEVERE,
            color_hex="#EF4444",
        )
        geom = LineStringGeometry(coordinates=[[79.3124, 30.3951], [79.3142, 30.3962]])
        feature = SegmentFeature(id="seg_nh7_042", properties=props, geometry=geom)
        fc = GeoJSONFeatureCollection(features=[feature])

        # 2. RouteInfo and AnalyzeRouteResponse
        route_info = RouteInfo(
            route_id="primary_nh7",
            summary="Direct NH-7",
            is_recommended=False,
            total_distance_km=156.4,
            estimated_time_minutes=310.0,
            composite_route_risk=68.4,
            max_bottleneck_risk=89.2,
            average_segment_risk=37.2,
            high_risk_segment_count=14,
            severe_risk_segment_count=5,
            recommendation="CAUTION_HIGH_RISK",
            advisory_text="High failure hazard along Alaknanda gorge.",
            geojson=fc,
        )
        route_resp = AnalyzeRouteResponse(
            status="success",
            query_id="9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
            execution_duration_ms=342.0,
            data_mode="DEMO",
            corridor="NH-7 (Rishikesh - Joshimath)",
            routes=[route_info],
        )
        assert route_resp.status == "success"
        assert len(route_resp.routes) == 1
        assert route_resp.routes[0].route_id == "primary_nh7"

        # 3. SegmentAttributionResponse
        attribution = FactorAttribution(
            slope=SlopeFactorAttribution(
                value_degrees=44.2,
                sub_score=92.4,
                weight=0.35,
                weighted_contribution=32.34,
                status="CRITICAL",
                description="Steep cut-slope exceeding 35°",
            ),
            rainfall=RainfallFactorAttribution(
                precipitation_24h_mm=68.5,
                precipitation_72h_mm=112.0,
                antecedent_rain_index=145.2,
                sub_score=91.3,
                weight=0.30,
                weighted_contribution=27.39,
                status="CRITICAL",
                description="Approaching threshold",
            ),
            proximity_to_scars=ProximityFactorAttribution(
                distance_meters=85.0,
                sub_score=78.4,
                weight=0.20,
                weighted_contribution=15.68,
                status="HIGH",
                description="Within 85m of mapped scar",
            ),
            landslide_density=DensityFactorAttribution(
                scars_per_sq_km=6.2,
                sub_score=77.5,
                weight=0.10,
                weighted_contribution=7.75,
                status="HIGH",
                description="High clustering",
            ),
            cut_slope_exposure=ExposureFactorAttribution(
                is_exposed=True,
                sub_score=100.0,
                weight=0.05,
                weighted_contribution=5.0,
                status="HIGH",
                description="Active excavation zone",
            ),
        )
        seg_resp = SegmentAttributionResponse(
            segment_id="seg_nh7_042",
            corridor="NH-7",
            chainage_km=10.5,
            coordinates=CoordinatePoint(latitude=30.3956, longitude=79.3133),
            overall_risk_score=89.2,
            risk_tier=RiskTier.SEVERE,
            color_hex="#EF4444",
            factor_attribution=attribution,
            geotechnical_advisory="Elevated probability of planar debris sliding.",
        )
        assert seg_resp.overall_risk_score == 89.2

        # 4. CorridorWeatherSummaryResponse
        weather_resp = CorridorWeatherSummaryResponse(
            corridor="NH-7 (Rishikesh to Joshimath)",
            data_mode="DEMO",
            last_updated="2026-10-01T10:30:00Z",
            average_rainfall_24h_mm=38.4,
            max_rainfall_24h_mm=68.5,
            active_alert_level=AlertLevel.ORANGE,
            monitoring_nodes=[
                WeatherMonitoringNode(
                    node_name="Rishikesh",
                    latitude=30.1033,
                    longitude=78.2947,
                    rain_24h_mm=12.0,
                    status=AlertLevel.GREEN,
                )
            ],
        )
        assert weather_resp.active_alert_level == AlertLevel.ORANGE

        # 5. HealthResponse
        health_resp = HealthResponse(
            status="healthy",
            service="Drishti-Himalaya API",
            version="1.0.0",
            data_mode="DEMO",
            database="connected (SQLite in-memory fallback)",
            weather_api="active (cached baseline)",
            routing_engine="active (deterministic NH-7 corridor)",
            cached_landslide_scars=11219,
            corridor_length_km=156.4,
        )
        assert health_resp.cached_landslide_scars == 11219

    def test_invalid_risk_category_rejected(self) -> None:
        """14. Verify that invalid risk tiers are rejected by RiskTier enum."""
        with pytest.raises(ValidationError):
            SegmentProperties(
                segment_index=1,
                segment_length_m=250.0,
                start_km=0.0,
                end_km=0.25,
                slope_degrees=20.0,
                elevation_m=500.0,
                precipitation_24h_mm=10.0,
                distance_to_historic_scar_m=500.0,
                scar_density_1km=1.0,
                is_cut_slope=False,
                segment_risk_score=15.0,
                risk_category="UNKNOWN_CATEGORY",  # type: ignore[arg-type]
                color_hex="#10B981",
            )
