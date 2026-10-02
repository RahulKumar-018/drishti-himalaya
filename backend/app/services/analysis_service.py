"""Unified end-to-end route hazard analysis and multi-objective optimization service.

Integrates:
- Waypoint Routing (Phase 8)
- Polyline 250m Segmentation (Phase 5)
- Historical GSI Landslides & DEM Terrain (Phases 4 & 6)
- Meteorological Ingestion & Antecedent Rainfall (Phase 7)
- Mechanistic MCDA Risk Engine (Phase 3)
- Length-Weighted Bottleneck Aggregation & Pareto Optimization (Phase 3)
"""

import logging
import math
import time
from typing import Any, Dict, List, Optional, Sequence, Tuple, Union
import uuid

from backend.app.core.config import settings
from backend.app.geospatial.enrichment import BaseCutSlopeProvider, DefaultCutSlopeProvider
from backend.app.geospatial.service import LandslideInventoryService, get_inventory_service
from backend.app.geospatial.terrain import BaseTerrainProvider, CopernicusDEMProvider
from backend.app.risk_engine.aggregation import calculate_route_objective, calculate_route_risk
from backend.app.risk_engine.scoring import calculate_segment_risk
from backend.app.routing.models import RouteWithSegments
from backend.app.routing.service import RoutingService, get_routing_service
from backend.app.schemas.common import CoordinatePoint, RiskTier
from backend.app.services.analysis_models import (
    AnalysisResult,
    AnalysisRouteResult,
    AnalysisSegmentResult,
    AnalysisStatus,
    DataAvailability,
    DataProvenance,
)
from backend.app.services.weather_service import WeatherService, get_weather_service

logger = logging.getLogger(__name__)


