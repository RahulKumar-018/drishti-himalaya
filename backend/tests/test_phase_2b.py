"""Comprehensive test suite for Phase 2B: Environmental & Geospatial Data Pipeline.

Verifies:
1. Geospatial & environmental parameter validation rules
2. Location creation, Point geometry, and DEM auto-sampling
3. Topographic terrain derivation: Horn (1981) slope, aspect, terrain classes
4. Multi-hazard disaster event tracking and proximity querying
5. Extensible WeatherProvider hierarchy and explicit source provenance
6. API endpoint contracts: /api/locations, /api/locations/{id}/*, /api/health
"""

from datetime import date, datetime, timezone
import math
import uuid
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session, sessionmaker

from backend.app.core.database import Base, get_db
from backend.app.geospatial.terrain import RasterGridTerrainProvider
from backend.app.main import app
from backend.app.models.disaster import DisasterEvent
from backend.app.models.location import Location
from backend.app.models.terrain import TerrainObservation
from backend.app.models.weather_observation import WeatherObservation
from backend.app.services.environmental import (
    DisasterDataService,
    ExternalWeatherProvider,
    GeospatialService,
    GeospatialValidation,
    HistoricalWeatherProvider,
    ManualWeatherProvider,
    TerrainService,
    WeatherDataService,
)
import numpy as np


from sqlalchemy.pool import StaticPool

# ---------------------------------------------------------------------------
# Database Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture(scope="module")
def p2b_engine():
    """Create in-memory SQLite engine with spatial function shims."""
    from sqlalchemy import event

    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
        echo=False,
    )

    @event.listens_for(engine, "connect")
    def _sqlite_shims(dbapi_conn, record):
        dbapi_conn.create_function("RecoverGeometryColumn", -1, lambda *args: 1)
        dbapi_conn.create_function("DiscardGeometryColumn", -1, lambda *args: 1)
        dbapi_conn.create_function("CreateSpatialIndex", -1, lambda *args: 1)
        dbapi_conn.create_function("CheckSpatialIndex", -1, lambda *args: None)
        dbapi_conn.create_function("DisableSpatialIndex", -1, lambda *args: 1)
        dbapi_conn.create_function("GeomFromEWKT", -1, lambda *args: args[0] if args else None)
        dbapi_conn.create_function("AsBinary", -1, lambda *args: args[0] if args else None)
        dbapi_conn.create_function("AsEWKT", -1, lambda *args: str(args[0]) if args and args[0] is not None else None)
        dbapi_conn.create_function("AsEWKB", -1, lambda *args: None)
        dbapi_conn.create_function("ST_AsEWKB", -1, lambda *args: None)

    Base.metadata.create_all(bind=engine)
    yield engine
    Base.metadata.drop_all(bind=engine)
    engine.dispose()


@pytest.fixture
def p2b_session(p2b_engine):
    """Provide isolated session per test."""
    session_factory = sessionmaker(bind=p2b_engine, expire_on_commit=False)
    session = session_factory()
    yield session
    session.rollback()
    session.close()


@pytest.fixture
def client(p2b_session, p2b_engine):
    """TestClient overriding get_db dependency."""
    def _override_get_db():
        session_factory = sessionmaker(bind=p2b_engine, expire_on_commit=False)
        db = session_factory()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = _override_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


@pytest.fixture
def sample_terrain_grid():
    """Provide a 5x5 controlled synthetic elevation grid with known slope and aspect."""
    # North to South (row 0 to 4), West to East (col 0 to 4)
    # Slopes down towards South: elevation drops by 50m per row
    grid = np.zeros((5, 5), dtype=np.float64)
    for r in range(5):
        grid[r, :] = 2000.0 - r * 50.0  # High in North, low in South -> faces South (180 deg)
    bounds = (78.0, 30.0, 78.04, 30.04)  # ~4.4km box
    return RasterGridTerrainProvider(grid, bounds, source_name="TestSlopeDEM")


# ---------------------------------------------------------------------------
# 1. Geospatial Validation Tests
# ---------------------------------------------------------------------------


