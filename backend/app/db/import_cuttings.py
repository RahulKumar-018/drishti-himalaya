"""Idempotent importer for the 2 verified historical 2018 OpenStreetMap road cutting features."""

import argparse
import json
import logging
from pathlib import Path
import sys
from typing import Any, Dict, List

# Ensure workspace root is in sys.path
root_dir = Path(__file__).resolve().parents[3]
if str(root_dir) not in sys.path:
    sys.path.insert(0, str(root_dir))

from backend.app.core.database import db_manager
from backend.app.db.repositories.historical_repository import CuttingRepository
from backend.app.models.historical import RoadCutting

logger = logging.getLogger(__name__)

DEFAULT_CUTTINGS_PATH = (
    Path(__file__).resolve().parents[1]
    / "data"
    / "uttarakhand_cuttings_2018.json"
)


def import_osm_cuttings(
    json_path: Path = DEFAULT_CUTTINGS_PATH,
    dry_run: bool = False,
) -> Dict[str, int]:
    """Parse and insert historical 2018 OSM road cutting features idempotently.

    Preserves exact provenance (source='OpenStreetMap', snapshot_year=2018, is_historical=True).
    """
    if not json_path.exists():
        raise FileNotFoundError(f"OSM cuttings file not found at: {json_path.resolve()}")

    with open(json_path, "r", encoding="utf-8") as f:
        features = json.load(f)

    total_found = len(features)
    print(f"Loaded {total_found} features from {json_path.name}")

    valid_cuttings: List[Dict[str, Any]] = []

    for feat in features:
        way_id = int(feat["id"])
        tags = feat.get("tags", {})
        raw_coords = feat.get("coordinates", [])

        if len(raw_coords) < 2:
            continue

        coords_wgs84: List[tuple[float, float]] = []
        for c in raw_coords:
            lon, lat = float(c[0]), float(c[1])
            coords_wgs84.append((lon, lat))

        valid_cuttings.append(
            {
                "osm_way_id": way_id,
                "snapshot_year": 2018,
                "source": "OpenStreetMap",
                "coords": coords_wgs84,
                "tags": tags,
                "is_historical": True,
            }
        )

    if dry_run:
        print(f"DRY RUN: Validated {len(valid_cuttings)} cutting features.")
        return {"total_found": total_found, "valid": len(valid_cuttings), "inserted": 0}

    inserted = 0
    with db_manager.session() as session:
        repo = CuttingRepository(session)
        for item in valid_cuttings:
            existing = repo.get_by_way_id(item["osm_way_id"], snapshot_year=item["snapshot_year"])
            if existing is None:
                repo.create_cutting(
                    osm_way_id=item["osm_way_id"],
                    coords_wgs84=item["coords"],
                    source=item["source"],
                    snapshot_year=item["snapshot_year"],
                    tags=item["tags"],
                    is_historical=True,
                )
                inserted += 1
                print(f"Inserted OSM way {item['osm_way_id']} (2018 snapshot).")
            else:
                print(f"OSM way {item['osm_way_id']} already exists in database; skipping.")

    return {
        "total_found": total_found,
        "valid": len(valid_cuttings),
        "inserted": inserted,
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Import 2018 historical OSM cuttings into PostGIS.")
    parser.add_argument("--dry-run", action="store_true", help="Validate without committing to database.")
    parser.add_argument("--path", type=str, default=str(DEFAULT_CUTTINGS_PATH), help="Path to JSON.")
    args = parser.parse_args()

    res = import_osm_cuttings(Path(args.path), dry_run=args.dry_run)
    print("Import Summary:", res)
