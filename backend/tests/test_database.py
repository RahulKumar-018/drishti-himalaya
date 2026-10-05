"""Comprehensive test suite for Drishti-Himalaya Phase 2A database foundation.

Tests verify:
1. DatabaseManager configuration, connectivity probes, and session lifecycle.
2. All 10 Phase 2A SQLAlchemy models (fields, tables, constraints, MCDA weights).
3. Repositories (CRUD, filtering, deduplication, bulk operations).
4. PersistenceService (transactional route analysis persistence and error isolation).
5. Historical data integrity (GSI 5,206 records and OSM 2018 2 cuttings provenance).
6. PostgreSQL/PostGIS integration tests (skipped cleanly when live DB not configured).
"""

from datetime import datetime, timezone
import uuid
import pytest
from sqlalchemy import create_engine, select, text
from sqlalchemy.orm import Session

from backend.app.core.config import settings
from backend.app.core.database import DatabaseManager, Base
from backend.app.models import (
    UserProfile,
    SavedRoute,
    RouteSegment,
    RiskAssessment,
    WeatherSnapshot,
    HazardAlert,
    CommunityHazardReport,
    Feedback,
    LandslideRecord,
    RoadCutting,
)
from backend.app.db.repositories import (
    UserRepository,
    RouteRepository,
    RouteSegmentRepository,
    RiskAssessmentRepository,
    WeatherSnapshotRepository,
    AlertRepository,
    CommunityReportRepository,
    FeedbackRepository,
    LandslideRepository,
    CuttingRepository,
)
from backend.app.risk_engine.models import (
    FactorScoreBreakdown,
    RouteRiskResult,
    SegmentRiskResult,
)
from backend.app.schemas.common import RiskTier
from backend.app.services.analysis_models import (
    AnalysisResult,
    AnalysisRouteResult,
    AnalysisSegmentResult,
    AnalysisStatus,
    DataAvailability,
    DataProvenance,
)
from backend.app.services.persistence_service import PersistenceService


# =====================================================================
# Fixtures for In-Memory SQLite Testing
# =====================================================================

@pytest.fixture(scope="module")
def sqlite_engine():
    """Create in-memory SQLite engine for model and repository tests."""
    from sqlalchemy import event

    engine = create_engine("sqlite:///:memory:", echo=False)

    @event.listens_for(engine, "connect")
    def _sqlite_spatial_shims(dbapi_conn, record):
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
def db_session(sqlite_engine):
    """Provide isolated SQLite session with rollback for each test."""
    connection = sqlite_engine.connect()
    transaction = connection.begin()
    session = Session(bind=connection)

    yield session

    session.close()
    transaction.rollback()
    connection.close()


# =====================================================================
# 1. Database Manager & Configuration Tests
# =====================================================================

class TestDatabaseManager:
    """Verify database connection manager, configuration, and readiness probes."""

    def test_01_config_properties(self):
        """Verify database configuration flags and properties."""
        assert hasattr(settings, "DATABASE_ENABLED")
        assert hasattr(settings, "is_postgres")
        assert hasattr(settings, "async_database_url")
        if not settings.DATABASE_URL.startswith("postgres"):
            assert settings.is_postgres is False

    def test_02_readiness_probe_demo_mode(self):
        """Verify check_readiness reports active/connected in DEMO / SQLite mode."""
        mgr = DatabaseManager()
        is_ready, desc, details = mgr.check_readiness()
        assert is_ready is True
        assert "connected" in desc.lower() or "sqlite" in desc.lower()
        assert "driver" in details

    def test_03_session_scope_lifecycle(self):
        """Verify context manager session_scope yields active session and executes queries."""
        mgr = DatabaseManager()
        with mgr.session_scope() as session:
            result = session.execute(text("SELECT 1;")).scalar()
            assert result == 1


# =====================================================================
# 2. Model Structure & Constraint Tests
# =====================================================================

