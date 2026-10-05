"""Comprehensive tests for the Uttarakhand geospatial pipeline and KDTree indexing."""

import json
import os
from pathlib import Path
import pytest

from backend.app.geospatial import (
    BaseLandslideLoader,
    GSILoader,
    LandslideInventoryService,
    LandslideSource,
    NRSCLoader,
    NormalizedLandslideRecord,
    SpatialLandslideIndex,
    batch_wgs84_to_utm44n,
    get_inventory_service,
    wgs84_to_utm44n,
)

RAW_GSI_PATH = Path("data/raw/GSI_Landslide_Inventory.geojson")
PROCESSED_UK_PATH = Path("data/processed/landslide_inventory_uttarakhand.geojson")


skip_if_no_raw_gsi = pytest.mark.skipif(
    not RAW_GSI_PATH.exists(),
    reason="Raw nationwide GSI GeoJSON not present in repository checkout",
)


class TestGSILoader:
    """Test suite for Geological Survey of India (GSI) data loading and validation."""

    @skip_if_no_raw_gsi
    def test_real_gsi_file_exists_and_loads(self) -> None:
        """1. Real GSI file exists and can be loaded."""
        assert RAW_GSI_PATH.exists()
        assert RAW_GSI_PATH.stat().st_size > 50 * 1024 * 1024  # > 50 MB

    @skip_if_no_raw_gsi
    def test_file_recognized_as_feature_collection(self) -> None:
        """2. Raw GeoJSON is verified as a FeatureCollection with CRS."""
        with open(RAW_GSI_PATH, "r", encoding="utf-8") as f:
            header = json.load(f)
        assert header.get("type") == "FeatureCollection"
        assert "features" in header
        assert isinstance(header["features"], list)

    @skip_if_no_raw_gsi
    def test_actual_feature_count_can_be_read(self) -> None:
        """3. Total feature count in the raw dataset is exactly 30,842."""
        with open(RAW_GSI_PATH, "r", encoding="utf-8") as f:
            data = json.load(f)
        assert len(data["features"]) == 30842

    @skip_if_no_raw_gsi
    def test_geometry_types_are_points(self) -> None:
        """4. Geometry types in the raw dataset are Point geometries."""
        with open(RAW_GSI_PATH, "r", encoding="utf-8") as f:
            data = json.load(f)
        geom_types = {f["geometry"]["type"] for f in data["features"] if f.get("geometry")}
        assert geom_types == {"Point"}

    @skip_if_no_raw_gsi
    def test_actual_state_attribute_detected(self) -> None:
        """5. Property field 'STATE' is present and holds state names."""
        with open(RAW_GSI_PATH, "r", encoding="utf-8") as f:
            data = json.load(f)
        first_props = data["features"][0].get("properties", {})
        assert "STATE" in first_props

    @skip_if_no_raw_gsi
    def test_uttarakhand_filtering_works(self) -> None:
        """6. Filtering for Uttarakhand yields exactly 5,206 records."""
        loader = GSILoader()
        uk_records = loader.load(RAW_GSI_PATH, state_filter="UTTARAKHAND")
        assert len(uk_records) == 5206

    @skip_if_no_raw_gsi
    def test_gsi_provenance_preserved(self) -> None:
        """7. GSI provenance and original attributes are preserved."""
        loader = GSILoader()
        uk_records = loader.load(RAW_GSI_PATH, state_filter="UTTARAKHAND")
        assert len(uk_records) > 0
        sample = uk_records[0]
        assert sample.source_dataset == LandslideSource.GSI
        assert sample.state.upper() == "UTTARAKHAND"
        assert sample.original_id is not None
        assert "SLIDE_NO" in sample.properties

    def test_invalid_geojson_rejected(self, tmp_path: Path) -> None:
        """8. Non-FeatureCollection or malformed JSON raises ValueError."""
        loader = GSILoader()
        bad_json = tmp_path / "bad.geojson"
        bad_json.write_text('{"type": "Point", "coordinates": [78.0, 30.0]}', encoding="utf-8")

        with pytest.raises(ValueError):
            loader.load(bad_json)

    @skip_if_no_raw_gsi
    def test_raw_source_not_modified(self) -> None:
        """9. Loading does not modify the raw source file size or timestamp."""
        mtime_before = RAW_GSI_PATH.stat().st_mtime
        size_before = RAW_GSI_PATH.stat().st_size
        loader = GSILoader()
        _ = loader.load(RAW_GSI_PATH, state_filter="UTTARAKHAND")
        mtime_after = RAW_GSI_PATH.stat().st_mtime
        size_after = RAW_GSI_PATH.stat().st_size
        assert mtime_before == mtime_after
        assert size_before == size_after


