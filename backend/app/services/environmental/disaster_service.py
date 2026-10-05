"""Historical disaster event ingestion and spatial retrieval service for Drishti-Himalaya."""

from datetime import date, datetime, timezone
import math
from typing import Any, Dict, List, Optional
import uuid

from sqlalchemy import or_
from sqlalchemy.orm import Session

from backend.app.models.disaster import SUPPORTED_EVENT_TYPES, DisasterEvent
from backend.app.models.historical import LandslideRecord

EARTH_RADIUS_M = 6371000.0


def haversine_distance_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculate great-circle distance between two points in meters using Haversine formula."""
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)

    a = math.sin(dphi / 2.0) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2.0) ** 2
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))
    return EARTH_RADIUS_M * c


class DisasterDataService:
    """Service for multi-hazard disaster event records and historical catalogs."""

    def record_disaster_event(
        self,
        session: Session,
        event_type: str,
        latitude: float,
        longitude: float,
        source: str,
        source_reference: Optional[str] = None,
        location_id: Optional[uuid.UUID] = None,
        event_date: Optional[date] = None,
        severity: Optional[str] = None,
        description: Optional[str] = None,
        is_historical: bool = True,
        extra_metadata: Optional[Dict[str, Any]] = None,
    ) -> DisasterEvent:
        """Create and persist a validated disaster event record."""
        # Coordinate validation
        if not (-90.0 <= latitude <= 90.0):
            raise ValueError(f"Latitude out of range [-90, 90]: {latitude}")
        if not (-180.0 <= longitude <= 180.0):
            raise ValueError(f"Longitude out of range [-180, 180]: {longitude}")

        # Event type validation
        normalized_type = event_type.lower().strip()
        if normalized_type not in SUPPORTED_EVENT_TYPES:
            raise ValueError(
                f"Unsupported event_type '{event_type}'. Must be one of: {list(SUPPORTED_EVENT_TYPES)}"
            )

        geom_point = f"SRID=4326;POINT({longitude} {latitude})"

        event = DisasterEvent(
            location_id=location_id,
            event_type=normalized_type,
            event_date=event_date,
            severity=severity,
            source=source,
            source_reference=source_reference,
            description=description,
            latitude=latitude,
            longitude=longitude,
            location_geometry=geom_point,
            is_historical=is_historical,
            extra_metadata=extra_metadata or {},
        )
        session.add(event)
        session.flush()
        return event

    def get_events_for_location(
        self,
        session: Session,
        location_id: uuid.UUID,
        event_type: Optional[str] = None,
        limit: int = 50,
    ) -> List[DisasterEvent]:
        """Query disaster events associated with a location."""
        query = session.query(DisasterEvent).filter(DisasterEvent.location_id == location_id)
        if event_type:
            query = query.filter(DisasterEvent.event_type == event_type.lower())
        return query.order_by(DisasterEvent.event_date.desc().nullslast()).limit(limit).all()

    def get_nearby_events(
        self,
        session: Session,
        latitude: float,
        longitude: float,
        radius_m: float = 5000.0,
        limit: int = 50,
    ) -> List[Dict[str, Any]]:
        """Query recorded disaster events within radius_m using bounding box pre-filter and Haversine."""
        if not (-90.0 <= latitude <= 90.0) or not (-180.0 <= longitude <= 180.0):
            raise ValueError("Invalid coordinates for nearby disaster query.")

        # Degree bounding box pre-filter
        lat_delta = radius_m / 111320.0
        lon_delta = radius_m / (111320.0 * math.cos(math.radians(latitude)))

        candidates = (
            session.query(DisasterEvent)
            .filter(
                DisasterEvent.latitude.between(latitude - lat_delta, latitude + lat_delta),
                DisasterEvent.longitude.between(longitude - lon_delta, longitude + lon_delta),
            )
            .limit(limit * 3)
            .all()
        )

        results: List[Dict[str, Any]] = []
        for ev in candidates:
            dist = haversine_distance_m(latitude, longitude, ev.latitude, ev.longitude)
            if dist <= radius_m:
                results.append(
                    {
                        "id": str(ev.id),
                        "event_type": ev.event_type,
                        "event_date": ev.event_date.isoformat() if ev.event_date else None,
                        "severity": ev.severity,
                        "source": ev.source,
                        "source_reference": ev.source_reference,
                        "description": ev.description,
                        "latitude": ev.latitude,
                        "longitude": ev.longitude,
                        "distance_m": round(dist, 1),
                        "is_historical": ev.is_historical,
                    }
                )

        results.sort(key=lambda x: x["distance_m"])
        return results[:limit]


_global_disaster_service: Optional[DisasterDataService] = None


def get_disaster_data_service() -> DisasterDataService:
    """Return singleton instance of DisasterDataService."""
    global _global_disaster_service
    if _global_disaster_service is None:
        _global_disaster_service = DisasterDataService()
    return _global_disaster_service
