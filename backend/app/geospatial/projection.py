"""Geospatial coordinate projection layer for Uttarakhand.

Transforms geographic coordinates (EPSG:4326 WGS84, longitude/latitude in degrees)
into conformal metric coordinates (EPSG:32644 UTM Zone 44N, Easting/Northing in meters).

Scientific Rationale:
- Input CRS: EPSG:4326 (WGS84 2D, coordinates in decimal degrees).
- Projected CRS: EPSG:32644 (UTM Zone 44N, central meridian 81°E, k0=0.9996).
- Uttarakhand span: 77.5°E to 81.1°E, 28.7°N to 31.5°N (actual GSI catalog: 77.0°E to 80.7°E).
- Conformal mapping preserves local angles, with linear scale distortion bounded within <=0.15%
  statewide (0.007% in central Uttarakhand, 0.040% at eastern central meridian, 0.101% at western
  configured boundary 77.5°E, and 0.141% at extreme western catalog boundary 77.0°E).
  This guarantees that KDTree Euclidean distance queries (d_min) and 1 km radius density counts (N_scars)
  remain accurate to within <=1.4 meters per kilometer across the entire state.
- Axis Order: Explicitly expects (longitude, latitude) or (lon, lat) floats.
"""

import math
from typing import Sequence, Tuple, Union
import numpy as np


# WGS84 Ellipsoid Constants
WGS84_SEMI_MAJOR_A_M: float = 6378137.0
WGS84_FLATTENING_F: float = 1.0 / 298.257223563
_E2: float = 2.0 * WGS84_FLATTENING_F - WGS84_FLATTENING_F**2
_E_PRIME2: float = _E2 / (1.0 - _E2)

# UTM Zone 44N Parameters (EPSG:32644)
UTM44N_CENTRAL_MERIDIAN_DEG: float = 81.0  # 6 * 44 - 183
UTM44N_SCALE_FACTOR_K0: float = 0.9996
UTM44N_FALSE_EASTING_M: float = 500000.0
UTM44N_FALSE_NORTHING_M: float = 0.0


def wgs84_to_utm44n(longitude: float, latitude: float) -> Tuple[float, float]:
    """Transform single (longitude, latitude) in WGS84 degrees to (easting, northing) in meters.

    Parameters
    ----------
    longitude : float
        Longitude in decimal degrees (e.g. 78.2947 for Rishikesh).
    latitude : float
        Latitude in decimal degrees (e.g. 30.1033 for Rishikesh).

    Returns
    -------
    Tuple[float, float]
        (easting_m, northing_m) in UTM Zone 44N (EPSG:32644).
    """
    if not math.isfinite(longitude) or not math.isfinite(latitude):
        raise ValueError(f"Coordinates must be finite real numbers, got lon={longitude}, lat={latitude}")
    if not (-180.0 <= longitude <= 180.0):
        raise ValueError(f"Longitude must be in [-180, 180], got {longitude}")
    if not (-90.0 <= latitude <= 90.0):
        raise ValueError(f"Latitude must be in [-90, 90], got {latitude}")

    phi = math.radians(latitude)
    lam = math.radians(longitude)
    lam0 = math.radians(UTM44N_CENTRAL_MERIDIAN_DEG)
    d_lam = lam - lam0

    sin_phi = math.sin(phi)
    cos_phi = math.cos(phi)
    tan_phi = math.tan(phi)

    N = WGS84_SEMI_MAJOR_A_M / math.sqrt(1.0 - _E2 * sin_phi**2)
    T = tan_phi**2
    C = _E_PRIME2 * cos_phi**2
    A = cos_phi * d_lam

    # Meridian distance M along central meridian from equator
    M = WGS84_SEMI_MAJOR_A_M * (
        (1.0 - _E2 / 4.0 - 3.0 * _E2**2 / 64.0 - 5.0 * _E2**3 / 256.0) * phi
        - (3.0 * _E2 / 8.0 + 3.0 * _E2**2 / 32.0 + 45.0 * _E2**3 / 1024.0) * math.sin(2.0 * phi)
        + (15.0 * _E2**2 / 256.0 + 45.0 * _E2**3 / 1024.0) * math.sin(4.0 * phi)
        - (35.0 * _E2**3 / 3072.0) * math.sin(6.0 * phi)
    )

    x = UTM44N_FALSE_EASTING_M + UTM44N_SCALE_FACTOR_K0 * N * (
        A
        + (1.0 - T + C) * A**3 / 6.0
        + (5.0 - 18.0 * T + T**2 + 72.0 * C - 58.0 * _E_PRIME2) * A**5 / 120.0
    )
    y = UTM44N_FALSE_NORTHING_M + UTM44N_SCALE_FACTOR_K0 * (
        M
        + N
        * tan_phi
        * (
            A**2 / 2.0
            + (5.0 - T + 9.0 * C + 4.0 * C**2) * A**4 / 24.0
            + (61.0 - 58.0 * T + T**2 + 600.0 * C - 330.0 * _E_PRIME2) * A**6 / 720.0
        )
    )

    return float(x), float(y)


