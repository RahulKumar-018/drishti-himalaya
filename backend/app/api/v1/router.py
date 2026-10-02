"""Central API v1 router mounting all resource subrouters."""

from fastapi import APIRouter

from backend.app.api.v1.hazard import router as hazard_router
from backend.app.api.v1.health import router as health_router
from backend.app.api.v1.route_analysis import router as route_analysis_router
from backend.app.api.v1.weather import router as weather_router

api_v1_router = APIRouter()

# Mount endpoints
api_v1_router.include_router(route_analysis_router)
api_v1_router.include_router(hazard_router)
api_v1_router.include_router(weather_router)
api_v1_router.include_router(health_router)
