"""OpenStreetMap (OSM) road-cut slope feature loader, validator, and spatial provider.

Data Provenance:
- Source: OpenStreetMap data queried and exported through Overpass API.
- Strictly identified as "OpenStreetMap". NOT government, NRSC, GSI, NHAI, or PWD.
- Identifies engineered hillside cuttings along drivable highway networks.
- Uses metric EPSG:32644 (UTM Zone 44N) projection for accurate Euclidean buffering.
- Preserves epistemic integrity: unmatched segments return None (unknown) rather than
  speculating or fabricating natural vs cut slope classifications.
- Strictly refuses to infer cut slopes from steep DEM slope gradients alone.
"""

from collections import Counter
import json
import logging
import math
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence, Set, Tuple, Union

import numpy as np
from pydantic import BaseModel, ConfigDict, Field
from shapely import LineString, Point, STRtree

from backend.app.core.config import settings
from backend.app.geospatial.enrichment import BaseCutSlopeProvider
from backend.app.geospatial.projection import batch_wgs84_to_utm44n, wgs84_to_utm44n
from backend.app.routing.models import RouteSegment

logger = logging.getLogger(__name__)

DEFAULT_OSM_CUT_SLOPES_PATH = Path("data/raw/osm/uttarakhand_cut_slopes.geojson")

# Recognized cut-slope tags in OpenStreetMap
POSITIVE_CUTTING_TAGS: Set[str] = {"yes", "left", "right"}
NEGATIVE_CUTTING_TAGS: Set[str] = {"no"}
EXPLICIT_NON_POSITIVE_TAGS: Set[str] = {"no", "track"}

# Drivable road highway classes in OpenStreetMap
DRIVABLE_HIGHWAY_CLASSES: Set[str] = {
    "motorway",
    "motorway_link",
    "trunk",
    "trunk_link",
    "primary",
    "primary_link",
    "secondary",
    "secondary_link",
    "tertiary",
    "tertiary_link",
    "unclassified",
    "unclassified_link",
    "residential",
    "residential_link",
    "living_street",
    "road",
}

# Non-drivable highway classes explicitly excluded from vehicle cut-slope consideration
EXCLUDED_HIGHWAY_CLASSES: Set[str] = {
    "footway",
    "path",
    "cycleway",
    "pedestrian",
    "track",
    "steps",
    "bridleway",
    "construction",
    "service",
}

# Spatial matching buffer in meters
DEFAULT_MATCH_BUFFER_METERS: float = 30.0


class OSMCutSlopeFeature(BaseModel):
    """Normalized OpenStreetMap highway cutting feature."""

    model_config = ConfigDict(frozen=True, extra="ignore")

    osm_id: str = Field(..., description="Unique OSM way or relation identifier.")
    cutting: str = Field(..., description="Normalized cutting tag ('yes', 'left', 'right', 'no', etc.).")
    highway: str = Field(..., description="Normalized OSM highway classification.")
    name: Optional[str] = Field(default=None, description="Road name if present in OSM tags.")
    is_positive_cut: bool = Field(..., description="True if cutting is in ('yes', 'left', 'right').")
    coordinates_wgs84: List[Tuple[float, float]] = Field(..., min_length=2, description="Ordered (lon, lat) tuples.")
    length_m: float = Field(..., ge=0.0, description="Metric length in meters computed in UTM 44N.")
    properties: Dict[str, Any] = Field(default_factory=dict, description="Raw feature properties from GeoJSON.")


class OSMCutSlopeMatch(BaseModel):
    """Diagnostic match result between a route segment and an OSM cut-slope feature."""

    model_config = ConfigDict(frozen=True, extra="ignore")

    matched: bool = Field(..., description="True if a qualifying OSM feature fell within matching tolerance.")
    osm_id: Optional[str] = Field(default=None, description="Matched OSM way identifier.")
    cutting: Optional[str] = Field(default=None, description="Matched cutting tag value.")
    highway: Optional[str] = Field(default=None, description="Matched highway class.")
    name: Optional[str] = Field(default=None, description="Matched highway name.")
    distance_m: Optional[float] = Field(default=None, description="Shortest metric distance in meters.")
    is_cut_slope: Optional[bool] = Field(default=None, description="Resolved is_cut_slope status.")
    match_type: Optional[str] = Field(default=None, description="'POSITIVE_CUT', 'NEGATIVE_CUT', or 'NO_MATCH'.")


