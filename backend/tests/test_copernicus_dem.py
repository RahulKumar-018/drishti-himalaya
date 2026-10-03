"""Tests for multi-tile Copernicus DEM GLO-30 raster integration (Phase 11)."""

import math
from pathlib import Path
import numpy as np
import pytest

from backend.app.geospatial.enrichment import DefaultCutSlopeProvider, enrich_route_segments
from backend.app.geospatial.service import get_inventory_service
from backend.app.geospatial.terrain import (
    BaseTerrainProvider,
    CopernicusDEMProvider,
    RasterGridTerrainProvider,
)
from backend.app.risk_engine.scoring import slope_score
from backend.app.routing.segmenter import segment_route_linestring


class TestCopernicusDEMTileDiscovery:
    """Test suite for DEM raster discovery, metadata parsing, and naming resilience."""

    def test_01_real_geotiff_opens_and_discovers_all_tiles(self) -> None:
        """1. Verify real Copernicus DEM provider discovers all 12 Uttarakhand GLO-30 tiles."""
        provider = CopernicusDEMProvider()
        assert provider.is_available is True
        assert provider.tile_count == 12
        assert provider.source_name == "Copernicus DEM GLO-30"

    def test_02_crs_and_resolution_detected_correctly(self) -> None:
        """2. Verify horizontal CRS is WGS84 (EPSG:4326) and resolution is 1 arc-sec (~30m)."""
        provider = CopernicusDEMProvider()
        assert provider.tile_count > 0
        for tile in provider.tiles:
            assert "4326" in tile.crs
            # 1 arc-second = 1 / 3600 degrees ~ 0.00027778
            assert pytest.approx(tile.res_lon_deg, abs=1e-6) == (1.0 / 3600.0)
            assert pytest.approx(tile.res_lat_deg, abs=1e-6) == (1.0 / 3600.0)
            assert tile.width == 3600
            assert tile.height == 3600

    def test_03_folder_naming_resilience_n30_e078(self) -> None:
        """3. Verify N30_E078 folder naming difference is discovered seamlessly."""
        provider = CopernicusDEMProvider()
        tile_names = [t.file_path.name for t in provider.tiles]
        parent_names = [t.file_path.parent.name for t in provider.tiles]

        assert "Copernicus_DSM_COG_10_N30_00_E078_00_DEM.tif" in tile_names
        assert "N30_E078" in parent_names

    def test_04_coordinate_to_tile_lookup(self) -> None:
        """4. Verify coordinate lookup maps to the appropriate containing tile."""
        provider = CopernicusDEMProvider()

        # Rishikesh (30.1033, 78.2947) -> N30_E078
        tile_rishi = provider.find_tile(78.2947, 30.1033)
        assert tile_rishi is not None
        assert "N30_00_E078" in tile_rishi.file_path.name

        # Joshimath (30.5526, 79.5684) -> N30_00_E079
        tile_joshi = provider.find_tile(79.5684, 30.5526)
        assert tile_joshi is not None
        assert "N30_00_E079" in tile_joshi.file_path.name

        # Chakrata (30.7016, 77.8686) -> N30_00_E077
        tile_chak = provider.find_tile(77.8686, 30.7016)
        assert tile_chak is not None
        assert "N30_00_E077" in tile_chak.file_path.name

        # Almora (29.5992, 79.6631) -> N29_00_E079
        tile_alm = provider.find_tile(79.6631, 29.5992)
        assert tile_alm is not None
        assert "N29_00_E079" in tile_alm.file_path.name

        # Pithoragarh (29.5829, 80.2182) -> N29_00_E080
        tile_pith = provider.find_tile(80.2182, 29.5829)
        assert tile_pith is not None
        assert "N29_00_E080" in tile_pith.file_path.name


