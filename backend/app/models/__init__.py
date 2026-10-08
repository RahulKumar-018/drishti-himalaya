"""Drishti-Himalaya ORM models package export."""

from backend.app.core.database import Base
from backend.app.models.alert import HazardAlert
from backend.app.models.base import GUID, TimestampMixin, utc_now
from backend.app.models.community import CommunityHazardReport, Feedback
from backend.app.models.disaster import DisasterEvent
from backend.app.models.historical import LandslideRecord, RoadCutting
from backend.app.models.location import Location
from backend.app.models.monitoring import (
    MonitoredTrip,
    TripRiskSnapshot,
    TripAlert,
    NotificationDevice,
)
from backend.app.models.risk import RiskAssessment
from backend.app.models.route import RouteSegment, SavedRoute
from backend.app.models.terrain import TerrainObservation
from backend.app.models.user import UserProfile
from backend.app.models.weather import WeatherSnapshot
from backend.app.models.weather_observation import WeatherObservation

__all__ = [
    "Base",
    "GUID",
    "TimestampMixin",
    "utc_now",
    "UserProfile",
    "SavedRoute",
    "RouteSegment",
    "RiskAssessment",
    "WeatherSnapshot",
    "HazardAlert",
    "CommunityHazardReport",
    "Feedback",
    "LandslideRecord",
    "RoadCutting",
    "Location",
    "TerrainObservation",
    "DisasterEvent",
    "WeatherObservation",
    "MonitoredTrip",
    "TripRiskSnapshot",
    "TripAlert",
    "NotificationDevice",
]