def batch_wgs84_to_utm44n(
    coords_lon_lat: Sequence[Tuple[float, float]],
) -> np.ndarray:
    """Transform an array of (longitude, latitude) pairs into an (N, 2) NumPy array of (easting, northing) meters.

    Parameters
    ----------
    coords_lon_lat : Sequence[Tuple[float, float]]
        Iterable of (lon, lat) tuples in decimal degrees.

    Returns
    -------
    np.ndarray
        Array of shape (N, 2) containing metric coordinates [Easting, Northing].
    """
    if len(coords_lon_lat) == 0:
        return np.empty((0, 2), dtype=np.float64)

    arr = np.empty((len(coords_lon_lat), 2), dtype=np.float64)
    for i, (lon, lat) in enumerate(coords_lon_lat):
        x, y = wgs84_to_utm44n(lon, lat)
        arr[i, 0] = x
        arr[i, 1] = y
    return arr


def utm44n_to_wgs84(easting: float, northing: float) -> Tuple[float, float]:
    """Transform metric (easting, northing) in UTM Zone 44N to (longitude, latitude) in WGS84 degrees.

    Parameters
    ----------
    easting : float
        Easting coordinate in meters.
    northing : float
        Northing coordinate in meters.

    Returns
    -------
    Tuple[float, float]
        (longitude, latitude) in decimal degrees.
    """
    if not math.isfinite(easting) or not math.isfinite(northing):
        raise ValueError(f"Metric coordinates must be finite real numbers, got easting={easting}, northing={northing}")

    a = WGS84_SEMI_MAJOR_A_M
    e2 = _E2
    e_prime2 = _E_PRIME2
    e1 = (1.0 - math.sqrt(1.0 - e2)) / (1.0 + math.sqrt(1.0 - e2))
    k0 = UTM44N_SCALE_FACTOR_K0
    lon0 = UTM44N_CENTRAL_MERIDIAN_DEG

    x = easting - UTM44N_FALSE_EASTING_M
    y = northing - UTM44N_FALSE_NORTHING_M
    M = y / k0

    mu = M / (a * (1.0 - e2 / 4.0 - 3.0 * e2**2 / 64.0 - 5.0 * e2**3 / 256.0))
    phi1 = mu + (
        (3.0 * e1 / 2.0 - 27.0 * e1**3 / 32.0) * math.sin(2.0 * mu)
        + (21.0 * e1**2 / 16.0 - 55.0 * e1**4 / 32.0) * math.sin(4.0 * mu)
        + (151.0 * e1**3 / 96.0) * math.sin(6.0 * mu)
        + (1097.0 * e1**4 / 512.0) * math.sin(8.0 * mu)
    )

    sin_phi1 = math.sin(phi1)
    cos_phi1 = math.cos(phi1)
    tan_phi1 = math.tan(phi1)

    N1 = a / math.sqrt(1.0 - e2 * sin_phi1**2)
    R1 = a * (1.0 - e2) / ((1.0 - e2 * sin_phi1**2)**1.5)
    D = x / (N1 * k0)
    T1 = tan_phi1**2
    C1 = e_prime2 * cos_phi1**2

    lat = phi1 - (N1 * tan_phi1 / R1) * (
        D**2 / 2.0
        - (5.0 + 3.0 * T1 + 10.0 * C1 - 4.0 * C1**2 - 9.0 * e_prime2) * D**4 / 24.0
        + (61.0 + 90.0 * T1 + 298.0 * C1 + 45.0 * T1**2 - 252.0 * e_prime2 - 3.0 * C1**2) * D**6 / 720.0
    )
    lon = math.radians(lon0) + (
        D
        - (1.0 + 2.0 * T1 + C1) * D**3 / 6.0
        + (5.0 - 2.0 * C1 + 28.0 * T1 - 3.0 * C1**2 + 8.0 * e_prime2 + 24.0 * T1**2) * D**5 / 120.0
    ) / cos_phi1

    return float(math.degrees(lon)), float(math.degrees(lat))


def batch_utm44n_to_wgs84(
    coords_metric: Sequence[Tuple[float, float]],
) -> list[Tuple[float, float]]:
    """Transform an array of metric (easting, northing) pairs into (longitude, latitude) WGS84 degrees."""
    return [utm44n_to_wgs84(e, n) for e, n in coords_metric]

