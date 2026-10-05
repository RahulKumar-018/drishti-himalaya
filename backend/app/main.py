"""FastAPI application entrypoint for Drishti-Himalaya."""

import logging
from typing import Any, Dict

from fastapi import FastAPI, Request, status
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from backend.app.api.v1.router import api_v1_router
from backend.app.core.config import settings
from backend.app.routing.exceptions import (
    InvalidCoordinateError,
    MissingAPIKeyError,
    NoRouteFoundError,
    RoutingNetworkError,
    RoutingProviderError,
    RoutingTimeoutError,
)

logger = logging.getLogger("drishti_himalaya")

app = FastAPI(
    title="Drishti-Himalaya Hazard Routing API",
    version="1.0.0",
    description=(
        "Hazard-aware road routing platform for the State of Uttarakhand. "
        "Integrates GSI historical landslide catalogs, metric spatial indexing, "
        "meteorological Antecedent Rainfall Index (ARI) telemetry, and multi-objective Pareto optimization."
    ),
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json",
)

# ---------------------------------------------------------------------------
# CORS Middleware
# ---------------------------------------------------------------------------
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Centralized Structured Exception Handlers
# ---------------------------------------------------------------------------


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(
    request: Request,
    exc: RequestValidationError,
) -> JSONResponse:
    """Format Pydantic schema validation failures as structured JSON."""
    return JSONResponse(
        status_code=422,
        content={
            "error": "VALIDATION_ERROR",
            "message": "Request payload validation failed.",
            "details": {"errors": jsonable_encoder(exc.errors())},
        },
    )


@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(
    request: Request,
    exc: StarletteHTTPException,
) -> JSONResponse:
    """Format standard HTTP exceptions (e.g. 404 Not Found) as structured JSON."""
    error_code = "NOT_FOUND" if exc.status_code == 404 else f"HTTP_{exc.status_code}"
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "error": error_code,
            "message": str(exc.detail),
            "details": {},
        },
    )


@app.exception_handler(InvalidCoordinateError)
async def invalid_coordinate_handler(
    request: Request,
    exc: InvalidCoordinateError,
) -> JSONResponse:
    """Handle waypoint coordinate out-of-bounds errors."""
    return JSONResponse(
        status_code=422,
        content={
            "error": "INVALID_COORDINATES",
            "message": str(exc),
            "details": {},
        },
    )


@app.exception_handler(NoRouteFoundError)
async def no_route_found_handler(
    request: Request,
    exc: NoRouteFoundError,
) -> JSONResponse:
    """Handle routing unreachable waypoint exceptions."""
    return JSONResponse(
        status_code=status.HTTP_404_NOT_FOUND,
        content={
            "error": "NO_ROUTE_FOUND",
            "message": str(exc),
            "details": {},
        },
    )


@app.exception_handler(RoutingTimeoutError)
async def routing_timeout_handler(
    request: Request,
    exc: RoutingTimeoutError,
) -> JSONResponse:
    """Handle routing provider gateway timeouts."""
    return JSONResponse(
        status_code=status.HTTP_504_GATEWAY_TIMEOUT,
        content={
            "error": "ROUTING_TIMEOUT",
            "message": str(exc),
            "details": {},
        },
    )


@app.exception_handler(RoutingProviderError)
async def routing_provider_handler(
    request: Request,
    exc: RoutingProviderError,
) -> JSONResponse:
    """Handle upstream routing provider communication failures."""
    return JSONResponse(
        status_code=status.HTTP_502_BAD_GATEWAY,
        content={
            "error": "ROUTING_PROVIDER_ERROR",
            "message": str(exc),
            "details": {"status_code": exc.status_code},
        },
    )


@app.exception_handler(RoutingNetworkError)
async def routing_network_handler(
    request: Request,
    exc: RoutingNetworkError,
) -> JSONResponse:
    """Handle upstream routing network connection failures."""
    return JSONResponse(
        status_code=status.HTTP_502_BAD_GATEWAY,
        content={
            "error": "ROUTING_NETWORK_ERROR",
            "message": str(exc),
            "details": {},
        },
    )


@app.exception_handler(MissingAPIKeyError)
async def missing_api_key_handler(
    request: Request,
    exc: MissingAPIKeyError,
) -> JSONResponse:
    """Handle missing upstream credential configuration."""
    return JSONResponse(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        content={
            "error": "MISSING_API_KEY",
            "message": str(exc),
            "details": {},
        },
    )


@app.exception_handler(ValueError)
async def value_error_handler(
    request: Request,
    exc: ValueError,
) -> JSONResponse:
    """Handle invalid domain values passed to service components."""
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={
            "error": "INVALID_ARGUMENT",
            "message": str(exc),
            "details": {},
        },
    )


@app.exception_handler(Exception)
async def generic_exception_handler(
    request: Request,
    exc: Exception,
) -> JSONResponse:
    """Catch unhandled internal errors, log stack trace, and prevent leakage to client."""
    logger.exception("Unhandled server exception: %s", exc)
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={
            "error": "INTERNAL_SERVER_ERROR",
            "message": "An unexpected internal server error occurred.",
            "details": {},
        },
    )


# ---------------------------------------------------------------------------
# Router Mounting
# ---------------------------------------------------------------------------
from backend.app.api.v1.environmental import router as environmental_router
from backend.app.api.v1.health import router as health_router
from backend.app.api.v1.risk import router as risk_router

app.include_router(api_v1_router, prefix="/api/v1")
app.include_router(environmental_router, prefix="/api")
app.include_router(health_router, prefix="/api")
app.include_router(risk_router, prefix="/api")
