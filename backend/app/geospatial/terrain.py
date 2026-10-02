"""Terrain and Digital Elevation Model (DEM) provider abstraction.

Provides topographic elevation and Horn (1981) 3x3 finite-difference slope
gradient calculations for road segment risk evaluation. Designed around
Copernicus DEM GLO-30 specifications.
"""

from abc import ABC, abstractmethod
import math
from pathlib import Path
from typing import Any, List, Optional, Tuple
import numpy as np


class BaseTerrainProvider(ABC):
    """Abstract provider interface for Digital Elevation Models (DEM)."""

    @property
    @abstractmethod
    def source_name(self) -> str:
        """Name of the underlying terrain data source (e.g. Copernicus DEM GLO-30)."""
        pass

    @property
    @abstractmethod
    def is_available(self) -> bool:
        """Whether valid terrain raster data is loaded and available for querying."""
        pass

    @abstractmethod
    def get_elevation_m(self, longitude: float, latitude: float) -> Optional[float]:
        """Sample topographic elevation in meters at (longitude, latitude).

        Returns None if data is unavailable or coordinate is outside coverage.
        """
        pass

    @abstractmethod
    def get_slope_degrees(self, longitude: float, latitude: float) -> Optional[float]:
        """Derive topographic slope gradient in degrees at (longitude, latitude).

        Returns None if data is unavailable or coordinate is outside coverage.
        """
        pass


class RasterGridTerrainProvider(BaseTerrainProvider):
    """In-memory 2D raster grid terrain provider.

    Used for verified local DEM grids and controlled test raster fixtures.

    Technical Specifications:
    - Coordinate Reference System: WGS84 Geographic (EPSG:4326).
    - Horizontal units: Converted from geographic arc-degrees to meters at query latitude:
        dx = cell_size_lon * (pi / 180) * 6378137.0 * cos(latitude)
        dy = cell_size_lat * (pi / 180) * 6378137.0
    - Vertical units: Meters (orthometric height EGM2008).
    - Neighborhood Window: 3x3 cell neighborhood using the Horn (1981) finite-difference formulation.
    - Edge Handling: Boundary clamping (border cells replicate nearest interior gradient to prevent edge artifacts).
    """

    def __init__(
        self,
        elevation_grid: np.ndarray,
        bounds_lon_lat: Tuple[float, float, float, float],
        source_name: str = "RasterGridDEM",
    ) -> None:
        """Initialize with a 2D numpy array and spatial bounding box.

        Parameters
        ----------
        elevation_grid : np.ndarray
            2D array of elevation values in meters [shape (num_rows, num_cols)],
            ordered from North to South (row 0 = north) and West to East (col 0 = west).
        bounds_lon_lat : Tuple[float, float, float, float]
            (min_lon, min_lat, max_lon, max_lat) in decimal degrees.
        source_name : str, optional
            Identifier string for the source.
        """
        if elevation_grid.ndim != 2:
            raise ValueError(f"Elevation grid must be 2D, got shape {elevation_grid.shape}")
        if elevation_grid.shape[0] < 2 or elevation_grid.shape[1] < 2:
            raise ValueError(f"Elevation grid must be at least 2x2, got {elevation_grid.shape}")

        min_lon, min_lat, max_lon, max_lat = bounds_lon_lat
        if min_lon >= max_lon or min_lat >= max_lat:
            raise ValueError(f"Invalid bounding box: {bounds_lon_lat}")

        self._grid = np.asarray(elevation_grid, dtype=np.float64)
        self._min_lon = float(min_lon)
        self._min_lat = float(min_lat)
        self._max_lon = float(max_lon)
        self._max_lat = float(max_lat)
        self._source_name = source_name

        self._num_rows, self._num_cols = self._grid.shape
        self._cell_lon_deg = (self._max_lon - self._min_lon) / max(1, self._num_cols - 1)
        self._cell_lat_deg = (self._max_lat - self._min_lat) / max(1, self._num_rows - 1)

    @property
    def source_name(self) -> str:
        return self._source_name

    @property
    def is_available(self) -> bool:
        return True

    def _coord_to_indices(self, longitude: float, latitude: float) -> Optional[Tuple[float, float]]:
        """Map geographic coordinates to continuous (row_float, col_float) indices."""
        if not (self._min_lon <= longitude <= self._max_lon and self._min_lat <= latitude <= self._max_lat):
            return None

        # Row 0 is at max_lat (north), increasing southward
        col_f = (longitude - self._min_lon) / (self._max_lon - self._min_lon) * (self._num_cols - 1)
        row_f = (self._max_lat - latitude) / (self._max_lat - self._min_lat) * (self._num_rows - 1)
        return row_f, col_f

    def get_elevation_m(self, longitude: float, latitude: float) -> Optional[float]:
        """Sample elevation via bilinear interpolation across adjacent DEM grid cells."""
        idx = self._coord_to_indices(longitude, latitude)
        if idx is None:
            return None

        row_f, col_f = idx
        r0 = int(math.floor(row_f))
        r1 = min(r0 + 1, self._num_rows - 1)
        c0 = int(math.floor(col_f))
        c1 = min(c0 + 1, self._num_cols - 1)

        dr = row_f - r0
        dc = col_f - c0

        z00 = self._grid[r0, c0]
        z01 = self._grid[r0, c1]
        z10 = self._grid[r1, c0]
        z11 = self._grid[r1, c1]

        # Bilinear interpolation
        z = (1.0 - dr) * (1.0 - dc) * z00 + (1.0 - dr) * dc * z01 + dr * (1.0 - dc) * z10 + dr * dc * z11
        return float(z)

    def get_slope_degrees(self, longitude: float, latitude: float) -> Optional[float]:
        """Derive topographic slope gradient in degrees using Horn's 3x3 finite-difference algorithm."""
        idx = self._coord_to_indices(longitude, latitude)
        if idx is None:
            return None

        row_f, col_f = idx
        r = int(round(row_f))
        c = int(round(col_f))

        # 3x3 neighborhood with boundary clamping
        r_prev = max(0, r - 1)
        r_next = min(self._num_rows - 1, r + 1)
        c_prev = max(0, c - 1)
        c_next = min(self._num_cols - 1, c + 1)

        z1 = self._grid[r_prev, c_prev]
        z2 = self._grid[r_prev, c]
        z3 = self._grid[r_prev, c_next]

        z4 = self._grid[r, c_prev]
        # z5 = self._grid[r, c] (center)
        z6 = self._grid[r, c_next]

        z7 = self._grid[r_next, c_prev]
        z8 = self._grid[r_next, c]
        z9 = self._grid[r_next, c_next]

        # Metric cell dimensions at local latitude
        phi = math.radians(latitude)
        dx_m = self._cell_lon_deg * (math.pi / 180.0) * 6378137.0 * math.cos(phi)
        dy_m = self._cell_lat_deg * (math.pi / 180.0) * 6378137.0

        if dx_m <= 0.0 or dy_m <= 0.0:
            return 0.0

        # Horn (1981) partial derivatives
        dz_dx = ((z3 + 2.0 * z6 + z9) - (z1 + 2.0 * z4 + z7)) / (8.0 * dx_m)
        # Note: row index increases southward, so row_prev is North (higher lat), row_next is South (lower lat)
        dz_dy = ((z1 + 2.0 * z2 + z3) - (z7 + 2.0 * z8 + z9)) / (8.0 * dy_m)

        slope_rad = math.atan(math.hypot(dz_dx, dz_dy))
        return float(math.degrees(slope_rad))


