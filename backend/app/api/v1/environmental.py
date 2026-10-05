"""Environmental and geospatial API routes for Phase 2B."""

from datetime import datetime
import logging
from typing import List, Optional
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from backend.app.core.database import get_db
from backend.app.schemas.environmental import (
    DisasterEventResponse,
    LocationCreate,
    LocationEnvironmentResponse,
    LocationListResponse,
    LocationResponse,
    TerrainObservationResponse,
    WeatherObservationResponse,
)
from backend.app.services.environmental import (
    get_disaster_data_service,
    get_geospatial_service,
    get_terrain_service,
    get_weather_data_service,
)

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Environmental & Geospatial Pipeline"])


def _parse_uuid(location_id: str) -> uuid.UUID:
    """Parse and validate string UUID."""
    try:
        return uuid.UUID(location_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Invalid UUID format for location_id: '{location_id}'",
        )


@router.post(
    "/locations",
    response_model=LocationResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Register Location",
    description="Register a new geographic reference location with spatial coordinates and optional elevation.",
)
def create_location(
    payload: LocationCreate,
    session: Session = Depends(get_db),
) -> LocationResponse:
    geo_svc = get_geospatial_service()
    try:
        loc = geo_svc.create_location(
            session=session,
            name=payload.name,
            latitude=payload.latitude,
            longitude=payload.longitude,
            elevation=payload.elevation,
            administrative_metadata=payload.administrative_metadata,
            auto_sample_terrain=True,
        )
        session.commit()
        return LocationResponse(
            id=str(loc.id),
            name=loc.name,
            latitude=loc.latitude,
            longitude=loc.longitude,
            elevation=loc.elevation,
            administrative_metadata=loc.administrative_metadata,
            created_at=loc.created_at,
            updated_at=loc.updated_at,
        )
    except ValueError as ve:
        session.rollback()
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(ve))


@router.get(
    "/locations",
    response_model=LocationListResponse,
    summary="List Locations",
    description="Retrieve a paginated list of geographic locations.",
)
def list_locations(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    search: Optional[str] = Query(None, description="Search locations by name"),
    session: Session = Depends(get_db),
) -> LocationListResponse:
    geo_svc = get_geospatial_service()
    locations = geo_svc.list_locations(session=session, skip=skip, limit=limit, search=search)
    return LocationListResponse(
        total=len(locations),
        locations=[
            LocationResponse(
                id=str(loc.id),
                name=loc.name,
                latitude=loc.latitude,
                longitude=loc.longitude,
                elevation=loc.elevation,
                administrative_metadata=loc.administrative_metadata,
                created_at=loc.created_at,
                updated_at=loc.updated_at,
            )
            for loc in locations
        ],
    )


@router.get(
    "/locations/{id}",
    response_model=LocationResponse,
    summary="Get Location by ID",
    description="Retrieve detailed metadata and coordinates for a specific location.",
)
def get_location_by_id(
    id: str,
    session: Session = Depends(get_db),
) -> LocationResponse:
    loc_id = _parse_uuid(id)
    geo_svc = get_geospatial_service()
    loc = geo_svc.get_location(session, loc_id)
    if not loc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Location '{id}' not found.")

    return LocationResponse(
        id=str(loc.id),
        name=loc.name,
        latitude=loc.latitude,
        longitude=loc.longitude,
        elevation=loc.elevation,
        administrative_metadata=loc.administrative_metadata,
        created_at=loc.created_at,
        updated_at=loc.updated_at,
    )


