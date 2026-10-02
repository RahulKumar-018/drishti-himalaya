"""Unit and regression tests for route LineString segmentation (Phase 5).

Verifies disaggregation of arbitrary road polylines into approximately 250m
discrete intervals with metric safety, geometric midpoint interpolation,
chainage continuity, and GeoJSON compatibility.
"""

import math
import pytest
from shapely.geometry import LineString

from backend.app.core.config import settings
from backend.app.geospatial.projection import utm44n_to_wgs84, wgs84_to_utm44n
from backend.app.routing.models import RouteSegment, SegmentedRouteResult, segments_to_geojson
from backend.app.routing.segmenter import segment_route_linestring


def _make_metric_path_in_wgs84(points_metric: list[tuple[float, float]]) -> list[tuple[float, float]]:
    """Helper to convert synthetic metric coordinates into WGS84 for deterministic length testing."""
    return [utm44n_to_wgs84(e, n) for e, n in points_metric]


class TestRouteSegmentationCore:
    """Core tests validating the ~250m segmentation requirements."""

    def test_1000m_route_produces_four_250m_segments(self):
        """1000m straight line should produce exactly 4 segments of 250m each."""
        # 1000m north in UTM Zone 44N
        wgs_coords = _make_metric_path_in_wgs84([(500000.0, 3300000.0), (500000.0, 3301000.0)])
        result = segment_route_linestring(wgs_coords, segment_length_m=250.0)

        assert len(result.segments) == 4
        assert result.segment_count == 4
        assert pytest.approx(result.total_length_m, abs=1e-2) == 1000.0

        expected_chainages = [
            (0.0, 0.25),
            (0.25, 0.50),
            (0.50, 0.75),
            (0.75, 1.00),
        ]
        for idx, seg in enumerate(result.segments):
            assert seg.segment_index == idx
            assert pytest.approx(seg.segment_length_m, abs=1e-2) == 250.0
            assert pytest.approx(seg.start_chainage_km, abs=1e-4) == expected_chainages[idx][0]
            assert pytest.approx(seg.end_chainage_km, abs=1e-4) == expected_chainages[idx][1]

    def test_1100m_route_produces_four_250m_plus_one_100m_remainder(self):
        """1100m route must produce 4 x 250m segments and 1 x 100m remainder segment."""
        wgs_coords = _make_metric_path_in_wgs84([(500000.0, 3300000.0), (500000.0, 3301100.0)])
        result = segment_route_linestring(wgs_coords, segment_length_m=250.0)

        assert len(result.segments) == 5
        assert result.segment_count == 5
        assert pytest.approx(result.total_length_m, abs=1e-2) == 1100.0

        for idx in range(4):
            assert pytest.approx(result.segments[idx].segment_length_m, abs=1e-2) == 250.0
        assert pytest.approx(result.segments[4].segment_length_m, abs=1e-2) == 100.0

        assert pytest.approx(result.segments[4].start_chainage_km, abs=1e-4) == 1.0
        assert pytest.approx(result.segments[4].end_chainage_km, abs=1e-4) == 1.1

    def test_245m_route_produces_one_segment(self):
        """A route shorter than 250m (245m) should yield exactly 1 segment of ~245m."""
        wgs_coords = _make_metric_path_in_wgs84([(500000.0, 3300000.0), (500000.0, 3300245.0)])
        result = segment_route_linestring(wgs_coords, segment_length_m=250.0)

        assert len(result.segments) == 1
        seg = result.segments[0]
        assert seg.segment_index == 0
        assert pytest.approx(seg.segment_length_m, abs=1e-2) == 245.0
        assert pytest.approx(seg.start_chainage_km, abs=1e-4) == 0.0
        assert pytest.approx(seg.end_chainage_km, abs=1e-4) == 0.245

    def test_exact_250m_route_produces_one_segment(self):
        """A route of exactly 250m should yield exactly 1 segment of 250m."""
        wgs_coords = _make_metric_path_in_wgs84([(500000.0, 3300000.0), (500000.0, 3300250.0)])
        result = segment_route_linestring(wgs_coords, segment_length_m=250.0)

        assert len(result.segments) == 1
        seg = result.segments[0]
        assert seg.segment_index == 0
        assert pytest.approx(seg.segment_length_m, abs=1e-2) == 250.0
        assert pytest.approx(seg.start_chainage_km, abs=1e-4) == 0.0
        assert pytest.approx(seg.end_chainage_km, abs=1e-4) == 0.250

    def test_route_shorter_than_250m_is_preserved_without_padding_or_discarding(self):
        """Routes shorter than target step must neither be discarded nor padded."""
        wgs_coords = _make_metric_path_in_wgs84([(500000.0, 3300000.0), (500000.0, 3300085.0)])
        result = segment_route_linestring(wgs_coords, segment_length_m=250.0)

        assert len(result.segments) == 1
        seg = result.segments[0]
        assert pytest.approx(seg.segment_length_m, abs=1e-2) == 85.0
        assert pytest.approx(result.total_length_m, abs=1e-2) == 85.0


