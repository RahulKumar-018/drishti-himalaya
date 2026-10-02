"""Data models for route segmentation, normalized route polylines, and discrete spatial intervals."""

from typing import Any, Iterator, List, Sequence, Tuple
from pydantic import BaseModel, ConfigDict, Field


class RouteSegment(BaseModel):
    """Discrete road segment representing an approximately 250m interval along a route.

    Preserves exact chainage, metric length, start/end vertices, and the geometrically
    interpolated midpoint for downstream hazard enrichment (slope, rainfall, landslide KDTree).
    """

    model_config = ConfigDict(frozen=True, extra="ignore")

    segment_index: int = Field(
        ...,
        ge=0,
        description="0-based sequential index along the route from origin to destination.",
    )
    start_chainage_km: float = Field(
        ...,
        ge=0.0,
        description="Cumulative distance from route start to segment start in kilometers.",
    )
    end_chainage_km: float = Field(
        ...,
        ge=0.0,
        description="Cumulative distance from route start to segment end in kilometers.",
    )
    segment_length_m: float = Field(
        ...,
        gt=0.0,
        description="Actual metric length of this segment in meters.",
    )
    start_coord: tuple[float, float] = Field(
        ...,
        description="Start coordinate (longitude, latitude) in WGS84 degrees.",
    )
    end_coord: tuple[float, float] = Field(
        ...,
        description="End coordinate (longitude, latitude) in WGS84 degrees.",
    )
    midpoint: tuple[float, float] = Field(
        ...,
        description="Geometrically interpolated midpoint (longitude, latitude) halfway along segment.",
    )
    geometry_coords: list[tuple[float, float]] = Field(
        ...,
        min_length=2,
        description="Ordered sequence of (longitude, latitude) coordinates defining segment LineString.",
    )

    @property
    def start_km(self) -> float:
        """Alias for start_chainage_km."""
        return self.start_chainage_km

    @property
    def end_km(self) -> float:
        """Alias for end_chainage_km."""
        return self.end_chainage_km

    def to_geojson_feature(self) -> dict[str, Any]:
        """Convert segment to a GeoJSON Feature dictionary."""
        return {
            "type": "Feature",
            "id": f"seg_{self.segment_index}",
            "properties": {
                "segment_index": self.segment_index,
                "segment_length_m": round(self.segment_length_m, 2),
                "start_km": round(self.start_chainage_km, 4),
                "end_km": round(self.end_chainage_km, 4),
                "start_chainage_km": round(self.start_chainage_km, 4),
                "end_chainage_km": round(self.end_chainage_km, 4),
                "midpoint": [self.midpoint[0], self.midpoint[1]],
            },
            "geometry": {
                "type": "LineString",
                "coordinates": [list(c) for c in self.geometry_coords],
            },
        }


class SegmentedRouteResult(BaseModel):
    """Container holding the complete segmentation output for a route."""

    model_config = ConfigDict(frozen=True, extra="ignore")

    total_length_m: float = Field(
        ...,
        gt=0.0,
        description="Total route length in meters.",
    )
    segment_count: int = Field(
        ...,
        ge=1,
        description="Total number of segments generated.",
    )
    segments: list[RouteSegment] = Field(
        ...,
        min_length=1,
        description="Ordered list of segmented route intervals.",
    )

    def __len__(self) -> int:
        return len(self.segments)

    def __getitem__(self, index: int) -> RouteSegment:
        return self.segments[index]

    def __iter__(self) -> Iterator[RouteSegment]:
        return iter(self.segments)

    def to_geojson_feature_collection(self) -> dict[str, Any]:
        """Convert all segments into a GeoJSON FeatureCollection dictionary."""
        return {
            "type": "FeatureCollection",
            "features": [seg.to_geojson_feature() for seg in self.segments],
        }

    def to_geojson(self) -> dict[str, Any]:
        """Convenience alias for to_geojson_feature_collection."""
        return self.to_geojson_feature_collection()


class NormalizedRoute(BaseModel):
    """Provider-independent normalized route alignment representation."""

    model_config = ConfigDict(frozen=True, extra="ignore")

    route_id: str = Field(
        ...,
        description="Unique route identifier (e.g. 'primary_route', 'alternative_route_1').",
    )
    geometry_coords: List[Tuple[float, float]] = Field(
        ...,
        min_length=2,
        description="Ordered sequence of (longitude, latitude) WGS84 coordinates along the road.",
    )
    total_distance_km: float = Field(
        ...,
        gt=0.0,
        description="Total route alignment distance in kilometers.",
    )
    estimated_time_minutes: float = Field(
        ...,
        gt=0.0,
        description="Estimated transit duration in minutes.",
    )
    provider: str = Field(
        ...,
        description="Source routing provider identifier (e.g. 'OPENROUTESERVICE' or 'DEMO_FIXTURE').",
    )
    profile: str = Field(
        default="driving-car",
        description="Routing traversal profile (e.g. 'driving-car').",
    )
    summary: str = Field(
        default="",
        description="Human-readable corridor route description or road designation.",
    )
    metadata: dict[str, Any] = Field(
        default_factory=dict,
        description="Raw provider attributes, elevation flags, or segment summaries.",
    )


class RouteWithSegments(BaseModel):
    """Aggregated container pairing a NormalizedRoute with its Phase-5 SegmentedRouteResult."""

    model_config = ConfigDict(frozen=True, extra="ignore")

    route: NormalizedRoute
    segmented_route: SegmentedRouteResult


def segments_to_geojson(segments: Sequence[RouteSegment]) -> dict[str, Any]:
    """Helper function to transform an arbitrary sequence of RouteSegments into a GeoJSON FeatureCollection."""
    return {
        "type": "FeatureCollection",
        "features": [seg.to_geojson_feature() for seg in segments],
    }
