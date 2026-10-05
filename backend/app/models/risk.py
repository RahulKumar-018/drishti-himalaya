"""Explainable risk assessment database model preserving Phase 1 MCDA mathematical formulation."""

from datetime import datetime
from typing import Optional
import uuid

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    Float,
    ForeignKey,
    Index,
    String,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.app.core.database import Base
from backend.app.models.base import GUID, utc_now


class RiskAssessment(Base):
    """Output record of the explainable multi-criteria decision analysis (MCDA) risk engine."""

    __tablename__ = "risk_assessments"
    __table_args__ = (
        CheckConstraint("risk_score >= 0.0 AND risk_score <= 100.0", name="chk_risk_score_bounds"),
        CheckConstraint("slope_score IS NULL OR (slope_score >= 0.0 AND slope_score <= 100.0)", name="chk_slope_score_bounds"),
        CheckConstraint("rain_score IS NULL OR (rain_score >= 0.0 AND rain_score <= 100.0)", name="chk_rain_score_bounds"),
        CheckConstraint("proximity_score IS NULL OR (proximity_score >= 0.0 AND proximity_score <= 100.0)", name="chk_prox_score_bounds"),
        CheckConstraint("density_score IS NULL OR (density_score >= 0.0 AND density_score <= 100.0)", name="chk_density_score_bounds"),
        CheckConstraint("exposure_score IS NULL OR (exposure_score >= 0.0 AND exposure_score <= 100.0)", name="chk_exp_score_bounds"),
        Index("idx_risk_assessments_route_id", "route_id"),
        Index("idx_risk_assessments_segment_id", "segment_id"),
        Index("idx_risk_assessments_tier", "risk_tier"),
        Index("idx_risk_assessments_created_at", "created_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(GUID(), primary_key=True, default=uuid.uuid4)
    route_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        GUID(),
        ForeignKey("saved_routes.id", ondelete="CASCADE"),
        nullable=True,
    )
    segment_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        GUID(),
        ForeignKey("route_segments.id", ondelete="CASCADE"),
        nullable=True,
    )

    risk_score: Mapped[float] = mapped_column(Float, nullable=False)
    risk_tier: Mapped[str] = mapped_column(String(20), nullable=False)
    analysis_status: Mapped[str] = mapped_column(String(20), default="COMPLETE", nullable=False)

    # 5 Explainable Factor Sub-Scores
    slope_score: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    rain_score: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    proximity_score: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    density_score: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    exposure_score: Mapped[Optional[float]] = mapped_column(Float, nullable=True)

    # Locked MCDA Weights: slope=0.35, rain=0.30, proximity=0.20, density=0.10, exposure=0.05
    slope_weight: Mapped[float] = mapped_column(Float, default=0.35, nullable=False)
    rain_weight: Mapped[float] = mapped_column(Float, default=0.30, nullable=False)
    proximity_weight: Mapped[float] = mapped_column(Float, default=0.20, nullable=False)
    density_weight: Mapped[float] = mapped_column(Float, default=0.10, nullable=False)
    exposure_weight: Mapped[float] = mapped_column(Float, default=0.05, nullable=False)

    # Route-level Aggregates (0.40 * avg + 0.60 * max)
    average_route_score: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    maximum_segment_score: Mapped[Optional[float]] = mapped_column(Float, nullable=True)

    engine_version: Mapped[str] = mapped_column(String(50), default="1.0.0-mcda", nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)

    # Relationships
    route = relationship("SavedRoute", back_populates="risk_assessments")
    segment = relationship("RouteSegment", back_populates="risk_assessments")

    def __repr__(self) -> str:
        return f"<RiskAssessment id={self.id} score={self.risk_score} tier={self.risk_tier} status={self.analysis_status}>"
