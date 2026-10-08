"""Geotechnical hazard attribution and segment explainability API endpoints."""

from typing import Any, Dict, Optional
from fastapi import APIRouter, HTTPException, Path, Query

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


@router.get(
    "/hazard/landslides",
    summary="Get Historical GSI Landslide Scars",
    description="Returns GeoJSON FeatureCollection of validated historical landslide scars from Geological Survey of India (GSI) catalog.",
)
def get_historical_landslides(
    min_lat: Optional[float] = Query(None, ge=-90.0, le=90.0, description="Minimum latitude bounding box"),
    max_lat: Optional[float] = Query(None, ge=-90.0, le=90.0, description="Maximum latitude bounding box"),
    min_lon: Optional[float] = Query(None, ge=-180.0, le=180.0, description="Minimum longitude bounding box"),
    max_lon: Optional[float] = Query(None, ge=-180.0, le=180.0, description="Maximum longitude bounding box"),
    limit: int = Query(300, ge=1, le=1000, description="Max feature return limit to optimize client rendering"),
) -> Dict[str, Any]:
    """Retrieve filtered GSI historical landslide scar features as GeoJSON."""
    from backend.app.geospatial.service import get_inventory_service

    service = get_inventory_service()
    if not service.is_ready:
        service.load_uttarakhand_inventory()

    features = []
    for rec in service._records:
        if min_lat is not None and rec.latitude < min_lat:
            continue
        if max_lat is not None and rec.latitude > max_lat:
            continue
        if min_lon is not None and rec.longitude < min_lon:
            continue
        if max_lon is not None and rec.longitude > max_lon:
            continue

        features.append(rec.to_geojson_feature())
        if len(features) >= limit:
            break

    return {
        "type": "FeatureCollection",
        "total_catalog_size": service.total_count,
        "returned_count": len(features),
        "features": features,
    }