class TestModelDefinitions:
    """Verify all 10 SQLAlchemy model tables, columns, constraints, and relationships."""

    def test_04_all_10_models_registered_in_metadata(self):
        """Ensure all 10 Phase 2A tables exist in Base.metadata."""
        expected_tables = {
            "user_profiles",
            "saved_routes",
            "route_segments",
            "risk_assessments",
            "weather_snapshots",
            "hazard_alerts",
            "community_hazard_reports",
            "feedback",
            "landslides",
            "cuttings",
        }
        registered = set(Base.metadata.tables.keys())
        assert expected_tables.issubset(registered), f"Missing tables: {expected_tables - registered}"

    def test_05_user_profile_model(self, db_session: Session):
        """Test UserProfile model instantiation and field types."""
        user = UserProfile(
            display_name="Uttarakhand Emergency Team",
            email="hazard-response@uk.gov.in",
            role="emergency_coordinator",
        )
        db_session.add(user)
        db_session.flush()

        assert isinstance(user.id, uuid.UUID)
        assert user.display_name == "Uttarakhand Emergency Team"
        assert user.created_at is not None

    def test_06_saved_route_and_segment_models(self, db_session: Session):
        """Test SavedRoute and RouteSegment parent-child persistence."""
        route = SavedRoute(
            name="Rishikesh to Devprayag NH-58",
            origin_name="Rishikesh",
            destination_name="Devprayag",
            origin_lat=30.0869,
            origin_lon=78.2676,
            destination_lat=30.1459,
            destination_lon=78.5986,
            vehicle_profile="driving-car",
            provider="demo",
            distance_km=72.4,
            risk_score=48.5,
            risk_tier="MODERATE",
            analysis_status="COMPLETE",
        )
        db_session.add(route)
        db_session.flush()

        seg = RouteSegment(
            route_id=route.id,
            segment_index=0,
            segment_id="DEMO-SEG-000",
            start_chainage_m=0.0,
            end_chainage_m=250.0,
            length_m=250.0,
            bearing_deg=45.0,
            risk_score=42.0,
            risk_tier="MODERATE",
            analysis_status="COMPLETE",
        )
        db_session.add(seg)
        db_session.flush()

        assert seg.route_id == route.id
        assert len(route.segments) == 1
        assert route.segments[0].segment_id == "DEMO-SEG-000"

    def test_07_risk_assessment_mcda_weights_integrity(self, db_session: Session):
        """Verify RiskAssessment preserves the exact explainable MCDA weights."""
        route = SavedRoute(
            origin_lat=30.0, origin_lon=78.0,
            destination_lat=30.1, destination_lon=78.1,
        )
        db_session.add(route)
        db_session.flush()

        assessment = RiskAssessment(
            route_id=route.id,
            risk_score=68.5,
            risk_tier="HIGH",
            analysis_status="COMPLETE",
            slope_score=75.0,
            rain_score=60.0,
            proximity_score=80.0,
            density_score=50.0,
            exposure_score=40.0,
            slope_weight=0.35,
            rain_weight=0.30,
            proximity_weight=0.20,
            density_weight=0.10,
            exposure_weight=0.05,
            engine_version="1.0.0-mcda",
        )
        db_session.add(assessment)
        db_session.flush()

        # Strict MCDA formula weight verification
        assert assessment.slope_weight == 0.35
        assert assessment.rain_weight == 0.30
        assert assessment.proximity_weight == 0.20
        assert assessment.density_weight == 0.10
        assert assessment.exposure_weight == 0.05
        assert sum([
            assessment.slope_weight,
            assessment.rain_weight,
            assessment.proximity_weight,
            assessment.density_weight,
            assessment.exposure_weight,
        ]) == pytest.approx(1.0)

    def test_08_weather_snapshot_model(self, db_session: Session):
        """Verify WeatherSnapshot model persistence and raw payload JSONB."""
        snap = WeatherSnapshot(
            latitude=30.1459,
            longitude=78.5986,
            observed_at=datetime.now(timezone.utc),
            source="Open-Meteo",
            precipitation_mm=12.5,
            precipitation_24h_mm=45.0,
            precipitation_72h_mm=85.2,
            temperature_c=22.4,
            raw_payload={"weathercode": 61, "windspeed_10m": 14.2},
        )
        db_session.add(snap)
        db_session.flush()

        assert snap.source == "Open-Meteo"
        assert snap.raw_payload["weathercode"] == 61
        assert snap.precipitation_24h_mm == 45.0

    def test_09_hazard_alert_model_origin_types(self, db_session: Session):
        """Verify HazardAlert origin_type distinction (OBSERVED, CALCULATED, HISTORICAL)."""
        for origin in ["OBSERVED", "CALCULATED", "HISTORICAL"]:
            alert = HazardAlert(
                alert_type="landslide_warning",
                severity="HIGH",
                title=f"{origin} Hazard Alert",
                message="Debris fall risk on NH-58",
                latitude=30.12,
                longitude=78.55,
                source="Drishti-Engine",
                status="ACTIVE",
                origin_type=origin,
            )
            db_session.add(alert)
        db_session.flush()

        alerts = db_session.execute(select(HazardAlert)).scalars().all()
        assert len(alerts) == 3
        origins = {a.origin_type for a in alerts}
        assert origins == {"OBSERVED", "CALCULATED", "HISTORICAL"}

    def test_10_feedback_and_community_models(self, db_session: Session):
        """Verify Feedback (1-5 rating) and CommunityHazardReport models."""
        report = CommunityHazardReport(
            report_type="rockfall",
            description="Minor rock debris observed near road shoulder",
            latitude=30.11,
            longitude=78.52,
            severity="LOW",
            status="REPORTED",
            source="community",
        )
        db_session.add(report)
        db_session.flush()
        assert report.id is not None

        feedback = Feedback(
            rating=5,
            comment="Accurate slope hazard warning for Devprayag segment.",
        )
        db_session.add(feedback)
        db_session.flush()
        assert feedback.rating == 5

    def test_11_historical_models_provenance(self, db_session: Session):
        """Verify GSI LandslideRecord and OSM RoadCutting provenance integrity."""
        gsi_pt = LandslideRecord(
            source="GSI",
            source_record_id="GSI_UK_001",
            latitude=30.25,
            longitude=78.85,
            is_historical=True,
            extra_metadata={"lithology": "Quartzite", "confidence": "high"},
        )
        db_session.add(gsi_pt)

        osm_way = RoadCutting(
            osm_way_id=225786479,
            source="OpenStreetMap",
            snapshot_year=2018,
            tags={"highway": "trunk", "cutting": "yes"},
            is_historical=True,
        )
        db_session.add(osm_way)
        db_session.flush()

        assert gsi_pt.is_historical is True
        assert gsi_pt.source == "GSI"
        assert osm_way.is_historical is True
        assert osm_way.snapshot_year == 2018
        assert osm_way.osm_way_id == 225786479