class TestGeometryQualityAndContinuity:
    """Verifies topological contiguity, no gaps, no overlaps, and exact endpoint preservation."""

    def test_no_gaps_between_adjacent_segments(self):
        """Adjacent segments must touch end-to-start with exact floating point equality."""
        wgs_coords = _make_metric_path_in_wgs84([
            (500000.0, 3300000.0),
            (500400.0, 3300300.0),
            (500800.0, 3300600.0),
        ])
        result = segment_route_linestring(wgs_coords, segment_length_m=250.0)

        for i in range(len(result.segments) - 1):
            curr_seg = result.segments[i]
            next_seg = result.segments[i + 1]
            # Exact equality of boundary coordinates
            assert curr_seg.end_coord == next_seg.start_coord
            assert curr_seg.geometry_coords[-1] == next_seg.geometry_coords[0]

    def test_no_overlaps_between_adjacent_segments(self):
        """Segment chainages must not overlap and total sum of lengths must equal total route length."""
        wgs_coords = _make_metric_path_in_wgs84([
            (500000.0, 3300000.0),
            (500600.0, 3300800.0),
        ])
        result = segment_route_linestring(wgs_coords, segment_length_m=250.0)

        sum_lengths = sum(seg.segment_length_m for seg in result.segments)
        assert pytest.approx(sum_lengths, abs=1e-3) == result.total_length_m

        for i in range(len(result.segments) - 1):
            assert pytest.approx(result.segments[i].end_chainage_km, abs=1e-5) == result.segments[i + 1].start_chainage_km

    def test_segment_indexes_are_consistent_and_zero_based(self):
        """Segment indexes must be 0-based, strictly contiguous, and without duplicates."""
        wgs_coords = _make_metric_path_in_wgs84([(500000.0, 3300000.0), (500000.0, 3301250.0)])
        result = segment_route_linestring(wgs_coords, segment_length_m=250.0)

        indices = [seg.segment_index for seg in result.segments]
        assert indices == list(range(len(result.segments)))

    def test_chainage_is_cumulative(self):
        """Chainage must start at 0.0 and strictly monotonically increase."""
        wgs_coords = _make_metric_path_in_wgs84([(500000.0, 3300000.0), (500000.0, 3301000.0)])
        result = segment_route_linestring(wgs_coords, segment_length_m=250.0)

        assert result.segments[0].start_chainage_km == 0.0
        for seg in result.segments:
            assert seg.end_chainage_km > seg.start_chainage_km
            expected_diff_km = seg.segment_length_m / 1000.0
            assert pytest.approx(seg.end_chainage_km - seg.start_chainage_km, abs=1e-5) == expected_diff_km

    def test_midpoint_is_geometrically_interpolated_along_curve(self):
        """Midpoint must be interpolated along the segment polyline, not an arithmetic vertex mean."""
        # L-shaped path: (0,0) -> (200, 0) -> (200, 200). Total length 400m.
        # First 250m segment: (0,0) -> (200, 0) -> (200, 50).
        # Geometric halfway point (125m along curve) must be at (125, 0).
        # Arithmetic average of vertices [(0,0), (200,0), (200,50)] would be (133.33, 16.67), which is off-road!
        wgs_coords = _make_metric_path_in_wgs84([
            (500000.0, 3300000.0),
            (500200.0, 3300000.0),
            (500200.0, 3300200.0),
        ])
        result = segment_route_linestring(wgs_coords, segment_length_m=250.0)
        seg0 = result.segments[0]

        # Project midpoint back to metric space to verify position
        mid_easting, mid_northing = wgs84_to_utm44n(seg0.midpoint[0], seg0.midpoint[1])
        assert pytest.approx(mid_easting, abs=1e-2) == 500125.0
        assert pytest.approx(mid_northing, abs=1e-2) == 3300000.0

    def test_every_segment_is_a_valid_linestring(self):
        """Every segment geometry must be a valid non-empty Shapely LineString with >= 2 points."""
        wgs_coords = _make_metric_path_in_wgs84([
            (500000.0, 3300000.0),
            (500300.0, 3300400.0),
            (500700.0, 3300400.0),
            (501000.0, 3300800.0),
        ])
        result = segment_route_linestring(wgs_coords, segment_length_m=250.0)

        for seg in result.segments:
            assert len(seg.geometry_coords) >= 2
            ls = LineString(seg.geometry_coords)
            assert ls.is_valid
            assert not ls.is_empty
            assert ls.length > 0.0

    def test_total_segmented_length_matches_original_within_tolerance(self):
        """Total length across segments must match original metric route length within millimeter tolerance."""
        wgs_coords = _make_metric_path_in_wgs84([
            (500000.0, 3300000.0),
            (500150.0, 3300200.0),
            (500600.0, 3300500.0),
            (501200.0, 3301000.0),
        ])
        result = segment_route_linestring(wgs_coords, segment_length_m=250.0)
        summed = sum(seg.segment_length_m for seg in result.segments)
        assert pytest.approx(summed, abs=1e-3) == result.total_length_m


