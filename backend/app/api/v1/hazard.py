"""Geotechnical hazard attribution and segment explainability API endpoints."""

from fastapi import APIRouter, HTTPException, Path

from backend.app.schemas.hazard import SegmentAttributionResponse
from backend.app.services.segment_repository import get_segment_repository, to_attribution_response

router = APIRouter(tags=["Geotechnical Hazard"])


@router.get(
    "/hazard/segment/{segment_id}",
    response_model=SegmentAttributionResponse,
    summary="Segment Geotechnical Drilldown",
    description="Returns the explainability profile, 5-factor attribution breakdown, and geotechnical advisory for a specific road segment.",
    responses={
        404: {
            "description": "Segment not found in analysis registry",
            "content": {
                "application/json": {
                    "example": {
                        "error": "NOT_FOUND",
                        "message": "Segment 'seg_9999' not found in registry.",
                        "details": {"segment_id": "seg_9999"},
                    }
                }
            },
        }
    },
)
def get_segment_drilldown(
    segment_id: str = Path(
        ...,
        description="Unique segment identifier (e.g. seg_0, seg_nh7_042).",
        examples=["seg_0"],
    ),
) -> SegmentAttributionResponse:
    """Retrieve explainability attribution for a specific road segment."""
    repo = get_segment_repository()
    stored = repo.get_segment(segment_id)
    if not stored:
        raise HTTPException(
            status_code=404,
            detail=f"Segment '{segment_id}' not found in registry.",
        )

    return to_attribution_response(stored)