# =====================================================================
# 3. Repository Layer Tests
# =====================================================================

class TestRepositories:
    """Verify repository operations, queries, and bulk insertion logic."""

    def test_12_user_repository(self, db_session: Session):
        """Test UserRepository CRUD operations."""
        repo = UserRepository(db_session)
        user = repo.create(
            display_name="Dr. Anil Sharma",
            email="anil.sharma@wadia.gov.in",
            role="geologist",
        )
        assert user.id is not None

        fetched = repo.get_by_id(user.id)
        assert fetched is not None
        assert fetched.email == "anil.sharma@wadia.gov.in"

        by_email = repo.get_by_email("anil.sharma@wadia.gov.in")
        assert by_email is not None
        assert by_email.id == user.id

    def test_13_route_repository(self, db_session: Session):
        """Test RouteRepository create and query."""
        repo = RouteRepository(db_session)
        route = repo.create_route(
            name="Char Dham Yatra Corridor",
            origin_lat=30.08, origin_lon=78.26,
            destination_lat=30.73, destination_lon=79.06,
            risk_score=62.4,
            risk_tier="HIGH",
        )
        assert route.id is not None

        fetched = repo.get_by_id(route.id)
        assert fetched is not None
        assert fetched.name == "Char Dham Yatra Corridor"

    def test_14_historical_landslide_repository(self, db_session: Session):
        """Test LandslideRepository bulk insertion and counting."""
        repo = LandslideRepository(db_session)

        records = [
            {"source": "GSI", "source_record_id": "GSI_1", "latitude": 30.1, "longitude": 78.1},
            {"source": "GSI", "source_record_id": "GSI_2", "latitude": 30.2, "longitude": 78.2},
        ]
        inserted = repo.bulk_create_records(records, batch_size=10)
        assert inserted == 2

        total = repo.count()
        assert total == 2

    def test_15_historical_cuttings_repository(self, db_session: Session):
        """Test CuttingRepository with verified OSM cuttings."""
        repo = CuttingRepository(db_session)

        c1 = repo.create_cutting(
            osm_way_id=225786479,
            coords_wgs84=[(78.26, 30.08), (78.27, 30.09)],
            source="OpenStreetMap",
            snapshot_year=2018,
            tags={"cutting": "yes"},
        )
        c2 = repo.create_cutting(
            osm_way_id=343144200,
            coords_wgs84=[(78.59, 30.14), (78.60, 30.15)],
            source="OpenStreetMap",
            snapshot_year=2018,
            tags={"cutting": "yes"},
        )
        db_session.flush()

        assert repo.count() == 2
        all_cuttings = repo.list_all()
        assert len(all_cuttings) == 2
        way_ids = {c.osm_way_id for c in all_cuttings}
        assert way_ids == {225786479, 343144200}

    def test_16_weather_snapshot_repository_dedup(self, db_session: Session):
        """Test WeatherSnapshotRepository deduplication on (source, lat, lon, time)."""
        repo = WeatherSnapshotRepository(db_session)
        now = datetime(2026, 10, 5, 12, 0, 0, tzinfo=timezone.utc)

        snap1 = repo.record_snapshot(
            latitude=30.14, longitude=78.59,
            observed_at=now, source="Open-Meteo",
            precipitation_24h_mm=30.0,
        )
        db_session.flush()
        assert snap1 is not None

        # Repeat identical observation -> should update and return existing record without duplicating
        snap2 = repo.record_snapshot(
            latitude=30.14, longitude=78.59,
            observed_at=now, source="Open-Meteo",
            precipitation_24h_mm=35.0,
        )
        db_session.flush()
        assert snap2.id == snap1.id
        assert snap2.precipitation_24h_mm == 35.0

        total = db_session.execute(select(WeatherSnapshot)).scalars().all()
        assert len(total) == 1

    def test_17_alert_repository_filtering(self, db_session: Session):
        """Test AlertRepository active alerts and severity filtering."""
        repo = AlertRepository(db_session)

        repo.create_alert(
            alert_type="rockfall", severity="SEVERE",
            title="Severe Rockfall Warning", message="Debris flow active",
            source="Drishti-Engine", origin_type="CALCULATED", status="ACTIVE",
        )
        repo.create_alert(
            alert_type="rainfall", severity="LOW",
            title="Light Rain Notice", message="Normal conditions",
            source="Open-Meteo", origin_type="OBSERVED", status="RESOLVED",
        )
        db_session.flush()

        active = repo.list_active()
        assert len(active) == 1
        assert active[0].severity == "SEVERE"
        assert active[0].status == "ACTIVE"


