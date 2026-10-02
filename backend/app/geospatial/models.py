"""Source-agnostic normalized landslide inventory models."""

from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Optional, Tuple

from backend.app.geospatial.projection import wgs84_to_utm44n


class LandslideSource(str, Enum):
    """Supported government landslide inventory source datasets."""

    GSI = "GSI"    # Geological Survey of India (National Landslide Susceptibility Mapping)
    NRSC = "NRSC"  # National Remote Sensing Centre / ISRO (Landslide Atlas of India)


@dataclass(frozen=True)
class NormalizedLandslideRecord:
    """Canonical internal representation of a historical landslide occurrence.

    Decouples raw source variations (GSI GeoJSON, future NRSC shapefiles/csvs)
    from downstream spatial indexing, KDTree lookups, and risk calculation.
    """

    source_dataset: LandslideSource
    longitude: float
    latitude: float
    original_id: Optional[str] = None
    slide_no: Optional[str] = None
    state: Optional[str] = None
    district: Optional[str] = None
    slide_name: Optional[str] = None
    triggering: Optional[str] = None
    movement_type: Optional[str] = None
    material_type: Optional[str] = None
    failure_mechanism: Optional[str] = None
    runout_distance_m: Optional[float] = None
    properties: dict[str, Any] = field(default_factory=dict)

    def to_metric_point(self) -> Tuple[float, float]:
        """Convert WGS84 coordinates to UTM Zone 44N (Easting, Northing) in meters."""
        return wgs84_to_utm44n(self.longitude, self.latitude)

    def to_geojson_feature(self) -> dict[str, Any]:
        """Serialize record into standard RFC 7946 GeoJSON Feature format."""
        props = dict(self.properties)
        props.update({
            "source_dataset": self.source_dataset.value,
            "original_id": self.original_id,
            "slide_no": self.slide_no,
            "state": self.state,
            "district": self.district,
            "slide_name": self.slide_name,
            "triggering": self.triggering,
            "movement_type": self.movement_type,
            "material_type": self.material_type,
            "failure_mechanism": self.failure_mechanism,
            "runout_distance_m": self.runout_distance_m,
        })
        return {
            "type": "Feature",
            "id": self.original_id or self.slide_no,
            "geometry": {
                "type": "Point",
                "coordinates": [self.longitude, self.latitude],
            },
            "properties": props,
        }