class TestInputValidation:
    """Verifies that invalid or malformed route inputs are strictly rejected."""

    def test_invalid_empty_route_is_rejected(self):
        """Empty route coordinate list must raise ValueError."""
        with pytest.raises(ValueError, match="at least 2 points"):
            segment_route_linestring([])

    def test_none_route_is_rejected(self):
        """None coordinates must raise ValueError."""
        with pytest.raises(ValueError, match="cannot be None"):
            segment_route_linestring(None)  # type: ignore

    def test_one_point_route_is_rejected(self):
        """Single-point route cannot form a LineString and must raise ValueError."""
        with pytest.raises(ValueError, match="at least 2 points"):
            segment_route_linestring([(78.5, 30.2)])

    def test_zero_length_route_is_rejected(self):
        """Route with identical start and end points has zero length and must raise ValueError."""
        with pytest.raises(ValueError, match="greater than zero"):
            segment_route_linestring([(78.5, 30.2), (78.5, 30.2)])

    def test_invalid_coordinates_rejected_nan(self):
        """Coordinates containing NaN must raise ValueError."""
        with pytest.raises(ValueError, match="non-finite"):
            segment_route_linestring([(78.5, 30.2), (float("nan"), 30.3)])

    def test_invalid_coordinates_rejected_inf(self):
        """Coordinates containing infinity must raise ValueError."""
        with pytest.raises(ValueError, match="non-finite"):
            segment_route_linestring([(78.5, 30.2), (78.6, float("inf"))])

    def test_invalid_coordinates_rejected_out_of_range_lon(self):
        """Longitude outside [-180, 180] must raise ValueError."""
        with pytest.raises(ValueError, match="Longitude.*out of valid range"):
            segment_route_linestring([(195.0, 30.2), (78.6, 30.3)])

    def test_invalid_coordinates_rejected_out_of_range_lat(self):
        """Latitude outside [-90, 90] must raise ValueError."""
        with pytest.raises(ValueError, match="Latitude.*out of valid range"):
            segment_route_linestring([(78.5, 95.0), (78.6, 30.3)])

    def test_invalid_coordinates_rejected_malformed_tuple(self):
        """Elements with fewer than 2 coordinates must raise ValueError."""
        with pytest.raises(ValueError, match="must have at least 2 elements"):
            segment_route_linestring([(78.5,), (78.6, 30.3)])  # type: ignore

    def test_invalid_segment_length_rejected_zero(self):
        """segment_length_m <= 0 must raise ValueError."""
        coords = [(78.5, 30.2), (78.6, 30.3)]
        with pytest.raises(ValueError, match="positive finite number"):
            segment_route_linestring(coords, segment_length_m=0.0)

    def test_invalid_segment_length_rejected_negative(self):
        """Negative segment length must raise ValueError."""
        coords = [(78.5, 30.2), (78.6, 30.3)]
        with pytest.raises(ValueError, match="positive finite number"):
            segment_route_linestring(coords, segment_length_m=-100.0)

    def test_invalid_segment_length_rejected_nan(self):
        """NaN segment length must raise ValueError."""
        coords = [(78.5, 30.2), (78.6, 30.3)]
        with pytest.raises(ValueError, match="positive finite number"):
            segment_route_linestring(coords, segment_length_m=float("nan"))