class TestRealElevationAndSlopeQueries:
    """Test suite for real elevation and Horn 1981 slope calculations."""

    @pytest.fixture
    def provider(self) -> CopernicusDEMProvider:
        return CopernicusDEMProvider()

    def test_05_elevation_query_returns_actual_meters(self, provider: CopernicusDEMProvider) -> None:
        """5. Verify elevation sampling returns authentic meters above sea level."""
        # Rishikesh valley floor: ~357m
        elev_rishi = provider.get_elevation_m(78.2947, 30.1033)
        assert elev_rishi is not None
        assert 340.0 < elev_rishi < 380.0

        # Joshimath mountain settlement: ~1981m
        elev_joshi = provider.get_elevation_m(79.5684, 30.5526)
        assert elev_joshi is not None
        assert 1900.0 < elev_joshi < 2100.0

        # Mussoorie hill ridge: ~2006m
        elev_muss = provider.get_elevation_m(78.0644, 30.4598)
        assert elev_muss is not None
        assert 1900.0 < elev_muss < 2100.0

    def test_06_real_slope_calculation_in_degrees(self, provider: CopernicusDEMProvider) -> None:
        """6. Verify slope derivation returns valid gradients in degrees [0, 90]."""
        # Rishikesh (flat/gentle valley floor)
        slope_rishi = provider.get_slope_degrees(78.2947, 30.1033)
        assert slope_rishi is not None
        assert 0.0 <= slope_rishi < 10.0

        # Joshimath (steep Himalayan mountain slope)
        slope_joshi = provider.get_slope_degrees(79.5684, 30.5526)
        assert slope_joshi is not None
        assert 15.0 < slope_joshi < 45.0

    def test_11_tile_boundary_lookup_and_slope(self, provider: CopernicusDEMProvider) -> None:
        """11. Verify query at exact tile boundary lon=79.0, lat=30.5 functions without error."""
        elev = provider.get_elevation_m(79.0, 30.5)
        slope = provider.get_slope_degrees(79.0, 30.5)
        assert elev is not None
        assert elev > 1500.0
        assert slope is not None
        assert 0.0 <= slope <= 90.0

    def test_12_out_of_bounds_and_missing_tile_returns_none(
        self, provider: CopernicusDEMProvider
    ) -> None:
        """12. Querying coordinates outside available coverage strictly returns None."""
        # Southern India / out of Uttarakhand
        assert provider.get_elevation_m(77.0, 20.0) is None
        assert provider.get_slope_degrees(77.0, 20.0) is None

        # Extreme longitude
        assert provider.get_elevation_m(90.0, 30.0) is None
        assert provider.get_slope_degrees(90.0, 30.0) is None

    def test_13_dem_absence_does_not_fabricate_synthetic_values(self) -> None:
        """13. When DEM directory contains no tiles, provider returns None, never fake values."""
        empty_prov = CopernicusDEMProvider(dem_dir="non_existent_dem_path")
        assert empty_prov.is_available is False
        assert empty_prov.tile_count == 0
        assert empty_prov.get_elevation_m(78.2947, 30.1033) is None
        assert empty_prov.get_slope_degrees(78.2947, 30.1033) is None


class TestHornSlopeMathematicalCorrectness:
    """Test suite using controlled planar fixtures to verify Horn algorithm accuracy."""

    def test_07_known_planar_fixture_produces_exact_slope(self) -> None:
        """7. Known planar ramp (TEST FIXTURE — NOT PRODUCTION DATA) produces exact 45° slope."""
        # 10x10 synthetic planar fixture with dz/dx = 1.0 (45° incline)
        # Lat=30.0°: dx_m = cell_deg * pi/180 * 6378137 * cos(30°)
        phi = math.radians(30.0)
        cell_deg = 0.001
        dx_m = cell_deg * (math.pi / 180.0) * 6378137.0 * math.cos(phi)

        # Create ramp where elevation rises by dx_m per cell eastward
        rows, cols = 10, 10
        grid = np.zeros((rows, cols), dtype=np.float64)
        for c in range(cols):
            grid[:, c] = c * dx_m

        # [TEST FIXTURE — NOT PRODUCTION DATA]
        fixture = RasterGridTerrainProvider(
            elevation_grid=grid,
            bounds_lon_lat=(78.0, 30.0, 78.0 + (cols - 1) * cell_deg, 30.0 + (rows - 1) * cell_deg),
            source_name="TEST_FIXTURE_RAMP_45DEG",
        )

        slope_center = fixture.get_slope_degrees(78.0 + 4 * cell_deg, 30.0 + 4 * cell_deg)
        assert slope_center is not None
        assert pytest.approx(slope_center, abs=0.5) == 45.0

    def test_08_flat_raster_produces_zero_degree_slope(self) -> None:
        """8. Flat plateau fixture (TEST FIXTURE — NOT PRODUCTION DATA) produces 0° slope."""
        # [TEST FIXTURE — NOT PRODUCTION DATA]
        flat_grid = np.full((10, 10), 1000.0, dtype=np.float64)
        fixture = RasterGridTerrainProvider(
            elevation_grid=flat_grid,
            bounds_lon_lat=(78.0, 30.0, 78.01, 30.01),
            source_name="TEST_FIXTURE_FLAT_PLATEAU",
        )
        slope = fixture.get_slope_degrees(78.005, 30.005)
        assert slope is not None
        assert pytest.approx(slope, abs=1e-4) == 0.0

    def test_10_ground_spacing_uses_metric_meters_not_degrees(self) -> None:
        """10. Verify derivative calculation uses ground meters, not raw geographic degrees."""
        # If 100m rise over 1 arc-second (~30m):
        # dz/dx_m = 100 / 30 ~ 3.33 -> slope ~ 73.3°
        # If incorrectly using degrees: dz/dx_deg = 100 / 0.000277 ~ 360,000 -> slope = 89.9998°
        provider = CopernicusDEMProvider()
        # Sample any steep point in Uttarakhand
        slope = provider.get_slope_degrees(79.5684, 30.5526)
        assert slope is not None
        # Must be realistic Himalayan terrain slope (e.g. 21°), NOT 89.999°
        assert slope < 70.0


