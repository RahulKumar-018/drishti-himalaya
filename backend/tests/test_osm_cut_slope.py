"""Comprehensive test suite for OpenStreetMap (OSM) cut-slope loading, validation, and spatial enrichment.

Verifies:
- Loading and validation of real data/raw/osm/uttarakhand_cut_slopes.geojson
- Exact feature counts: 68 total, 64 positive cutting, 51 retained after highway filtering
- Recognition of cutting=yes, cutting=left, cutting=right as positive evidence
- Rejection of cutting=no and cutting=track from positive evidence
- Preservation of negative evidence: cutting=no resolves to is_cut_slope=False
- Left vs right indicate road orientation and do NOT alter risk scores
- Highway filtering retains drivable classes (motorway, trunk, primary, secondary, tertiary, unclassified, residential)
  and excludes non-drivable classes (footway, path, cycleway, pedestrian, track, construction, service)
- Spatial matching via metric UTM Zone 44N projection and Shapely STRtree indexing
- Buffer tolerance behavior (matching within buffer, refusing to match outside buffer)
- No-match behavior strictly preserves unknown semantics (returns None, never fabricates)
- Strict refusal to infer cut-slopes from steep DEM slopes alone
- Provenance tracking as "OpenStreetMap" (never government, NRSC, GSI, NHAI, or PWD)
- Seamless integration with Phase-5 250m segmenter and Phase-9 analysis_service
- Provider replaceability interface
"""

import json
from pathlib import Path
import pytest
from shapely.geometry import LineString

from backend.app.core.config import settings
from backend.app.geospatial.enrichment import (
    BaseCutSlopeProvider,
    DefaultCutSlopeProvider,
    enrich_route_segments,
    get_cut_slope_provider,
)
from backend.app.geospatial.osm_cut_slope import (
    DEFAULT_MATCH_BUFFER_METERS,
    DEFAULT_OSM_CUT_SLOPES_PATH,
    DRIVABLE_HIGHWAY_CLASSES,
    EXCLUDED_HIGHWAY_CLASSES,
    OSMCutSlopeFeature,
    OSMCutSlopeMatch,
    OSMCutSlopeProvider,
    load_osm_cut_slopes,
)
from backend.app.geospatial.projection import batch_wgs84_to_utm44n
from backend.app.geospatial.terrain import RasterGridTerrainProvider
from backend.app.risk_engine.scoring import calculate_segment_risk, exposure_score
from backend.app.routing.models import RouteSegment
from backend.app.routing.segmenter import segment_route_linestring
from backend.app.services.analysis_service import analyze_route
from backend.app.services.weather_service import WeatherService


# ===========================================================================
# 1. GeoJSON Dataset Ingestion & Validation Tests
# ===========================================================================
class TestOSMCutSlopeLoading:
    """Tests loading and statistical validation of the real OSM GeoJSON dataset."""

    def test_load_real_osm_cut_slopes_dataset(self):
        """Load real GeoJSON and verify exact feature, cutting, and highway counts."""
        features, stats = load_osm_cut_slopes(DEFAULT_OSM_CUT_SLOPES_PATH)

        # 1. Exact total features loaded
        assert stats["total_features_loaded"] == 68
        assert stats["provenance"] == "OpenStreetMap"

        # 2. Exact positive cutting features: 64 ('yes': 64)
        assert stats["positive_cutting_count"] == 64

        # 3. Exact rejected cutting features: 4 ('no': 3, 'track': 1)
        assert stats["rejected_cutting_count"] == 4
        assert stats["cutting_breakdown"].get("no") == 3
        assert stats["cutting_breakdown"].get("track") == 1

        # 4. Exact retained features after highway filtering: 51
        assert stats["retained_features_count"] == 51
        assert len(features) == 51

        # 5. Exact excluded non-drivable highway features with positive cutting: 13
        # (path: 3, track: 3, construction: 3, service: 2, cycleway: 2)
        assert stats["rejected_highway_count"] == 13

        # All retained features must be positive cuts and drivable
        for feat in features:
            assert feat.is_positive_cut is True
            assert feat.cutting in ("yes", "left", "right")
            assert feat.highway in DRIVABLE_HIGHWAY_CLASSES
            assert feat.highway not in EXCLUDED_HIGHWAY_CLASSES
            assert feat.length_m > 0.0
            assert len(feat.coordinates_wgs84) >= 2

    def test_missing_file_raises_filenotfound(self, tmp_path):
        """Non-existent file raises FileNotFoundError with clear message."""
        fake_path = tmp_path / "non_existent_cut_slopes.geojson"
        with pytest.raises(FileNotFoundError, match="not found"):
            load_osm_cut_slopes(fake_path)

    def test_malformed_json_raises_value_error(self, tmp_path):
        """Invalid JSON syntax raises ValueError."""
        bad_file = tmp_path / "bad.geojson"
        bad_file.write_text("{corrupt json content", encoding="utf-8")
        with pytest.raises(ValueError, match="Failed to decode JSON"):
            load_osm_cut_slopes(bad_file)

    def test_non_feature_collection_raises_value_error(self, tmp_path):
        """Non-FeatureCollection GeoJSON raises ValueError."""
        bad_file = tmp_path / "not_fc.geojson"
        bad_file.write_text(json.dumps({"type": "Point", "coordinates": [78.0, 30.0]}), encoding="utf-8")
        with pytest.raises(ValueError, match="Expected GeoJSON FeatureCollection"):
            load_osm_cut_slopes(bad_file)


