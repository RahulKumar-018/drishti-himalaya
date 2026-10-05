"""Hazard risk assessment and spatial risk-zone API routes for Phase 2C."""

from datetime import datetime
import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from backend.app.core.database import get_db
from backend.app.risk_engine.service import get_spatial_risk_service
from backend.app.schemas.risk import (
    RiskPredictRequest,
    RiskPredictResponse,
    RiskZonesGeoJSONResponse,
)

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Hazard Risk Assessment Engine"])


@router.post(
    "/risk/predict",
    response_model=RiskPredictResponse,
    status_code=status.HTTP_200_OK,
    summary="Predict Point Hazard Risk",
    description=(
        "Evaluates explainable landslide and multi-hazard exposure for any geographic coordinate. "
        "Integrates topographic slope, hydro-meteorological rainfall saturation, and GSI historical "
        "landslide scar catalogs into a normalized [0, 100] risk score with explicit contributing factors "
        "and data quality evaluation."
    ),
    responses={
        422: {
            "description": "Validation Error (e.g. invalid latitude or longitude coordinates)",
            "content": {
                "application/json": {
                    "example": {
                        "error": "INVALID_ARGUMENT",
                        "message": "Latitude 95.0 is outside valid range [-90.0, 90.0]",
                    }
                }
            },
        }
    },
)
def predict_risk(
    payload: RiskPredictRequest,
    session: Session = Depends(get_db),
) -> RiskPredictResponse:
    """Predict point hazard risk score, categorical level, and contributing factors."""
    service = get_spatial_risk_service()
    try:
        response = service.assess_point_risk(
            session=session,
            latitude=payload.latitude,
            longitude=payload.longitude,
            timestamp=payload.timestamp,
            rainfall_mm=payload.rainfall_mm,
            slope_deg=payload.slope_deg,
            weather_source=payload.weather_source,
            model_type=payload.model_type,
            use_cache=True,
        )
        return response
    except ValueError as ve:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(ve),
        )
    except Exception as exc:
        logger.exception(f"Unexpected error during risk prediction: {exc}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An error occurred while evaluating hazard risk.",
        )


@router.get(
    "/risk/zones",
    response_model=RiskZonesGeoJSONResponse,
    status_code=status.HTTP_200_OK,
    summary="Get Spatial Hazard Risk Zones",
    description=(
        "Returns GeoJSON FeatureCollection of spatial hazard risk zones across Uttarakhand. "
        "Each feature includes bounding geometry, risk score, risk level, contributing factors, "
        "and an explicit scientific disclaimer noting MVP visualization boundaries."
    ),
)
def get_risk_zones(
    min_lat: Optional[float] = Query(None, ge=-90.0, le=90.0, description="Minimum bounding latitude"),
    max_lat: Optional[float] = Query(None, ge=-90.0, le=90.0, description="Maximum bounding latitude"),
    min_lon: Optional[float] = Query(None, ge=-180.0, le=180.0, description="Minimum bounding longitude"),
    max_lon: Optional[float] = Query(None, ge=-180.0, le=180.0, description="Maximum bounding longitude"),
    session: Session = Depends(get_db),
) -> RiskZonesGeoJSONResponse:
    """Retrieve spatial risk zones as GeoJSON."""
    service = get_spatial_risk_service()
    try:
        return service.generate_risk_zones(
            session=session,
            min_lat=min_lat,
            max_lat=max_lat,
            min_lon=min_lon,
            max_lon=max_lon,
        )
    except Exception as exc:
        logger.exception(f"Unexpected error retrieving risk zones: {exc}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An error occurred while generating spatial risk zones.",
        )


@router.get(
    "/risk/model/info",
    summary="Get Risk Engine Model Information",
    description="Returns metadata about active scoring models, configuration weights, and dataset status.",
)
def get_model_info():
    """Return model architecture and configuration metadata."""
    service = get_spatial_risk_service()
    return {
        "active_model_type": service.get_model("heuristic").model_type,
        "active_model_version": service.get_model("heuristic").model_version,
        "weights": {
            "slope": service.config.slope_weight,
            "rainfall": service.config.rainfall_weight,
            "historical_proximity": service.config.proximity_weight,
            "historical_density": service.config.density_weight,
            "cut_slope_exposure": service.config.exposure_weight,
        },
        "thresholds": {
            "low_max": service.config.low_max,
            "medium_max": service.config.medium_max,
            "high_max": service.config.high_max,
            "critical_max": service.config.critical_max,
        },
        "classification_tiers": {
            "LOW": f"0 to {service.config.low_max}",
            "MEDIUM": f"{service.config.low_max + 1} to {service.config.medium_max}",
            "HIGH": f"{service.config.medium_max + 1} to {service.config.high_max}",
            "CRITICAL": f"{service.config.high_max + 1} to {service.config.critical_max}",
        },
        "ml_pipeline_readiness": {
            "interface_ready": True,
            "catalog_inventory_status": "GSI 5,206 positive points in Uttarakhand",
            "negative_controls": "None (absent in raw catalog)",
            "ml_status": "Documented future work requiring verified non-landslide controls and dynamic precipitation series",
        },
    }
