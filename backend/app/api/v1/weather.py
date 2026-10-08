"""Weather telemetry and corridor meteorological summary API endpoints."""

from datetime import datetime, timezone
import math
from typing import Dict, List, Optional
from fastapi import APIRouter, Query

from backend.app.core.config import settings
from backend.app.schemas.common import AlertLevel
from backend.app.schemas.weather import CorridorWeatherSummaryResponse, WeatherMonitoringNode
from backend.app.services.weather_service import get_weather_service

router = APIRouter(tags=["Weather Telemetry"])

# Standard monitoring telemetry stations across key Uttarakhand corridors
CORRIDOR_MONITORING_NODES: Dict[str, List[Dict[str, float | str]]] = {
    "NH7": [
        {"node_name": "Rishikesh", "latitude": 30.1033, "longitude": 78.2947},
        {"node_name": "Devprayag", "latitude": 30.1459, "longitude": 78.5986},
        {"node_name": "Rudraprayag", "latitude": 30.2858, "longitude": 78.9810},
        {"node_name": "Pipalkoti", "latitude": 30.4285, "longitude": 79.4290},
        {"node_name": "Joshimath", "latitude": 30.5526, "longitude": 79.5684},
    ],
    "NH-7": [
        {"node_name": "Rishikesh", "latitude": 30.1033, "longitude": 78.2947},
        {"node_name": "Devprayag", "latitude": 30.1459, "longitude": 78.5986},
        {"node_name": "Rudraprayag", "latitude": 30.2858, "longitude": 78.9810},
        {"node_name": "Pipalkoti", "latitude": 30.4285, "longitude": 79.4290},
        {"node_name": "Joshimath", "latitude": 30.5526, "longitude": 79.5684},
    ],
    "NH109": [
        {"node_name": "Rudraprayag", "latitude": 30.2858, "longitude": 78.9810},
        {"node_name": "Augustmuni", "latitude": 30.3932, "longitude": 79.0264},
        {"node_name": "Guptkashi", "latitude": 30.5228, "longitude": 79.0777},
        {"node_name": "Sonprayag", "latitude": 30.6300, "longitude": 78.9900},
    ],
    "NH34": [
        {"node_name": "Rishikesh", "latitude": 30.1033, "longitude": 78.2947},
        {"node_name": "Chamba", "latitude": 30.3444, "longitude": 78.3970},
        {"node_name": "Uttarkashi", "latitude": 30.7268, "longitude": 78.4354},
    ],
}


def _determine_alert_level(p24: float | None) -> AlertLevel:
    """Categorize rainfall intensity into regional IMD-aligned hazard levels."""
    if p24 is None:
        return AlertLevel.UNKNOWN
    if p24 >= 75.0:
        return AlertLevel.RED
    if p24 >= 50.0:
        return AlertLevel.ORANGE
    if p24 >= 25.0:
        return AlertLevel.YELLOW
    return AlertLevel.GREEN


ALERT_LEVEL_PRIORITY = {
    AlertLevel.UNKNOWN: 0,
    AlertLevel.GREEN: 1,
    AlertLevel.YELLOW: 2,
    AlertLevel.ORANGE: 3,
    AlertLevel.RED: 4,
}


@router.get(
    "/weather/corridor-summary",
    response_model=CorridorWeatherSummaryResponse,
    summary="Corridor Meteorological Summary",
    description="Supplies current 24h/72h rainfall, active alerts, and antecedent moisture across corridor monitoring nodes.",
)
def get_corridor_weather_summary(
    corridor: str = Query(
        default="NH7",
        description="Corridor identifier (e.g. NH7, NH-7, NH109, NH34).",
    ),
) -> CorridorWeatherSummaryResponse:
    """Fetch current precipitation observations along highway monitoring stations."""
    weather_svc = get_weather_service()
    clean_key = corridor.strip().upper().replace(" ", "")

    # Look up predefined nodes or fallback to generic NH-7 stations
    node_configs = CORRIDOR_MONITORING_NODES.get(clean_key)
    if not node_configs:
        # Check partial match
        for k, v in CORRIDOR_MONITORING_NODES.items():
            if k in clean_key or clean_key in k:
                node_configs = v
                break
    if not node_configs:
        node_configs = CORRIDOR_MONITORING_NODES["NH7"]

    nodes: List[WeatherMonitoringNode] = []
    p24_values: List[float] = []
    p72_values: List[float] = []

    for nc in node_configs:
        name = str(nc["node_name"])
        lat = float(nc["latitude"])
        lon = float(nc["longitude"])

        query_res = weather_svc.query_weather(longitude=lon, latitude=lat)
        if query_res.is_available and query_res.features is not None:
            p24 = query_res.features.p24_mm
            p72 = query_res.features.p72_mm
            node_rain = round(p24, 2)
            alert = _determine_alert_level(p24)
            p24_values.append(p24)
            p72_values.append(p72)
        else:
            node_rain = None
            alert = AlertLevel.UNKNOWN

        nodes.append(
            WeatherMonitoringNode(
                node_name=name,
                latitude=lat,
                longitude=lon,
                rain_24h_mm=node_rain,
                status=alert,
            )
        )

    valid_alerts = [n.status for n in nodes if n.status != AlertLevel.UNKNOWN]
    if valid_alerts:
        highest_alert = max(valid_alerts, key=lambda a: ALERT_LEVEL_PRIORITY[a])
    else:
        highest_alert = AlertLevel.UNKNOWN

    if not p24_values:
        weather_status = "unavailable"
    elif len(p24_values) < len(node_configs):
        weather_status = "degraded"
    else:
        weather_status = "available"

    avg_p24 = round(sum(p24_values) / len(p24_values), 2) if p24_values else None
    max_p24 = round(max(p24_values), 2) if p24_values else None
    avg_p72 = round(sum(p72_values) / len(p72_values), 2) if p72_values else None

    return CorridorWeatherSummaryResponse(
        corridor=f"{corridor} Corridor",
        data_mode=weather_svc.data_mode,
        last_updated=datetime.now(timezone.utc).isoformat(),
        average_rainfall_24h_mm=avg_p24,
        max_rainfall_24h_mm=max_p24,
        average_rainfall_72h_mm=avg_p72,
        active_alert_level=highest_alert,
        weather_status=weather_status,
        monitoring_nodes=nodes,
    )