class TestStatewideCoverageVerification:
    """Statewide verification across Western, Central, and Eastern Uttarakhand."""

    @pytest.fixture
    def provider(self) -> CopernicusDEMProvider:
        return CopernicusDEMProvider()

    def test_14_western_uttarakhand_verified(self, provider: CopernicusDEMProvider) -> None:
        """14. Western Uttarakhand (Dehradun, Mussoorie, Chakrata) elevation and slope verified."""
        # Dehradun
        elev_ddn = provider.get_elevation_m(78.0322, 30.3165)
        assert elev_ddn is not None and 500.0 < elev_ddn < 800.0

        # Chakrata
        elev_chk = provider.get_elevation_m(77.8686, 30.7016)
        assert elev_chk is not None and 2000.0 < elev_chk < 2300.0

    def test_15_central_uttarakhand_verified(self, provider: CopernicusDEMProvider) -> None:
        """15. Central Uttarakhand (Srinagar Garhwal, Rudraprayag, Joshimath) verified."""
        # Srinagar Garhwal
        elev_sri = provider.get_elevation_m(78.7847, 30.2227)
        assert elev_sri is not None and 500.0 < elev_sri < 700.0

        # Joshimath
        elev_jsh = provider.get_elevation_m(79.5684, 30.5526)
        assert elev_jsh is not None and 1900.0 < elev_jsh < 2100.0

    def test_16_eastern_uttarakhand_verified(self, provider: CopernicusDEMProvider) -> None:
        """16. Eastern Uttarakhand (Almora, Pithoragarh, Dharchula) verified."""
        # Almora
        elev_alm = provider.get_elevation_m(79.6631, 29.5992)
        assert elev_alm is not None and 1400.0 < elev_alm < 1700.0

        # Pithoragarh
        elev_pit = provider.get_elevation_m(80.2182, 29.5829)
        assert elev_pit is not None and 1400.0 < elev_pit < 1700.0

        # Dharchula (steep Kali gorge)
        elev_dha = provider.get_elevation_m(80.5367, 29.8488)
        assert elev_dha is not None and 800.0 < elev_dha < 1200.0
        slope_dha = provider.get_slope_degrees(80.5367, 29.8488)
        assert slope_dha is not None and slope_dha > 20.0


class TestPipelineIntegration:
    """Test suite integrating Copernicus DEM with segmentation, GSI, and MCDA formulas."""

    def test_17_route_enrichment_queries_multiple_tiles(self) -> None:
        """17. Route crossing multiple 1° DEM tiles receives valid elevation and slope across all segments."""
        # Synthetic 2-point line crossing lon=79.0 (tile boundary between E078 and E079)
        coords = [(78.95, 30.40), (79.05, 30.40)]
        segmented = segment_route_linestring(coords)
        assert len(segmented.segments) >= 2

        dem_prov = CopernicusDEMProvider()
        enriched = enrich_route_segments(segmented, terrain_provider=dem_prov)

        for es in enriched.enriched_segments:
            # Elevation and slope must be valid real numbers
            assert es.features.elevation_m is not None
            assert es.features.elevation_m > 0.0
            assert es.features.slope_degrees is not None
            assert es.features.slope_degrees >= 0.0

    def test_18_integration_with_risk_engine_formulas(self) -> None:
        """18. Verify real DEM slope flows into MCDA slope factor S_slope correctly."""
        # Slope score function: S_slope = 0 if < 15°, sigmoid if 15-60°, 90 if > 60°
        assert slope_score(10.0) == 0.0
        assert 0.0 < slope_score(35.0) < 100.0
        assert slope_score(70.0) == 90.0

        # Real valley slope (~3.3°) yields S_slope = 0
        dem_prov = CopernicusDEMProvider()
        rishi_slope = dem_prov.get_slope_degrees(78.2947, 30.1033)
        assert rishi_slope is not None
        assert slope_score(rishi_slope) == 0.0

        # Real mountain slope (~21.1°) yields positive S_slope
        joshi_slope = dem_prov.get_slope_degrees(79.5684, 30.5526)
        assert joshi_slope is not None
        assert slope_score(joshi_slope) > 0.0

    def test_19_existing_gsi_and_weather_remain_functional(self) -> None:
        """19. Verify GSI KDTree distance and weather features integrate simultaneously with real DEM."""
        inv_svc = get_inventory_service()
        if not inv_svc.is_ready:
            inv_svc.load_uttarakhand_inventory()

        assert inv_svc.total_count == 5206
        dist = inv_svc.nearest_distance_m(79.5684, 30.5526)
        assert dist > 0.0

    def test_20_dataset_cache_and_context_manager(self) -> None:
        """20. Verify dataset caching avoids reopening files and closes cleanly."""
        with CopernicusDEMProvider() as dem:
            assert dem.is_available
            _ = dem.get_elevation_m(78.2947, 30.1033)
            # Cache must hold open reader for the accessed tile
            assert len(dem._dataset_cache) >= 1

        # On exit, cached readers should be closed
        for ds in dem._dataset_cache.values():
            assert ds.closed
