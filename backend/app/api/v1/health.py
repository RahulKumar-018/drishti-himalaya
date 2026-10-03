"""System health and runtime readiness API endpoint."""

import sqlite3
from typing import Tuple
from urllib.parse import urlparse

from fastapi import APIRouter

from backend.app.core.config import settings
from backend.app.geospatial.service import get_inventory_service
from backend.app.schemas.health import HealthResponse
from backend.app.services.weather_service import DEFAULT_FIXTURE_PATH, get_weather_service

router = APIRouter(tags=["System Health"])


def _check_database() -> Tuple[bool, str]:
    """Inspect configured database reachability without raising unhandled errors."""
    db_url = settings.DATABASE_URL
    if db_url.startswith("sqlite"):
        try:
            # Parse sqlite path: sqlite:///./path.db or sqlite:///:memory:
            db_path = db_url.replace("sqlite:///", "").replace("sqlite://", "")
            if not db_path:
                db_path = ":memory:"
            conn = sqlite3.connect(db_path, timeout=2.0)
            cursor = conn.cursor()
            cursor.execute("SELECT 1;")
            cursor.close()
            conn.close()
            return True, f"connected ({'in-memory' if ':memory:' in db_path else 'SQLite'})"
        except Exception as exc:
            return False, f"disconnected (SQLite error: {exc})"
    elif db_url.startswith(("postgresql", "postgres")):
        # Without optional asyncpg/psycopg2 drivers or external db server, report honest state
        return False, "disconnected (PostgreSQL server unreachable or driver absent)"
    return False, f"disconnected (unsupported URI: {db_url})"


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
