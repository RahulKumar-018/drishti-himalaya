"""Repository abstraction for storing and retrieving evaluated road segments."""

from abc import ABC, abstractmethod
from dataclasses import dataclass
from functools import lru_cache
from typing import Dict, List, Optional

from backend.app.schemas.common import CoordinatePoint, RiskTier
from backend.app.schemas.hazard import (
    DensityFactorAttribution,
    ExposureFactorAttribution,
    FactorAttribution,
    ProximityFactorAttribution,
    RainfallFactorAttribution,
    SegmentAttributionResponse,
    SlopeFactorAttribution,
)
from backend.app.services.analysis_models import AnalysisSegmentResult


@dataclass
class StoredSegment:
    """In-memory or persisted representation of an evaluated road segment."""

    segment_id: str
    corridor: str
    route_id: str
    segment: AnalysisSegmentResult


class BaseSegmentRepository(ABC):
    """Abstract interface for road segment explainability retrieval."""

    @abstractmethod
    def get_segment(self, segment_id: str) -> Optional[StoredSegment]:
        """Retrieve a stored segment by unique identifier."""
        pass

    @abstractmethod
    def save_segments(
        self,
        corridor: str,
        route_id: str,
        segments: List[AnalysisSegmentResult],
    ) -> None:
        """Store evaluated segments under corridor and route context."""
        pass

    @abstractmethod
    def clear(self) -> None:
        """Clear all cached segments."""
        pass


class InMemorySegmentRepository(BaseSegmentRepository):
    """In-memory segment repository for the process lifecycle.

    Provides explainability drilldown retrieval prior to Phase 11 database persistence.
    """

    def __init__(self) -> None:
        self._segments: Dict[str, StoredSegment] = {}

    def get_segment(self, segment_id: str) -> Optional[StoredSegment]:
        return self._segments.get(segment_id)

    def save_segments(
        self,
        corridor: str,
        route_id: str,
        segments: List[AnalysisSegmentResult],
    ) -> None:
        for s in segments:
            stored = StoredSegment(
                segment_id=f"seg_{s.segment_index}",
                corridor=corridor,
                route_id=route_id,
                segment=s,
            )
            # Store under primary segment_id: seg_0, seg_1, etc.
            self._segments[f"seg_{s.segment_index}"] = stored
            # Also store under route-qualified id: e.g. primary_route_seg_0
            self._segments[f"{route_id}_seg_{s.segment_index}"] = stored

    def clear(self) -> None:
        self._segments.clear()


_repository_instance: Optional[BaseSegmentRepository] = None


def get_segment_repository() -> BaseSegmentRepository:
    """Return singleton segment repository instance."""
    global _repository_instance
    if _repository_instance is None:
        _repository_instance = InMemorySegmentRepository()
    return _repository_instance


