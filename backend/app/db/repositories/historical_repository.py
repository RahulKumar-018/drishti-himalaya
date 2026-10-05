"""Repository implementations for historical GSI landslides and 2018 OSM road cuttings."""

from datetime import date
from typing import Any, Dict, List, Optional
import uuid

from geoalchemy2.shape import from_shape
from shapely.geometry import LineString, Point
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from backend.app.db.repositories.base import BaseRepository
from backend.app.models.historical import LandslideRecord, RoadCutting


class LandslideRepository(BaseRepository[LandslideRecord]):
    """Data access repository for Geological Survey of India historical landslide records."""

    def __init__(self, session: Session) -> None:
        super().__init__(LandslideRecord, session)

    def count(self) -> int:
        """Return total count of historical landslide points."""
        stmt = select(func.count(LandslideRecord.id))
        return self.session.scalar(stmt) or 0

    def get_by_source_id(self, source: str, source_record_id: str) -> Optional[LandslideRecord]:
        """Fetch a specific landslide by its agency source record ID."""
        stmt = (
            select(LandslideRecord)
            .where(
                LandslideRecord.source == source,
                LandslideRecord.source_record_id == source_record_id,
            )
        )
        return self.session.scalars(stmt).first()

    def create_record(
        self,
        latitude: float,
        longitude: float,
        source: str = "GSI",
        source_record_id: Optional[str] = None,
        event_date: Optional[date] = None,
        is_historical: bool = True,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> LandslideRecord:
        """Create and stage a single historical landslide record."""
        pt = Point(longitude, latitude)
        rec = LandslideRecord(
            source=source,
            source_record_id=source_record_id,
            latitude=latitude,
            longitude=longitude,
            location_geometry=from_shape(pt, srid=4326),
            event_date=event_date,
            is_historical=is_historical,
            extra_metadata=metadata,
        )
        return self.add(rec)

    def bulk_create_records(
        self,
        records: List[Dict[str, Any]],
        batch_size: int = 500,
    ) -> int:
        """Batch insert normalized landslide records idempotently."""
        inserted_count = 0
        for i in range(0, len(records), batch_size):
            batch = records[i : i + batch_size]
            entities: List[LandslideRecord] = []
            for r in batch:
                pt = Point(r["longitude"], r["latitude"])
                entities.append(
                    LandslideRecord(
                        source=r.get("source", "GSI"),
                        source_record_id=r.get("source_record_id"),
                        latitude=r["latitude"],
                        longitude=r["longitude"],
                        location_geometry=from_shape(pt, srid=4326),
                        event_date=r.get("event_date"),
                        is_historical=r.get("is_historical", True),
                        extra_metadata=r.get("metadata"),
                    )
                )
            self.session.add_all(entities)
            self.session.flush()
            inserted_count += len(entities)
        return inserted_count


class CuttingRepository(BaseRepository[RoadCutting]):
    """Data access repository for 2018 historical OpenStreetMap road cuttings."""

    def __init__(self, session: Session) -> None:
        super().__init__(RoadCutting, session)

    def count(self) -> int:
        """Return total count of historical road cuttings."""
        stmt = select(func.count(RoadCutting.id))
        return self.session.scalar(stmt) or 0

    def get_by_way_id(self, osm_way_id: int, snapshot_year: int = 2018) -> Optional[RoadCutting]:
        """Fetch cutting by OSM way ID and snapshot year."""
        stmt = (
            select(RoadCutting)
            .where(
                RoadCutting.osm_way_id == osm_way_id,
                RoadCutting.snapshot_year == snapshot_year,
            )
        )
        return self.session.scalars(stmt).first()

    def list_all(self, limit: int = 100, offset: int = 0) -> List[RoadCutting]:
        """Fetch all historical cutting features."""
        stmt = select(RoadCutting).limit(limit).offset(offset)
        return list(self.session.scalars(stmt).all())

    def create_cutting(
        self,
        osm_way_id: int,
        coords_wgs84: List[tuple[float, float]],
        source: str = "OpenStreetMap",
        snapshot_year: int = 2018,
        tags: Optional[Dict[str, Any]] = None,
        is_historical: bool = True,
    ) -> RoadCutting:
        """Create and stage a single historical road cutting feature."""
        ls = LineString([(lon, lat) for lon, lat in coords_wgs84])
        cutting = RoadCutting(
            osm_way_id=osm_way_id,
            source=source,
            snapshot_year=snapshot_year,
            geometry=from_shape(ls, srid=4326),
            tags=tags,
            is_historical=is_historical,
        )
        return self.add(cutting)
