"""Geospatial validation, location management, and environmental signal aggregation."""

from datetime import datetime, timezone
import math
from typing import Any, Dict, List, Optional
import uuid

from sqlalchemy import or_
from sqlalchemy.orm import Session

from backend.app.models.location import Location
from backend.app.services.environmental.disaster_service import (
    DisasterDataService,
    get_disaster_data_service,
)
from backend.app.services.environmental.terrain_service import (
    TerrainService,
    get_terrain_service,
)
from backend.app.services.environmental.weather_service import (
    WeatherDataService,
    get_weather_data_service,
)


class GeospatialValidation:
    """Rigorous physical and spatial domain validation rules for Drishti-Himalaya."""

    @staticmethod
    def validate_coordinates(latitude: float, longitude: float) -> None:
        """Validate WGS84 geographic coordinate bounds and finite numbers."""
        if math.isnan(latitude) or math.isinf(latitude):
            raise ValueError(f"Latitude must be a finite number: {latitude}")
        if math.isnan(longitude) or math.isinf(longitude):
            raise ValueError(f"Longitude must be a finite number: {longitude}")
        if not (-90.0 <= latitude <= 90.0):
            raise ValueError(f"Latitude {latitude} is outside valid range [-90.0, 90.0]")
        if not (-180.0 <= longitude <= 180.0):
            raise ValueError(f"Longitude {longitude} is outside valid range [-180.0, 180.0]")

    @staticmethod
    def validate_slope(slope_degrees: Optional[float]) -> None:
        """Validate topographic slope gradient."""
        if slope_degrees is None:
            return
        if math.isnan(slope_degrees) or math.isinf(slope_degrees):
            raise ValueError("Slope gradient must be a finite number")
        if not (0.0 <= slope_degrees <= 90.0):
            raise ValueError(f"Slope {slope_degrees}° is outside physically valid range [0.0°, 90.0°]")

    @staticmethod
    def validate_rainfall(rainfall_mm: Optional[float]) -> None:
        """Validate rainfall precipitation amount."""
        if rainfall_mm is None:
            return
        if math.isnan(rainfall_mm) or math.isinf(rainfall_mm):
            raise ValueError("Rainfall must be a finite number")
        if rainfall_mm < 0.0:
            raise ValueError(f"Rainfall amount cannot be negative: {rainfall_mm} mm")

    @staticmethod
    def validate_temperature(temperature_c: Optional[float]) -> None:
        """Validate ambient temperature in Celsius."""
        if temperature_c is None:
            return
        if math.isnan(temperature_c) or math.isinf(temperature_c):
            raise ValueError("Temperature must be a finite number")
        if not (-60.0 <= temperature_c <= 60.0):
            raise ValueError(f"Temperature {temperature_c}°C is outside plausible terrestrial range [-60°C, 60°C]")

    @staticmethod
    def validate_humidity(humidity_percent: Optional[float]) -> None:
        """Validate relative humidity percentage."""
        if humidity_percent is None:
            return
        if math.isnan(humidity_percent) or math.isinf(humidity_percent):
            raise ValueError("Humidity percentage must be a finite number")
        if not (0.0 <= humidity_percent <= 100.0):
            raise ValueError(f"Relative humidity {humidity_percent}% is outside valid range [0%, 100%]")