# ===========================================================================
# 2. Geometry Validation Tests
# ===========================================================================
class TestGeometryValidation:
    """Tests geometry sanity checks and edge cases."""

    def test_non_linestring_skipped(self, tmp_path):
        """Point or Polygon geometries inside FeatureCollection are safely skipped."""
        fc = {
            "type": "FeatureCollection",
            "features": [
                {
                    "type": "Feature",
                    "geometry": {"type": "Point", "coordinates": [78.5, 30.2]},
                    "properties": {"cutting": "yes", "highway": "primary"},
                },
                {
                    "type": "Feature",
                    "geometry": {
                        "type": "LineString",
                        "coordinates": [[78.5, 30.2], [78.51, 30.21]],
                    },
                    "properties": {"cutting": "yes", "highway": "primary"},
                },
            ],
        }
        path = tmp_path / "mixed.geojson"
        path.write_text(json.dumps(fc), encoding="utf-8")

        features, stats = load_osm_cut_slopes(path)
        assert len(features) == 1
        assert stats["total_features_loaded"] == 1

    def test_single_point_linestring_skipped(self, tmp_path):
        """LineStrings with fewer than 2 vertices are skipped."""
        fc = {
            "type": "FeatureCollection",
            "features": [
                {
                    "type": "Feature",
                    "geometry": {"type": "LineString", "coordinates": [[78.5, 30.2]]},
                    "properties": {"cutting": "yes", "highway": "primary"},
                }
            ],
        }
        path = tmp_path / "single_pt.geojson"
        path.write_text(json.dumps(fc), encoding="utf-8")

        features, stats = load_osm_cut_slopes(path)
        assert len(features) == 0

    def test_corrupt_coordinates_skipped(self, tmp_path):
        """LineStrings with non-finite or out-of-range coordinates are skipped."""
        fc = {
            "type": "FeatureCollection",
            "features": [
                {
                    "type": "Feature",
                    "geometry": {
                        "type": "LineString",
                        "coordinates": [[78.5, 30.2], [999.0, float("nan")]],
                    },
                    "properties": {"cutting": "yes", "highway": "primary"},
                }
            ],
        }
        path = tmp_path / "nan_coords.geojson"
        path.write_text(json.dumps(fc), encoding="utf-8")

        features, stats = load_osm_cut_slopes(path)
        assert len(features) == 0


