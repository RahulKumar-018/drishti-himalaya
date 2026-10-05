"""Repository implementation for explainable MCDA risk assessments."""

from typing import List, Optional
import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.app.db.repositories.base import BaseRepository
from backend.app.models.risk import RiskAssessment


class RiskAssessmentRepository(BaseRepository[RiskAssessment]):
    """Data access repository for explainable RiskAssessment entities."""

    def __init__(self, session: Session) -> None:
        super().__init__(RiskAssessment, session)

    def get_by_segment_id(self, segment_id: uuid.UUID) -> Optional[RiskAssessment]:
        """Fetch risk assessment for a specific segment UUID."""
        stmt = select(RiskAssessment).where(RiskAssessment.segment_id == segment_id)
        return self.session.scalars(stmt).first()

    def list_by_route_id(self, route_id: uuid.UUID) -> List[RiskAssessment]:
        """Fetch all risk assessments associated with a route UUID."""
        stmt = select(RiskAssessment).where(RiskAssessment.route_id == route_id)
        return list(self.session.scalars(stmt).all())

    def create_assessment(
        self,
        risk_score: float,
        risk_tier: str,
        route_id: Optional[uuid.UUID] = None,
        segment_id: Optional[uuid.UUID] = None,
        analysis_status: str = "COMPLETE",
        slope_score: Optional[float] = None,
        rain_score: Optional[float] = None,
        proximity_score: Optional[float] = None,
        density_score: Optional[float] = None,
        exposure_score: Optional[float] = None,
        slope_weight: float = 0.35,
        rain_weight: float = 0.30,
        proximity_weight: float = 0.20,
        density_weight: float = 0.10,
        exposure_weight: float = 0.05,
        average_route_score: Optional[float] = None,
        maximum_segment_score: Optional[float] = None,
        engine_version: str = "1.0.0-mcda",
    ) -> RiskAssessment:
        """Create and stage a new explainable RiskAssessment record."""
        assessment = RiskAssessment(
            route_id=route_id,
            segment_id=segment_id,
            risk_score=risk_score,
            risk_tier=risk_tier,
            analysis_status=analysis_status,
            slope_score=slope_score,
            rain_score=rain_score,
            proximity_score=proximity_score,
            density_score=density_score,
            exposure_score=exposure_score,
            slope_weight=slope_weight,
            rain_weight=rain_weight,
            proximity_weight=proximity_weight,
            density_weight=density_weight,
            exposure_weight=exposure_weight,
            average_route_score=average_route_score,
            maximum_segment_score=maximum_segment_score,
            engine_version=engine_version,
        )
        return self.add(assessment)
