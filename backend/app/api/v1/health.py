from pathlib import Path
import sqlite3
from typing import Tuple
from urllib.parse import urlparse

from fastapi import APIRouter, Response, status

from backend.app.core.config import settings
from backend.app.core.database import db_manager
from backend.app.geospatial.service import get_inventory_service
from backend.app.schemas.health import HealthResponse, ReadinessResponse
from backend.app.services.weather_service import DEFAULT_FIXTURE_PATH, get_weather_service

router = APIRouter(tags=["System Health"])


def _check_database() -> Tuple[bool, str]:
    """Inspect configured database reachability without raising unhandled errors."""
    is_ready, desc, _ = db_manager.check_readiness()
    return is_ready, desc


def _check_weather() -> Tuple[bool, str]:
    """Inspect configured meteorological telemetry availability."""
    weather_svc = get_weather_service()
    if weather_svc.data_mode == "DEMO":
        if DEFAULT_FIXTURE_PATH.exists():
            return True, "active (DEMO baseline fixture)"
        return False, "unavailable (DEMO fixture missing)"
    else:
        # LIVE mode: check if base URL is configured
        if settings.OPEN_METEO_BASE_URL:
            return True, "active (Open-Meteo)"
        return False, "unavailable (Open-Meteo unconfigured)"


def _check_routing() -> Tuple[bool, str]:
    """Inspect routing subsystem readiness."""
    mode = settings.DATA_MODE.upper()
    if mode == "DEMO":
        return True, "active (deterministic DEMO corridor)"
    else:
        key = settings.OPENROUTESERVICE_API_KEY
        if key and key.strip():
            return True, "active (OpenRouteService LIVE)"
        return False, "degraded (missing OPENROUTESERVICE_API_KEY)"


@router.get(
    "/health",
    response_model=HealthResponse,
    summary="System Health & Telemetry Status",
    description="Inspect overall service readiness, database connectivity, and loaded geospatial asset counts.",
)
def get_health() -> HealthResponse:
    """Return runtime health indicators across database, weather, and geospatial inventory."""
    db_ok, db_desc = _check_database()
    weather_ok, weather_desc = _check_weather()
    routing_ok, routing_desc = _check_routing()

    # Query loaded GSI landslide scars count
    inv_svc = get_inventory_service()
    if not inv_svc.is_ready:
        try:
            inv_svc.load_uttarakhand_inventory()
        except Exception:
            pass
    landslide_count = inv_svc.total_count if inv_svc.is_ready else 0

    is_all_ok = weather_ok and routing_ok
    status_indicator = "healthy" if is_all_ok else "degraded"

    return HealthResponse(
        status=status_indicator,
        service="Drishti-Himalaya API",
        version="1.0.0",
        data_mode=settings.DATA_MODE.upper(),
        database=db_desc,
        weather_api=weather_desc,
        routing_engine=routing_desc,
        cached_landslide_scars=landslide_count,
        corridor_length_km=156.4,
    )


@router.get(
    "/ready",
    response_model=ReadinessResponse,
    summary="Subsystem Readiness Probe",
    description="Inspect whether local terrain DEM, landslide spatial index, weather feed, and routing services are initialized and ready to serve traffic.",
)
def get_ready(response: Response) -> ReadinessResponse:
    """Readiness probe evaluating local and upstream subsystem availability."""
    # 1. Copernicus DEM check
    dem_dir = Path(settings.DEM_DIRECTORY)
    dem_ready = dem_dir.exists() and any(dem_dir.rglob("*.tif"))

    # 2. Historical landslide KDTree inventory check
    inv_svc = get_inventory_service()
    if not inv_svc.is_ready:
        try:
            inv_svc.load_uttarakhand_inventory()
        except Exception:
            pass
    inventory_ready = inv_svc.is_ready and inv_svc.total_count > 0

    # 3. Weather check
    weather_ok, _ = _check_weather()

    # 4. Routing check
    routing_ok, _ = _check_routing()

    # 5. Historical OSM cuttings check
    cuttings_file = (
        Path(__file__).resolve().parents[2]
        / "data"
        / "uttarakhand_cuttings_2018.json"
    )
    cuttings_ready = cuttings_file.exists()

    # 6. Database readiness check
    db_ok, _ = _check_database()

    checks = {
        "terrain_dem": dem_ready,
        "landslide_inventory": inventory_ready,
        "weather": weather_ok,
        "routing": routing_ok,
        "historical_cuttings": cuttings_ready,
        "database": db_ok,
    }

    critical_ready = dem_ready and inventory_ready and weather_ok and routing_ok

    if critical_ready:
        response.status_code = status.HTTP_200_OK
        overall_status = "ready"
        message = "All critical local and mock dependencies are initialized."
    else:
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
        overall_status = "not_ready"
        message = "One or more critical subsystems are not ready."

    return ReadinessResponse(
        status=overall_status,
        ready=critical_ready,
        service="Drishti-Himalaya API",
        data_mode=settings.DATA_MODE.upper(),
        checks=checks,
        message=message,
    )