def analyze_route(
    origin: Union[CoordinatePoint, Tuple[float, float], Sequence[float]],
    destination: Union[CoordinatePoint, Tuple[float, float], Sequence[float]],
    preference_weight_safety: float = 0.50,
    simulated_rainfall_mm: Optional[float] = None,
    alternatives: int = 1,
    routing_service: Optional[RoutingService] = None,
    terrain_provider: Optional[BaseTerrainProvider] = None,
    cut_slope_provider: Optional[BaseCutSlopeProvider] = None,
    weather_service: Optional[WeatherService] = None,
    inventory_service: Optional[LandslideInventoryService] = None,
    data_mode: Optional[str] = None,
) -> AnalysisResult:
    """Orchestrate end-to-end corridor hazard analysis across arbitrary Uttarakhand waypoints.

    Parameters
    ----------
    origin : Union[CoordinatePoint, Tuple[float, float], Sequence[float]]
        Starting waypoint inside Uttarakhand bounds.
    destination : Union[CoordinatePoint, Tuple[float, float], Sequence[float]]
        Destination waypoint inside Uttarakhand bounds.
    preference_weight_safety : float, optional
        Pareto beta parameter [0.0 - 1.0]. Higher values prioritize slope stability over duration.
        Default is 0.50 (triggers automated weather-adaptive clear 70/30 vs monsoon 20/80 weights).
    simulated_rainfall_mm : Optional[float], optional
        Optional uniform 24h rainfall override [0.0 - 150.0 mm] for scenario simulation.
    alternatives : int, optional
        Number of alternative route alignments requested from provider (default 1).
    routing_service : Optional[RoutingService], optional
        Custom or mocked routing service instance.
    terrain_provider : Optional[BaseTerrainProvider], optional
        Custom or mocked terrain provider (e.g. RasterGridTerrainProvider for tests).
    cut_slope_provider : Optional[BaseCutSlopeProvider], optional
        Custom or mocked road engineering cut-slope provider.
    weather_service : Optional[WeatherService], optional
        Custom or mocked meteorological service instance.
    inventory_service : Optional[LandslideInventoryService], optional
        Custom or mocked historical landslide inventory index.
    data_mode : Optional[str], optional
        Execution data mode override ('DEMO' or 'LIVE').

    Returns
    -------
    AnalysisResult
        Unified analysis output with per-segment features, route risks, and Pareto optimization.
    """
    t_start = time.perf_counter()
    query_id = str(uuid.uuid4())
    mode = (data_mode or settings.DATA_MODE).upper()

    # Parameter validation
    if not (0.0 <= preference_weight_safety <= 1.0):
        raise ValueError(
            f"preference_weight_safety must be in [0.0, 1.0], got {preference_weight_safety}"
        )
    if simulated_rainfall_mm is not None:
        if not (0.0 <= simulated_rainfall_mm <= 150.0) or not math.isfinite(simulated_rainfall_mm):
            raise ValueError(
                f"simulated_rainfall_mm must be in [0.0, 150.0], got {simulated_rainfall_mm}"
            )

    # Initialize services
    routing_svc = routing_service or (
        RoutingService(data_mode=mode) if data_mode else get_routing_service()
    )
    terrain_prov = terrain_provider or CopernicusDEMProvider()
    cut_slope_prov = cut_slope_provider or DefaultCutSlopeProvider()
    weather_svc = weather_service or (
        WeatherService(data_mode=mode) if data_mode else get_weather_service()
    )
    inv_svc = inventory_service or get_inventory_service()

    if not inv_svc.is_ready:
        inv_svc.load_uttarakhand_inventory()

    # Track missing features across data sources
    missing_global: List[str] = []
    if not terrain_prov.is_available:
        missing_global.extend(["elevation_m", "slope_degrees"])

    is_cut_slope_surveyed = False
    if isinstance(cut_slope_prov, DefaultCutSlopeProvider) and cut_slope_prov._map:
        is_cut_slope_surveyed = True
    elif not isinstance(cut_slope_prov, DefaultCutSlopeProvider):
        is_cut_slope_surveyed = True

    if not is_cut_slope_surveyed:
        missing_global.append("is_cut_slope")

    provenance = DataProvenance(
        routing_source=routing_svc.provider.provider_name,
        weather_source=(
            f"SIMULATED({simulated_rainfall_mm}mm)"
            if simulated_rainfall_mm is not None
            else ("DEMO_BASELINE" if mode == "DEMO" else "OPEN_METEO")
        ),
        landslide_source="GSI",
        terrain_source=terrain_prov.source_name if terrain_prov.is_available else None,
        cut_slope_source="SURVEY_DATA" if is_cut_slope_surveyed else None,
    )

    availability = DataAvailability(
        routing=True,
        landslide_inventory=inv_svc.is_ready,
        weather=True,
        terrain=terrain_prov.is_available,
        cut_slope=is_cut_slope_surveyed,
        missing_features=list(set(missing_global)),
    )

    # 1. Routing + Phase-5 250m Segmentation
    routes_with_segments: List[RouteWithSegments] = routing_svc.get_segmented_routes(
        origin=origin,
        destination=destination,
        alternatives=alternatives,
    )

    evaluated_routes: List[AnalysisRouteResult] = []

    # 2. Enrich and evaluate each route
    for r_seg in routes_with_segments:
        norm_route = r_seg.route
        segmented_res = r_seg.segmented_route

        analyzed_segments: List[AnalysisSegmentResult] = []
        route_missing_features: set[str] = set()

        for seg in segmented_res.segments:
            lon, lat = seg.midpoint

            # Topographic features (DEM)
            elev = terrain_prov.get_elevation_m(lon, lat)
            slope = terrain_prov.get_slope_degrees(lon, lat)

            # Historical Landslides (GSI KDTree)
            dist_scar = inv_svc.nearest_distance_m(lon, lat)
            density = inv_svc.count_within_radius_m(lon, lat, radius_m=1000.0)

            # Road cut exposure
            cut_slope = cut_slope_prov.is_cut_slope(seg)

            # Weather ingestion
            wf = weather_svc.get_weather_for_segment(seg)

            # Simulated rainfall precedence: simulated > real P24
            if simulated_rainfall_mm is not None:
                p24 = simulated_rainfall_mm
            else:
                p24 = wf.p24_mm if wf else None

            p72 = wf.p72_mm if wf else None
            ari = wf.ari_mm if wf else None

            # Feature completeness check
            seg_missing: List[str] = []
            if slope is None:
                seg_missing.append("slope_degrees")
            if elev is None:
                seg_missing.append("elevation_m")
            if p24 is None:
                seg_missing.append("p24_mm")
            if p72 is None:
                seg_missing.append("p72_mm")
            if ari is None:
                seg_missing.append("ari_mm")
            if cut_slope is None:
                seg_missing.append("is_cut_slope")

            route_missing_features.update(seg_missing)

            # Strict risk engine evaluation: only evaluate when all required factors exist
            is_complete = len(seg_missing) == 0
            risk_res = None
            if is_complete:
                risk_res = calculate_segment_risk(
                    slope_deg=slope,  # type: ignore
                    p24_mm=p24,  # type: ignore
                    p72_mm=p72,  # type: ignore
                    ari_mm=ari,  # type: ignore
                    dist_scar_m=dist_scar,
                    scar_density_1km=density,
                    is_cut_slope=cut_slope,  # type: ignore
                )

            analyzed_segments.append(
                AnalysisSegmentResult(
                    segment_index=seg.segment_index,
                    geometry_coords=seg.geometry_coords,
                    segment_length_m=seg.segment_length_m,
                    start_chainage_km=seg.start_chainage_km,
                    end_chainage_km=seg.end_chainage_km,
                    midpoint=seg.midpoint,
                    elevation_m=elev,
                    slope_degrees=slope,
                    p24_mm=p24,
                    p72_mm=p72,
                    ari_mm=ari,
                    distance_to_historic_scar_m=dist_scar,
                    scar_density_1km=density,
                    is_cut_slope=cut_slope,
                    risk_result=risk_res,
                    is_risk_complete=is_complete,
                    missing_features=seg_missing,
                )
            )

        # 3. Route Risk Aggregation & Multi-Objective Pareto Evaluation
        all_segments_complete = all(s.is_risk_complete for s in analyzed_segments)
        route_risk = None
        route_obj = None
        high_risk_count = 0
        severe_risk_count = 0
        rec_text = "PARTIAL_ASSESSMENT_MISSING_DATA"

        if all_segments_complete and len(analyzed_segments) > 0:
            risk_scores = [s.risk_result.risk_score for s in analyzed_segments if s.risk_result]
            lengths = [s.segment_length_m for s in analyzed_segments]

            route_risk = calculate_route_risk(risk_scores, segment_lengths_m=lengths)

            # Max 24h rainfall along corridor for weather-dependent weights
            max_p24 = max((s.p24_mm or 0.0) for s in analyzed_segments)

            # If user specified non-default safety preference (different from 0.50), use it;
            # otherwise let the documented weather-adaptive mode determine weights.
            if preference_weight_safety != 0.50:
                alpha_val = 1.0 - preference_weight_safety
                beta_val = preference_weight_safety
            else:
                alpha_val = None
                beta_val = None

            route_obj = calculate_route_objective(
                travel_time_minutes=norm_route.estimated_time_minutes,
                composite_route_risk=route_risk.composite_route_risk,
                p24_mm=max_p24,
                alpha=alpha_val,
                beta=beta_val,
            )

            for s in analyzed_segments:
                if s.risk_result:
                    if s.risk_result.risk_category == RiskTier.HIGH:
                        high_risk_count += 1
                    elif s.risk_result.risk_category == RiskTier.SEVERE:
                        severe_risk_count += 1

            if severe_risk_count > 0:
                rec_text = "CAUTION_SEVERE_HAZARD"
            elif high_risk_count > 0:
                rec_text = "CAUTION_HIGH_RISK"
            else:
                rec_text = "RECOMMENDED_ROUTE"

            route_status = AnalysisStatus.COMPLETE
        else:
            route_status = AnalysisStatus.PARTIAL

        evaluated_routes.append(
            AnalysisRouteResult(
                route_id=norm_route.route_id,
                summary=norm_route.summary,
                total_distance_km=norm_route.total_distance_km,
                estimated_time_minutes=norm_route.estimated_time_minutes,
                status=route_status,
                data_availability=DataAvailability(
                    routing=True,
                    landslide_inventory=inv_svc.is_ready,
                    weather=True,
                    terrain=terrain_prov.is_available,
                    cut_slope=is_cut_slope_surveyed,
                    missing_features=sorted(list(route_missing_features)),
                ),
                data_provenance=provenance,
                segments=analyzed_segments,
                route_risk=route_risk,
                objective=route_obj,
                is_recommended=False,
                recommendation_available=all_segments_complete,
                recommendation_text=rec_text,
                high_risk_segment_count=high_risk_count,
                severe_risk_segment_count=severe_risk_count,
            )
        )

    # 4. Multi-Route Pareto Optimization & Route Selection
    complete_routes = [r for r in evaluated_routes if r.objective is not None]
    recommended_id: Optional[str] = None
    rec_available = False

    if complete_routes:
        # Select route with lowest Pareto objective cost J(P)
        best_route = min(complete_routes, key=lambda r: r.objective.cost)  # type: ignore
        for r in evaluated_routes:
            if r.route_id == best_route.route_id:
                object.__setattr__(r, "is_recommended", True)
                if r.recommendation_text == "RECOMMENDED_ROUTE":
                    object.__setattr__(r, "recommendation_text", "OPTIMAL_SAFETY_TRANSIT_ROUTE")
        recommended_id = best_route.route_id
        rec_available = True

    overall_status = (
        AnalysisStatus.COMPLETE
        if all(r.status == AnalysisStatus.COMPLETE for r in evaluated_routes)
        else AnalysisStatus.PARTIAL
    )

    exec_duration_ms = round((time.perf_counter() - t_start) * 1000.0, 2)

    return AnalysisResult(
        query_id=query_id,
        status=overall_status,
        data_mode=mode,
        execution_duration_ms=exec_duration_ms,
        routes=evaluated_routes,
        recommended_route_id=recommended_id,
        recommendation_available=rec_available,
        data_availability=availability,
        data_provenance=provenance,
    )
