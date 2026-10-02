"""Route segmentation engine.

Disaggregates continuous road LineStrings into approximately 250-meter
discrete segments for localized geotechnical hazard and MCDA risk evaluation.
Independent of specific corridors, routes, or administrative boundaries.
"""

import math
from typing import Any, Sequence, Tuple, Union
from shapely.geometry import LineString
from shapely.ops import substring

from backend.app.core.config import settings
from backend.app.geospatial.projection import batch_wgs84_to_utm44n, utm44n_to_wgs84
from backend.app.routing.models import RouteSegment, SegmentedRouteResult, segments_to_geojson


def segment_route_linestring(
    coordinates: Sequence[Union[Tuple[float, float], Sequence[float]]],
    segment_length_m: float | None = None,
) -> SegmentedRouteResult:
    """Disaggregate a WGS84 road LineString into discrete segments of approximately segment_length_m.

    Parameters
    ----------
    coordinates : Sequence[Union[Tuple[float, float], Sequence[float]]]
        Sequence of (longitude, latitude) pairs in WGS84 decimal degrees defining the road geometry.
        Must contain at least 2 points.
    segment_length_m : float | None, optional
        Target segment length in meters. If None, defaults to settings.SEGMENT_LENGTH_M (250.0 m).
        Must be strictly positive.

    Returns
    -------
    SegmentedRouteResult
        Structured segmentation result containing individual RouteSegment instances with
        cumulative chainage, geometric midpoints, and contiguous geometry.

    Raises
    ------
    ValueError
        If coordinates are empty, fewer than 2 points, contain non-finite or out-of-range values,
        if total route length is zero, or if segment_length_m <= 0.
    """
    if coordinates is None:
        raise ValueError("Route coordinates cannot be None.")

    # Extract coordinates if passed as Shapely geometry or iterable
    if hasattr(coordinates, "coords"):
        raw_coords = list(coordinates.coords)
    elif isinstance(coordinates, (list, tuple)):
        raw_coords = list(coordinates)
    else:
        raise ValueError("Route coordinates must be a sequence of (lon, lat) pairs or a LineString.")

    if len(raw_coords) < 2:
        raise ValueError(
            f"Route coordinates must contain at least 2 points to form a LineString, got {len(raw_coords)}."
        )

    # Validate coordinate values
    clean_coords: list[tuple[float, float]] = []
    for idx, pt in enumerate(raw_coords):
        if not isinstance(pt, (list, tuple)) or len(pt) < 2:
            raise ValueError(f"Coordinate at index {idx} must have at least 2 elements (lon, lat), got {pt}.")
        lon = float(pt[0])
        lat = float(pt[1])
        if not (math.isfinite(lon) and math.isfinite(lat)):
            raise ValueError(
                f"Coordinate at index {idx} contains non-finite numbers: lon={lon}, lat={lat}."
            )
        if not (-180.0 <= lon <= 180.0):
            raise ValueError(f"Longitude at index {idx} out of valid range [-180, 180]: {lon}.")
        if not (-90.0 <= lat <= 90.0):
            raise ValueError(f"Latitude at index {idx} out of valid range [-90, 90]: {lat}.")
        clean_coords.append((lon, lat))

    # Validate segment length
    target_step = segment_length_m if segment_length_m is not None else settings.SEGMENT_LENGTH_M
    if not math.isfinite(target_step) or target_step <= 0.0:
        raise ValueError(f"segment_length_m must be a positive finite number, got {target_step}.")

    # Project to metric coordinates (UTM Zone 44N, EPSG:32644)
    metric_coords = batch_wgs84_to_utm44n(clean_coords)
    metric_line = LineString(metric_coords)
    total_length_m = float(metric_line.length)

    if total_length_m <= 0.0:
        raise ValueError("Route total length must be greater than zero.")

    # Generate cutting distance intervals [start_m, end_m]
    cut_intervals: list[tuple[float, float]] = []
    curr_m = 0.0
    # Stop condition avoids tiny epsilon remainders (e.g. 1e-7 m) from creating microscopic dummy segments
    while curr_m + target_step < total_length_m - 1e-6:
        cut_intervals.append((curr_m, curr_m + target_step))
        curr_m += target_step
    # Final segment captures the remainder to the exact total length
    cut_intervals.append((curr_m, total_length_m))

    segments: list[RouteSegment] = []
    num_intervals = len(cut_intervals)

    for seg_idx, (start_m, end_m) in enumerate(cut_intervals):
        # Extract sub-linestring using Shapely substring
        sub = substring(metric_line, start_m, end_m)
        if sub.is_empty:
            continue

        # Extract metric coordinates of substring
        sub_metric_coords = list(sub.coords)
        if len(sub_metric_coords) < 2:
            continue

        # Transform metric coordinates back to WGS84
        wgs84_coords = [utm44n_to_wgs84(x, y) for x, y in sub_metric_coords]

        # Enforce exact endpoint preservation and strict inter-segment contiguity:
        # 1. First segment starts at the exact input origin
        if seg_idx == 0:
            wgs84_coords[0] = (clean_coords[0][0], clean_coords[0][1])
        else:
            # Segment i starts exactly where segment i-1 ended
            wgs84_coords[0] = segments[seg_idx - 1].end_coord

        # 2. Final segment ends at the exact input destination
        if seg_idx == num_intervals - 1:
            wgs84_coords[-1] = (clean_coords[-1][0], clean_coords[-1][1])

        # Compute geometric midpoint halfway along the metric substring curve
        midpoint_pt = sub.interpolate(sub.length / 2.0)
        midpoint_wgs84 = utm44n_to_wgs84(midpoint_pt.x, midpoint_pt.y)

        # Cumulative chainage in kilometers
        start_chainage_km = start_m / 1000.0
        end_chainage_km = end_m / 1000.0
        seg_length_m = float(sub.length)

        segment = RouteSegment(
            segment_index=seg_idx,
            start_chainage_km=start_chainage_km,
            end_chainage_km=end_chainage_km,
            segment_length_m=seg_length_m,
            start_coord=wgs84_coords[0],
            end_coord=wgs84_coords[-1],
            midpoint=midpoint_wgs84,
            geometry_coords=wgs84_coords,
        )
        segments.append(segment)

    return SegmentedRouteResult(
        total_length_m=total_length_m,
        segment_count=len(segments),
        segments=segments,
    )


__all__ = ["segment_route_linestring", "segments_to_geojson"]