class TestGeospatialValidation:
    """Verify bounds and domain sanity checks for all environmental signals."""

    def test_valid_coordinates_accepted(self):
        GeospatialValidation.validate_coordinates(30.145, 78.789)
        GeospatialValidation.validate_coordinates(-89.9, 179.9)

    def test_invalid_latitude_rejected(self):
        with pytest.raises(ValueError, match="Latitude"):
            GeospatialValidation.validate_coordinates(91.0, 78.0)
        with pytest.raises(ValueError, match="Latitude"):
            GeospatialValidation.validate_coordinates(-90.1, 78.0)

    def test_invalid_longitude_rejected(self):
        with pytest.raises(ValueError, match="Longitude"):
            GeospatialValidation.validate_coordinates(30.0, 180.1)
        with pytest.raises(ValueError, match="Longitude"):
            GeospatialValidation.validate_coordinates(30.0, -180.1)

    def test_nan_or_inf_coordinates_rejected(self):
        with pytest.raises(ValueError, match="finite number"):
            GeospatialValidation.validate_coordinates(float("nan"), 78.0)
        with pytest.raises(ValueError, match="finite number"):
            GeospatialValidation.validate_coordinates(30.0, float("inf"))

    def test_slope_validation_bounds(self):
        GeospatialValidation.validate_slope(0.0)
        GeospatialValidation.validate_slope(45.5)
        GeospatialValidation.validate_slope(90.0)
        with pytest.raises(ValueError, match="Slope"):
            GeospatialValidation.validate_slope(-1.0)
        with pytest.raises(ValueError, match="Slope"):
            GeospatialValidation.validate_slope(90.5)

    def test_rainfall_non_negative_validation(self):
        GeospatialValidation.validate_rainfall(0.0)
        GeospatialValidation.validate_rainfall(125.4)
        with pytest.raises(ValueError, match="Rainfall amount cannot be negative"):
            GeospatialValidation.validate_rainfall(-0.5)

    def test_temperature_validation_bounds(self):
        GeospatialValidation.validate_temperature(-15.0)
        GeospatialValidation.validate_temperature(38.5)
        with pytest.raises(ValueError, match="Temperature"):
            GeospatialValidation.validate_temperature(-65.0)
        with pytest.raises(ValueError, match="Temperature"):
            GeospatialValidation.validate_temperature(65.0)

    def test_humidity_validation_bounds(self):
        GeospatialValidation.validate_humidity(0.0)
        GeospatialValidation.validate_humidity(100.0)
        with pytest.raises(ValueError, match="Relative humidity"):
            GeospatialValidation.validate_humidity(-1.0)
        with pytest.raises(ValueError, match="Relative humidity"):
            GeospatialValidation.validate_humidity(101.0)


# ---------------------------------------------------------------------------
# 2. Location & Terrain Pipeline Tests
# ---------------------------------------------------------------------------


class TestLocationAndTerrainPipeline:
    """Verify location registration, PostGIS point representation, and DEM metric extraction."""

    def test_location_creation_with_geometry(self, p2b_session: Session):
        geo_svc = GeospatialService()
        loc = geo_svc.create_location(
            session=p2b_session,
            name="Devprayag Confluence",
            latitude=30.145,
            longitude=78.599,
            elevation=475.0,
            administrative_metadata={"district": "Tehri Garhwal", "state": "Uttarakhand"},
            auto_sample_terrain=False,
        )
        assert loc.id is not None
        assert loc.name == "Devprayag Confluence"
        assert loc.latitude == 30.145
        assert loc.longitude == 78.599
        assert loc.elevation == 475.0
        assert "Tehri Garhwal" in loc.administrative_metadata["district"]

    def test_terrain_derivation_horn_slope_and_aspect(self, sample_terrain_grid):
        terrain_svc = TerrainService(provider=sample_terrain_grid)
        # Query interior point (lon=78.02, lat=30.02)
        metrics = terrain_svc.sample_terrain(longitude=78.02, latitude=30.02)
        assert metrics["elevation_m"] is not None
        assert metrics["slope_degrees"] is not None
        assert metrics["slope_degrees"] > 0.0

        # Since elevation drops southward, aspect should face South (~180 degrees)
        assert metrics["aspect_degrees"] is not None
        assert 170.0 <= metrics["aspect_degrees"] <= 190.0

    def test_slope_geomorphological_classification(self):
        classify = RasterGridTerrainProvider.classify_slope
        assert classify(2.0) == "flat"
        assert classify(10.0) == "gentle_slope"
        assert classify(22.0) == "moderate_slope"
        assert classify(35.0) == "steep_slope"
        assert classify(55.0) == "cliff_escarpment"
        assert classify(None) is None

    def test_terrain_observation_persistence(self, p2b_session: Session, sample_terrain_grid):
        geo_svc = GeospatialService()
        loc = geo_svc.create_location(
            session=p2b_session,
            name="Rudraprayag Station",
            latitude=30.02,
            longitude=78.02,
            auto_sample_terrain=False,
        )

        terrain_svc = TerrainService(provider=sample_terrain_grid)
        obs = terrain_svc.record_terrain_observation(
            session=p2b_session,
            location_id=loc.id,
            longitude=78.02,
            latitude=30.02,
        )
        assert obs is not None
        assert obs.location_id == loc.id
        assert obs.slope > 0.0
        assert obs.source == "TestSlopeDEM"

        retrieved = terrain_svc.get_latest_terrain_for_location(p2b_session, loc.id)
        assert retrieved is not None
        assert retrieved.id == obs.id


