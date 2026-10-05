"""Idempotent batch importer for the 5,206 Geological Survey of India historical landslide records."""

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
from backend.app.db.repositories.historical_repository import LandslideRepository
from backend.app.models.historical import LandslideRecord

logger = logging.getLogger(__name__)

DEFAULT_GSI_PROCESSED_PATH = Path("data/processed/landslide_inventory_uttarakhand.geojson")


def import_gsi_landslides(
    geojson_path: Path = DEFAULT_GSI_PROCESSED_PATH,
    batch_size: int = 500,
    dry_run: bool = False,
) -> Dict[str, int]:
    """Parse and batch-insert GSI historical landslide points idempotently.

    Preserves exact provenance (source='GSI', is_historical=True).
    """
    if not geojson_path.exists():
        raise FileNotFoundError(f"GSI inventory file not found at: {geojson_path.resolve()}")

    with open(geojson_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    features = data.get("features", [])
    total_found = len(features)
    print(f"Loaded {total_found} features from {geojson_path.name}")

    normalized: List[Dict[str, Any]] = []
    skipped_invalid = 0

    for idx, feat in enumerate(features):
        geom = feat.get("geometry", {})
        coords = geom.get("coordinates", [])
        if len(coords) < 2:
            skipped_invalid += 1
            continue

        lon, lat = float(coords[0]), float(coords[1])
        if not (-180.0 <= lon <= 180.0 and -90.0 <= lat <= 90.0):
            skipped_invalid += 1
            continue

        props = feat.get("properties", {}) or {}
        slide_no = str(props.get("SLIDE_NO") or f"GSI_UK_{idx:05d}")

        normalized.append(
            {
                "source": "GSI",
                "source_record_id": slide_no,
                "latitude": lat,
                "longitude": lon,
                "is_historical": True,
                "metadata": {
                    "state": props.get("STATE", "UTTARAKHAND"),
                    "slide_no": slide_no,
                    "original_properties": props,
                },
            }
        )

    if dry_run:
        print(f"DRY RUN: Validated {len(normalized)} records. Skipped {skipped_invalid} invalid.")
        return {"total_found": total_found, "valid": len(normalized), "inserted": 0, "skipped": skipped_invalid}

    # Connect and insert in batches
    inserted = 0
    with db_manager.session() as session:
        repo = LandslideRepository(session)
        # Check existing count
        existing_count = repo.count()
        print(f"Current landslides in database: {existing_count}")

        if existing_count > 0:
            print("Existing records detected; checking for duplicates...")
            to_insert: List[Dict[str, Any]] = []
            for item in normalized:
                existing = repo.get_by_source_id(item["source"], item["source_record_id"])
                if existing is None:
                    to_insert.append(item)
            inserted = repo.bulk_create_records(to_insert, batch_size=batch_size)
            print(f"Inserted {inserted} new records ({len(normalized) - len(to_insert)} already existed).")
        else:
            inserted = repo.bulk_create_records(normalized, batch_size=batch_size)
            print(f"Inserted {inserted} GSI landslide records.")

    return {
        "total_found": total_found,
        "valid": len(normalized),
        "inserted": inserted,
        "skipped": skipped_invalid,
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Import GSI historical landslide inventory into PostGIS.")
    parser.add_argument("--dry-run", action="store_true", help="Validate without committing to database.")
    parser.add_argument("--batch-size", type=int, default=500, help="Batch size for inserts.")
    parser.add_argument("--path", type=str, default=str(DEFAULT_GSI_PROCESSED_PATH), help="Path to GeoJSON.")
    args = parser.parse_args()

    res = import_gsi_landslides(Path(args.path), batch_size=args.batch_size, dry_run=args.dry_run)
    print("Import Summary:", res)
