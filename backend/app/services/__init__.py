"""External service integrations and unified route hazard analysis orchestration."""

from backend.app.services.analysis_models import (
    AnalysisResult,
    AnalysisRouteResult,
    AnalysisSegmentResult,
    AnalysisStatus,
    DataAvailability,
    DataProvenance,
)
from backend.app.services.analysis_service import analyze_route
from backend.app.services.weather_models import WeatherFeatures, WeatherQueryResult
from backend.app.services.weather_service import WeatherService, get_weather_service

__all__ = [
    # Analysis & Orchestration
    "analyze_route",
    "AnalysisResult",
    "AnalysisRouteResult",
    "AnalysisSegmentResult",
    "AnalysisStatus",
    "DataAvailability",
    "DataProvenance",
    # Weather
    "WeatherFeatures",
    "WeatherQueryResult",
    "WeatherService",
    "get_weather_service",
]
