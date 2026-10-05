"""Repository implementations for community hazard reports and traveler feedback."""

from typing import Any, Dict, List, Optional
import uuid

from geoalchemy2.shape import from_shape
from shapely.geometry import Point
from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.app.db.repositories.base import BaseRepository
from backend.app.models.community import CommunityHazardReport, Feedback


class CommunityReportRepository(BaseRepository[CommunityHazardReport]):
    """Data access repository for CommunityHazardReport records."""

    def __init__(self, session: Session) -> None:
        super().__init__(CommunityHazardReport, session)

    def create_report(
        self,
        report_type: str,
        latitude: float,
        longitude: float,
        description: Optional[str] = None,
        severity: str = "MODERATE",
        user_id: Optional[uuid.UUID] = None,
        source: str = "COMMUNITY",
        metadata: Optional[Dict[str, Any]] = None,
    ) -> CommunityHazardReport:
        """Create and stage a new community hazard incident report."""
        pt = Point(longitude, latitude)
        report = CommunityHazardReport(
            user_id=user_id,
            report_type=report_type,
            description=description,
            latitude=latitude,
            longitude=longitude,
            location_geometry=from_shape(pt, srid=4326),
            severity=severity,
            source=source,
            extra_metadata=metadata,
        )
        return self.add(report)

    def list_reports(
        self,
        status: Optional[str] = None,
        report_type: Optional[str] = None,
        limit: int = 50,
    ) -> List[CommunityHazardReport]:
        """Fetch community reports filtered optionally by status or type."""
        stmt = select(CommunityHazardReport)
        if status:
            stmt = stmt.where(CommunityHazardReport.status == status.upper())
        if report_type:
            stmt = stmt.where(CommunityHazardReport.report_type == report_type)
        stmt = stmt.order_by(CommunityHazardReport.created_at.desc()).limit(limit)
        return list(self.session.scalars(stmt).all())


class FeedbackRepository(BaseRepository[Feedback]):
    """Data access repository for traveler route feedback."""

    def __init__(self, session: Session) -> None:
        super().__init__(Feedback, session)

    def create_feedback(
        self,
        rating: int,
        comment: Optional[str] = None,
        user_id: Optional[uuid.UUID] = None,
        route_id: Optional[uuid.UUID] = None,
    ) -> Feedback:
        """Create and stage a traveler rating record."""
        if not (1 <= rating <= 5):
            raise ValueError(f"Rating must be between 1 and 5, got {rating}")
        fb = Feedback(
            user_id=user_id,
            route_id=route_id,
            rating=rating,
            comment=comment,
        )
        return self.add(fb)

    def list_by_route(self, route_id: uuid.UUID) -> List[Feedback]:
        """Fetch all feedback entries for a given route."""
        stmt = select(Feedback).where(Feedback.route_id == route_id).order_by(Feedback.created_at.desc())
        return list(self.session.scalars(stmt).all())