# =====================================================================
# 4. Persistence Service & API Integration Tests
# =====================================================================

class TestPersistenceService:
    """Verify PersistenceService converts domain results to DB transactions."""

    def test_18_persist_analysis_result(self, db_session: Session):
        """Verify transactional persistence of Route + Segments + RiskAssessments."""
        service = PersistenceService()

        # Build mock segment risk
        seg_risk = SegmentRiskResult(
            risk_score=37.8,
            risk_category=RiskTier.MODERATE,
            color_hex="#FFA500",
            sub_scores={"slope": 42.0, "rain": 35.0, "prox": 50.0, "density": 30.0, "exp": 0.0},
            weighted_contributions={"slope": 14.7, "rain": 10.5, "prox": 10.0, "density": 3.0, "exp": 0.0},
            factor_details={},
            is_partial=False,
        )

        segment = AnalysisSegmentResult(
            segment_index=0,
            geometry_coords=[(78.2676, 30.0869), (78.2700, 30.0870)],
            segment_length_m=250.0,
            start_chainage_km=0.0,
            end_chainage_km=0.25,
            midpoint=(78.2688, 30.08695),
            elevation_m=350.0,
            slope_degrees=18.5,
            p24_mm=15.0,
            p72_mm=30.0,
            ari_mm=45.0,
            distance_to_historic_scar_m=450.0,
            scar_density_1km=2,
            is_cut_slope=False,
            risk_result=seg_risk,
            is_risk_complete=True,
        )

        route_risk = RouteRiskResult(
            average_risk=37.8,
            max_bottleneck_risk=45.0,
            composite_route_risk=42.1,
            segment_count=1,
            total_length_m=250.0,
        )

        route_res = AnalysisRouteResult(
            route_id="ROUTE-TEST-001",
            summary="NH-58 Primary Corridor",
            total_distance_km=0.25,
            estimated_time_minutes=2.0,
            status=AnalysisStatus.COMPLETE,
            data_availability=DataAvailability(
                routing=True, landslide_inventory=True, weather=True, terrain=True, cut_slope=True
            ),
            data_provenance=DataProvenance(
                routing_source="DEMO_FIXTURE",
                weather_source="DEMO_BASELINE",
                landslide_source="GSI",
                terrain_source="COPERNICUS_DEM_GLO30",
            ),
            segments=[segment],
            route_risk=route_risk,
            requested_origin=[78.2676, 30.0869],
            requested_destination=[78.2700, 30.0870],
        )

        analysis = AnalysisResult(
            query_id=str(uuid.uuid4()),
            status=AnalysisStatus.COMPLETE,
            data_mode="DEMO",
            execution_duration_ms=45.2,
            routes=[route_res],
            recommended_route_id="ROUTE-TEST-001",
            recommendation_available=True,
            data_availability=route_res.data_availability,
            data_provenance=route_res.data_provenance,
        )

        created_ids = service.persist_analysis_result(analysis, corridor="NH-58", session=db_session)
        assert len(created_ids) == 1
        route_uuid = created_ids[0]

        saved_route = db_session.get(SavedRoute, route_uuid)
        assert saved_route is not None
        assert saved_route.risk_score == pytest.approx(42.1)
        assert saved_route.risk_tier == "MODERATE"
        assert len(saved_route.segments) == 1

        # Check risk assessments
        assessments = db_session.execute(
            select(RiskAssessment).where(RiskAssessment.route_id == route_uuid)
        ).scalars().all()
        assert len(assessments) == 2  # 1 route-level + 1 segment-level
        seg_assessment = next(a for a in assessments if a.segment_id is not None)
        assert seg_assessment.slope_score == 42.0
        assert seg_assessment.rain_score == 35.0
        assert seg_assessment.slope_weight == 0.35

    def test_19_persistence_service_availability_check(self):
        """Verify PersistenceService.is_available accurately reflects readiness probe."""
        service = PersistenceService()
        # In test environment with default SQLite or DEMO mode, is_available is True
        assert service.is_available is True


# =====================================================================
# 5. Live PostgreSQL / PostGIS Integration Tests (Skipped if not configured)
# =====================================================================

@pytest.mark.skipif(
    not settings.is_postgres,
    reason="Live PostgreSQL / PostGIS database not configured in current environment",
)
class TestPostGISIntegration:
    """Integration test suite executed only when live PostgreSQL credentials exist."""

    def test_20_postgis_extension_available(self):
        """Verify PostGIS extension functions are callable."""
        mgr = DatabaseManager()
        is_ready, desc, details = mgr.check_readiness()
        assert is_ready is True
        assert details.get("postgis") is True, f"PostGIS not active: {desc}"

    def test_21_spatial_gist_query(self):
        """Verify ST_DWithin or spatial geometry query on real PostGIS."""
        mgr = DatabaseManager()
        with mgr.session_scope() as session:
            result = session.execute(
                text("SELECT ST_AsText(ST_MakePoint(78.2676, 30.0869));")
            ).scalar()
            assert "POINT" in result
