"""Segment hazard feature enrichment service.

Enriches Phase-5 road segments with physical and historical hazard attributes:
- Topographic elevation (meters) & slope gradient (degrees) via TerrainProvider
- Historical landslide distance (meters) & 1km scar density via GSI/NRSC KDTree
- Road-cut exposure classification via CutSlopeProvider
- Controlled integration bridge into the Phase-3 MCDA risk engine
"""

from abc import ABC, abstractmethod
from typing import Any, Iterator, List, Optional, Sequence
from pydantic import BaseModel, ConfigDict, Field

from backend.app.geospatial.service import LandslideInventoryService, get_inventory_service
from backend.app.geospatial.terrain import BaseTerrainProvider, CopernicusDEMProvider
from backend.app.risk_engine.models import SegmentRiskResult
from backend.app.risk_engine.scoring import calculate_segment_risk
from backend.app.routing.models import RouteSegment, SegmentedRouteResult


class BaseCutSlopeProvider(ABC):
    """Abstract interface for road engineering cut-slope exposure detection."""

    @property
    def provider_name(self) -> str:
        """Name of the cut-slope provider implementation."""
        return "BASE_CUT_SLOPE"

    @property
    def source_name(self) -> Optional[str]:
        """Name of the cut-slope data source (e.g. 'OpenStreetMap', 'SURVEY_DATA')."""
        return None

    @property
    def is_available(self) -> bool:
        """True if the provider has data loaded and ready for queries."""
        return True

    @abstractmethod
    def is_cut_slope(
        self,
        segment: RouteSegment,
        properties: Optional[dict[str, Any]] = None,
    ) -> Optional[bool]:
        """Determine whether the segment traverses an engineered highway cut-slope excavation.

        Returns None if exposure status is unknown or survey data is unavailable.
        """
        pass


class DefaultCutSlopeProvider(BaseCutSlopeProvider):
    """Default cut-slope provider inspecting explicit segment properties or survey metadata.

    Refuses to speculate or invent cut-slope values when geotechnical survey data is absent,
    returning None to preserve epistemic integrity.
    """

    def __init__(self, cut_slope_map: Optional[dict[int, bool]] = None) -> None:
        self._map = cut_slope_map or {}

    @property
    def provider_name(self) -> str:
        return "DEFAULT_CUT_SLOPE"

    @property
    def source_name(self) -> Optional[str]:
        return "SURVEY_DATA" if self._map else None

    @property
    def is_available(self) -> bool:
        return bool(self._map)

    def is_cut_slope(
        self,
        segment: RouteSegment,
        properties: Optional[dict[str, Any]] = None,
    ) -> Optional[bool]:
        if segment.segment_index in self._map:
            return self._map[segment.segment_index]
        if properties and "is_cut_slope" in properties and properties["is_cut_slope"] is not None:
            return bool(properties["is_cut_slope"])
        return None


# Default singleton instance for cut-slope provider
_default_cut_slope_provider: Optional[BaseCutSlopeProvider] = None


def get_cut_slope_provider(
    geojson_path: Optional[Any] = None,
    force_reload: bool = False,
) -> BaseCutSlopeProvider:
    """Return default cut-slope provider: OSMCutSlopeProvider if available, else DefaultCutSlopeProvider."""
    global _default_cut_slope_provider
    if _default_cut_slope_provider is None or force_reload:
        from pathlib import Path
        from backend.app.core.config import settings
        from backend.app.geospatial.osm_cut_slope import OSMCutSlopeProvider

        path = Path(geojson_path or settings.OSM_CUT_SLOPES_PATH)
        if path.exists():
            _default_cut_slope_provider = OSMCutSlopeProvider(geojson_path=path)
        else:
            _default_cut_slope_provider = DefaultCutSlopeProvider()
    return _default_cut_slope_provider