# ---------------------------------------------------------------------------
# 3. Multi-Hazard Disaster Data Service Tests
# ---------------------------------------------------------------------------


class TestDisasterDataService:
    """Verify disaster event tracking across landslide, flood, rockfall, avalanche, and debris flow."""

    def test_disaster_event_creation(self, p2b_session: Session):
        disaster_svc = DisasterDataService()
        event = disaster_svc.record_disaster_event(
            session=p2b_session,
            event_type="landslide",
            latitude=30.28,
            longitude=79.22,
            source="GSI",
            source_reference="GSI-UK-2023-412",
            event_date=date(2023, 7, 15),
            severity="severe",
            description="Debris slide blocking NH-7 at Karnaprayag",
            is_historical=True,
        )
        assert event.id is not None
        assert event.event_type == "landslide"
        assert event.severity == "severe"
        assert event.is_historical is True

    def test_unsupported_event_type_rejected(self, p2b_session: Session):
        disaster_svc = DisasterDataService()
        with pytest.raises(ValueError, match="Unsupported event_type"):
            disaster_svc.record_disaster_event(
                session=p2b_session,
                event_type="earthquake_aftershock_unknown",
                latitude=30.0,
                longitude=78.0,
                source="Field",
            )

    def test_all_supported_event_types_accepted(self, p2b_session: Session):
        disaster_svc = DisasterDataService()
        types = ["landslide", "flash_flood", "rockfall", "avalanche", "debris_flow", "road_subsidence"]
        for t in types:
            ev = disaster_svc.record_disaster_event(
                session=p2b_session,
                event_type=t,
                latitude=30.5,
                longitude=79.5,
                source="SDMA",
            )
            assert ev.event_type == t

    def test_nearby_disaster_spatial_search(self, p2b_session: Session):
        disaster_svc = DisasterDataService()
        # Insert event near Joshimath (30.556, 79.566)
        disaster_svc.record_disaster_event(
            session=p2b_session,
            event_type="rockfall",
            latitude=30.558,
            longitude=79.568,
            source="Border Roads Organisation",
            description="Rockfall event 300m from Joshimath center",
        )
        # Insert event far away in Dehradun (30.316, 78.032) ~150km away
        disaster_svc.record_disaster_event(
            session=p2b_session,
            event_type="flash_flood",
            latitude=30.316,
            longitude=78.032,
            source="Dehradun Control Room",
        )

        nearby = disaster_svc.get_nearby_events(
            session=p2b_session,
            latitude=30.556,
            longitude=79.566,
            radius_m=2000.0,
        )
        assert len(nearby) == 1
        assert nearby[0]["event_type"] == "rockfall"
        assert nearby[0]["distance_m"] < 1000.0


# ---------------------------------------------------------------------------
# 4. Weather Provider Abstraction & Data Ingestion Tests
# ---------------------------------------------------------------------------