def load_osm_cut_slopes(
    geojson_path: Union[str, Path] = DEFAULT_OSM_CUT_SLOPES_PATH,
    filter_drivable: bool = True,
    allowed_highway_classes: Optional[Set[str]] = None,
    include_negative: bool = False,
) -> Tuple[List[OSMCutSlopeFeature], Dict[str, Any]]:
    """Load, validate, and filter OpenStreetMap cut-slope features from GeoJSON.

    Parameters
    ----------
    geojson_path : Union[str, Path]
        Path to local GeoJSON file.
    filter_drivable : bool, optional
        If True, only retain drivable vehicle highway classes, excluding paths/tracks.
    allowed_highway_classes : Optional[Set[str]], optional
        Optional custom set of highway classes to retain. Defaults to DRIVABLE_HIGHWAY_CLASSES.
    include_negative : bool, optional
        If True, also retain non-positive cutting (e.g. cutting=no) features. Default is False.

    Returns
    -------
    Tuple[List[OSMCutSlopeFeature], Dict[str, Any]]
        List of retained validated features and a dictionary of loading/filtering metrics.
    """
    path = Path(geojson_path)
    if not path.exists():
        raise FileNotFoundError(f"OSM cut-slope GeoJSON not found at: {path.resolve()}")

    with open(path, "r", encoding="utf-8") as f:
        try:
            data = json.load(f)
        except Exception as e:
            raise ValueError(f"Failed to decode JSON from {path}: {e}") from e

    if not isinstance(data, dict) or data.get("type") != "FeatureCollection":
        raise ValueError(f"Expected GeoJSON FeatureCollection, got: {type(data)}")

    raw_features = data.get("features", [])
    if not isinstance(raw_features, list):
        raise ValueError("GeoJSON 'features' attribute must be a list.")

    valid_classes = allowed_highway_classes or DRIVABLE_HIGHWAY_CLASSES

    retained_features: List[OSMCutSlopeFeature] = []
    total_loaded = 0
    positive_cutting_count = 0
    rejected_cutting_count = 0
    rejected_highway_count = 0
    cutting_breakdown: Counter = Counter()
    highway_breakdown: Counter = Counter()

    for feat in raw_features:
        if not isinstance(feat, dict):
            continue

        geom = feat.get("geometry", {})
        if not isinstance(geom, dict):
            continue

        geom_type = geom.get("type")
        raw_coords = geom.get("coordinates", [])

        # Validate geometry type and coordinates
        if geom_type != "LineString" or not isinstance(raw_coords, list) or len(raw_coords) < 2:
            continue

        # Coordinate parsing and finite verification
        coords_wgs84: List[Tuple[float, float]] = []
        is_geom_valid = True
        for c in raw_coords:
            if not isinstance(c, (list, tuple)) or len(c) < 2:
                is_geom_valid = False
                break
            lon, lat = float(c[0]), float(c[1])
            if not (math.isfinite(lon) and math.isfinite(lat)):
                is_geom_valid = False
                break
            if not (-180.0 <= lon <= 180.0 and -90.0 <= lat <= 90.0):
                is_geom_valid = False
                break
            coords_wgs84.append((lon, lat))

        if not is_geom_valid or len(coords_wgs84) < 2:
            continue

        total_loaded += 1

        props = feat.get("properties", {}) or {}
        osm_id = str(props.get("@id") or props.get("id") or f"feature_{total_loaded}")
        raw_cutting = str(props.get("cutting", "")).strip().lower()
        raw_highway = str(props.get("highway", "")).strip().lower()
        road_name = props.get("name")
        if road_name is not None:
            road_name = str(road_name).strip()

        cutting_breakdown[raw_cutting] += 1
        highway_breakdown[raw_highway] += 1

        # Check positive cutting evidence
        is_positive = raw_cutting in POSITIVE_CUTTING_TAGS
        if is_positive:
            positive_cutting_count += 1
        else:
            rejected_cutting_count += 1
            if not include_negative:
                continue

        # Highway class filter
        is_drivable = raw_highway in valid_classes
        if filter_drivable and not is_drivable:
            if is_positive:
                rejected_highway_count += 1
            continue

        # Compute metric length via UTM Zone 44N projection
        metric_coords = batch_wgs84_to_utm44n(coords_wgs84)
        line = LineString(metric_coords)
        length_m = float(line.length)

        retained_features.append(
            OSMCutSlopeFeature(
                osm_id=osm_id,
                cutting=raw_cutting,
                highway=raw_highway,
                name=road_name,
                is_positive_cut=is_positive,
                coordinates_wgs84=coords_wgs84,
                length_m=round(length_m, 2),
                properties=props,
            )
        )

    stats = {
        "total_features_loaded": total_loaded,
        "positive_cutting_count": positive_cutting_count,
        "retained_features_count": len(retained_features),
        "rejected_cutting_count": rejected_cutting_count,
        "rejected_highway_count": rejected_highway_count,
        "cutting_breakdown": dict(cutting_breakdown),
        "highway_breakdown": dict(highway_breakdown),
        "provenance": "OpenStreetMap",
    }

    logger.info(
        f"Loaded OSM cut slopes: {len(retained_features)} retained out of {total_loaded} total "
        f"({positive_cutting_count} positive cutting, {rejected_highway_count} excluded highway classes)."
    )

    return retained_features, stats