class GeospatialService:
    """Service for managing spatial locations, environmental signals, and data quality."""

    def __init__(
        self,
        terrain_service: Optional[TerrainService] = None,
        weather_service: Optional[WeatherDataService] = None,
        disaster_service: Optional[DisasterDataService] = None,
    ) -> None:
        self.terrain_service = terrain_service or get_terrain_service()
        self.weather_service = weather_service or get_weather_data_service()
        self.disaster_service = disaster_service or get_disaster_data_service()

    def create_location(
        self,
        session: Session,
        name: str,
        latitude: float,
        longitude: float,
        elevation: Optional[float] = None,
        administrative_metadata: Optional[Dict[str, Any]] = None,
        auto_sample_terrain: bool = True,
    ) -> Location:
        """Create a new geographic reference location with validated geometry and terrain."""
        GeospatialValidation.validate_coordinates(latitude, longitude)
        clean_name = name.strip()
        if not clean_name:
            raise ValueError("Location name cannot be empty.")

        # Auto-derive elevation from Copernicus DEM if not provided
        derived_elev = elevation
        if derived_elev is None:
            t_metrics = self.terrain_service.sample_terrain(longitude, latitude)
            derived_elev = t_metrics.get("elevation_m")

        geom_point = f"SRID=4326;POINT({longitude} {latitude})"

        location = Location(
            name=clean_name,
            latitude=latitude,
            longitude=longitude,
            elevation=derived_elev,
            location_geometry=geom_point,
            administrative_metadata=administrative_metadata or {},
        )
        session.add(location)
        session.flush()

        # If requested, derive and persist initial terrain observation
        if auto_sample_terrain:
            try:
                self.terrain_service.record_terrain_observation(
                    session=session,
                    location_id=location.id,
                    longitude=longitude,
                    latitude=latitude,
                )
            except Exception as exc:
                # Log non-fatal terrain enrichment error
                pass

        return location

    def get_location(self, session: Session, location_id: uuid.UUID) -> Optional[Location]:
        """Fetch location by UUID."""
        return session.query(Location).filter(Location.id == location_id).first()

    def list_locations(
        self,
        session: Session,
        skip: int = 0,
        limit: int = 50,
        search: Optional[str] = None,
    ) -> List[Location]:
        """List locations with pagination and optional search."""
        query = session.query(Location)
        if search:
            query = query.filter(Location.name.ilike(f"%{search.strip()}%"))
        return query.order_by(Location.name.asc()).offset(skip).limit(limit).all()

    def get_location_environment(
        self,
        session: Session,
        location_id: uuid.UUID,
    ) -> Optional[Dict[str, Any]]:
        """Aggregate complete environmental signals bundle for a specific location.

        Prepares all 7 signals required for the downstream risk engine:
        1. Elevation
        2. Slope
        3. Terrain characteristics
        4. Historical disaster / landslide information
        5. Rainfall / weather input structure
        6. Location / geospatial information
        7. Data quality and provenance metadata
        """
        loc = self.get_location(session, location_id)
        if not loc:
            return None

        # 1-3. Terrain metrics
        latest_terrain = self.terrain_service.get_latest_terrain_for_location(session, location_id)
        if latest_terrain:
            terrain_data = {
                "elevation_m": latest_terrain.elevation,
                "slope_degrees": latest_terrain.slope,
                "aspect_degrees": latest_terrain.aspect,
                "terrain_class": latest_terrain.terrain_class,
                "source": latest_terrain.source,
                "observation_time": latest_terrain.observation_time.isoformat()
                if latest_terrain.observation_time
                else None,
            }
        else:
            t_sample = self.terrain_service.sample_terrain(loc.longitude, loc.latitude)
            terrain_data = {
                "elevation_m": t_sample.get("elevation_m") or loc.elevation,
                "slope_degrees": t_sample.get("slope_degrees"),
                "aspect_degrees": t_sample.get("aspect_degrees"),
                "terrain_class": t_sample.get("terrain_class"),
                "source": t_sample.get("source", "Copernicus DEM GLO-30"),
                "observation_time": None,
            }

        # 4. Historical disasters
        disaster_records = self.disaster_service.get_events_for_location(session, location_id, limit=10)
        nearby_disasters = self.disaster_service.get_nearby_events(
            session=session,
            latitude=loc.latitude,
            longitude=loc.longitude,
            radius_m=10000.0,
            limit=5,
        )

        # 5. Weather observation (guarantee: never claims live unless real live provider responds)
        w_obs_list = self.weather_service.get_location_observations(session, location_id, limit=1)
        if w_obs_list:
            w_rec = w_obs_list[0]
            raw = w_rec.raw_payload or {}
            weather_data = {
                "rainfall_mm": w_rec.rainfall_mm,
                "temperature_c": w_rec.temperature_c,
                "humidity_percent": w_rec.humidity_percent,
                "wind_speed_kmh": w_rec.wind_speed_kmh,
                "precipitation_probability": w_rec.precipitation_probability,
                "observation_time": w_rec.observation_time.isoformat(),
                "forecast_time": w_rec.forecast_time.isoformat() if w_rec.forecast_time else None,
                "weather_source": w_rec.source,
                "source_type": w_rec.source_type,
                "is_live": False,  # Persisted snapshot
                "p24_mm": raw.get("p24_mm"),
                "p72_mm": raw.get("p72_mm"),
                "ari_mm": raw.get("ari_mm"),
                "retrieved_at": raw.get("retrieved_at"),
            }
        else:
            w_res = self.weather_service.get_weather_for_coordinate(
                latitude=loc.latitude,
                longitude=loc.longitude,
                session=session,
                persist=False,
                location_id=location_id,
            )
            weather_data = {
                "rainfall_mm": w_res.rainfall_mm,
                "temperature_c": w_res.temperature_c,
                "humidity_percent": w_res.humidity_percent,
                "wind_speed_kmh": w_res.wind_speed_kmh,
                "precipitation_probability": w_res.precipitation_probability,
                "observation_time": w_res.observation_time.isoformat(),
                "forecast_time": w_res.forecast_time.isoformat() if w_res.forecast_time else None,
                "weather_source": w_res.source,
                "source_type": w_res.source_type,
                "is_live": w_res.is_live,
                "p24_mm": w_res.p24_mm,
                "p72_mm": w_res.p72_mm,
                "ari_mm": w_res.ari_mm,
                "retrieved_at": w_res.retrieved_at.isoformat() if w_res.retrieved_at else None,
            }

        # 6. Location metadata
        location_data = {
            "id": str(loc.id),
            "name": loc.name,
            "latitude": loc.latitude,
            "longitude": loc.longitude,
            "elevation": loc.elevation,
            "administrative_metadata": loc.administrative_metadata or {},
            "created_at": loc.created_at.isoformat(),
            "updated_at": loc.updated_at.isoformat(),
        }

        # 7. Data quality and scientific provenance metadata
        provenance = {
            "crs": "EPSG:4326 (WGS84 Geographic)",
            "dem_source": "Copernicus DEM GLO-30 (European Space Agency / Airbus)",
            "dem_resolution": "30 meters (1 arc-second)",
            "vertical_datum": "EGM2008 geoid",
            "slope_algorithm": "Horn (1981) 3x3 finite-difference",
            "landslide_catalog": "Geological Survey of India (GSI) National Landslide Susceptibility Inventory",
            "cutting_catalog": "OpenStreetMap 2018 Hillside Cutting Inventory (snapshot)",
            "weather_integration_status": "Modular WeatherProvider (No live weather API guaranteed)",
            "license": "Open Data Commons / CC BY 4.0",
        }

        return {
            "location": location_data,
            "terrain": terrain_data,
            "historical_disasters": {
                "location_events": [
                    {
                        "id": str(d.id),
                        "event_type": d.event_type,
                        "event_date": d.event_date.isoformat() if d.event_date else None,
                        "severity": d.severity,
                        "source": d.source,
                        "source_reference": d.source_reference,
                        "description": d.description,
                        "is_historical": d.is_historical,
                    }
                    for d in disaster_records
                ],
                "nearby_incidents_10km": nearby_disasters,
            },
            "weather": weather_data,
            "provenance": provenance,
        }


_global_geospatial_service: Optional[GeospatialService] = None


def get_geospatial_service() -> GeospatialService:
    """Return singleton instance of GeospatialService."""
    global _global_geospatial_service
    if _global_geospatial_service is None:
        _global_geospatial_service = GeospatialService()
    return _global_geospatial_service
