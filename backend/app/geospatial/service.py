"""Multi-source landslide inventory service coordinating loaders, indexing, and spatial queries.

Supports:
- GSI (current operational dataset: 5,206 Uttarakhand records)
- NRSC (future plug-in dataset)
- Auto-caches processed Uttarakhand inventory for high-performance sub-second startup
- Exposes single point of access for nearest-scar distance and 1km density queries.
"""

from functools import lru_cache
import json
import logging
from pathlib import Path
from typing import Dict, List, Optional, Sequence, Tuple, Union

from backend.app.geospatial.kdtree import SpatialLandslideIndex
from backend.app.geospatial.loaders import BaseLandslideLoader, GSILoader, NRSCLoader
from backend.app.geospatial.models import LandslideSource, NormalizedLandslideRecord

logger = logging.getLogger(__name__)

# Default repository paths relative to project root
DEFAULT_RAW_GSI_PATH = Path("data/raw/GSI_Landslide_Inventory.geojson")
DEFAULT_PROCESSED_UTTARAKHAND_PATH = Path("data/processed/landslide_inventory_uttarakhand.geojson")
DEFAULT_RAW_NRSC_PATH = Path("data/raw/NRSC_Landslide_Inventory.geojson")


class LandslideInventoryService:
    """Orchestrates landslide data ingestion from government sources and manages the spatial index."""

    def __init__(
        self,
        raw_gsi_path: Union[str, Path] = DEFAULT_RAW_GSI_PATH,
        processed_path: Union[str, Path] = DEFAULT_PROCESSED_UTTARAKHAND_PATH,
        raw_nrsc_path: Union[str, Path] = DEFAULT_RAW_NRSC_PATH,
    ) -> None:
        self.raw_gsi_path = Path(raw_gsi_path)
        self.processed_path = Path(processed_path)
        self.raw_nrsc_path = Path(raw_nrsc_path)

        self._loaders: Dict[LandslideSource, BaseLandslideLoader] = {
            LandslideSource.GSI: GSILoader(),
            LandslideSource.NRSC: NRSCLoader(),
        }

        self._index = SpatialLandslideIndex()
        self._records: List[NormalizedLandslideRecord] = []
        self._source_counts: Dict[str, int] = {}

    @property
    def index(self) -> SpatialLandslideIndex:
        return self._index

    @property
    def total_count(self) -> int:
        return len(self._records)

    @property
    def source_counts(self) -> Dict[str, int]:
        return dict(self._source_counts)

    @property
    def is_ready(self) -> bool:
        return self._index.is_built

    def register_loader(self, loader: BaseLandslideLoader) -> None:
        """Register a custom or future source loader."""
        self._loaders[loader.source] = loader

    def load_uttarakhand_inventory(
        self,
        force_reprocess: bool = False,
        include_nrsc: bool = True,
    ) -> List[NormalizedLandslideRecord]:
        """Load and index the statewide Uttarakhand landslide inventory.

        Workflow:
        1. If processed file exists and force_reprocess is False: load directly from processed GeoJSON.
        2. Else, load from raw GSI GeoJSON, filter to Uttarakhand, save processed GeoJSON, and load.
        3. If include_nrsc is True and NRSC file is present, merge NRSC records.
        4. Construct metric KDTree index in memory.
        """
        all_records: List[NormalizedLandslideRecord] = []
        source_counts: Dict[str, int] = {}

        # 1. Load GSI (either from processed cache or raw source)
        if self.processed_path.exists() and not force_reprocess:
            gsi_records = self._load_processed_geojson(self.processed_path)
            logger.info(f"Loaded {len(gsi_records)} Uttarakhand records from processed file: {self.processed_path}")
        else:
            gsi_loader = self._loaders[LandslideSource.GSI]
            gsi_records = gsi_loader.load(self.raw_gsi_path, state_filter="UTTARAKHAND")
            logger.info(f"Loaded {len(gsi_records)} Uttarakhand records from raw GSI source: {self.raw_gsi_path}")
            # Save to processed file
            self.export_processed_geojson(gsi_records, self.processed_path)

        all_records.extend(gsi_records)
        source_counts[LandslideSource.GSI.value] = len(gsi_records)

        # 2. Check for optional NRSC future dataset
        if include_nrsc and self.raw_nrsc_path.exists():
            nrsc_loader = self._loaders[LandslideSource.NRSC]
            nrsc_records = nrsc_loader.load(self.raw_nrsc_path, state_filter="UTTARAKHAND")
            all_records.extend(nrsc_records)
            source_counts[LandslideSource.NRSC.value] = len(nrsc_records)
            logger.info(f"Loaded {len(nrsc_records)} NRSC records.")
        else:
            source_counts[LandslideSource.NRSC.value] = 0

        # 3. Build spatial index
        self._records = all_records
        self._source_counts = source_counts
        self._index.build_index(self._records)
        logger.info(f"Constructed spatial KDTree with {len(self._records)} total records.")

        return self._records

    def export_processed_geojson(
        self,
        records: Sequence[NormalizedLandslideRecord],
        target_path: Union[str, Path],
    ) -> None:
        """Export normalized records as standard GeoJSON FeatureCollection."""
        path = Path(target_path)
        path.parent.mkdir(parents=True, exist_ok=True)

        features = [rec.to_geojson_feature() for rec in records]
        geojson_data = {
            "type": "FeatureCollection",
            "crs": {
                "type": "name",
                "properties": {"name": "urn:ogc:def:crs:OGC::CRS84"},
            },
            "features": features,
        }

        with open(path, "w", encoding="utf-8") as f:
            json.dump(geojson_data, f, indent=2)
        logger.info(f"Saved {len(records)} features to {path.resolve()}")

    def _load_processed_geojson(self, path: Path) -> List[NormalizedLandslideRecord]:
        """Load records from previously generated processed GeoJSON file."""
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)

        records: List[NormalizedLandslideRecord] = []
        for f in data.get("features", []):
            geom = f.get("geometry", {})
            coords = geom.get("coordinates", [])
            props = f.get("properties", {}) or {}
            source_str = props.get("source_dataset", "GSI")
            source_enum = LandslideSource.GSI if source_str == "GSI" else LandslideSource.NRSC

            records.append(
                NormalizedLandslideRecord(
                    source_dataset=source_enum,
                    longitude=float(coords[0]),
                    latitude=float(coords[1]),
                    original_id=props.get("original_id") or str(f.get("id", "")),
                    slide_no=props.get("slide_no"),
                    state=props.get("state"),
                    district=props.get("district"),
                    slide_name=props.get("slide_name"),
                    triggering=props.get("triggering"),
                    movement_type=props.get("movement_type"),
                    material_type=props.get("material_type"),
                    failure_mechanism=props.get("failure_mechanism"),
                    runout_distance_m=props.get("runout_distance_m"),
                    properties=props,
                )
            )
        return records

    def nearest_distance_m(self, longitude: float, latitude: float) -> float:
        """Query distance to nearest historical landslide in meters."""
        if not self._index.is_built:
            self.load_uttarakhand_inventory()
        return self._index.nearest_distance_m(longitude, latitude)

    def count_within_radius_m(
        self,
        longitude: float,
        latitude: float,
        radius_m: float = 1000.0,
    ) -> int:
        """Query number of scars within radius in meters (default 1000m)."""
        if not self._index.is_built:
            self.load_uttarakhand_inventory()
        return self._index.count_within_radius_m(longitude, latitude, radius_m)

    def query_nearest(
        self,
        longitude: float,
        latitude: float,
    ) -> Tuple[float, Optional[NormalizedLandslideRecord]]:
        """Query nearest distance and record."""
        if not self._index.is_built:
            self.load_uttarakhand_inventory()
        return self._index.query_nearest(longitude, latitude)


@lru_cache()
def get_inventory_service() -> LandslideInventoryService:
    """Return application-wide cached singleton of the landslide inventory service."""
    service = LandslideInventoryService()
    return service
