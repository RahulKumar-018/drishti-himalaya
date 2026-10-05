"""Repository layer package export for Drishti-Himalaya."""

from backend.app.db.repositories.alert_repository import AlertRepository
from backend.app.db.repositories.base import BaseRepository
from backend.app.db.repositories.community_repository import (
    CommunityReportRepository,
    FeedbackRepository,
)
from backend.app.db.repositories.historical_repository import (
    CuttingRepository,
    LandslideRepository,
)
from backend.app.db.repositories.risk_repository import RiskAssessmentRepository
from backend.app.db.repositories.route_repository import (
    RouteRepository,
    RouteSegmentRepository,
)
from backend.app.db.repositories.user_repository import UserRepository
from backend.app.db.repositories.weather_repository import WeatherSnapshotRepository

__all__ = [
    "BaseRepository",
    "UserRepository",
    "RouteRepository",
    "RouteSegmentRepository",
    "RiskAssessmentRepository",
    "WeatherSnapshotRepository",
    "AlertRepository",
    "CommunityReportRepository",
    "FeedbackRepository",
    "LandslideRepository",
    "CuttingRepository",
]
