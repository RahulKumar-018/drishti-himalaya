"""Spatial Risk Assessment Service coordinating environmental pipelines and risk engines.

Orchestrates:
1. Spatial coordinate validation and PostGIS / KDTree lookups.
2. Topographic DEM sampling (elevation, slope, aspect).
3. Historical landslide proximity and density queries from GSI catalog.
4. Meteorological condition retrieval with honest provenance.
5. Standardized feature vector generation.
6. Execution via pluggable BaseRiskModel (Heuristic or ML).
7. In-memory caching for performance and redundant query minimization.
8. Spatial risk zones generation in standard GeoJSON format.
"""

from collections import OrderedDict
from datetime import datetime, timezone
import hashlib
import json
import logging
import math
import threading
import time
from typing import Any, Dict, List, Optional, Tuple

from sqlalchemy.orm import Session

from backend.app.core.config import settings
from backend.app.geospatial.service import get_inventory_service
from backend.app.risk_engine.base import BaseRiskModel, RiskEvaluationResult
from backend.app.risk_engine.config import DEFAULT_RISK_CONFIG, RiskModelConfig
from backend.app.risk_engine.features import DataQuality, EnvironmentalFeatureVector
from backend.app.risk_engine.heuristic_model import HeuristicRiskModel
from backend.app.risk_engine.ml_model import MLRiskModel
from backend.app.schemas.risk import (
    GeoJSONPolygonGeometry,
    RiskFactors,
    RiskLocation,
    RiskPredictResponse,
    RiskZoneFeature,
    RiskZoneProperties,
    RiskZonesGeoJSONResponse,
)
from backend.app.services.environmental.disaster_service import (
    DisasterDataService,
    get_disaster_data_service,
)
from backend.app.services.environmental.terrain_service import (
    TerrainService,
    get_terrain_service,
)
from backend.app.services.environmental.weather_service import (
    WeatherDataService,
    get_weather_data_service,
)

logger = logging.getLogger(__name__)


class TTLSpatialCache:
    """Thread-safe bounded in-memory LRU cache with time-to-live expiration."""

    def __init__(self, max_size: int = 1000, ttl_seconds: float = 300.0) -> None:
        self.max_size = max_size
        self.ttl_seconds = ttl_seconds
        self._cache: OrderedDict[str, Tuple[float, Any]] = OrderedDict()
        self._lock = threading.Lock()

    def _generate_key(
        self,
        lat: float,
        lon: float,
        model_type: str,
        rainfall_mm: Optional[float],
        slope_deg: Optional[float],
    ) -> str:
        # Snap coordinates to ~11 meters (4 decimal places) for spatial deduplication
        r_lat = round(lat, 4)
        r_lon = round(lon, 4)
        r_rain = round(rainfall_mm, 1) if rainfall_mm is not None else "auto"
        r_slope = round(slope_deg, 1) if slope_deg is not None else "auto"
        return f"{r_lat}:{r_lon}:{model_type}:{r_rain}:{r_slope}"

    def get(
        self,
        lat: float,
        lon: float,
        model_type: str,
        rainfall_mm: Optional[float],
        slope_deg: Optional[float],
    ) -> Optional[Any]:
        key = self._generate_key(lat, lon, model_type, rainfall_mm, slope_deg)
        now = time.time()
        with self._lock:
            if key in self._cache:
                timestamp, val = self._cache[key]
                if now - timestamp < self.ttl_seconds:
                    self._cache.move_to_end(key)
                    return val
                else:
                    del self._cache[key]
        return None

    def set(
        self,
        lat: float,
        lon: float,
        model_type: str,
        rainfall_mm: Optional[float],
        slope_deg: Optional[float],
        value: Any,
    ) -> None:
        key = self._generate_key(lat, lon, model_type, rainfall_mm, slope_deg)
        now = time.time()
        with self._lock:
            if key in self._cache:
                del self._cache[key]
            elif len(self._cache) >= self.max_size:
                self._cache.popitem(last=False)
            self._cache[key] = (now, value)

    def clear(self) -> None:
        with self._lock:
            self._cache.clear()