# ===========================================================================
# 3. Cutting Tag Semantics (yes, left, right, no, track)
# ===========================================================================
class TestCuttingTagSemantics:
    """Tests positive, negative, and invalid cutting tags."""

    def test_cutting_yes_recognized_as_positive(self):
        """cutting='yes' produces is_positive_cut=True."""
        feat = OSMCutSlopeFeature(
            osm_id="way/101",
            cutting="yes",
            highway="primary",
            is_positive_cut=True,
            coordinates_wgs84=[(78.50, 30.20), (78.51, 30.21)],
            length_m=1200.0,
        )
        provider = OSMCutSlopeProvider(features=[feat])
        seg = segment_route_linestring([(78.50, 30.20), (78.51, 30.21)]).segments[0]
        match = provider.match_segment(seg)

        assert match.matched is True
        assert match.is_cut_slope is True
        assert match.match_type == "POSITIVE_CUT"

    def test_cutting_left_recognized_as_positive(self):
        """cutting='left' produces is_positive_cut=True."""
        feat = OSMCutSlopeFeature(
            osm_id="way/102",
            cutting="left",
            highway="secondary",
            is_positive_cut=True,
            coordinates_wgs84=[(78.50, 30.20), (78.51, 30.21)],
            length_m=1200.0,
        )
        provider = OSMCutSlopeProvider(features=[feat])
        seg = segment_route_linestring([(78.50, 30.20), (78.51, 30.21)]).segments[0]
        match = provider.match_segment(seg)

        assert match.matched is True
        assert match.is_cut_slope is True
        assert match.cutting == "left"

    def test_cutting_right_recognized_as_positive(self):
        """cutting='right' produces is_positive_cut=True."""
        feat = OSMCutSlopeFeature(
            osm_id="way/103",
            cutting="right",
            highway="tertiary",
            is_positive_cut=True,
            coordinates_wgs84=[(78.50, 30.20), (78.51, 30.21)],
            length_m=1200.0,
        )
        provider = OSMCutSlopeProvider(features=[feat])
        seg = segment_route_linestring([(78.50, 30.20), (78.51, 30.21)]).segments[0]
        match = provider.match_segment(seg)

        assert match.matched is True
        assert match.is_cut_slope is True
        assert match.cutting == "right"

    def test_cutting_left_right_do_not_alter_risk_scores(self):
        """cutting=left and cutting=right represent orientation, NOT different risk scores."""
        # Both evaluate with exposure_score(theta, is_cut_slope=True)
        score_left = exposure_score(theta=35.0, is_cut_slope=True)
        score_right = exposure_score(theta=35.0, is_cut_slope=True)
        assert score_left == score_right == 100.0

        # Full MCDA risk calculation is identical
        risk_left = calculate_segment_risk(
            slope_deg=35.0, p24_mm=30.0, p72_mm=60.0, ari_mm=55.0, dist_scar_m=500.0, scar_density_1km=2, is_cut_slope=True
        )
        risk_right = calculate_segment_risk(
            slope_deg=35.0, p24_mm=30.0, p72_mm=60.0, ari_mm=55.0, dist_scar_m=500.0, scar_density_1km=2, is_cut_slope=True
        )
        assert risk_left.risk_score == risk_right.risk_score

    def test_cutting_no_resolves_to_false(self):
        """cutting='no' provides negative evidence, resolving to is_cut_slope=False."""
        feat = OSMCutSlopeFeature(
            osm_id="way/104",
            cutting="no",
            highway="primary",
            is_positive_cut=False,
            coordinates_wgs84=[(78.50, 30.20), (78.51, 30.21)],
            length_m=1200.0,
        )
        provider = OSMCutSlopeProvider(features=[feat])
        seg = segment_route_linestring([(78.50, 30.20), (78.51, 30.21)]).segments[0]
        match = provider.match_segment(seg)

        assert match.matched is True
        assert match.is_cut_slope is False
        assert match.match_type == "NEGATIVE_CUT"

    def test_cutting_track_not_positive(self):
        """cutting='track' is NOT positive evidence and does NOT produce is_cut_slope=True."""
        feat = OSMCutSlopeFeature(
            osm_id="way/105",
            cutting="track",
            highway="track",
            is_positive_cut=False,
            coordinates_wgs84=[(78.50, 30.20), (78.51, 30.21)],
            length_m=500.0,
        )
        provider = OSMCutSlopeProvider(features=[feat])
        seg = segment_route_linestring([(78.50, 30.20), (78.51, 30.21)]).segments[0]
        match = provider.match_segment(seg)

        assert match.is_cut_slope is None