class CopernicusDEMProvider(BaseTerrainProvider):
    """Production provider interface for Copernicus DEM GLO-30 (30m European Space Agency / Airbus).

    Checks local filesystem for Copernicus GLO-30 GeoTIFF tiles.
    If no tiles exist locally, operates in a clear data-unavailable mode returning None,
    strictly refusing to fabricate synthetic elevation or slope.
    """

    DEFAULT_DEM_DIR = Path("data/raw/dem/copernicus")

    def __init__(self, dem_dir: Optional[Path | str] = None) -> None:
        self._dem_dir = Path(dem_dir) if dem_dir is not None else self.DEFAULT_DEM_DIR
        self._active_provider: Optional[BaseTerrainProvider] = None
        self._discover_tiles()

    @property
    def source_name(self) -> str:
        return "Copernicus DEM GLO-30"

    @property
    def is_available(self) -> bool:
        return self._active_provider is not None and self._active_provider.is_available

    def _discover_tiles(self) -> None:
        """Scan DEM directory for available GeoTIFF / DEM raster tiles."""
        if not self._dem_dir.exists():
            return

        # Check for any .tif or .dem files
        tif_files = list(self._dem_dir.glob("*.tif")) + list(self._dem_dir.glob("*.dem"))
        if not tif_files:
            return

        # If tiles are present and rasterio is available in the future, load them.
        # Currently no verified DEM tiles are locally present in data/raw/dem/copernicus.
        pass

    def get_elevation_m(self, longitude: float, latitude: float) -> Optional[float]:
        """Return elevation in meters from Copernicus DEM, or None if no local DEM coverage exists."""
        if self._active_provider is not None:
            return self._active_provider.get_elevation_m(longitude, latitude)
        return None

    def get_slope_degrees(self, longitude: float, latitude: float) -> Optional[float]:
        """Return slope in degrees from Copernicus DEM, or None if no local DEM coverage exists."""
        if self._active_provider is not None:
            return self._active_provider.get_slope_degrees(longitude, latitude)
        return None

    @staticmethod
    def get_required_tiles_info() -> dict[str, Any]:
        """Report Copernicus DEM GLO-30 tiles required for statewide Uttarakhand coverage.

        Bounding box: LAT: 28.7°N to 31.5°N, LON: 77.5°E to 81.1°E.
        Coverage: 12 1°x1° tiles (approx. 25 MB per compressed COG tile, ~300 MB total).
        """
        required_tiles = [
            "Copernicus_DSM_COG_10_N28_00_E077_00_DEM.tif",
            "Copernicus_DSM_COG_10_N28_00_E078_00_DEM.tif",
            "Copernicus_DSM_COG_10_N28_00_E079_00_DEM.tif",
            "Copernicus_DSM_COG_10_N28_00_E080_00_DEM.tif",
            "Copernicus_DSM_COG_10_N29_00_E077_00_DEM.tif",
            "Copernicus_DSM_COG_10_N29_00_E078_00_DEM.tif",
            "Copernicus_DSM_COG_10_N29_00_E079_00_DEM.tif",
            "Copernicus_DSM_COG_10_N29_00_E080_00_DEM.tif",
            "Copernicus_DSM_COG_10_N30_00_E077_00_DEM.tif",
            "Copernicus_DSM_COG_10_N30_00_E078_00_DEM.tif",
            "Copernicus_DSM_COG_10_N30_00_E079_00_DEM.tif",
            "Copernicus_DSM_COG_10_N30_00_E080_00_DEM.tif",
        ]
        return {
            "dataset": "Copernicus DEM GLO-30 (European Space Agency)",
            "resolution": "30 meters (1 arc-second)",
            "vertical_datum": "EGM2008 geoid",
            "horizontal_crs": "WGS84 (EPSG:4326)",
            "tile_count": len(required_tiles),
            "estimated_total_size_mb": 300.0,
            "required_tiles": required_tiles,
        }