class SegmentHazardFeatures(BaseModel):
    """Normalized physical and historical hazard attributes for a 250m road segment."""

    model_config = ConfigDict(frozen=True, extra="ignore")

    segment_index: int = Field(
        ...,
        ge=0,
        description="0-based sequential index along the highway corridor.",
    )
    segment_length_m: float = Field(
        ...,
        gt=0.0,
        description="Metric length of the road segment in meters.",
    )
    midpoint_longitude: float = Field(
        ...,
        description="WGS84 longitude of the geometric midpoint.",
    )
    midpoint_latitude: float = Field(
        ...,
        description="WGS84 latitude of the geometric midpoint.",
    )
    elevation_m: Optional[float] = Field(
        default=None,
        description="Topographic elevation in meters from DEM (None if unavailable).",
    )
    slope_degrees: Optional[float] = Field(
        default=None,
        description="Mean topographic slope in degrees derived from DEM (None if unavailable).",
    )
    distance_to_historic_scar_m: float = Field(
        ...,
        ge=0.0,
        description="Euclidean distance in meters to nearest mapped landslide scar from GSI/NRSC KDTree.",
    )
    scar_density_1km: float | int = Field(
        ...,
        ge=0.0,
        description="Number of historical landslide scars within a 1 km radius.",
    )
    is_cut_slope: Optional[bool] = Field(
        default=None,
        description="True if within active engineered road-cut buffer, False if natural, None if unknown.",
    )

    @property
    def midpoint(self) -> tuple[float, float]:
        """(longitude, latitude) tuple of the geometric midpoint."""
        return (self.midpoint_longitude, self.midpoint_latitude)

    def to_geojson_properties(self) -> dict[str, Any]:
        """Convert features into GeoJSON feature properties dictionary without premature risk scores."""
        props: dict[str, Any] = {
            "segment_index": self.segment_index,
            "segment_length_m": round(self.segment_length_m, 2),
            "midpoint": [self.midpoint_longitude, self.midpoint_latitude],
            "elevation_m": round(self.elevation_m, 1) if self.elevation_m is not None else None,
            "slope_degrees": round(self.slope_degrees, 2) if self.slope_degrees is not None else None,
            "distance_to_historic_scar_m": round(self.distance_to_historic_scar_m, 2),
            "scar_density_1km": self.scar_density_1km,
            "is_cut_slope": self.is_cut_slope,
        }
        return props


class EnrichedSegment(BaseModel):
    """Pairing of a geometric RouteSegment and its physical SegmentHazardFeatures."""

    model_config = ConfigDict(frozen=True, extra="ignore")

    segment: RouteSegment
    features: SegmentHazardFeatures

    def to_geojson_feature(self) -> dict[str, Any]:
        """Export enriched segment as standard GeoJSON Feature."""
        base_feature = self.segment.to_geojson_feature()
        feat_props = self.features.to_geojson_properties()
        # Merge properties, preserving chainage and index
        merged_props = {**base_feature["properties"], **feat_props}
        return {
            "type": "Feature",
            "id": base_feature["id"],
            "geometry": base_feature["geometry"],
            "properties": merged_props,
        }


class EnrichedRouteResult(BaseModel):
    """Aggregate result holding all enriched segments for a route."""

    model_config = ConfigDict(frozen=True, extra="ignore")

    segmented_route: SegmentedRouteResult
    features: List[SegmentHazardFeatures]
    enriched_segments: List[EnrichedSegment]

    def __len__(self) -> int:
        return len(self.enriched_segments)

    def __getitem__(self, index: int) -> EnrichedSegment:
        return self.enriched_segments[index]

    def __iter__(self) -> Iterator[EnrichedSegment]:
        return iter(self.enriched_segments)

    def to_geojson(self) -> dict[str, Any]:
        """Export all enriched segments as a GeoJSON FeatureCollection."""
        return {
            "type": "FeatureCollection",
            "features": [es.to_geojson_feature() for es in self.enriched_segments],
        }


