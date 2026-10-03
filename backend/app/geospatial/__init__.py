"""Geospatial module providing coordinate projection, loaders, KDTree indexing, and terrain enrichment."""

from backend.app.geospatial.enrichment import (
    BaseCutSlopeProvider,
    DefaultCutSlopeProvider,
    EnrichedRouteResult,
    EnrichedSegment,
    SegmentHazardFeatures,
    enrich_route_segments,
    evaluate_segment_risk_from_features,
    get_cut_slope_provider,
)
from backend.app.geospatial.kdtree import SpatialLandslideIndex
from backend.app.geospatial.loaders import BaseLandslideLoader, GSILoader, NRSCLoader
from backend.app.geospatial.models import LandslideSource, NormalizedLandslideRecord
from backend.app.geospatial.osm_cut_slope import (
    OSMCutSlopeFeature,
    OSMCutSlopeMatch,
    OSMCutSlopeProvider,
    load_osm_cut_slopes,
)
from backend.app.geospatial.projection import (
    batch_utm44n_to_wgs84,
    batch_wgs84_to_utm44n,
    utm44n_to_wgs84,
    wgs84_to_utm44n,
)
from backend.app.geospatial.service import (
    LandslideInventoryService,
    get_inventory_service,
)
from backend.app.geospatial.terrain import (
    BaseTerrainProvider,
    CopernicusDEMProvider,
    RasterGridTerrainProvider,
)

__all__ = [
    # Models & Enums
    "LandslideSource",
    "NormalizedLandslideRecord",
    # Projection
    "wgs84_to_utm44n",
    "batch_wgs84_to_utm44n",
    "utm44n_to_wgs84",
    "batch_utm44n_to_wgs84",
    # Loaders
    "BaseLandslideLoader",
    "GSILoader",
    "NRSCLoader",
    # KD-Tree & Service
    "SpatialLandslideIndex",
    "LandslideInventoryService",
    "get_inventory_service",
    # Terrain & DEM
    "BaseTerrainProvider",
    "RasterGridTerrainProvider",
    "CopernicusDEMProvider",
    # Road Exposure & Cut Slopes
    "BaseCutSlopeProvider",
    "DefaultCutSlopeProvider",
    "get_cut_slope_provider",
    "OSMCutSlopeFeature",
    "OSMCutSlopeMatch",
    "OSMCutSlopeProvider",
    "load_osm_cut_slopes",
    # Segment Enrichment
    "SegmentHazardFeatures",
    "EnrichedSegment",
    "EnrichedRouteResult",
    "enrich_route_segments",
    "evaluate_segment_risk_from_features",
]
