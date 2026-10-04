"""Route hazard analysis API endpoints."""

import logging
from typing import List

from fastapi import APIRouter

from backend.app.schemas.geojson import GeoJSONFeatureCollection
from backend.app.schemas.route import AnalyzeRouteRequest, AnalyzeRouteResponse, RouteInfo
from backend.app.services.analysis_service import analyze_route
from backend.app.services.segment_repository import get_segment_repository

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Route Analysis"])


@router.post(
    "/route/analyze",
    response_model=AnalyzeRouteResponse,
    summary="End-to-End Route Hazard Evaluation",
    description="Accepts origin and destination coordinates within Uttarakhand, segments the route into ~250m intervals, performs geotechnical hazard analysis, and provides Pareto-optimal routing recommendations.",
)
def post_route_analyze(request: AnalyzeRouteRequest) -> AnalyzeRouteResponse:
    """Execute end-to-end corridor hazard orchestration across arbitrary Uttarakhand waypoints."""
    # Orchestrate analysis via existing Phase 9 pipeline
    result = analyze_route(
        origin=(request.origin.longitude, request.origin.latitude),
        destination=(request.destination.longitude, request.destination.latitude),
        preference_weight_safety=request.preference_weight_safety,
        simulated_rainfall_mm=request.simulated_rainfall_mm,
    )

    corridor_label = (
        f"{request.origin.name or f'({request.origin.latitude:.3f}, {request.origin.longitude:.3f})'} to "
        f"{request.destination.name or f'({request.destination.latitude:.3f}, {request.destination.longitude:.3f})'}"
    )

    repo = get_segment_repository()
    route_infos: List[RouteInfo] = []

    for r in result.routes:
        # Cache segments in registry for explainability drilldown
        repo.save_segments(
            corridor=corridor_label,
            route_id=r.route_id,
            segments=r.segments,
        )

        geojson_data = r.to_geojson()
        fc = GeoJSONFeatureCollection.model_validate(geojson_data)

        total_segs = len(r.segments)
        terrain_segs = sum(
            1 for s in r.segments if s.slope_degrees is not None and s.elevation_m is not None
        )
        missing_terrain_segs = total_segs - terrain_segs

        if r.status.value == "COMPLETE":
            advisory = (
                "Full geotechnical hazard evaluation completed across terrain, precipitation, and historical catalogs."
            )
        elif not r.data_availability.terrain or terrain_segs == 0:
            advisory = (
                "Partial hazard assessment: Copernicus DEM GLO-30 terrain data is not locally available. "
                "Elevation and slope factors are unpopulated. Risk engine scores are not fabricated."
            )
        elif missing_terrain_segs > 0:
            advisory = (
                f"Partial hazard assessment: Copernicus DEM GLO-30 terrain data is available and enriched {terrain_segs}/{total_segs} "
                f"segments, but {missing_terrain_segs} segment(s) lack local DEM tile coverage. "
                "Risk engine scores are not fabricated for incomplete segments."
            )
        elif r.route_risk is not None and "is_cut_slope" in r.data_availability.missing_features:
            advisory = (
                "Partial hazard assessment: Risk scores were calculated using verified available factors "
                "(Copernicus DEM terrain, Open-Meteo precipitation, and GSI landslide inventory). "
                "Cut-slope information is unavailable for this route. "
                "The result is therefore a PARTIAL assessment. "
                "No missing factor was assumed to be safe."
            )
        else:
            missing_factors = [
                f for f in r.data_availability.missing_features
                if f not in ("elevation_m", "slope_degrees")
            ]
            missing_desc = ", ".join(missing_factors) if missing_factors else "unpopulated factor data"
            advisory = (
                f"Partial hazard assessment: Copernicus DEM GLO-30 terrain data is fully active "
                f"(elevation and slope enriched across all {total_segs} segments). "
                f"Assessment remains partial due to missing {missing_desc}. "
                "Risk engine scores are not fabricated without complete verified hazard inputs."
            )

        snapping_notes: list[str] = []
        if r.is_origin_snapped:
            snapping_notes.append(
                f"Origin was approximately {int(round(r.snapping_distance_origin_m))}m from the nearest drivable road. "
                "Routing was calculated from the nearest accessible road point."
            )
        if r.is_destination_snapped:
            snapping_notes.append(
                f"Destination was approximately {int(round(r.snapping_distance_destination_m))}m from the nearest drivable road. "
                "Routing was calculated from the nearest accessible road point."
            )
        if snapping_notes:
            advisory = f"{advisory} {' '.join(snapping_notes)}"

        route_infos.append(
            RouteInfo(
                route_id=r.route_id,
                summary=r.summary or f"Corridor alignment {r.route_id}",
                is_recommended=r.is_recommended,
                total_distance_km=round(r.total_distance_km, 2),
                estimated_time_minutes=round(r.estimated_time_minutes, 1),
                composite_route_risk=r.route_risk.composite_route_risk if r.route_risk else None,
                max_bottleneck_risk=r.route_risk.max_bottleneck_risk if r.route_risk else None,
                average_segment_risk=r.route_risk.average_risk if r.route_risk else None,
                high_risk_segment_count=r.high_risk_segment_count,
                severe_risk_segment_count=r.severe_risk_segment_count,
                recommendation=r.recommendation_text or "PARTIAL_ASSESSMENT_MISSING_DATA",
                advisory_text=advisory,
                geojson=fc,
                requested_origin=r.requested_origin,
                requested_destination=r.requested_destination,
                snapped_origin=r.snapped_origin,
                snapped_destination=r.snapped_destination,
                snapping_distance_origin_m=round(r.snapping_distance_origin_m, 2),
                snapping_distance_destination_m=round(r.snapping_distance_destination_m, 2),
                is_origin_snapped=r.is_origin_snapped,
                is_destination_snapped=r.is_destination_snapped,
            )
        )

    return AnalyzeRouteResponse(
        status=result.status.value,
        query_id=result.query_id,
        execution_duration_ms=result.execution_duration_ms,
        data_mode=result.data_mode,
        corridor=corridor_label,
        routes=route_infos,
        recommended_route_id=result.recommended_route_id,
        recommendation_available=result.recommendation_available,
        data_availability=result.data_availability.model_dump(),
        data_provenance=result.data_provenance.model_dump(),
    )