@router.get(
    "/locations/{id}/terrain",
    response_model=TerrainObservationResponse,
    summary="Get Location Terrain Metrics",
    description="Derive or fetch topographic elevation, slope, aspect, and terrain class for the location.",
)
def get_location_terrain(
    id: str,
    session: Session = Depends(get_db),
) -> TerrainObservationResponse:
    loc_id = _parse_uuid(id)
    geo_svc = get_geospatial_service()
    loc = geo_svc.get_location(session, loc_id)
    if not loc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Location '{id}' not found.")

    terrain_svc = get_terrain_service()
    obs = terrain_svc.get_latest_terrain_for_location(session, loc_id)
    if obs:
        return TerrainObservationResponse(
            id=str(obs.id),
            location_id=str(obs.location_id),
            elevation_m=obs.elevation,
            slope_degrees=obs.slope,
            aspect_degrees=obs.aspect,
            terrain_class=obs.terrain_class,
            source=obs.source,
            source_reference=obs.source_reference,
            observation_time=obs.observation_time,
        )

    # Dynamic fallback to DEM sampling
    metrics = terrain_svc.sample_terrain(loc.longitude, loc.latitude)
    return TerrainObservationResponse(
        id=None,
        location_id=str(loc.id),
        elevation_m=metrics.get("elevation_m") or loc.elevation,
        slope_degrees=metrics.get("slope_degrees"),
        aspect_degrees=metrics.get("aspect_degrees"),
        terrain_class=metrics.get("terrain_class"),
        source=metrics.get("source", "Copernicus DEM GLO-30"),
        source_reference="EPSG:4326/Horn-1981",
        observation_time=None,
    )


@router.get(
    "/locations/{id}/disasters",
    response_model=List[DisasterEventResponse],
    summary="Get Location Disaster History",
    description="Retrieve recorded historical disaster events (landslide, flash flood, rockfall, etc.) for this location.",
)
def get_location_disasters(
    id: str,
    event_type: Optional[str] = Query(None, description="Filter by event type"),
    limit: int = Query(50, ge=1, le=100),
    session: Session = Depends(get_db),
) -> List[DisasterEventResponse]:
    loc_id = _parse_uuid(id)
    geo_svc = get_geospatial_service()
    loc = geo_svc.get_location(session, loc_id)
    if not loc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Location '{id}' not found.")

    disaster_svc = get_disaster_data_service()
    events = disaster_svc.get_events_for_location(session, loc_id, event_type=event_type, limit=limit)
    return [
        DisasterEventResponse(
            id=str(e.id),
            location_id=str(e.location_id) if e.location_id else None,
            event_type=e.event_type,
            event_date=e.event_date,
            severity=e.severity,
            source=e.source,
            source_reference=e.source_reference,
            description=e.description,
            latitude=e.latitude,
            longitude=e.longitude,
            is_historical=e.is_historical,
            created_at=e.created_at,
        )
        for e in events
    ]


@router.get(
    "/locations/{id}/weather",
    response_model=WeatherObservationResponse,
    summary="Get Location Weather",
    description="Retrieve meteorological conditions for this location with explicit source provenance.",
)
def get_location_weather(
    id: str,
    session: Session = Depends(get_db),
) -> WeatherObservationResponse:
    loc_id = _parse_uuid(id)
    geo_svc = get_geospatial_service()
    loc = geo_svc.get_location(session, loc_id)
    if not loc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Location '{id}' not found.")

    weather_svc = get_weather_data_service()
    recent = weather_svc.get_location_observations(session, loc_id, limit=1)
    if recent:
        r = recent[0]
        raw = r.raw_payload or {}
        ret_at = None
        if raw.get("retrieved_at"):
            try:
                ret_at = datetime.fromisoformat(raw["retrieved_at"])
            except Exception:
                ret_at = None

        return WeatherObservationResponse(
            latitude=r.latitude,
            longitude=r.longitude,
            observation_time=r.observation_time,
            forecast_time=r.forecast_time,
            rainfall_mm=r.rainfall_mm,
            temperature_c=r.temperature_c,
            humidity_percent=r.humidity_percent,
            wind_speed_kmh=r.wind_speed_kmh,
            precipitation_probability=r.precipitation_probability,
            weather_source=r.source,
            source_type=r.source_type,
            is_live=False,
            p24_mm=raw.get("p24_mm"),
            p72_mm=raw.get("p72_mm"),
            ari_mm=raw.get("ari_mm"),
            wind_gusts_kmh=raw.get("wind_gusts_kmh"),
            weather_code=raw.get("weather_code"),
            retrieved_at=ret_at,
        )

    res = weather_svc.get_weather_for_coordinate(
        latitude=loc.latitude,
        longitude=loc.longitude,
        session=session,
        persist=False,
        location_id=loc.id,
    )
    return WeatherObservationResponse(
        latitude=res.latitude,
        longitude=res.longitude,
        observation_time=res.observation_time,
        forecast_time=res.forecast_time,
        rainfall_mm=res.rainfall_mm,
        temperature_c=res.temperature_c,
        humidity_percent=res.humidity_percent,
        wind_speed_kmh=res.wind_speed_kmh,
        precipitation_probability=res.precipitation_probability,
        weather_source=res.source,
        source_type=res.source_type,
        is_live=res.is_live,
        p24_mm=res.p24_mm,
        p72_mm=res.p72_mm,
        ari_mm=res.ari_mm,
        wind_gusts_kmh=res.wind_gusts_kmh,
        weather_code=res.weather_code,
        retrieved_at=res.retrieved_at,
    )