# ===========================================================================
# 4. Highway Class Filtering Tests
# ===========================================================================
class TestHighwayFiltering:
    """Tests drivable highway retention and non-drivable class exclusion."""

    def test_drivable_highways_retained(self, tmp_path):
        """Motorway, trunk, primary, secondary, tertiary, unclassified, residential are retained."""
        features_json = []
        classes = ["motorway", "trunk", "primary", "secondary", "tertiary", "unclassified", "residential"]
        for idx, cls in enumerate(classes):
            features_json.append({
                "type": "Feature",
                "geometry": {
                    "type": "LineString",
                    "coordinates": [[78.5 + idx * 0.01, 30.2], [78.5 + idx * 0.01, 30.21]],
                },
                "properties": {"cutting": "yes", "highway": cls, "@id": f"way/{idx}"},
            })

        path = tmp_path / "drivable.geojson"
        path.write_text(json.dumps({"type": "FeatureCollection", "features": features_json}), encoding="utf-8")

        retained, stats = load_osm_cut_slopes(path, filter_drivable=True)
        assert len(retained) == len(classes)
        assert stats["retained_features_count"] == len(classes)
        assert stats["rejected_highway_count"] == 0

    def test_non_drivable_highways_excluded(self, tmp_path):
        """Footway, path, cycleway, pedestrian, track, construction, service are excluded."""
        features_json = []
        classes = ["footway", "path", "cycleway", "pedestrian", "track", "construction", "service"]
        for idx, cls in enumerate(classes):
            features_json.append({
                "type": "Feature",
                "geometry": {
                    "type": "LineString",
                    "coordinates": [[78.5 + idx * 0.01, 30.2], [78.5 + idx * 0.01, 30.21]],
                },
                "properties": {"cutting": "yes", "highway": cls, "@id": f"way/non_drivable_{idx}"},
            })

        path = tmp_path / "non_drivable.geojson"
        path.write_text(json.dumps({"type": "FeatureCollection", "features": features_json}), encoding="utf-8")

        retained, stats = load_osm_cut_slopes(path, filter_drivable=True)
        assert len(retained) == 0
        assert stats["retained_features_count"] == 0
        assert stats["rejected_highway_count"] == len(classes)

    def test_filter_drivable_disabled_retains_all(self, tmp_path):
        """When filter_drivable=False, all positive cuts are retained."""
        fc = {
            "type": "FeatureCollection",
            "features": [
                {
                    "type": "Feature",
                    "geometry": {"type": "LineString", "coordinates": [[78.5, 30.2], [78.51, 30.21]]},
                    "properties": {"cutting": "yes", "highway": "path"},
                }
            ],
        }
        path = tmp_path / "path_test.geojson"
        path.write_text(json.dumps(fc), encoding="utf-8")

        retained, stats = load_osm_cut_slopes(path, filter_drivable=False)
        assert len(retained) == 1