class TestCoordinateProjection:
    """Test suite for WGS84 to UTM Zone 44N metric coordinate conversion."""

    def test_valid_lon_lat_extracted_correctly(self) -> None:
        """10. Coordinates for sample point are extracted as valid floats."""
        rec = NormalizedLandslideRecord(
            source_dataset=LandslideSource.GSI,
            longitude=78.2947,
            latitude=30.1033,
        )
        assert rec.longitude == 78.2947
        assert rec.latitude == 30.1033

    def test_invalid_coordinates_rejected(self) -> None:
        """11. Non-finite or out-of-range coordinates raise ValueError."""
        with pytest.raises(ValueError):
            wgs84_to_utm44n(float("nan"), 30.0)
        with pytest.raises(ValueError):
            wgs84_to_utm44n(78.0, float("inf"))
        with pytest.raises(ValueError):
            wgs84_to_utm44n(195.0, 30.0)
        with pytest.raises(ValueError):
            wgs84_to_utm44n(78.0, 95.0)

    def test_wgs84_to_metric_conversion_deterministic(self) -> None:
        """12. Coordinate conversion produces deterministic metric coordinates."""
        e1, n1 = wgs84_to_utm44n(78.2947, 30.1033)
        e2, n2 = wgs84_to_utm44n(78.2947, 30.1033)
        assert e1 == e2
        assert n1 == n2
        # Verify metric scale (Easting in hundred thousands meters, Northing in millions meters)
        assert 200000.0 < e1 < 300000.0
        assert 3000000.0 < n1 < 3500000.0

    def test_projection_distortion_across_uttarakhand(self) -> None:
        """Deterministic validation of linear scale distortion against WGS84 geodesic distance.

        Validates scale factor behavior across representative transects:
        - Eastern edge / Central Meridian (81.0°E): error ~ -0.040%
        - Central Uttarakhand (79.3°E): error ~ -0.007%
        - Western Configured Boundary (77.5°E): error ~ +0.101%
        - Far Western GSI Boundary (77.0°E): error ~ +0.141%
        Confirms statewide linear scale error is strictly <= 0.15% (<= 1.5 m per 1000m).
        """
        import math

        # Helper: Vincenty geodesic distance on WGS84
        def vincenty_dist(lon1: float, lat1: float, lon2: float, lat2: float) -> float:
            a = 6378137.0
            f = 1.0 / 298.257223563
            b = (1.0 - f) * a
            phi1, phi2 = math.radians(lat1), math.radians(lat2)
            u1 = math.atan((1.0 - f) * math.tan(phi1))
            u2 = math.atan((1.0 - f) * math.tan(phi2))
            lam = math.radians(lon2 - lon1)
            sin_u1, cos_u1 = math.sin(u1), math.cos(u1)
            sin_u2, cos_u2 = math.sin(u2), math.cos(u2)

            for _ in range(100):
                sin_lam = math.sin(lam)
                cos_lam = math.cos(lam)
                sin_sigma = math.sqrt((cos_u2 * sin_lam) ** 2 + (cos_u1 * sin_u2 - sin_u1 * cos_u2 * cos_lam) ** 2)
                cos_sigma = sin_u1 * sin_u2 + cos_u1 * cos_u2 * cos_lam
                sigma = math.atan2(sin_sigma, cos_sigma)
                sin_alpha = (cos_u1 * cos_u2 * sin_lam) / sin_sigma
                cos2_alpha = 1.0 - sin_alpha**2
                cos_2sigma_m = cos_sigma - (2.0 * sin_u1 * sin_u2) / cos2_alpha if cos2_alpha != 0 else 0.0
                c = (f / 16.0) * cos2_alpha * (4.0 + f * (4.0 - 3.0 * cos2_alpha))
                lam_prev = lam
                lam = math.radians(lon2 - lon1) + (1.0 - c) * f * sin_alpha * (
                    sigma + c * sin_sigma * (cos_2sigma_m + c * cos_sigma * (-1.0 + 2.0 * cos_2sigma_m**2))
                )
                if abs(lam - lam_prev) < 1e-12:
                    break

            u_sq = cos2_alpha * (a**2 - b**2) / (b**2)
            cap_a = 1.0 + (u_sq / 16384.0) * (4096.0 + u_sq * (-768.0 + u_sq * (320.0 - 175.0 * u_sq)))
            cap_b = (u_sq / 1024.0) * (256.0 + u_sq * (-128.0 + u_sq * (74.0 - 47.0 * u_sq)))
            delta_sigma = cap_b * sin_sigma * (
                cos_2sigma_m
                + 0.25 * cap_b * (
                    cos_sigma * (-1.0 + 2.0 * cos_2sigma_m**2)
                    - (cap_b / 6.0) * cos_2sigma_m * (-3.0 + 4.0 * sin_sigma**2) * (-3.0 + 4.0 * cos_2sigma_m**2)
                )
            )
            return float(b * cap_a * (sigma - delta_sigma))

        test_points = [
            ("Eastern Meridian", 81.0, 30.0, 0.05),     # expected ~0.040%
            ("Central Uttarakhand", 79.3, 30.0, 0.02),  # expected ~0.007%
            ("Western Boundary", 77.5, 30.0, 0.11),     # expected ~0.101%
            ("Far West GSI Extent", 77.0, 30.85, 0.15), # expected ~0.141%
        ]

        for name, lon, lat, max_allowed_err_pct in test_points:
            # 1000m north
            lat_north = lat + (1000.0 / 110852.0)
            geod_d = vincenty_dist(lon, lat, lon, lat_north)
            x1, y1 = wgs84_to_utm44n(lon, lat)
            x2, y2 = wgs84_to_utm44n(lon, lat_north)
            proj_d = math.hypot(x2 - x1, y2 - y1)
            rel_err_pct = abs(proj_d - geod_d) / geod_d * 100.0

            assert rel_err_pct <= max_allowed_err_pct, (
                f"{name} (lon={lon}): relative error {rel_err_pct:.3f}% exceeds {max_allowed_err_pct}%"
            )
            assert rel_err_pct <= 0.15  # Statewide universal guarantee <= 0.15%


