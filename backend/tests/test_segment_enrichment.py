"""Unit and integration tests for Segment Hazard Feature Enrichment (Phase 6).

Verifies:
- Midpoint query to real GSI landslide KDTree (nearest distance and 1km density)
- Spatial index reuse without redundant reloads
- Terrain DEM provider interface and Horn (1981) slope derivation on small test fixtures
- Data-unavailable handling with strict refusal to fabricate synthetic terrain
- Cut-slope exposure preservation without arbitrary inference
- Controlled integration bridge into Phase-3 MCDA risk engine
- Standard GeoJSON feature export compatibility
"""

import math
import numpy as np
import pytest

from backend.app.geospatial.enrichment import (
    BaseCutSlopeProvider,
    DefaultCutSlopeProvider,
    EnrichedRouteResult,
    SegmentHazardFeatures,
    enrich_route_segments,
    evaluate_segment_risk_from_features,
)
from backend.app.geospatial.models import LandslideSource
from backend.app.geospatial.service import LandslideInventoryService, get_inventory_service
from backend.app.geospatial.terrain import (
    BaseTerrainProvider,
    CopernicusDEMProvider,
    RasterGridTerrainProvider,
)
from backend.app.risk_engine.models import SegmentRiskResult
from backend.app.routing.segmenter import segment_route_linestring


# Synthetic small controlled test raster fixture (TEST ONLY - NEVER ADDED TO PRODUCTION)
@pytest.fixture
def controlled_test_dem():
    """Create a 5x5 test raster grid with known linear gradient for slope and elevation validation."""
    # Bounds: 78.0°E to 78.004°E, 30.0°N to 30.004°N
    # 5 rows x 5 cols, 0.001° spacing (~100m)
    bounds = (78.0, 30.0, 78.004, 30.004)
    # Tilted plane: z rises by 100m for every 100m east (dx) -> 45° slope in E-W direction
    # Row 0 is North (lat 30.004), Col 0 is West (lon 78.0)
    grid = np.zeros((5, 5), dtype=np.float64)
    phi = math.radians(30.0)
    cell_dx_m = 0.001 * (math.pi / 180.0) * 6378137.0 * math.cos(phi)
    for r in range(5):
        for c in range(5):
            grid[r, c] = 500.0 + c * cell_dx_m  # rises exactly 1 meter per meter eastward

    return RasterGridTerrainProvider(elevation_grid=grid, bounds_lon_lat=bounds, source_name="TestTiltedDEM")


@pytest.fixture
def flat_test_dem():
    """Create a flat 5x5 test raster grid with 0° slope."""
    bounds = (78.0, 30.0, 78.004, 30.004)
    grid = np.full((5, 5), 750.0, dtype=np.float64)
    return RasterGridTerrainProvider(elevation_grid=grid, bounds_lon_lat=bounds, source_name="TestFlatDEM")


@pytest.fixture
def test_route_segments():
    """Generate a simple 500m route yielding two 250m segments."""
    coords = [(78.001, 30.001), (78.001, 30.006)]
    return segment_route_linestring(coords, segment_length_m=250.0)


class TestGSILandslideFeatures:
    """Tests for GSI historical landslide KDTree integration."""

    def test_midpoint_is_passed_to_kdtree(self, test_route_segments):
        """Segment geometric midpoint must be used for nearest scar and density spatial queries."""
        service = get_inventory_service()
        if not service.is_ready:
            service.load_uttarakhand_inventory()

        result = enrich_route_segments(test_route_segments, inventory_service=service)

        for es in result.enriched_segments:
            expected_lon, expected_lat = es.segment.midpoint
            assert es.features.midpoint_longitude == expected_lon
            assert es.features.midpoint_latitude == expected_lat

    def test_nearest_historical_scar_distance_is_returned(self, test_route_segments):
        """Nearest scar distance must match the spatial index query in meters."""
        service = get_inventory_service()
        result = enrich_route_segments(test_route_segments, inventory_service=service)

        for es in result.enriched_segments:
            expected_dist = service.nearest_distance_m(es.features.midpoint_longitude, es.features.midpoint_latitude)
            assert pytest.approx(es.features.distance_to_historic_scar_m, abs=1e-2) == expected_dist
            assert es.features.distance_to_historic_scar_m > 0.0

    def test_1km_scar_density_is_returned(self, test_route_segments):
        """Historical scar count within 1 km must match the KDTree range query."""
        service = get_inventory_service()
        result = enrich_route_segments(test_route_segments, inventory_service=service)

        for es in result.enriched_segments:
            expected_count = service.count_within_radius_m(
                es.features.midpoint_longitude, es.features.midpoint_latitude, radius_m=1000.0
            )
            assert es.features.scar_density_1km == expected_count
            assert isinstance(es.features.scar_density_1km, int)

    def test_gsi_source_is_preserved(self):
        """Historical records must preserve GSI government provenance."""
        service = get_inventory_service()
        if not service.is_ready:
            service.load_uttarakhand_inventory()

        assert service.total_count == 5206
        assert service.source_counts.get(LandslideSource.GSI.value) == 5206

    def test_kdtree_is_reused_without_rebuilding(self, test_route_segments):
        """Enriching multiple segments must reuse the existing in-memory spatial index."""
        service = get_inventory_service()
        if not service.is_ready:
            service.load_uttarakhand_inventory()

        # Index is already built
        assert service.is_ready
        initial_tree = service.index._tree

        # Run enrichment
        res1 = enrich_route_segments(test_route_segments, inventory_service=service)
        res2 = enrich_route_segments(test_route_segments, inventory_service=service)

        # Index tree object was not destroyed or rebuilt
        assert service.index._tree is initial_tree
        assert len(res1) == len(res2)