class TestProjectionAndGeoJSONIntegration:
    """Verifies metric round-trip, GeoJSON export, and route-agnostic capabilities."""

    def test_wgs84_metric_wgs84_round_trip_remains_within_tolerance(self):
        """Route start and end coordinates in WGS84 must match original endpoints with extreme precision."""
        original_coords = [(78.456789, 30.123456), (78.470000, 30.135000), (78.490000, 30.150000)]
        result = segment_route_linestring(original_coords, segment_length_m=250.0)

        # First segment start matches route origin exactly
        assert result.segments[0].start_coord == original_coords[0]
        # Last segment end matches route destination exactly
        assert result.segments[-1].end_coord == original_coords[-1]

    def test_geojson_feature_collection_conversion_works(self):
        """Segmented result must convert to standard GeoJSON FeatureCollection without risk fields."""
        wgs_coords = _make_metric_path_in_wgs84([(500000.0, 3300000.0), (500000.0, 3300600.0)])
        result = segment_route_linestring(wgs_coords, segment_length_m=250.0)

        geojson = result.to_geojson()
        assert geojson["type"] == "FeatureCollection"
        assert len(geojson["features"]) == len(result.segments)

        feature = geojson["features"][0]
        assert feature["type"] == "Feature"
        assert feature["id"] == "seg_0"
        assert feature["geometry"]["type"] == "LineString"
        assert len(feature["geometry"]["coordinates"]) >= 2

        props = feature["properties"]
        assert props["segment_index"] == 0
        assert "segment_length_m" in props
        assert "start_km" in props
        assert "end_km" in props
        assert "midpoint" in props

        # Verify risk engine fields are NOT present in Phase 5
        assert "segment_risk_score" not in props
        assert "slope_degrees" not in props
        assert "risk_category" not in props

        # Helper function segments_to_geojson produces identical structure
        helper_geojson = segments_to_geojson(result.segments)
        assert helper_geojson == geojson

    def test_arbitrary_route_coordinates_work_no_hardcoding(self):
        """Segmenter must work on arbitrary geographic coordinates across different regions."""
        # 1. Western Uttarakhand (near Yamunanagar/Dehradun border)
        west_route = [(77.75, 30.35), (77.76, 30.36), (77.77, 30.37)]
        res_west = segment_route_linestring(west_route)
        assert len(res_west.segments) > 0

        # 2. Central Uttarakhand
        central_route = [(79.15, 30.55), (79.16, 30.56)]
        res_central = segment_route_linestring(central_route)
        assert len(res_central.segments) > 0

        # 3. Eastern Uttarakhand (Pithoragarh border)
        east_route = [(80.20, 29.75), (80.21, 29.76)]
        res_east = segment_route_linestring(east_route)
        assert len(res_east.segments) > 0

        # 4. Global arbitrary coordinates (Himachal / Kashmir)
        kashmir_route = [(75.10, 34.10), (75.11, 34.11)]
        res_kashmir = segment_route_linestring(kashmir_route)
        assert len(res_kashmir.segments) > 0

    def test_default_segment_length_uses_settings_config(self):
        """When segment_length_m is None, the segmenter must default to settings.SEGMENT_LENGTH_M."""
        assert settings.SEGMENT_LENGTH_M == 250.0
        wgs_coords = _make_metric_path_in_wgs84([(500000.0, 3300000.0), (500000.0, 3300500.0)])
        result = segment_route_linestring(wgs_coords, segment_length_m=None)
        assert len(result.segments) == 2
        for seg in result.segments:
            assert pytest.approx(seg.segment_length_m, abs=1e-2) == 250.0

    def test_shapely_linestring_input_supported(self):
        """Passing a Shapely LineString directly must be handled transparently."""
        ls = LineString([(78.5, 30.2), (78.51, 30.21)])
        result = segment_route_linestring(ls)
        assert len(result.segments) >= 1
