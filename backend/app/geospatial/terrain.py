"""Terrain and Digital Elevation Model (DEM) provider abstraction.

Provides topographic elevation and Horn (1981) 3x3 finite-difference slope
gradient calculations for road segment risk evaluation. Designed around
Copernicus DEM GLO-30 specifications.
"""

from abc import ABC, abstractmethod
import logging
import math
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple
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


logger = logging.getLogger(__name__)

try:
    import rasterio
    from rasterio.windows import Window
    HAS_RASTERIO = True
except ImportError:
    HAS_RASTERIO = False


class CopernicusTileMetadata:
    """Metadata describing a single Copernicus GLO-30 DEM GeoTIFF tile."""

    def __init__(
        self,
        file_path: Path,
        bounds: Tuple[float, float, float, float],
        res_lon_deg: float,
        res_lat_deg: float,
        width: int,
        height: int,
        nodata: Optional[float],
        crs: str,
    ) -> None:
        self.file_path = file_path
        self.bounds = bounds  # (min_lon, min_lat, max_lon, max_lat)
        self.res_lon_deg = res_lon_deg
        self.res_lat_deg = res_lat_deg
        self.width = width
        self.height = height
        self.nodata = nodata
        self.crs = crs

    def __repr__(self) -> str:
        return f"<CopernicusTileMetadata {self.file_path.name} bounds={self.bounds}>"