class TestTerrainDEMProvider:
    """Tests for DEM provider abstraction, Horn slope derivation, and unavailable handling."""

    def test_real_dem_provider_interface_loads(self):
        """CopernicusDEMProvider interface loads and reports required tile specifications."""
        provider = CopernicusDEMProvider()
        assert provider.source_name == "Copernicus DEM GLO-30"

        # Check required tile manifest report
        info = CopernicusDEMProvider.get_required_tiles_info()
        assert info["tile_count"] == 12
        assert "Copernicus_DSM_COG_10_N28_00_E077_00_DEM.tif" in info["required_tiles"]
        assert info["resolution"] == "30 meters (1 arc-second)"

    def test_elevation_sampling_works_with_small_test_raster(self, controlled_test_dem):
        """Elevation sampling uses bilinear interpolation across DEM grid cells."""
        # Query at western edge (lon=78.0, lat=30.002)
        elev_west = controlled_test_dem.get_elevation_m(78.0, 30.002)
        assert pytest.approx(elev_west, abs=1.0) == 500.0

        # Query in center (lon=78.002, lat=30.002) -> should be higher due to eastward rise
        elev_center = controlled_test_dem.get_elevation_m(78.002, 30.002)
        assert elev_center > elev_west

    def test_slope_calculation_works_with_controlled_test_raster(self, controlled_test_dem, flat_test_dem):
        """Slope calculation using Horn (1981) formula yields exact expected gradients."""
        # Flat DEM must have 0° slope
        flat_slope = flat_test_dem.get_slope_degrees(78.002, 30.002)
        assert pytest.approx(flat_slope, abs=1e-2) == 0.0

        # Controlled tilted DEM has dz/dx = 1.0 -> 45° slope
        tilted_slope = controlled_test_dem.get_slope_degrees(78.002, 30.002)
        assert pytest.approx(tilted_slope, abs=0.5) == 45.0

    def test_invalid_or_no_dem_coverage_is_handled_clearly(self, controlled_test_dem):
        """Querying outside DEM coverage bounds returns None."""
        # Out of bounds coordinate
        assert controlled_test_dem.get_elevation_m(79.5, 31.0) is None
        assert controlled_test_dem.get_slope_degrees(79.5, 31.0) is None

    def test_no_fake_elevation_is_generated(self, test_route_segments):
        """When DEM coverage is absent, elevation and slope must remain strictly None."""
        copernicus_empty = CopernicusDEMProvider(dem_dir="non_existent_dem_dir")
        assert not copernicus_empty.is_available

        result = enrich_route_segments(test_route_segments, terrain_provider=copernicus_empty)

        for es in result.enriched_segments:
            # Elevation and slope must be None, never fabricated as 0.0 or random numbers
            assert es.features.elevation_m is None
            assert es.features.slope_degrees is None


class TestCutSlopeExposure:
    """Tests for road cut-slope exposure detection and preservation."""

    def test_existing_cut_slope_value_is_respected(self, test_route_segments):
        """Explicit cut-slope mapping is preserved for each segment."""
        cut_provider = DefaultCutSlopeProvider(cut_slope_map={0: True, 1: False})
        result = enrich_route_segments(test_route_segments, cut_slope_provider=cut_provider)

        assert result.enriched_segments[0].features.is_cut_slope is True
        assert result.enriched_segments[1].features.is_cut_slope is False

    def test_missing_cut_slope_status_remains_unavailable(self, test_route_segments):
        """In the absence of survey data, is_cut_slope must be None (unavailable)."""
        cut_provider = DefaultCutSlopeProvider()
        result = enrich_route_segments(test_route_segments, cut_slope_provider=cut_provider)

        for es in result.enriched_segments:
            assert es.features.is_cut_slope is None

    def test_no_arbitrary_cut_slope_inference_is_made(self, test_route_segments, controlled_test_dem):
        """Even with steep slope, cut-slope must not be guessed without explicit data."""
        # Provider with steep 45° slope
        result = enrich_route_segments(
            test_route_segments,
            terrain_provider=controlled_test_dem,
            cut_slope_provider=DefaultCutSlopeProvider(),
        )

        for es in result.enriched_segments:
            # Must remain None, strictly refusing to guess based on slope
            assert es.features.is_cut_slope is None