class TestWeatherProviderAbstraction:
    """Verify WeatherProvider hierarchy, explicit provenance, and zero false live claims."""

    def test_historical_weather_provider_provenance(self):
        prov = HistoricalWeatherProvider()
        res = prov.fetch_weather(latitude=30.2, longitude=78.8)
        assert res.source_type == "historical_dataset"
        assert res.is_live is False
        assert res.rainfall_mm is not None
        assert res.rainfall_mm >= 0.0
        assert res.temperature_c is not None

    def test_manual_weather_provider(self):
        prov = ManualWeatherProvider(
            rainfall_mm=14.5,
            temperature_c=18.0,
            humidity_percent=85.0,
            operator_note="Emergency Station Chamoli Gauge #4",
        )
        res = prov.fetch_weather(latitude=30.3, longitude=79.3)
        assert res.source_type == "manual"
        assert res.is_live is False
        assert res.rainfall_mm == 14.5
        assert res.humidity_percent == 85.0
        assert res.raw_payload["note"] == "Emergency Station Chamoli Gauge #4"

    def test_external_weather_provider_demo_fallback(self):
        # External provider in DEMO mode must fall back to historical without claiming live
        prov = ExternalWeatherProvider()
        res = prov.fetch_weather(latitude=30.1, longitude=78.3)
        assert res.source_type == "historical_dataset"
        assert res.is_live is False

    def test_weather_data_service_persistence(self, p2b_session: Session):
        prov = ManualWeatherProvider(rainfall_mm=8.2, temperature_c=15.0)
        svc = WeatherDataService(provider=prov)

        loc_id = uuid.uuid4()
        res = svc.get_weather_for_coordinate(
            latitude=30.4,
            longitude=79.1,
            session=p2b_session,
            persist=True,
            location_id=loc_id,
        )
        assert res.rainfall_mm == 8.2

        stored = svc.get_location_observations(p2b_session, loc_id)
        assert len(stored) == 1
        assert stored[0].rainfall_mm == 8.2
        assert stored[0].source_type == "manual"

    def test_weather_data_service_rejects_negative_rainfall(self):
        bad_prov = ManualWeatherProvider(rainfall_mm=-10.0)
        svc = WeatherDataService(provider=bad_prov)
        with pytest.raises(ValueError, match="Invalid negative rainfall"):
            svc.get_weather_for_coordinate(30.0, 78.0)


# ---------------------------------------------------------------------------
# 5. API Endpoints Integration Tests
# ---------------------------------------------------------------------------