def enrich_route_segments(
    segmented_route: SegmentedRouteResult,
    terrain_provider: Optional[BaseTerrainProvider] = None,
    cut_slope_provider: Optional[BaseCutSlopeProvider] = None,
    inventory_service: Optional[LandslideInventoryService] = None,
) -> EnrichedRouteResult:
    """Enrich route segments with terrain DEM, GSI landslide spatial index, and road exposure attributes.

    Parameters
    ----------
    segmented_route : SegmentedRouteResult
        Phase-5 segmented route containing discrete ~250m intervals.
    terrain_provider : Optional[BaseTerrainProvider], optional
        DEM provider for elevation and slope. Defaults to CopernicusDEMProvider.
    cut_slope_provider : Optional[BaseCutSlopeProvider], optional
        Provider for anthropogenic cut-slope exposure. Defaults to DefaultCutSlopeProvider.
    inventory_service : Optional[LandslideInventoryService], optional
        Multi-source historical landslide service. Defaults to cached get_inventory_service().

    Returns
    -------
    EnrichedRouteResult
        Enriched route container with individual SegmentHazardFeatures and GeoJSON export.
    """
    if terrain_provider is None:
        terrain_provider = CopernicusDEMProvider()

    if cut_slope_provider is None:
        cut_slope_provider = get_cut_slope_provider()

    if inventory_service is None:
        inventory_service = get_inventory_service()

    # Ensure landslide KDTree is initialized once across all segments
    if not inventory_service.is_ready:
        inventory_service.load_uttarakhand_inventory()

    features_list: List[SegmentHazardFeatures] = []
    enriched_segments_list: List[EnrichedSegment] = []

    for seg in segmented_route.segments:
        lon, lat = seg.midpoint

        # 1. Terrain derivation (DEM provider)
        elevation = terrain_provider.get_elevation_m(lon, lat)
        slope = terrain_provider.get_slope_degrees(lon, lat)

        # 2. Historical Landslide queries (reusing spatial KDTree)
        dist_scar = inventory_service.nearest_distance_m(lon, lat)
        density_1km = inventory_service.count_within_radius_m(lon, lat, radius_m=1000.0)

        # 3. Road exposure / cut-slope determination
        cut_slope = cut_slope_provider.is_cut_slope(seg)

        feat = SegmentHazardFeatures(
            segment_index=seg.segment_index,
            segment_length_m=seg.segment_length_m,
            midpoint_longitude=lon,
            midpoint_latitude=lat,
            elevation_m=elevation,
            slope_degrees=slope,
            distance_to_historic_scar_m=dist_scar,
            scar_density_1km=density_1km,
            is_cut_slope=cut_slope,
        )
        features_list.append(feat)

        enriched_segments_list.append(
            EnrichedSegment(
                segment=seg,
                features=feat,
            )
        )

    return EnrichedRouteResult(
        segmented_route=segmented_route,
        features=features_list,
        enriched_segments=enriched_segments_list,
    )


def evaluate_segment_risk_from_features(
    features: SegmentHazardFeatures,
    p24_mm: Optional[float] = None,
    p72_mm: Optional[float] = None,
    ari_mm: Optional[float] = None,
    default_cut_slope: bool = True,
) -> Optional[SegmentRiskResult]:
    """Evaluate segment risk using the Phase-3 MCDA engine IF all required inputs are present.

    If rainfall parameters or topographic slope are missing (None), returns None
    rather than fabricating synthetic meteorological or terrain inputs.
    """
    if features.slope_degrees is None:
        return None
    if p24_mm is None or p72_mm is None or ari_mm is None:
        return None

    cut_slope_val = features.is_cut_slope if features.is_cut_slope is not None else default_cut_slope

    return calculate_segment_risk(
        slope_deg=features.slope_degrees,
        p24_mm=p24_mm,
        p72_mm=p72_mm,
        ari_mm=ari_mm,
        dist_scar_m=features.distance_to_historic_scar_m,
        scar_density_1km=features.scar_density_1km,
        is_cut_slope=cut_slope_val,
    )
