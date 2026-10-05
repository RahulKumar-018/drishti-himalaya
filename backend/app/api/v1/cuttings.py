"""Historical OSM road-cutting data API."""

import json
from pathlib import Path

from fastapi import APIRouter

router = APIRouter(tags=["Historical OSM"])

DATA_FILE = (
    Path(__file__).resolve().parents[2]
    / "data"
    / "uttarakhand_cuttings_2018.json"
)


@router.get(
    "/hazard/cuttings",
    summary="Historical Uttarakhand Road Cuttings",
)
def get_historical_cuttings():
    """Return road-cutting features extracted from the 2018 OSM snapshot."""

    if not DATA_FILE.exists():
        return {
            "count": 0,
            "features": [],
            "error": "Historical cutting dataset not found",
        }

    with DATA_FILE.open("r", encoding="utf-8") as f:
        features = json.load(f)

    return {
        "count": len(features),
        "year": 2018,
        "source": "OpenStreetMap historical snapshot",
        "features": features,
    }
