"""Repository implementations for saved routes and 250m road segments."""

from typing import List, Optional
import uuid

from geoalchemy2.shape import from_shape, to_shape
from shapely.geometry import LineString, Point
from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.app.db.repositories.base import BaseRepository
from backend.app.models.route import RouteSegment, SavedRoute


class RouteRepository(BaseRepository[SavedRoute]):
    """Data access repository for SavedRoute entities."""

    def __init__(self, session: Session) -> None:
        super().__init__(SavedRoute, session)

    def get_by_id(self, route_id: uuid.UUID) -> Optional[SavedRoute]:
        """Retrieve a saved route by UUID."""
        return super().get_by_id(route_id)

    def list_by_user(self, user_id: uuid.UUID, limit: int = 50) -> List[SavedRoute]:
        """Fetch all routes saved by a given user."""
        stmt = select(SavedRoute).where(SavedRoute.user_id == user_id).limit(limit)
        return list(self.session.scalars(stmt).all())

    def create_route(
        self,
        origin_lat: float,
        origin_lon: float,
        destination_lat: float,
        destination_lon: float,
        name: Optional[str] = None,
        origin_name: Optional[str] = None,
        destination_name: Optional[str] = None,
        distance_km: Optional[float] = None,
        risk_score: Optional[float] = None,
        risk_tier: Optional[str] = None,
        analysis_status: Optional[str] = "COMPLETE",
        route_coords_wgs84: Optional[List[tuple[float, float]]] = None,
        user_id: Optional[uuid.UUID] = None,
        provider: str = "OSRM",
    ) -> SavedRoute:
        """Create and stage a new SavedRoute record."""
        route_geom = None
        if route_coords_wgs84 and len(route_coords_wgs84) >= 2:
            ls = LineString([(lon, lat) for lon, lat in route_coords_wgs84])
            route_geom = from_shape(ls, srid=4326)

        route = SavedRoute(
            user_id=user_id,
            name=name,
            origin_name=origin_name,
            destination_name=destination_name,
            origin_lat=origin_lat,
            origin_lon=origin_lon,
            destination_lat=destination_lat,
            destination_lon=destination_lon,
            distance_km=distance_km,
            risk_score=risk_score,
            risk_tier=risk_tier,
            analysis_status=analysis_status,
            route_geometry=route_geom,
            provider=provider,
        )
        return self.add(route)


class RouteSegmentRepository(BaseRepository[RouteSegment]):
    """Data access repository for discrete 250m road segment features."""

    def __init__(self, session: Session) -> None:
        super().__init__(RouteSegment, session)

    def get_by_segment_id(self, segment_id: str) -> Optional[RouteSegment]:
        """Fetch a segment by its business segment identifier (e.g. 'seg_001')."""
        stmt = select(RouteSegment).where(RouteSegment.segment_id == segment_id)
        return self.session.scalars(stmt).first()

    def list_by_route_id(self, route_id: uuid.UUID) -> List[RouteSegment]:
        """Fetch all segments belonging to a given route, ordered by segment_index."""
        stmt = (
            select(RouteSegment)
            .where(RouteSegment.route_id == route_id)
            .order_by(RouteSegment.segment_index)
        )
        return list(self.session.scalars(stmt).all())

    def create_segment(
        self,
        route_id: uuid.UUID,
        segment_index: int,
        segment_id: str,
        start_chainage_m: float,
        end_chainage_m: float,
        length_m: float,
        midpoint_lon_lat: tuple[float, float],
        coords_wgs84: List[tuple[float, float]],
        bearing_deg: Optional[float] = None,
        risk_score: Optional[float] = None,
        risk_tier: Optional[str] = None,
        analysis_status: Optional[str] = "COMPLETE",
    ) -> RouteSegment:
        """Create and stage a new RouteSegment with PostGIS Point and LineString geometries."""
        pt = Point(midpoint_lon_lat[0], midpoint_lon_lat[1])
        ls = LineString([(lon, lat) for lon, lat in coords_wgs84])

        seg = RouteSegment(
            route_id=route_id,
            segment_index=segment_index,
            segment_id=segment_id,
            start_chainage_m=start_chainage_m,
            end_chainage_m=end_chainage_m,
            length_m=length_m,
            bearing_deg=bearing_deg,
            midpoint=from_shape(pt, srid=4326),
            geometry=from_shape(ls, srid=4326),
            risk_score=risk_score,
            risk_tier=risk_tier,
            analysis_status=analysis_status,
        )
        return self.add(seg)