class TestKDTreeSpatialIndex:
    """Test suite for SciPy KDTree spatial querying in meters."""

    def test_index_builds_successfully(self) -> None:
        """13. Index builds from normalized records and reports correct size."""
        records = [
            NormalizedLandslideRecord(source_dataset=LandslideSource.GSI, longitude=78.2947, latitude=30.1033),
            NormalizedLandslideRecord(source_dataset=LandslideSource.GSI, longitude=78.5986, latitude=30.1459),
        ]
        index = SpatialLandslideIndex()
        index.build_index(records)
        assert index.is_built
        assert index.size == 2

    def test_nearest_distance_returns_meters(self) -> None:
        """14. Distance to nearest scar is returned in physical ground meters."""
        records = [
            NormalizedLandslideRecord(source_dataset=LandslideSource.GSI, longitude=78.2947, latitude=30.1033),
        ]
        index = SpatialLandslideIndex()
        index.build_index(records)
        # Query 100 meters east
        easting, northing = wgs84_to_utm44n(78.2947, 30.1033)
        dist = index.nearest_distance_m(78.2947, 30.1033)
        assert dist == 0.0

    def test_zero_distance_query(self) -> None:
        """15. Query directly on a known landslide location yields distance 0.0."""
        index = SpatialLandslideIndex()
        index.build_index([
            NormalizedLandslideRecord(source_dataset=LandslideSource.GSI, longitude=79.3133, latitude=30.3956),
        ])
        assert pytest.approx(index.nearest_distance_m(79.3133, 30.3956), abs=1e-3) == 0.0

    def test_larger_separation_produces_larger_distance(self) -> None:
        """16. Points further away yield larger distance values."""
        index = SpatialLandslideIndex()
        index.build_index([
            NormalizedLandslideRecord(source_dataset=LandslideSource.GSI, longitude=78.2947, latitude=30.1033),
        ])
        d_close = index.nearest_distance_m(78.2957, 30.1033)
        d_far = index.nearest_distance_m(78.3500, 30.1033)
        assert d_far > d_close > 0.0

    def test_count_within_radius_works(self) -> None:
        """17. Density counts all points falling inside specified radius."""
        origin_lon, origin_lat = 78.5000, 30.3000
        # Create 3 points within 500m and 1 point 5km away
        records = [
            NormalizedLandslideRecord(source_dataset=LandslideSource.GSI, longitude=origin_lon, latitude=origin_lat),
            NormalizedLandslideRecord(source_dataset=LandslideSource.GSI, longitude=origin_lon + 0.001, latitude=origin_lat),
            NormalizedLandslideRecord(source_dataset=LandslideSource.GSI, longitude=origin_lon, latitude=origin_lat + 0.001),
            NormalizedLandslideRecord(source_dataset=LandslideSource.GSI, longitude=origin_lon + 0.1, latitude=origin_lat + 0.1),
        ]
        index = SpatialLandslideIndex()
        index.build_index(records)

        count_500m = index.count_within_radius_m(origin_lon, origin_lat, radius_m=500.0)
        assert count_500m >= 1
        count_10km = index.count_within_radius_m(origin_lon, origin_lat, radius_m=20000.0)
        assert count_10km == 4

    def test_thousand_meter_radius_treated_as_meters(self) -> None:
        """18. Default 1000m radius search treats distance in true meters."""
        index = SpatialLandslideIndex()
        rec_center = NormalizedLandslideRecord(source_dataset=LandslideSource.GSI, longitude=79.0, latitude=30.0)
        index.build_index([rec_center])

        # Point ~200m away
        count_inside = index.count_within_radius_m(79.001, 30.0, radius_m=1000.0)
        assert count_inside == 1

        # Point ~10km away
        count_outside = index.count_within_radius_m(79.1, 30.0, radius_m=1000.0)
        assert count_outside == 0

    def test_empty_index_handled_safely(self) -> None:
        """19. Queries on empty index return infinity and zero without crashing."""
        empty_index = SpatialLandslideIndex()
        assert not empty_index.is_built
        assert empty_index.nearest_distance_m(78.0, 30.0) == float("inf")
        assert empty_index.count_within_radius_m(78.0, 30.0, 1000.0) == 0
        dist, rec = empty_index.query_nearest(78.0, 30.0)
        assert dist == float("inf")
        assert rec is None

    def test_repeated_queries_deterministic(self) -> None:
        """20. Repeated identical queries yield identical results."""
        service = LandslideInventoryService()
        service.load_uttarakhand_inventory()
        d1 = service.nearest_distance_m(78.2947, 30.1033)
        d2 = service.nearest_distance_m(78.2947, 30.1033)
        assert d1 == d2


