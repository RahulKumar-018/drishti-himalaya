"""Pydantic schemas and data contracts for Drishti-Himalaya API."""

from backend.app.schemas.common import AlertLevel, CoordinatePoint, RiskTier
from backend.app.schemas.geojson import (
    GeoJSONFeatureCollection,
    LineStringGeometry,
    SegmentFeature,
    SegmentProperties,
)
from backend.app.schemas.hazard import (
    DensityFactorAttribution,
    ExposureFactorAttribution,
    FactorAttribution,
    ProximityFactorAttribution,
    RainfallFactorAttribution,
    SegmentAttributionResponse,
    SlopeFactorAttribution,
)
from backend.app.schemas.environmental import (
    DisasterEventResponse,
    LocationCreate,
    LocationEnvironmentResponse,
    LocationListResponse,
    LocationResponse,
    TerrainObservationResponse,
    WeatherObservationResponse,
)
from backend.app.schemas.health import HealthResponse
from backend.app.schemas.route import (
    AnalyzeRouteRequest,
    AnalyzeRouteResponse,
    RouteInfo,
)
from backend.app.schemas.weather import (
    CorridorWeatherSummaryResponse,
    WeatherMonitoringNode,
)

__all__ = [
    # Common primitives
    "CoordinatePoint",
    "RiskTier",
    "AlertLevel",
    # GeoJSON
    "LineStringGeometry",
    "SegmentProperties",
    "SegmentFeature",
    "GeoJSONFeatureCollection",
    # Hazard & Attribution
    "SlopeFactorAttribution",
    "RainfallFactorAttribution",
    "ProximityFactorAttribution",
    "DensityFactorAttribution",
    "ExposureFactorAttribution",
    "FactorAttribution",
    "SegmentAttributionResponse",
    # Route Analysis
    "AnalyzeRouteRequest",
    "RouteInfo",
    "AnalyzeRouteResponse",
    # Weather
    "WeatherMonitoringNode",
    "CorridorWeatherSummaryResponse",
    # Health
    "HealthResponse",
    # Environmental (Phase 2B)
    "LocationCreate",
    "LocationResponse",
    "LocationListResponse",
    "TerrainObservationResponse",
    "DisasterEventResponse",
    "WeatherObservationResponse",
    "LocationEnvironmentResponse",
]