class CopernicusDEMProvider(BaseTerrainProvider):
    """Production provider interface for Copernicus DEM GLO-30 (30m European Space Agency / Airbus).

    Automatically discovers, indexes, and queries multi-tile local Copernicus GLO-30 GeoTIFFs.
    If no tiles exist locally or a coordinate falls outside local coverage, operates in a clear
    data-unavailable mode returning None, strictly refusing to fabricate synthetic elevation or slope.
    """

    DEFAULT_DEM_DIR = Path("data/raw/dem/copernicus_glo30")
    FALLBACK_DEM_DIR = Path("data/raw/dem/copernicus")

    def __init__(self, dem_dir: Optional[Path | str] = None) -> None:
        if dem_dir is not None:
            self._dem_dir = Path(dem_dir)
        else:
            try:
                from backend.app.core.config import settings
                configured_dir = Path(settings.DEM_DIRECTORY)
                if configured_dir.exists():
                    self._dem_dir = configured_dir
                elif self.DEFAULT_DEM_DIR.exists():
                    self._dem_dir = self.DEFAULT_DEM_DIR
                else:
                    self._dem_dir = self.FALLBACK_DEM_DIR
            except Exception:
                if self.DEFAULT_DEM_DIR.exists():
                    self._dem_dir = self.DEFAULT_DEM_DIR
                else:
                    self._dem_dir = self.FALLBACK_DEM_DIR

        self._tiles: List[CopernicusTileMetadata] = []
        self._dataset_cache: Dict[Path, Any] = {}
        self._discover_tiles()

    @property
    def source_name(self) -> str:
        return "Copernicus DEM GLO-30"

    @property
    def is_available(self) -> bool:
        return len(self._tiles) > 0

    @property
    def tiles(self) -> List[CopernicusTileMetadata]:
        return list(self._tiles)

    @property
    def tile_count(self) -> int:
        return len(self._tiles)

    def _discover_tiles(self) -> None:
        """Scan DEM directory recursively for available GeoTIFF raster tiles."""
        if not HAS_RASTERIO:
            logger.warning("rasterio library is not available. DEM provider cannot load GeoTIFFs.")
            return

        if not self._dem_dir.exists():
            return

        # Search recursively for Copernicus *_DEM.tif or any .tif/.dem rasters
        candidate_files = sorted(list(self._dem_dir.rglob("*_DEM.tif")))
        if not candidate_files:
            candidate_files = sorted(
                list(self._dem_dir.rglob("*.tif")) + list(self._dem_dir.rglob("*.dem"))
            )

        for f in candidate_files:
            try:
                with rasterio.open(f) as ds:
                    b = ds.bounds
                    res_x, res_y = ds.res
                    meta = CopernicusTileMetadata(
                        file_path=f,
                        bounds=(float(b.left), float(b.bottom), float(b.right), float(b.top)),
                        res_lon_deg=float(res_x),
                        res_lat_deg=float(res_y),
                        width=int(ds.width),
                        height=int(ds.height),
                        nodata=float(ds.nodata) if ds.nodata is not None else None,
                        crs=str(ds.crs),
                    )
                    self._tiles.append(meta)
            except Exception as exc:
                logger.warning("Could not index DEM raster file %s: %s", f, exc)

    def find_tile(self, longitude: float, latitude: float) -> Optional[CopernicusTileMetadata]:
        """Locate the Copernicus DEM tile covering the given WGS84 coordinates."""
        matching: List[CopernicusTileMetadata] = []
        for t in self._tiles:
            min_lon, min_lat, max_lon, max_lat = t.bounds
            if min_lon <= longitude <= max_lon and min_lat <= latitude <= max_lat:
                matching.append(t)

        if not matching:
            return None

        if len(matching) == 1:
            return matching[0]

        # In case of shared boundary edge between adjacent tiles,
        # prefer tile where index falls strictly within [0, width) and [0, height)
        for t in matching:
            try:
                ds = self._get_dataset(t.file_path)
                row, col = ds.index(longitude, latitude)
                if 0 <= col < t.width and 0 <= row < t.height:
                    return t
            except Exception:
                pass

        return matching[0]

    def _get_dataset(self, file_path: Path):
        """Retrieve or open a cached rasterio dataset reader."""
        if file_path in self._dataset_cache:
            ds = self._dataset_cache[file_path]
            if not ds.closed:
                return ds

        ds = rasterio.open(file_path)
        self._dataset_cache[file_path] = ds
        return ds

    def get_elevation_m(self, longitude: float, latitude: float) -> Optional[float]:
        """Return elevation in meters from Copernicus DEM, or None if no local DEM coverage exists."""
        if not self.is_available:
            return None

        tile = self.find_tile(longitude, latitude)
        if tile is None:
            return None

        try:
            ds = self._get_dataset(tile.file_path)
            row, col = ds.index(longitude, latitude)
            if not (0 <= row < tile.height and 0 <= col < tile.width):
                return None

            val = ds.read(1, window=Window(col, row, 1, 1))[0, 0]
            if tile.nodata is not None and val == tile.nodata:
                return None
            if np.isnan(val) or val <= -9999.0:
                return None

            return float(val)
        except Exception as exc:
            logger.warning("Error reading DEM elevation at (%f, %f): %s", longitude, latitude, exc)
            return None

    def get_slope_degrees(self, longitude: float, latitude: float) -> Optional[float]:
        """Derive topographic slope gradient in degrees using Horn's 3x3 finite-difference algorithm.

        The ground cell dimensions are computed in meters at the local query latitude:
            dx_m = res_lon_deg * (pi / 180.0) * 6378137.0 * cos(latitude)
            dy_m = res_lat_deg * (pi / 180.0) * 6378137.0

        Returns None if outside DEM coverage, or if any cell in the 3x3 window is nodata.
        """
        if not self.is_available:
            return None

        tile = self.find_tile(longitude, latitude)
        if tile is None:
            return None

        try:
            ds = self._get_dataset(tile.file_path)
            row, col = ds.index(longitude, latitude)
            if not (0 <= row < tile.height and 0 <= col < tile.width):
                return None

            # Fast path: strictly interior 3x3 window within the containing tile
            if 1 <= col < tile.width - 1 and 1 <= row < tile.height - 1:
                window_data = ds.read(1, window=Window(col - 1, row - 1, 3, 3))
            else:
                # Border cell: assemble 3x3 by sampling neighbors (including adjacent tiles)
                window_data = np.zeros((3, 3), dtype=np.float64)
                for dr in (-1, 0, 1):
                    for dc in (-1, 0, 1):
                        r_t = row + dr
                        c_t = col + dc
                        if 0 <= c_t < tile.width and 0 <= r_t < tile.height:
                            cell_v = ds.read(1, window=Window(c_t, r_t, 1, 1))[0, 0]
                        else:
                            # Outside this tile: compute geographic coordinate of neighbor
                            n_lon, n_lat = ds.xy(r_t, c_t)
                            elev_opt = self.get_elevation_m(n_lon, n_lat)
                            if elev_opt is None:
                                return None
                            cell_v = elev_opt

                        if tile.nodata is not None and cell_v == tile.nodata:
                            return None
                        if np.isnan(cell_v) or cell_v <= -9999.0:
                            return None

                        window_data[dr + 1, dc + 1] = cell_v

            # Check nodata / nan across 3x3
            if tile.nodata is not None and np.any(window_data == tile.nodata):
                return None
            if np.any(np.isnan(window_data)) or np.any(window_data <= -9999.0):
                return None

            # 3x3 neighborhood:
            # z1 z2 z3
            # z4 z5 z6
            # z7 z8 z9
            z1, z2, z3 = window_data[0, 0], window_data[0, 1], window_data[0, 2]
            z4, z5, z6 = window_data[1, 0], window_data[1, 1], window_data[1, 2]
            z7, z8, z9 = window_data[2, 0], window_data[2, 1], window_data[2, 2]

            phi = math.radians(latitude)
            dx_m = tile.res_lon_deg * (math.pi / 180.0) * 6378137.0 * math.cos(phi)
            dy_m = tile.res_lat_deg * (math.pi / 180.0) * 6378137.0

            if dx_m <= 0.0 or dy_m <= 0.0:
                return 0.0

            # Horn (1981) partial derivatives
            dz_dx = ((z3 + 2.0 * z6 + z9) - (z1 + 2.0 * z4 + z7)) / (8.0 * dx_m)
            # Row index increases southward (North to South)
            dz_dy = ((z1 + 2.0 * z2 + z3) - (z7 + 2.0 * z8 + z9)) / (8.0 * dy_m)

            slope_rad = math.atan(math.hypot(dz_dx, dz_dy))
            return float(math.degrees(slope_rad))
        except Exception as exc:
            logger.warning("Error computing DEM slope at (%f, %f): %s", longitude, latitude, exc)
            return None

    def close(self) -> None:
        """Close all cached dataset readers."""
        for ds in self._dataset_cache.values():
            try:
                if not ds.closed:
                    ds.close()
            except Exception:
                pass
        self._dataset_cache.clear()

    def __enter__(self) -> "CopernicusDEMProvider":
        return self

    def __exit__(self, exc_type, exc_val, exc_tb) -> None:
        self.close()

    def __del__(self) -> None:
        self.close()

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