# ===========================================================================
# 5. Spatial Matching & Metric Tolerance Tests
# ===========================================================================
class TestSpatialMatching:
    """Tests metric spatial matching between route segments and OSM cut geometries."""

    @pytest.fixture
    def sample_osm_cut_provider(self):
        """Provider with a known cut along line (78.50, 30.20) -> (78.50, 30.21)."""
        feat = OSMCutSlopeFeature(
            osm_id="way/test_cut_highway",
            cutting="yes",
            highway="primary",
            name="Haridwar-Rishikesh Bypass",
            is_positive_cut=True,
            coordinates_wgs84=[(78.5000, 30.2000), (78.5000, 30.2100)],
            length_m=1100.0,
        )
        return OSMCutSlopeProvider(features=[feat], match_buffer_m=30.0)

    def test_segment_within_buffer_matches(self, sample_osm_cut_provider):
        """Segment directly overlapping the cut line matches with is_cut_slope=True."""
        # Segment directly along the cut
        seg = segment_route_linestring([(78.5000, 30.2020), (78.5000, 30.2045)]).segments[0]
        match = sample_osm_cut_provider.match_segment(seg)

        assert match.matched is True
        assert match.is_cut_slope is True
        assert match.osm_id == "way/test_cut_highway"
        assert match.distance_m < 5.0

    def test_segment_outside_buffer_does_not_match(self, sample_osm_cut_provider):
        """Segment 150m away from the cut line does NOT match."""
        # Offset longitude by 0.002° (~190m east at lat 30°)
        seg = segment_route_linestring([(78.5020, 30.2020), (78.5020, 30.2045)]).segments[0]
        match = sample_osm_cut_provider.match_segment(seg)

        assert match.matched is False
        assert match.is_cut_slope is None
        assert match.match_type == "NO_MATCH"

    def test_configurable_buffer_distance(self):
        """Provider honors custom match_buffer_m parameter."""
        feat = OSMCutSlopeFeature(
            osm_id="way/buffer_test",
            cutting="yes",
            highway="tertiary",
            is_positive_cut=True,
            coordinates_wgs84=[(78.5000, 30.2000), (78.5000, 30.2100)],
            length_m=1100.0,
        )
        # 15m buffer -> 25m offset fails
        provider_tight = OSMCutSlopeProvider(features=[feat], match_buffer_m=15.0)
        # 50m buffer -> 25m offset matches
        provider_wide = OSMCutSlopeProvider(features=[feat], match_buffer_m=50.0)

        # Coordinate offset ~25m east: 0.00026 degrees at lat 30°
        seg = segment_route_linestring([(78.50026, 30.2020), (78.50026, 30.2045)]).segments[0]

        assert provider_tight.match_segment(seg).matched is False
        assert provider_wide.match_segment(seg).matched is True

    def test_real_mahakali_highway_segments_match(self):
        """Segments segmented along the real Mahakali Highway (way/232259368) match."""
        provider = OSMCutSlopeProvider(DEFAULT_OSM_CUT_SLOPES_PATH)

        # Extract coordinates of way/232259368
        target_feat = next(f for f in provider._features if f.osm_id == "way/232259368")
        coords = target_feat.coordinates_wgs84

        seg_result = segment_route_linestring(coords)
        assert len(seg_result.segments) > 0

        # All segments along this surveyed cut must match
        matched_count = 0
        for seg in seg_result.segments:
            match = provider.match_segment(seg)
            if match.matched and match.is_cut_slope is True:
                matched_count += 1

        assert matched_count == len(seg_result.segments)


# ===========================================================================
# 6. No-Match Behavior & Epistemic Honesty (No Inference from Slope)
# ===========================================================================
class TestNoMatchAndEpistemicHonesty:
    """Tests confirming strict refusal to infer cut-slopes from steep topography alone."""

    def test_no_match_returns_none_by_default(self):
        """Unmatched segments return None (unknown) to preserve epistemic integrity."""
        provider = OSMCutSlopeProvider(DEFAULT_OSM_CUT_SLOPES_PATH)
        # Segment in Rishikesh where no OSM cut slope is present
        seg = segment_route_linestring([(78.2947, 30.1033), (78.2970, 30.1055)]).segments[0]
        assert provider.is_cut_slope(seg) is None

    def test_no_inference_from_steep_dem_slope(self):
        """Even if DEM slope is 45° or 60°, cut-slope is NEVER inferred without explicit OSM evidence."""
        provider = OSMCutSlopeProvider(DEFAULT_OSM_CUT_SLOPES_PATH)
        seg = segment_route_linestring([(78.2947, 30.1033), (78.2970, 30.1055)]).segments[0]

        # Explicitly pass properties with steep slope
        props = {"slope_degrees": 55.0, "elevation_m": 2200.0}
        val = provider.is_cut_slope(seg, properties=props)

        # Must strictly remain None
        assert val is None

    def test_default_no_match_override(self):
        """When default_no_match=False is configured, unmatched segments return False."""
        provider = OSMCutSlopeProvider(DEFAULT_OSM_CUT_SLOPES_PATH, default_no_match=False)
        seg = segment_route_linestring([(78.2947, 30.1033), (78.2970, 30.1055)]).segments[0]
        assert provider.is_cut_slope(seg) is False


