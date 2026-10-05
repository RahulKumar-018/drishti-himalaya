"""Persistence service orchestrating transactional database storage for evaluated route hazards.

Maintains strict separation between the analytical MCDA risk engine and the database layer.
"""

import logging
from typing import List, Optional
import uuid

from sqlalchemy.orm import Session

from backend.app.core.config import settings
from backend.app.core.database import db_manager
from backend.app.db.repositories.risk_repository import RiskAssessmentRepository
from backend.app.db.repositories.route_repository import RouteRepository, RouteSegmentRepository
from backend.app.db.repositories.weather_repository import WeatherSnapshotRepository
from backend.app.models.risk import RiskAssessment
from backend.app.models.route import RouteSegment, SavedRoute
from backend.app.risk_engine.scoring import get_risk_tier_and_color
from backend.app.services.analysis_models import AnalysisResult, AnalysisRouteResult

logger = logging.getLogger(__name__)


class PersistenceService:
    """Service layer coordinating atomic persistence of evaluated highway risk assessments."""

    def __init__(self, db=None) -> None:
        self.db = db or db_manager

    @property
    def is_available(self) -> bool:
        """True if the database is configured and reachable."""
        ready, _, _ = self.db.check_readiness()
        return ready

    def persist_analysis_result(
        self,
        analysis: AnalysisResult,
        corridor: str = "NH-7",
        user_id: Optional[uuid.UUID] = None,
        session: Optional[Session] = None,
    ) -> List[uuid.UUID]:
        """Atomically persist routes, segments, and explainable risk assessments from an AnalysisResult.

        Guarantees transactional consistency across saved_routes, route_segments, and risk_assessments.
        """
        if session is not None:
            return self._persist_with_session(session, analysis, corridor, user_id)

        with self.db.session() as s:
            return self._persist_with_session(s, analysis, corridor, user_id)

    def _persist_with_session(
        self,
        session: Session,
        analysis: AnalysisResult,
        corridor: str,
        user_id: Optional[uuid.UUID],
    ) -> List[uuid.UUID]:
        route_repo = RouteRepository(session)
        segment_repo = RouteSegmentRepository(session)
        risk_repo = RiskAssessmentRepository(session)

        created_route_ids: List[uuid.UUID] = []

        for r_res in analysis.routes:
            # 1. Persist route
            composite_risk = r_res.route_risk.composite_route_risk if r_res.route_risk else None
            tier = get_risk_tier_and_color(composite_risk)[0].value if composite_risk is not None else None

            # Collect coordinates from segment boundaries
            all_coords: List[tuple[float, float]] = []
            for seg in r_res.segments:
                all_coords.extend(seg.geometry_coords)
            # Deduplicate sequential vertices
            dedup_coords: List[tuple[float, float]] = []
            for pt in all_coords:
                if not dedup_coords or dedup_coords[-1] != (pt[0], pt[1]):
                    dedup_coords.append((pt[0], pt[1]))

            req_orig = r_res.requested_origin or [r_res.segments[0].geometry_coords[0][0], r_res.segments[0].geometry_coords[0][1]]
            req_dest = r_res.requested_destination or [r_res.segments[-1].geometry_coords[-1][0], r_res.segments[-1].geometry_coords[-1][1]]

            route_entity = route_repo.create_route(
                user_id=user_id,
                name=f"{r_res.summary or corridor} Analysis",
                origin_name=f"Lat {req_orig[1]:.4f}, Lon {req_orig[0]:.4f}",
                destination_name=f"Lat {req_dest[1]:.4f}, Lon {req_dest[0]:.4f}",
                origin_lat=req_orig[1],
                origin_lon=req_orig[0],
                destination_lat=req_dest[1],
                destination_lon=req_dest[0],
                distance_km=r_res.total_distance_km,
                risk_score=composite_risk,
                risk_tier=tier,
                analysis_status=r_res.status.value,
                route_coords_wgs84=dedup_coords,
                provider=analysis.data_provenance.routing_source,
            )
            session.flush()
            route_uuid = route_entity.id
            created_route_ids.append(route_uuid)

            # 2. Persist route-level risk assessment
            if r_res.route_risk:
                tier_val = get_risk_tier_and_color(r_res.route_risk.composite_route_risk)[0].value
                risk_repo.create_assessment(
                    route_id=route_uuid,
                    segment_id=None,
                    risk_score=r_res.route_risk.composite_route_risk,
                    risk_tier=tier_val,
                    analysis_status=r_res.status.value,
                    average_route_score=r_res.route_risk.average_risk,
                    maximum_segment_score=r_res.route_risk.max_bottleneck_risk,
                    engine_version="1.0.0-mcda",
                )

            # 3. Persist individual segments and their 5 explainable components
            for seg_res in r_res.segments:
                seg_risk = seg_res.risk_result
                seg_score = seg_risk.risk_score if seg_risk else None
                seg_tier = seg_risk.risk_category.value if seg_risk else None

                seg_entity = segment_repo.create_segment(
                    route_id=route_uuid,
                    segment_index=seg_res.segment_index,
                    segment_id=f"seg_{seg_res.segment_index:03d}",
                    start_chainage_m=seg_res.start_chainage_km * 1000.0,
                    end_chainage_m=seg_res.end_chainage_km * 1000.0,
                    length_m=seg_res.segment_length_m,
                    midpoint_lon_lat=seg_res.midpoint,
                    coords_wgs84=seg_res.geometry_coords,
                    risk_score=seg_score,
                    risk_tier=seg_tier,
                    analysis_status="COMPLETE" if seg_res.is_risk_complete else "PARTIAL",
                )
                session.flush()

                if seg_risk:
                    sub = seg_risk.sub_scores
                    risk_repo.create_assessment(
                        route_id=route_uuid,
                        segment_id=seg_entity.id,
                        risk_score=seg_risk.risk_score,
                        risk_tier=seg_risk.risk_category.value,
                        analysis_status="COMPLETE" if not seg_risk.is_partial else "PARTIAL",
                        slope_score=sub.get("slope"),
                        rain_score=sub.get("rain"),
                        proximity_score=sub.get("prox"),
                        density_score=sub.get("density"),
                        exposure_score=sub.get("exp"),
                        slope_weight=0.35,
                        rain_weight=0.30,
                        proximity_weight=0.20,
                        density_weight=0.10,
                        exposure_weight=0.05,
                        engine_version="1.0.0-mcda",
                    )

        session.flush()
        return created_route_ids


_default_persistence_service: Optional[PersistenceService] = None


def get_persistence_service() -> PersistenceService:
    """Return singleton persistence service instance."""
    global _default_persistence_service
    if _default_persistence_service is None:
        _default_persistence_service = PersistenceService()
    return _default_persistence_service