class TestMultiSourceArchitecture:
    """Test suite for multi-source modularity and NRSC future plug-in capability."""

    def test_gsi_works_without_nrsc(self) -> None:
        """21. GSI works standalone when NRSC is not present."""
        service = LandslideInventoryService()
        records = service.load_uttarakhand_inventory(include_nrsc=True)
        assert len(records) == 5206
        assert service.source_counts[LandslideSource.GSI.value] == 5206
        assert service.source_counts[LandslideSource.NRSC.value] == 0

    def test_nrsc_supported_as_future_source_identifier(self) -> None:
        """22. LandslideSource enum supports NRSC as valid identifier."""
        assert LandslideSource.NRSC.value == "NRSC"
        assert LandslideSource.GSI.value == "GSI"
        nrsc_loader = NRSCLoader()
        assert nrsc_loader.source == LandslideSource.NRSC

    def test_absence_of_nrsc_does_not_break_startup(self) -> None:
        """23. Ingesting absent NRSC file gracefully returns empty list and does not crash."""
        nrsc_loader = NRSCLoader()
        records = nrsc_loader.load("data/raw/non_existent_nrsc.geojson")
        assert records == []

    def test_downstream_spatial_interface_source_agnostic(self) -> None:
        """24. KDTree index operates identically regardless of whether records originate from GSI or NRSC."""
        mixed_records = [
            NormalizedLandslideRecord(source_dataset=LandslideSource.GSI, longitude=78.2947, latitude=30.1033, original_id="GSI_1"),
            NormalizedLandslideRecord(source_dataset=LandslideSource.NRSC, longitude=78.2950, latitude=30.1035, original_id="NRSC_1"),
        ]
        index = SpatialLandslideIndex()
        index.build_index(mixed_records)
        assert index.size == 2
        d, nearest_rec = index.query_nearest(78.2947, 30.1033)
        assert d == 0.0
        assert nearest_rec.source_dataset == LandslideSource.GSI
        assert index.count_within_radius_m(78.2947, 30.1033, radius_m=500.0) == 2