class TestFeatureIntegrationAndRiskBridge:
    """Tests verifying segment feature models, GeoJSON export, and the risk engine bridge."""

    def test_segment_feature_object_is_populated_correctly(self, test_route_segments, controlled_test_dem):
        """All hazard feature attributes must be properly populated."""
        cut_provider = DefaultCutSlopeProvider(cut_slope_map={0: True})
        result = enrich_route_segments(
            test_route_segments,
            terrain_provider=controlled_test_dem,
            cut_slope_provider=cut_provider,
        )

        f0 = result.enriched_segments[0].features
        assert f0.segment_index == 0
        assert f0.segment_length_m > 0
        assert f0.elevation_m is not None
        assert f0.slope_degrees is not None
        assert f0.distance_to_historic_scar_m > 0
        assert f0.is_cut_slope is True

    def test_existing_risk_engine_accepts_valid_enriched_inputs(self, test_route_segments, controlled_test_dem):
        """When slope, distance, density, cut-slope, and simulated rainfall are provided, risk evaluates cleanly."""
        cut_provider = DefaultCutSlopeProvider(cut_slope_map={0: True, 1: False})
        result = enrich_route_segments(
            test_route_segments,
            terrain_provider=controlled_test_dem,
            cut_slope_provider=cut_provider,
        )

        f0 = result.enriched_segments[0].features
        # Provide test rainfall parameters explicitly to test the bridge
        risk_result = evaluate_segment_risk_from_features(
            f0,
            p24_mm=45.0,
            p72_mm=80.0,
            ari_mm=55.0,
        )

        assert risk_result is not None
        assert isinstance(risk_result, SegmentRiskResult)
        assert 0.0 <= risk_result.risk_score <= 100.0
        assert risk_result.risk_category is not None
        assert risk_result.color_hex.startswith("#")

    def test_rainfall_remains_explicitly_separate_and_not_fabricated(self, test_route_segments):
        """If rainfall is omitted (None), risk evaluation must return None without fabricating weather."""
        result = enrich_route_segments(test_route_segments)
        f0 = result.enriched_segments[0].features

        # Without rainfall -> returns None
        assert evaluate_segment_risk_from_features(f0, p24_mm=None) is None

    def test_geojson_properties_are_generated_correctly(self, test_route_segments, controlled_test_dem):
        """Enriched GeoJSON FeatureCollection must contain segment metadata and hazard features without fake risk."""
        result = enrich_route_segments(
            test_route_segments,
            terrain_provider=controlled_test_dem,
        )
        geojson = result.to_geojson()

        assert geojson["type"] == "FeatureCollection"
        assert len(geojson["features"]) == len(test_route_segments)

        feature = geojson["features"][0]
        assert feature["type"] == "Feature"
        assert feature["geometry"]["type"] == "LineString"

        props = feature["properties"]
        assert "segment_index" in props
        assert "segment_length_m" in props
        assert "elevation_m" in props
        assert "slope_degrees" in props
        assert "distance_to_historic_scar_m" in props
        assert "scar_density_1km" in props
        assert "is_cut_slope" in props

        # Confirm no premature risk scores are in GeoJSON
        assert "segment_risk_score" not in props
        assert "risk_category" not in props


class TestStatewideRouteAgnosticEnrichment:
    """Verifies that enrichment works across arbitrary Uttarakhand coordinates without corridor hard-coding."""

    def test_western_uttarakhand_enrichment(self):
        """Western Uttarakhand route (near Yamuna / Dehradun border)."""
        west_route = segment_route_linestring([(77.80, 30.40), (77.80, 30.405)], segment_length_m=250.0)
        res = enrich_route_segments(west_route)
        assert len(res) == len(west_route)
        for es in res:
            assert es.features.distance_to_historic_scar_m > 0.0

    def test_central_uttarakhand_enrichment(self):
        """Central Uttarakhand route."""
        central_route = segment_route_linestring([(79.20, 30.45), (79.20, 30.455)], segment_length_m=250.0)
        res = enrich_route_segments(central_route)
        assert len(res) == len(central_route)
        for es in res:
            assert es.features.distance_to_historic_scar_m > 0.0

    def test_eastern_uttarakhand_enrichment(self):
        """Eastern Uttarakhand route (Pithoragarh border)."""
        east_route = segment_route_linestring([(80.20, 29.80), (80.20, 29.805)], segment_length_m=250.0)
        res = enrich_route_segments(east_route)
        assert len(res) == len(east_route)
        for es in res:
            assert es.features.distance_to_historic_scar_m > 0.0
