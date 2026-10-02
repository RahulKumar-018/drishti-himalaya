"""Data loaders for historical landslide inventory datasets (GSI, NRSC).

Follows a source-agnostic adapter pattern converting heterogeneous government raw datasets
into canonical NormalizedLandslideRecord objects.
"""

from abc import ABC, abstractmethod
import json
import logging
from pathlib import Path
from typing import Any, List, Optional, Sequence, Union

from backend.app.geospatial.models import LandslideSource, NormalizedLandslideRecord

logger = logging.getLogger(__name__)


class BaseLandslideLoader(ABC):
    """Abstract base class for government landslide inventory loaders."""

    @property
    @abstractmethod
    def source(self) -> LandslideSource:
        """Declared landslide inventory source dataset."""
        pass

    @abstractmethod
    def load(
        self,
        file_path: Union[str, Path],
        state_filter: Optional[str] = "UTTARAKHAND",
    ) -> List[NormalizedLandslideRecord]:
        """Load and normalize landslide records from source file."""
        pass


class GSILoader(BaseLandslideLoader):
    """Loader for Geological Survey of India (GSI) National Landslide Susceptibility Mapping GeoJSON."""

    @property
    def source(self) -> LandslideSource:
        return LandslideSource.GSI

    def load(
        self,
        file_path: Union[str, Path],
        state_filter: Optional[str] = "UTTARAKHAND",
    ) -> List[NormalizedLandslideRecord]:
        """Load real GSI GeoJSON, validate Point geometries, and filter for target state.

        Parameters
        ----------
        file_path : str or Path
            Path to raw GSI GeoJSON file.
        state_filter : str, optional
            State name filter (default "UTTARAKHAND", case-insensitive).
            Pass None to load all records across India.

        Returns
        -------
        List[NormalizedLandslideRecord]
            Normalized landslide records with source_dataset="GSI".
        """
        path = Path(file_path)
        if not path.exists():
            raise FileNotFoundError(f"GSI raw dataset file not found: {path.resolve()}")

        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)

        if not isinstance(data, dict) or data.get("type") != "FeatureCollection":
            raise ValueError(f"Invalid GeoJSON: Expected root type 'FeatureCollection', got {type(data)}")

        features = data.get("features", [])
        if not isinstance(features, list):
            raise ValueError("Invalid GeoJSON: 'features' must be an array.")

        records: List[NormalizedLandslideRecord] = []
        non_point_count = 0
        null_geom_count = 0
        target_state_upper = state_filter.strip().upper() if state_filter else None

        for f in features:
            geom = f.get("geometry")
            if not geom or not isinstance(geom, dict):
                null_geom_count += 1
                continue

            g_type = geom.get("type")
            if g_type != "Point":
                non_point_count += 1
                continue

            coords = geom.get("coordinates")
            if not coords or len(coords) < 2:
                null_geom_count += 1
                continue

            lon, lat = float(coords[0]), float(coords[1])
            props = f.get("properties") or {}

            # Detect state from GSI properties
            state_val = props.get("STATE") or ""
            state_str = str(state_val).strip()
            state_upper = state_str.upper()

            # State filtering
            if target_state_upper:
                # Matches "UTTARAKHAND" or historical "UTTARANCHAL"
                is_match = (target_state_upper in state_upper) or (
                    target_state_upper == "UTTARAKHAND" and "UTTARANCHAL" in state_upper
                )
                if not is_match:
                    continue

            # Parse runout distance if present
            runout_val = props.get("RUNOUT_DISTANCE")
            runout_m: Optional[float] = None
            if runout_val is not None:
                try:
                    runout_m = float(runout_val)
                except (ValueError, TypeError):
                    pass

            rec = NormalizedLandslideRecord(
                source_dataset=LandslideSource.GSI,
                longitude=lon,
                latitude=lat,
                original_id=str(props.get("OBJECTID")) if props.get("OBJECTID") is not None else None,
                slide_no=str(props.get("SLIDE_NO")) if props.get("SLIDE_NO") else None,
                state=state_str if state_str else None,
                district=str(props.get("DISTRICT")).strip() if props.get("DISTRICT") else None,
                slide_name=str(props.get("SLIDE_NAME")).strip() if props.get("SLIDE_NAME") else None,
                triggering=str(props.get("TRIGGERING")).strip() if props.get("TRIGGERING") else None,
                movement_type=str(props.get("MOVEMENT_TYPE")).strip() if props.get("MOVEMENT_TYPE") else None,
                material_type=str(props.get("MATERIAL_TYPE")).strip() if props.get("MATERIAL_TYPE") else None,
                failure_mechanism=str(props.get("FAILURE_MECHANISM")).strip() if props.get("FAILURE_MECHANISM") else None,
                runout_distance_m=runout_m,
                properties=props,
            )
            records.append(rec)

        if non_point_count > 0 or null_geom_count > 0:
            logger.info(
                f"GSILoader: Skipped {non_point_count} non-Point and {null_geom_count} null geometries."
            )

        return records


class NRSCLoader(BaseLandslideLoader):
    """Loader adapter for future NRSC / ISRO Landslide Atlas of India dataset.

    Architecturally ready to ingest NRSC vector data (GeoJSON, Shapefile, CSV)
    without modifying downstream KDTree or risk calculations.
    """

    @property
    def source(self) -> LandslideSource:
        return LandslideSource.NRSC

    def load(
        self,
        file_path: Union[str, Path],
        state_filter: Optional[str] = "UTTARAKHAND",
    ) -> List[NormalizedLandslideRecord]:
        """Load NRSC vector dataset if present."""
        path = Path(file_path)
        if not path.exists():
            logger.warning(
                f"NRSC dataset file not present at {path.resolve()}. "
                "System operates in GSI-only mode until NRSC vector data is provided."
            )
            return []

        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)

        features = data.get("features", [])
        records: List[NormalizedLandslideRecord] = []
        for f in features:
            geom = f.get("geometry") or {}
            coords = geom.get("coordinates")
            if not coords or len(coords) < 2:
                continue
            props = f.get("properties") or {}
            rec = NormalizedLandslideRecord(
                source_dataset=LandslideSource.NRSC,
                longitude=float(coords[0]),
                latitude=float(coords[1]),
                original_id=str(props.get("ID") or props.get("OBJECTID")),
                slide_no=str(props.get("SLIDE_ID") or props.get("SCAR_ID")),
                state=str(props.get("STATE") or "Uttarakhand"),
                district=str(props.get("DISTRICT")),
                triggering=str(props.get("TRIGGER") or props.get("CAUSE")),
                properties=props,
            )
            records.append(rec)

        return records