class SpatialRiskService:
    """Core domain service for spatial environmental aggregation and risk assessment."""

    def __init__(
        self,
        config: Optional[RiskModelConfig] = None,
        terrain_service: Optional[TerrainService] = None,
        weather_service: Optional[WeatherDataService] = None,
        disaster_service: Optional[DisasterDataService] = None,
        cache_ttl_seconds: float = 300.0,
    ) -> None:
        self.config = config or DEFAULT_RISK_CONFIG
        self.terrain_service = terrain_service or get_terrain_service()
        self.weather_service = weather_service or get_weather_data_service()
        self.disaster_service = disaster_service or get_disaster_data_service()

        self._heuristic_model = HeuristicRiskModel(config=self.config)
        self._ml_model = MLRiskModel(config=self.config)
        self._cache = TTLSpatialCache(max_size=2000, ttl_seconds=cache_ttl_seconds)

    def get_model(self, model_selector: Optional[str] = "heuristic") -> BaseRiskModel:
        """Select active hazard evaluation model."""
        if model_selector and model_selector.lower() in ("ml", "machine_learning"):
            return self._ml_model
        return self._heuristic_model

    def assess_point_risk(
        self,
        session: Optional[Session],
        latitude: float,
        longitude: float,
        timestamp: Optional[datetime] = None,
        rainfall_mm: Optional[float] = None,
        slope_deg: Optional[float] = None,
        weather_source: Optional[str] = None,
        model_type: Optional[str] = "heuristic",
        use_cache: bool = True,
    ) -> RiskPredictResponse:
        """Execute full spatial lookup, feature engineering, and risk evaluation for a point."""
        # 1. Check cache
        normalized_model_type = "ml" if (model_type and model_type.lower() in ("ml", "machine_learning")) else "heuristic"
        if use_cache:
            cached = self._cache.get(
                lat=latitude,
                lon=longitude,
                model_type=normalized_model_type,
                rainfall_mm=rainfall_mm,
                slope_deg=slope_deg,
            )
            if cached is not None:
                return cached

        # 2. Extract Topographic Signals (Elevation, Slope, Aspect)
        elevation_val: Optional[float] = None
        slope_val: Optional[float] = slope_deg
        aspect_val: Optional[float] = None
        terrain_class: Optional[str] = None
        terrain_src = "Copernicus DEM GLO-30"

        if slope_val is None:
            t_metrics = self.terrain_service.sample_terrain(longitude=longitude, latitude=latitude)
            elevation_val = t_metrics.get("elevation_m")
            slope_val = t_metrics.get("slope_degrees")
            aspect_val = t_metrics.get("aspect_degrees")
            terrain_class = t_metrics.get("terrain_class")
            terrain_src = t_metrics.get("source", terrain_src)

        # 3. Extract Historical Landslide Catalog Signals (GSI Spatial KDTree)
        inv_service = get_inventory_service()
        dist_scar_m: float = 10000.0
        scar_density_1km: int = 0

        # Query KDTree if inside or reasonably near study area
        try:
            dist_scar_m = inv_service.nearest_distance_m(longitude, latitude)
            scar_density_1km = inv_service.count_within_radius_m(longitude, latitude, radius_m=1000.0)
        except Exception as exc:
            logger.debug(f"Historical KDTree query bypassed or returned error: {exc}")
            dist_scar_m = 10000.0
            scar_density_1km = 0

        # Check multi-hazard historical disaster events table if session provided
        disaster_count_10km = 0
        if session:
            try:
                nearby_events = self.disaster_service.get_nearby_events(
                    session=session,
                    latitude=latitude,
                    longitude=longitude,
                    radius_m=10000.0,
                    limit=10,
                )
                disaster_count_10km = len(nearby_events)
            except Exception:
                pass

        # 4. Extract Meteorological Signals
        resolved_rain: Optional[float] = rainfall_mm
        resolved_weather_src: str = weather_source or "historical_dataset"
        is_live_weather: bool = False
        temp_c: Optional[float] = None
        humidity_pct: Optional[float] = None
        p24_val: Optional[float] = None
        p72_val: Optional[float] = None
        ari_val: Optional[float] = None
        precip_prob: Optional[float] = None

        if resolved_rain is None:
            try:
                w_res = self.weather_service.get_weather_for_coordinate(
                    latitude=latitude,
                    longitude=longitude,
                    session=session,
                    persist=False,
                )
                resolved_rain = w_res.rainfall_mm
                resolved_weather_src = w_res.source
                is_live_weather = w_res.is_live
                temp_c = w_res.temperature_c
                humidity_pct = w_res.humidity_percent
                p24_val = w_res.p24_mm if w_res.p24_mm is not None else resolved_rain
                p72_val = w_res.p72_mm if w_res.p72_mm is not None else resolved_rain
                ari_val = w_res.ari_mm if w_res.ari_mm is not None else ((resolved_rain * 0.82) if resolved_rain is not None else 0.0)
                precip_prob = w_res.precipitation_probability
            except Exception as exc:
                logger.debug(f"Weather lookup fallback: {exc}")
                resolved_rain = 0.0
                resolved_weather_src = "offline_fallback"
                p24_val = 0.0
                p72_val = 0.0
                ari_val = 0.0
        else:
            p24_val = resolved_rain
            p72_val = resolved_rain
            ari_val = (resolved_rain * 0.82) if resolved_rain is not None else 0.0

        # 5. Build standardized feature vector
        features = EnvironmentalFeatureVector(
            latitude=latitude,
            longitude=longitude,
            timestamp=timestamp or datetime.now(timezone.utc),
            elevation_m=elevation_val,
            slope_deg=slope_val,
            aspect_deg=aspect_val,
            terrain_class=terrain_class,
            rainfall_mm=resolved_rain,
            p24_mm=p24_val,
            p72_mm=p72_val,
            ari_mm=ari_val,
            temperature_c=temp_c,
            humidity_percent=humidity_pct,
            precipitation_probability=precip_prob,
            distance_to_historical_events_m=dist_scar_m,
            historical_landslide_count_1km=scar_density_1km,
            disaster_events_nearby_count=disaster_count_10km,
            weather_source=resolved_weather_src,
            is_live_weather=is_live_weather,
            terrain_source=terrain_src,
        )

        # 6. Evaluate via chosen Model
        model = self.get_model(normalized_model_type)
        eval_result = model.evaluate(features)

        # 7. Construct API response
        response = RiskPredictResponse(
            location=RiskLocation(latitude=latitude, longitude=longitude),
            risk_score=eval_result.risk_score,
            risk_level=eval_result.risk_level,
            factors=RiskFactors(
                rainfall=eval_result.factors["rainfall"],
                slope=eval_result.factors["slope"],
                terrain=eval_result.factors["terrain"],
                historical=eval_result.factors["historical"],
                details=eval_result.factor_details,
            ),
            explanation=eval_result.explanation,
            contributing_factors=eval_result.contributing_factors,
            weather_source=eval_result.weather_source,
            model_type=eval_result.model_type,
            model_version=eval_result.model_version,
            data_quality=eval_result.data_quality.value,
            data_caveats=eval_result.data_caveats,
            generated_at=eval_result.generated_at,
        )

        # 8. Cache result
        if use_cache:
            self._cache.set(
                lat=latitude,
                lon=longitude,
                model_type=normalized_model_type,
                rainfall_mm=rainfall_mm,
                slope_deg=slope_deg,
                value=response,
            )

        return response

    def generate_risk_zones(
        self,
        session: Optional[Session] = None,
        min_lat: Optional[float] = None,
        max_lat: Optional[float] = None,
        min_lon: Optional[float] = None,
        max_lon: Optional[float] = None,
    ) -> RiskZonesGeoJSONResponse:
        """Generate GeoJSON FeatureCollection of spatial hazard risk zones in Uttarakhand.

        Covers key geomorphological corridors across Uttarakhand:
        - Chamoli - Joshimath High-Hazard Corridor
        - Rudraprayag - Mandakini River Basin
        - Uttarkashi - Bhagirathi Valley
        - Nainital Lake Basin & Outer Himalayan Thrust
        - Pithoragarh - Kali River Valley
        - Rishikesh - Devprayag Foothills Corridor
        """
        now = datetime.now(timezone.utc)

        # Predefined regional polygon bounding boxes for key Uttarakhand zones
        zone_definitions = [
            {
                "id": "zone_chamoli_joshimath",
                "name": "Chamoli - Joshimath Corridor",
                "center": (30.55, 79.56),
                "poly": [
                    [79.50, 30.50],
                    [79.62, 30.50],
                    [79.62, 30.60],
                    [79.50, 30.60],
                    [79.50, 30.50],
                ],
                "base_slope": 38.5,
                "base_rain": 45.0,
            },
            {
                "id": "zone_rudraprayag_kedarnath",
                "name": "Rudraprayag - Mandakini Basin",
                "center": (30.28, 78.98),
                "poly": [
                    [78.92, 30.22],
                    [79.04, 30.22],
                    [79.04, 30.34],
                    [78.92, 30.34],
                    [78.92, 30.22],
                ],
                "base_slope": 36.0,
                "base_rain": 40.0,
            },
            {
                "id": "zone_uttarkashi_bhagirathi",
                "name": "Uttarkashi - Bhagirathi Valley",
                "center": (30.73, 78.44),
                "poly": [
                    [78.38, 30.67],
                    [78.50, 30.67],
                    [78.50, 30.79],
                    [78.38, 30.79],
                    [78.38, 30.67],
                ],
                "base_slope": 32.5,
                "base_rain": 35.0,
            },
            {
                "id": "zone_nainital_kumaon",
                "name": "Nainital - Kumaon Hills",
                "center": (29.39, 79.46),
                "poly": [
                    [79.40, 29.33],
                    [79.52, 29.33],
                    [79.52, 29.45],
                    [79.40, 29.45],
                    [79.40, 29.33],
                ],
                "base_slope": 31.0,
                "base_rain": 25.0,
            },
            {
                "id": "zone_pithoragarh_kali",
                "name": "Pithoragarh - Kali River Basin",
                "center": (29.58, 80.22),
                "poly": [
                    [80.16, 29.52],
                    [80.28, 29.52],
                    [80.28, 29.64],
                    [80.16, 29.64],
                    [80.16, 29.52],
                ],
                "base_slope": 34.0,
                "base_rain": 30.0,
            },
            {
                "id": "zone_rishikesh_foothills",
                "name": "Rishikesh - Devprayag Foothills",
                "center": (30.10, 78.30),
                "poly": [
                    [78.24, 30.04],
                    [78.36, 30.04],
                    [78.36, 30.16],
                    [78.24, 30.16],
                    [78.24, 30.04],
                ],
                "base_slope": 18.0,
                "base_rain": 15.0,
            },
        ]

        features: List[RiskZoneFeature] = []

        for z in zone_definitions:
            c_lat, c_lon = z["center"]
            # Filter if bounding box was requested
            if min_lat is not None and c_lat < min_lat:
                continue
            if max_lat is not None and c_lat > max_lat:
                continue
            if min_lon is not None and c_lon < min_lon:
                continue
            if max_lon is not None and c_lon > max_lon:
                continue

            assessment = self.assess_point_risk(
                session=session,
                latitude=c_lat,
                longitude=c_lon,
                slope_deg=z["base_slope"],
                rainfall_mm=z["base_rain"],
                use_cache=True,
            )

            # Determine color
            _, color = self._heuristic_model.classify_risk_tier(assessment.risk_score)

            feature = RiskZoneFeature(
                id=z["id"],
                geometry=GeoJSONPolygonGeometry(
                    coordinates=[z["poly"]]
                ),
                properties=RiskZoneProperties(
                    zone_id=z["id"],
                    zone_name=z["name"],
                    risk_score=assessment.risk_score,
                    risk_level=assessment.risk_level,
                    color_hex=color,
                    factors={
                        "rainfall": assessment.factors.rainfall,
                        "slope": assessment.factors.slope,
                        "terrain": assessment.factors.terrain,
                        "historical": assessment.factors.historical,
                    },
                    model_version=assessment.model_version,
                    generated_at=now,
                    disclaimer="MVP visualization — not scientifically authoritative hazard boundary",
                ),
            )
            features.append(feature)

        return RiskZonesGeoJSONResponse(
            features=features,
            total_zones=len(features),
            generated_at=now,
            model_version=self._heuristic_model.model_version,
        )


_global_spatial_risk_service: Optional[SpatialRiskService] = None


def get_spatial_risk_service() -> SpatialRiskService:
    """Return singleton instance of SpatialRiskService."""
    global _global_spatial_risk_service
    if _global_spatial_risk_service is None:
        _global_spatial_risk_service = SpatialRiskService()
    return _global_spatial_risk_service