@router.get(
    "/locations/{id}/environment",
    response_model=LocationEnvironmentResponse,
    summary="Get Full Environmental Signals Bundle",
    description=(
        "Prepares the complete 7-signal environmental bundle required for downstream risk analysis: "
        "Elevation, Slope, Terrain characteristics, Historical disasters, Weather, Location metadata, "
        "and Scientific provenance."
    ),
)
def get_location_environment(
    id: str,
    session: Session = Depends(get_db),
) -> LocationEnvironmentResponse:
    loc_id = _parse_uuid(id)
    geo_svc = get_geospatial_service()
    bundle = geo_svc.get_location_environment(session, loc_id)
    if not bundle:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Location '{id}' not found.")

    loc_dict = bundle["location"]
    terrain_dict = bundle["terrain"]
    weather_dict = bundle["weather"]

    loc_resp = LocationResponse(
        id=loc_dict["id"],
        name=loc_dict["name"],
        latitude=loc_dict["latitude"],
        longitude=loc_dict["longitude"],
        elevation=loc_dict["elevation"],
        administrative_metadata=loc_dict["administrative_metadata"],
        created_at=datetime.fromisoformat(loc_dict["created_at"]),
        updated_at=datetime.fromisoformat(loc_dict["updated_at"]),
    )
    terrain_resp = TerrainObservationResponse(
        id=None,
        location_id=loc_dict["id"],
        elevation_m=terrain_dict.get("elevation_m"),
        slope_degrees=terrain_dict.get("slope_degrees"),
        aspect_degrees=terrain_dict.get("aspect_degrees"),
        terrain_class=terrain_dict.get("terrain_class"),
        source=terrain_dict.get("source", "Copernicus DEM GLO-30"),
        source_reference="EPSG:4326/Horn-1981",
        observation_time=datetime.fromisoformat(terrain_dict["observation_time"])
        if terrain_dict.get("observation_time")
        else None,
    )
    weather_resp = WeatherObservationResponse(
        latitude=loc_dict["latitude"],
        longitude=loc_dict["longitude"],
        observation_time=datetime.fromisoformat(weather_dict["observation_time"]),
        forecast_time=datetime.fromisoformat(weather_dict["forecast_time"])
        if weather_dict.get("forecast_time")
        else None,
        rainfall_mm=weather_dict.get("rainfall_mm"),
        temperature_c=weather_dict.get("temperature_c"),
        humidity_percent=weather_dict.get("humidity_percent"),
        wind_speed_kmh=weather_dict.get("wind_speed_kmh"),
        precipitation_probability=weather_dict.get("precipitation_probability"),
        weather_source=weather_dict.get("weather_source", "Unknown"),
        source_type=weather_dict.get("source_type", "historical_dataset"),
        is_live=weather_dict.get("is_live", False),
        p24_mm=weather_dict.get("p24_mm"),
        p72_mm=weather_dict.get("p72_mm"),
        ari_mm=weather_dict.get("ari_mm"),
        retrieved_at=datetime.fromisoformat(weather_dict["retrieved_at"])
        if weather_dict.get("retrieved_at")
        else None,
    )

    return LocationEnvironmentResponse(
        location=loc_resp,
        terrain=terrain_resp,
        historical_disasters=bundle["historical_disasters"],
        weather=weather_resp,
        provenance=bundle["provenance"],
    )