class OSMCutSlopeProvider(BaseCutSlopeProvider):
    """Production provider matching road segments against OpenStreetMap engineered cuttings.

    Uses a fast spatial index (Shapely STRtree) over UTM Zone 44N projected LineStrings.
    Preserves unknown semantics: segments that do not match a surveyed OSM cut return None,
    ensuring no speculative or synthetic risk is introduced.
    """

    def __init__(
        self,
        geojson_path: Optional[Union[str, Path]] = None,
        match_buffer_m: float = DEFAULT_MATCH_BUFFER_METERS,
        default_no_match: Optional[bool] = None,
        filter_drivable: bool = True,
        features: Optional[Sequence[OSMCutSlopeFeature]] = None,
    ) -> None:
        self.match_buffer_m = match_buffer_m
        self.default_no_match = default_no_match
        self.geojson_path = Path(geojson_path or settings.OSM_CUT_SLOPES_PATH)

        if features is not None:
            self._features = list(features)
            self._stats = {
                "total_features_loaded": len(self._features),
                "positive_cutting_count": sum(1 for f in self._features if f.is_positive_cut),
                "retained_features_count": len(self._features),
                "provenance": "OpenStreetMap",
            }
        elif self.geojson_path.exists():
            self._features, self._stats = load_osm_cut_slopes(
                self.geojson_path,
                filter_drivable=filter_drivable,
            )
        else:
            self._features = []
            self._stats = {
                "total_features_loaded": 0,
                "positive_cutting_count": 0,
                "retained_features_count": 0,
                "provenance": "OpenStreetMap",
            }

        # Build metric spatial index
        self._geometries_metric: List[LineString] = []
        if self._features:
            for feat in self._features:
                m_coords = batch_wgs84_to_utm44n(feat.coordinates_wgs84)
                self._geometries_metric.append(LineString(m_coords))
            self._tree: Optional[STRtree] = STRtree(self._geometries_metric)
        else:
            self._tree = None

    @property
    def provider_name(self) -> str:
        """Internal provider identifier."""
        return "OSM_CUT_SLOPE"

    @property
    def source_name(self) -> str:
        """Formal provenance label for analysis reporting."""
        return "OpenStreetMap"

    @property
    def is_available(self) -> bool:
        """True if provider has loaded valid OSM cut-slope features."""
        return len(self._features) > 0

    @property
    def feature_count(self) -> int:
        """Number of retained cut-slope features in the index."""
        return len(self._features)

    @property
    def stats(self) -> Dict[str, Any]:
        """Ingestion and filtering diagnostic metrics."""
        return dict(self._stats)

    def match_segment(self, segment: RouteSegment) -> OSMCutSlopeMatch:
        """Find the closest qualifying OSM cutting feature within the match buffer.

        Parameters
        ----------
        segment : RouteSegment
            Discrete route segment with WGS84 vertices.

        Returns
        -------
        OSMCutSlopeMatch
            Diagnostic match outcome.
        """
        if not self.is_available or self._tree is None:
            return OSMCutSlopeMatch(matched=False, is_cut_slope=self.default_no_match, match_type="NO_MATCH")

        # Project segment vertices into metric UTM Zone 44N
        if len(segment.geometry_coords) >= 2:
            seg_metric_coords = batch_wgs84_to_utm44n(segment.geometry_coords)
            seg_geom = LineString(seg_metric_coords)
        else:
            mx, my = wgs84_to_utm44n(*segment.midpoint)
            seg_geom = Point(mx, my)

        # Spatial search in metric index
        candidates = self._tree.query(seg_geom, predicate="dwithin", distance=self.match_buffer_m)
        if len(candidates) == 0:
            return OSMCutSlopeMatch(matched=False, is_cut_slope=self.default_no_match, match_type="NO_MATCH")

        # Find closest candidate geometry
        min_dist = float("inf")
        best_idx = None
        for idx in candidates:
            dist = float(seg_geom.distance(self._geometries_metric[idx]))
            if dist <= self.match_buffer_m and dist < min_dist:
                min_dist = dist
                best_idx = idx

        if best_idx is None:
            return OSMCutSlopeMatch(matched=False, is_cut_slope=self.default_no_match, match_type="NO_MATCH")

        feat = self._features[best_idx]
        if feat.is_positive_cut:
            resolved_cut = True
            m_type = "POSITIVE_CUT"
        elif feat.cutting == "no":
            resolved_cut = False
            m_type = "NEGATIVE_CUT"
        else:
            resolved_cut = self.default_no_match
            m_type = "NON_POSITIVE_CUT"

        return OSMCutSlopeMatch(
            matched=True,
            osm_id=feat.osm_id,
            cutting=feat.cutting,
            highway=feat.highway,
            name=feat.name,
            distance_m=round(min_dist, 2),
            is_cut_slope=resolved_cut,
            match_type=m_type,
        )

    def is_cut_slope(
        self,
        segment: RouteSegment,
        properties: Optional[dict[str, Any]] = None,
    ) -> Optional[bool]:
        """Determine whether the segment traverses an engineered highway cut-slope.

        Parameters
        ----------
        segment : RouteSegment
            Phase-5 discrete route interval.
        properties : Optional[dict[str, Any]], optional
            Optional segment properties containing explicit override.

        Returns
        -------
        Optional[bool]
            True if matching a positive cut-slope, False if matching cutting=no,
            or None if no spatial match is found.
        """
        # Respect explicit segment property override if provided
        if properties and "is_cut_slope" in properties and properties["is_cut_slope"] is not None:
            return bool(properties["is_cut_slope"])

        match = self.match_segment(segment)
        return match.is_cut_slope
