"""Topographic and geomorphological terrain processing service for Drishti-Himalaya."""

from datetime import datetime, timezone
import logging
from typing import Any, Dict, List, Optional
import uuid

from sqlalchemy.orm import Session

from backend.app.geospatial.terrain import (
    BaseTerrainProvider,
    CopernicusDEMProvider,
)
from backend.app.models.terrain import TerrainObservation

logger = logging.getLogger(__name__)


class TerrainService:
    """Service for topographic elevation, slope gradient, aspect, and terrain classification."""

    def __init__(self, provider: Optional[BaseTerrainProvider] = None) -> None:
        self.provider = provider or CopernicusDEMProvider()

    def set_provider(self, provider: BaseTerrainProvider) -> None:
        """Switch active terrain provider."""
        self.provider = provider

    def sample_terrain(
        self,
        longitude: float,
        latitude: float,
    ) -> Dict[str, Any]:
        """Sample elevation (m), slope (deg), aspect (deg), and terrain class for given coordinate."""
        if not (-90.0 <= latitude <= 90.0):
            raise ValueError(f"Latitude out of range [-90, 90]: {latitude}")
        if not (-180.0 <= longitude <= 180.0):
            raise ValueError(f"Longitude out of range [-180, 180]: {longitude}")

        metrics = self.provider.get_terrain_metrics(longitude, latitude)

        # Validate derived slope if available
        slope = metrics.get("slope_degrees")
        if slope is not None and not (0.0 <= slope <= 90.0):
            raise ValueError(f"Derived slope out of range [0, 90]: {slope}")

        # Validate aspect if available
        aspect = metrics.get("aspect_degrees")
        if aspect is not None and not (0.0 <= aspect <= 360.0):
            raise ValueError(f"Derived aspect out of range [0, 360]: {aspect}")

        return metrics

    def record_terrain_observation(
        self,
        session: Session,
        location_id: uuid.UUID,
        longitude: float,
        latitude: float,
        observation_time: Optional[datetime] = None,
    ) -> Optional[TerrainObservation]:
        """Derive terrain metrics and persist a TerrainObservation record linked to a Location."""
        metrics = self.sample_terrain(longitude, latitude)
        elev = metrics.get("elevation_m")
        slope = metrics.get("slope_degrees")

        if elev is None or slope is None:
            logger.warning(
                "Incomplete DEM coverage at (%f, %f); skipping persistent terrain observation.",
                longitude,
                latitude,
            )
            return None

        obs = TerrainObservation(
            location_id=location_id,
            elevation=float(elev),
            slope=float(slope),
            aspect=metrics.get("aspect_degrees"),
            terrain_class=metrics.get("terrain_class"),
            source=metrics.get("source", "Copernicus DEM GLO-30"),
            source_reference=f"EPSG:4326/Horn-1981",
            observation_time=observation_time or datetime.now(timezone.utc),
        )
        session.add(obs)
        session.flush()
        return obs

    def get_latest_terrain_for_location(
        self,
        session: Session,
        location_id: uuid.UUID,
    ) -> Optional[TerrainObservation]:
        """Fetch the most recent terrain observation for a given location."""
        return (
            session.query(TerrainObservation)
            .filter(TerrainObservation.location_id == location_id)
            .order_by(TerrainObservation.created_at.desc())
            .first()
        )


_global_terrain_service: Optional[TerrainService] = None


def get_terrain_service() -> TerrainService:
    """Return singleton instance of TerrainService."""
    global _global_terrain_service
    if _global_terrain_service is None:
        _global_terrain_service = TerrainService()
    return _global_terrain_service