def to_attribution_response(stored: StoredSegment) -> SegmentAttributionResponse:
    """Convert a StoredSegment to the documented SegmentAttributionResponse.

    Honors data completeness: if terrain is missing, returns null for scores
    and exposes missing features rather than fabricating numbers.
    """
    s = stored.segment
    lon, lat = s.midpoint
    coords = CoordinatePoint(latitude=lat, longitude=lon)

    if s.is_risk_complete and s.risk_result is not None:
        rr = s.risk_result
        details = rr.factor_details
        attribution = FactorAttribution(
            slope=SlopeFactorAttribution(
                value_degrees=s.slope_degrees if s.slope_degrees is not None else 0.0,
                sub_score=details["slope"].sub_score,
                weight=details["slope"].weight,
                weighted_contribution=details["slope"].weighted_contribution,
                status=details["slope"].status,
                description=details["slope"].description,
            ),
            rainfall=RainfallFactorAttribution(
                precipitation_24h_mm=s.p24_mm if s.p24_mm is not None else 0.0,
                precipitation_72h_mm=s.p72_mm if s.p72_mm is not None else 0.0,
                antecedent_rain_index=s.ari_mm if s.ari_mm is not None else 0.0,
                sub_score=details["rain"].sub_score,
                weight=details["rain"].weight,
                weighted_contribution=details["rain"].weighted_contribution,
                status=details["rain"].status,
                description=details["rain"].description,
            ),
            proximity_to_scars=ProximityFactorAttribution(
                distance_meters=s.distance_to_historic_scar_m,
                sub_score=details["prox"].sub_score,
                weight=details["prox"].weight,
                weighted_contribution=details["prox"].weighted_contribution,
                status=details["prox"].status,
                description=details["prox"].description,
            ),
            landslide_density=DensityFactorAttribution(
                scars_per_sq_km=float(s.scar_density_1km),
                sub_score=details["density"].sub_score,
                weight=details["density"].weight,
                weighted_contribution=details["density"].weighted_contribution,
                status=details["density"].status,
                description=details["density"].description,
            ),
            cut_slope_exposure=ExposureFactorAttribution(
                is_exposed=bool(s.is_cut_slope),
                sub_score=details["exp"].sub_score,
                weight=details["exp"].weight,
                weighted_contribution=details["exp"].weighted_contribution,
                status=details["exp"].status,
                description=details["exp"].description,
            ),
        )
        if rr.risk_category == RiskTier.SEVERE:
            advisory = "CRITICAL: Severe geotechnical failure hazard. Transit not advised without escort."
        elif rr.risk_category == RiskTier.HIGH:
            advisory = "Elevated probability of slope debris instability under current saturation."
        elif rr.risk_category == RiskTier.MODERATE:
            advisory = "Moderate hazard. Exercise standard mountain driving precautions."
        else:
            advisory = "Low geotechnical hazard under current meteorological conditions."

        return SegmentAttributionResponse(
            segment_id=stored.segment_id,
            corridor=stored.corridor,
            chainage_km=round(s.start_chainage_km, 2),
            coordinates=coords,
            overall_risk_score=rr.risk_score,
            risk_tier=rr.risk_category,
            color_hex=rr.color_hex,
            factor_attribution=attribution,
            geotechnical_advisory=advisory,
            is_risk_complete=True,
            missing_features=[],
        )
    elif s.risk_result is not None:
        rr = s.risk_result
        if rr.risk_category == RiskTier.SEVERE:
            advisory = "CRITICAL: Severe geotechnical failure hazard. Transit not advised without escort (Partial assessment: cut-slope unavailable)."
        elif rr.risk_category == RiskTier.HIGH:
            advisory = "Elevated probability of slope debris instability under current saturation (Partial assessment: cut-slope unavailable)."
        elif rr.risk_category == RiskTier.MODERATE:
            advisory = "Moderate hazard. Exercise standard mountain driving precautions (Partial assessment: cut-slope unavailable)."
        else:
            advisory = "Low geotechnical hazard under current meteorological conditions (Partial assessment: cut-slope unavailable)."

        return SegmentAttributionResponse(
            segment_id=stored.segment_id,
            corridor=stored.corridor,
            chainage_km=round(s.start_chainage_km, 2),
            coordinates=coords,
            overall_risk_score=rr.risk_score,
            risk_tier=rr.risk_category,
            color_hex=rr.color_hex,
            factor_attribution=None,
            geotechnical_advisory=advisory,
            is_risk_complete=False,
            missing_features=s.missing_features,
        )
    else:
        # Incomplete data: report null scores honestly
        return SegmentAttributionResponse(
            segment_id=stored.segment_id,
            corridor=stored.corridor,
            chainage_km=round(s.start_chainage_km, 2),
            coordinates=coords,
            overall_risk_score=None,
            risk_tier=None,
            color_hex=None,
            factor_attribution=None,
            geotechnical_advisory="Data incomplete: missing DEM terrain and/or cut-slope factors. Geotechnical score cannot be calculated.",
            is_risk_complete=False,
            missing_features=s.missing_features,
        )
