"""Repository implementation for hazard alerts maintaining strict origin_type classification."""

from datetime import datetime
from typing import Any, Dict, List, Optional
import uuid

from geoalchemy2.shape import from_shape
from shapely.geometry import Point
from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.app.db.repositories.base import BaseRepository
from backend.app.models.alert import HazardAlert


class AlertRepository(BaseRepository[HazardAlert]):
    """Data access repository for HazardAlert records."""

    def __init__(self, session: Session) -> None:
        super().__init__(HazardAlert, session)

    def create_alert(
        self,
        alert_type: str,
        severity: str,
        title: str,
        message: str,
        source: str,
        origin_type: str,
        latitude: Optional[float] = None,
        longitude: Optional[float] = None,
        region: Optional[str] = "Uttarakhand",
        source_timestamp: Optional[datetime] = None,
        expires_at: Optional[datetime] = None,
        status: str = "ACTIVE",
        metadata: Optional[Dict[str, Any]] = None,
    ) -> HazardAlert:
        """Create and stage a new HazardAlert record with verified origin_type."""
        valid_origins = {"OBSERVED", "CALCULATED", "HISTORICAL"}
        if origin_type.upper() not in valid_origins:
            raise ValueError(f"origin_type must be one of {valid_origins}, got '{origin_type}'")

        geom = None
        if latitude is not None and longitude is not None:
            pt = Point(longitude, latitude)
            geom = from_shape(pt, srid=4326)

        alert = HazardAlert(
            alert_type=alert_type.upper(),
            severity=severity.upper(),
            title=title,
            message=message,
            latitude=latitude,
            longitude=longitude,
            location_geometry=geom,
            region=region,
            source=source,
            source_timestamp=source_timestamp,
            expires_at=expires_at,
            status=status.upper(),
            origin_type=origin_type.upper(),
            extra_metadata=metadata,
        )
        return self.add(alert)

    def list_active(
        self,
        severity: Optional[str] = None,
        origin_type: Optional[str] = None,
        limit: int = 50,
    ) -> List[HazardAlert]:
        """Fetch currently active alerts filtered optionally by severity or origin_type."""
        stmt = select(HazardAlert).where(HazardAlert.status == "ACTIVE")
        if severity:
            stmt = stmt.where(HazardAlert.severity == severity.upper())
        if origin_type:
            stmt = stmt.where(HazardAlert.origin_type == origin_type.upper())
        stmt = stmt.order_by(HazardAlert.created_at.desc()).limit(limit)
        return list(self.session.scalars(stmt).all())