class TestEnvironmentalAPIEndpoints:
    """Verify HTTP API contracts for /api/locations, sub-resources, and /api/health."""

    def test_01_create_location(self, client: TestClient):
        payload = {
            "name": "Badrinath Gateway",
            "latitude": 30.743,
            "longitude": 79.493,
            "elevation": 3100.0,
            "administrative_metadata": {"corridor": "NH-7", "district": "Chamoli"},
        }
        resp = client.post("/api/locations", json=payload)
        assert resp.status_code == 201
        data = resp.json()
        assert "id" in data
        assert data["name"] == "Badrinath Gateway"
        assert data["elevation"] == 3100.0
        assert data["administrative_metadata"]["district"] == "Chamoli"

    def test_02_create_location_invalid_coords_rejected(self, client: TestClient):
        payload = {
            "name": "Invalid Point",
            "latitude": 105.0,  # Out of bounds
            "longitude": 79.0,
        }
        resp = client.post("/api/locations", json=payload)
        assert resp.status_code == 422

    def test_03_list_locations(self, client: TestClient):
        resp = client.get("/api/locations")
        assert resp.status_code == 200
        data = resp.json()
        assert "total" in data
        assert "locations" in data
        assert data["total"] >= 1

    def test_04_get_location_by_id(self, client: TestClient):
        # Create a location first
        c_resp = client.post(
            "/api/locations",
            json={"name": "Kedarnath Foothills", "latitude": 30.65, "longitude": 79.05},
        )
        loc_id = c_resp.json()["id"]

        resp = client.get(f"/api/locations/{loc_id}")
        assert resp.status_code == 200
        assert resp.json()["name"] == "Kedarnath Foothills"

    def test_05_get_unknown_location_returns_404(self, client: TestClient):
        unknown_id = str(uuid.uuid4())
        resp = client.get(f"/api/locations/{unknown_id}")
        assert resp.status_code == 404

    def test_06_get_location_terrain(self, client: TestClient):
        c_resp = client.post(
            "/api/locations",
            json={"name": "Karnaprayag", "latitude": 30.257, "longitude": 79.218},
        )
        loc_id = c_resp.json()["id"]

        resp = client.get(f"/api/locations/{loc_id}/terrain")
        assert resp.status_code == 200
        data = resp.json()
        assert "source" in data
        assert "elevation_m" in data

    def test_07_get_location_disasters(self, client: TestClient, p2b_session: Session):
        c_resp = client.post(
            "/api/locations",
            json={"name": "Nandaprayag", "latitude": 30.33, "longitude": 79.32},
        )
        loc_id = c_resp.json()["id"]

        # Insert a disaster linked to this location
        disaster_svc = DisasterDataService()
        disaster_svc.record_disaster_event(
            session=p2b_session,
            location_id=uuid.UUID(loc_id),
            event_type="flash_flood",
            latitude=30.33,
            longitude=79.32,
            source="State Disaster Response Force",
            event_date=date(2023, 8, 12),
        )
        p2b_session.commit()

        resp = client.get(f"/api/locations/{loc_id}/disasters")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) >= 1
        assert data[0]["event_type"] == "flash_flood"
        assert data[0]["source"] == "State Disaster Response Force"

    def test_08_get_location_weather_provenance(self, client: TestClient):
        c_resp = client.post(
            "/api/locations",
            json={"name": "Joshimath Station", "latitude": 30.556, "longitude": 79.566},
        )
        loc_id = c_resp.json()["id"]

        resp = client.get(f"/api/locations/{loc_id}/weather")
        assert resp.status_code == 200
        data = resp.json()
        assert "weather_source" in data
        assert "source_type" in data
        # In default offline environment, must explicitly report historical/manual, NEVER false "live"
        assert data["source_type"] in ("historical_dataset", "manual")
        assert data["is_live"] is False

    def test_09_get_location_environment_7_signals_bundle(self, client: TestClient):
        c_resp = client.post(
            "/api/locations",
            json={
                "name": "Uttarkashi Corridor",
                "latitude": 30.726,
                "longitude": 78.435,
                "administrative_metadata": {"district": "Uttarkashi"},
            },
        )
        loc_id = c_resp.json()["id"]

        resp = client.get(f"/api/locations/{loc_id}/environment")
        assert resp.status_code == 200
        bundle = resp.json()

        # Signal 1: Location & Coordinates
        assert "location" in bundle
        assert bundle["location"]["name"] == "Uttarkashi Corridor"
        assert bundle["location"]["latitude"] == 30.726

        # Signal 2-3: Topographic Terrain (Elevation, Slope, Aspect, Terrain Class)
        assert "terrain" in bundle
        assert "source" in bundle["terrain"]

        # Signal 4: Historical Disasters
        assert "historical_disasters" in bundle
        assert "location_events" in bundle["historical_disasters"]
        assert "nearby_incidents_10km" in bundle["historical_disasters"]

        # Signal 5: Weather input structure
        assert "weather" in bundle
        assert "weather_source" in bundle["weather"]
        assert bundle["weather"]["is_live"] is False

        # Signal 6-7: Scientific Provenance and Metadata
        assert "provenance" in bundle
        assert "EPSG:4326" in bundle["provenance"]["crs"]
        assert "Copernicus DEM GLO-30" in bundle["provenance"]["dem_source"]
        assert "Horn (1981)" in bundle["provenance"]["slope_algorithm"]

    def test_10_api_v1_and_api_root_compatibility(self, client: TestClient):
        # Both /api/locations and /api/v1/locations must respond
        resp_root = client.get("/api/locations")
        resp_v1 = client.get("/api/v1/locations")
        assert resp_root.status_code == 200
        assert resp_v1.status_code == 200

    def test_11_health_endpoint_availability(self, client: TestClient):
        # Both /api/health and /api/v1/health should respond
        resp_root = client.get("/api/health")
        resp_v1 = client.get("/api/v1/health")
        assert resp_root.status_code == 200
        assert resp_v1.status_code == 200
        assert resp_root.json()["status"] in ("healthy", "degraded")
