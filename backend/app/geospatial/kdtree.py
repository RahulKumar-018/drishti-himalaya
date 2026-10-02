"""Spatial KD-Tree indexing service using SciPy.

Builds a metric 2D spatial index over historical landslide failure coordinates,
enabling microsecond nearest-scar distance queries (d_min) and 1 km radius density counts (N_scars)
in true metric distance (meters) via UTM Zone 44N projection.
"""

import math
from typing import List, Optional, Sequence, Tuple
import numpy as np
from scipy.spatial import KDTree

from backend.app.geospatial.models import NormalizedLandslideRecord
from backend.app.geospatial.projection import batch_wgs84_to_utm44n, wgs84_to_utm44n


class SpatialLandslideIndex:
    """In-memory 2D spatial KD-Tree index over projected metric landslide locations."""

    def __init__(self) -> None:
        self._tree: Optional[KDTree] = None
        self._records: List[NormalizedLandslideRecord] = []
        self._coords_metric: Optional[np.ndarray] = None

    @property
    def is_built(self) -> bool:
        """True if the spatial index contains data and is ready for queries."""
        return self._tree is not None and len(self._records) > 0

    @property
    def size(self) -> int:
        """Total number of indexed landslide records."""
        return len(self._records)

    def build_index(self, records: Sequence[NormalizedLandslideRecord]) -> None:
        """Construct the KD-Tree index from a sequence of normalized records.

        Parameters
        ----------
        records : Sequence[NormalizedLandslideRecord]
            Historical landslide locations in WGS84 coordinates.
        """
        self._records = list(records)
        if not self._records:
            self._tree = None
            self._coords_metric = None
            return

        lon_lat_list = [(rec.longitude, rec.latitude) for rec in self._records]
        self._coords_metric = batch_wgs84_to_utm44n(lon_lat_list)
        self._tree = KDTree(self._coords_metric)

    def nearest_distance_m(self, longitude: float, latitude: float) -> float:
        """Find Euclidean distance in meters from given WGS84 point to nearest historical scar.

        Parameters
        ----------
        longitude : float
            Query longitude in decimal degrees.
        latitude : float
            Query latitude in decimal degrees.

        Returns
        -------
        float
            Distance in meters. Returns infinity if index is empty.
        """
        if not math.isfinite(longitude) or not math.isfinite(latitude):
            raise ValueError(f"Query coordinates must be finite real numbers, got lon={longitude}, lat={latitude}")
        if self._tree is None or len(self._records) == 0:
            return float("inf")

        qx, qy = wgs84_to_utm44n(longitude, latitude)
        dist, _ = self._tree.query([qx, qy], k=1)
        return float(dist)

    def count_within_radius_m(
        self,
        longitude: float,
        latitude: float,
        radius_m: float = 1000.0,
    ) -> int:
        """Count historical scars within specified metric radius circle.

        Parameters
        ----------
        longitude : float
            Query longitude in decimal degrees.
        latitude : float
            Query latitude in decimal degrees.
        radius_m : float, default 1000.0
            Search radius in meters.

        Returns
        -------
        int
            Number of failure scars within radius. Returns 0 if index is empty.
        """
        if not math.isfinite(longitude) or not math.isfinite(latitude):
            raise ValueError(f"Query coordinates must be finite, got lon={longitude}, lat={latitude}")
        if not math.isfinite(radius_m) or radius_m < 0.0:
            raise ValueError(f"Search radius must be non-negative and finite, got {radius_m}")
        if self._tree is None or len(self._records) == 0:
            return 0

        qx, qy = wgs84_to_utm44n(longitude, latitude)
        indices = self._tree.query_ball_point([qx, qy], r=radius_m)
        return len(indices)

    def query_nearest(
        self,
        longitude: float,
        latitude: float,
    ) -> Tuple[float, Optional[NormalizedLandslideRecord]]:
        """Return nearest distance in meters and the corresponding landslide record."""
        if not math.isfinite(longitude) or not math.isfinite(latitude):
            raise ValueError(f"Query coordinates must be finite, got lon={longitude}, lat={latitude}")
        if self._tree is None or len(self._records) == 0:
            return float("inf"), None

        qx, qy = wgs84_to_utm44n(longitude, latitude)
        dist, idx = self._tree.query([qx, qy], k=1)
        record = self._records[int(idx)] if 0 <= idx < len(self._records) else None
        return float(dist), record

    def query_radius(
        self,
        longitude: float,
        latitude: float,
        radius_m: float = 1000.0,
    ) -> List[NormalizedLandslideRecord]:
        """Return all historical records within specified metric radius circle."""
        if not math.isfinite(longitude) or not math.isfinite(latitude):
            raise ValueError(f"Query coordinates must be finite, got lon={longitude}, lat={latitude}")
        if not math.isfinite(radius_m) or radius_m < 0.0:
            raise ValueError(f"Search radius must be non-negative, got {radius_m}")
        if self._tree is None or len(self._records) == 0:
            return []

        qx, qy = wgs84_to_utm44n(longitude, latitude)
        indices = self._tree.query_ball_point([qx, qy], r=radius_m)
        return [self._records[i] for i in indices]