# ===========================================================================
# 7. Integration with Segment Enrichment & Analysis Pipeline
# ===========================================================================
class TestIntegrationWithEnrichmentAndAnalysis:
    """Tests verifying OSM cut-slope integration with enrich_route_segments and analyze_route."""

    def test_enrich_route_segments_with_osm_provider(self):
        """enrich_route_segments attaches OSM cut-slope results to SegmentHazardFeatures."""
        provider = OSMCutSlopeProvider(DEFAULT_OSM_CUT_SLOPES_PATH)
        # Segment along Mahakali Highway
        target_feat = next(f for f in provider._features if f.osm_id == "way/232259368")
        coords = target_feat.coordinates_wgs84[:5]
        seg_res = segment_route_linestring(coords)

        enriched = enrich_route_segments(seg_res, cut_slope_provider=provider)
        assert len(enriched) > 0
        for es in enriched:
            assert es.features.is_cut_slope is True

    def test_provenance_is_openstreetmap(self):
        """DataProvenance.cut_slope_source is explicitly 'OpenStreetMap'."""
        provider = OSMCutSlopeProvider(DEFAULT_OSM_CUT_SLOPES_PATH)
        assert provider.source_name == "OpenStreetMap"

        res = analyze_route(
            (78.2947, 30.1033),
            (79.5684, 30.5526),
            cut_slope_provider=provider,
            data_mode="DEMO",
            simulated_rainfall_mm=25.0,
        )
        assert res.data_provenance.cut_slope_source == "OpenStreetMap"

    def test_end_to_end_analyze_route_with_osm_matched_route(self):
        """Route traversing Mahakali Highway cut slope evaluates with complete features."""
        provider = OSMCutSlopeProvider(DEFAULT_OSM_CUT_SLOPES_PATH)
        target_feat = next(f for f in provider._features if f.osm_id == "way/232259368")
        coords = target_feat.coordinates_wgs84[:10]

        from backend.app.routing.models import NormalizedRoute
        from backend.app.routing.providers import BaseRoutingProvider

        class CustomMahakaliProvider(BaseRoutingProvider):
            @property
            def provider_name(self) -> str:
                return "MAHAKALI_TEST"

            def get_routes(self, origin, destination, alternatives=1):
                return [
                    NormalizedRoute(
                        route_id="primary_route",
                        geometry_coords=coords,
                        total_distance_km=2.5,
                        estimated_time_minutes=5.0,
                        provider="MAHAKALI_TEST",
                        summary="Mahakali Cut Alignment",
                    )
                ]

        from backend.app.routing.service import RoutingService
        custom_svc = RoutingService(provider=CustomMahakaliProvider())

        res = analyze_route(
            origin=coords[0],
            destination=coords[-1],
            routing_service=custom_svc,
            cut_slope_provider=provider,
            simulated_rainfall_mm=30.0,
            weather_service=WeatherService(data_mode="DEMO"),
            data_mode="DEMO",
        )

        assert res.data_provenance.cut_slope_source == "OpenStreetMap"
        route = res.routes[0]

        # All segments along this cut-slope are positive
        for s in route.segments:
            assert s.is_cut_slope is True
            assert s.elevation_m is not None
            assert s.slope_degrees is not None

        # Because all factors (DEM, GSI, weather, cut_slope) are complete:
        assert route.status.value == "COMPLETE"
        assert route.route_risk is not None
        assert route.route_risk.composite_route_risk > 0.0
        assert route.objective is not None
        assert res.recommendation_available is True


# ===========================================================================
# 8. Provider Replaceability
# ===========================================================================
class TestProviderReplaceability:
    """Verifies that a future engineering dataset or custom provider replaces OSM cleanly."""

    def test_custom_provider_can_replace_osm(self):
        """Custom BaseCutSlopeProvider subclass can be supplied to analyze_route without friction."""

        class FutureNHAIProvider(BaseCutSlopeProvider):
            @property
            def provider_name(self) -> str:
                return "NHAI_SURVEY_2026"

            @property
            def source_name(self) -> str:
                return "NHAI_OFFICIAL_SURVEY"

            @property
            def is_available(self) -> bool:
                return True

            def is_cut_slope(self, segment, properties=None):
                # Custom survey rule: segment 0 is cut, segment 1 is natural
                return segment.segment_index % 2 == 0

        future_prov = FutureNHAIProvider()
        res = analyze_route(
            (78.35, 30.12),
            (78.55, 30.28),
            cut_slope_provider=future_prov,
            data_mode="DEMO",
            simulated_rainfall_mm=20.0,
        )

        assert res.data_provenance.cut_slope_source == "NHAI_OFFICIAL_SURVEY"
        segs = res.routes[0].segments
        assert segs[0].is_cut_slope is True
        assert segs[1].is_cut_slope is False
