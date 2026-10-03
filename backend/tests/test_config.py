"""Tests for core configuration settings in Drishti-Himalaya."""

import pytest
from pydantic import ValidationError

from backend.app.core.config import Settings, get_settings, settings


class TestConfigSettings:
    """Test suite for Settings validation and defaults."""

    def test_default_data_mode_is_demo(self) -> None:
        """1. Verify that the default DATA_MODE is DEMO."""
        cfg = Settings(_env_file=None)
        assert cfg.DATA_MODE == "DEMO"

    def test_default_segment_length_is_250_meters(self) -> None:
        """2. Verify that the default route segment length is 250.0 meters."""
        cfg = Settings(_env_file=None)
        assert cfg.SEGMENT_LENGTH_M == 250.0

    def test_uttarakhand_bounds_are_correct(self) -> None:
        """3. Verify documented Uttarakhand spatial boundaries."""
        cfg = Settings(_env_file=None)
        assert cfg.LAT_MIN == 28.7
        assert cfg.LAT_MAX == 31.5
        assert cfg.LON_MIN == 77.5
        assert cfg.LON_MAX == 81.1
        assert cfg.LAT_MIN < cfg.LAT_MAX
        assert cfg.LON_MIN < cfg.LON_MAX

    def test_settings_accepts_valid_database_url(self) -> None:
        """4. Verify that Settings accepts valid SQLite and PostgreSQL DATABASE_URLs."""
        sqlite_cfg = Settings(
            DATABASE_URL="sqlite:///./test_drishti.db",
            _env_file=None,
        )
        assert sqlite_cfg.DATABASE_URL == "sqlite:///./test_drishti.db"

        pg_cfg = Settings(
            DATABASE_URL="postgresql://user:pass@localhost:5432/drishti_himalaya",
            _env_file=None,
        )
        assert pg_cfg.DATABASE_URL == "postgresql://user:pass@localhost:5432/drishti_himalaya"

    def test_invalid_data_mode_is_rejected(self) -> None:
        """5. Verify that any DATA_MODE other than DEMO or LIVE is rejected."""
        with pytest.raises(ValidationError) as exc_info:
            Settings(DATA_MODE="STAGING", _env_file=None)  # type: ignore[arg-type]

        errors = exc_info.value.errors()
        assert any(err["loc"] == ("DATA_MODE",) for err in errors)

    def test_invalid_segment_length_is_rejected(self) -> None:
        """6. Verify that non-positive segment lengths are rejected."""
        # Zero length
        with pytest.raises(ValidationError) as exc_zero:
            Settings(SEGMENT_LENGTH_M=0, _env_file=None)
        assert any(err["loc"] == ("SEGMENT_LENGTH_M",) for err in exc_zero.value.errors())

        # Negative length
        with pytest.raises(ValidationError) as exc_neg:
            Settings(SEGMENT_LENGTH_M=-100.0, _env_file=None)
        assert any(err["loc"] == ("SEGMENT_LENGTH_M",) for err in exc_neg.value.errors())

    def test_data_mode_case_insensitive_normalization(self) -> None:
        """Verify that lowercase 'demo' or 'live' are normalized properly."""
        cfg_demo = Settings(DATA_MODE="demo", _env_file=None)
        assert cfg_demo.DATA_MODE == "DEMO"

        cfg_live = Settings(DATA_MODE="live", _env_file=None)
        assert cfg_live.DATA_MODE == "LIVE"

    def test_cors_origins_parsing(self) -> None:
        """Verify that CORS origins can be provided as a comma-separated string or list."""
        cfg_str = Settings(
            CORS_ORIGINS="http://localhost:3000, http://example.com",  # type: ignore[arg-type]
            _env_file=None,
        )
        assert cfg_str.CORS_ORIGINS == ["http://localhost:3000", "http://example.com"]

        cfg_list = Settings(
            CORS_ORIGINS=["http://localhost:5173", "http://127.0.0.1:5173"],
            _env_file=None,
        )
        assert cfg_list.CORS_ORIGINS == ["http://localhost:5173", "http://127.0.0.1:5173"]

    def test_invalid_spatial_bounds_rejected(self) -> None:
        """Verify that inverted latitude or longitude bounds are rejected."""
        with pytest.raises(ValidationError):
            Settings(LAT_MIN=32.0, LAT_MAX=28.0, _env_file=None)

        with pytest.raises(ValidationError):
            Settings(LON_MIN=82.0, LON_MAX=76.0, _env_file=None)

    def test_alias_support(self) -> None:
        """Verify that legacy alias keys (MIN_LAT, SPATIAL_SEGMENT_LENGTH_METERS) populate correctly."""
        cfg = Settings(
            MIN_LAT=29.0,  # type: ignore[call-arg]
            SPATIAL_SEGMENT_LENGTH_METERS=500.0,  # type: ignore[call-arg]
            _env_file=None,
        )
        assert cfg.LAT_MIN == 29.0
        assert cfg.SEGMENT_LENGTH_M == 500.0

    def test_singleton_accessor(self) -> None:
        """Verify that get_settings() returns a cached instance and settings is accessible."""
        instance1 = get_settings()
        instance2 = get_settings()
        assert instance1 is instance2
        assert settings is not None
        assert isinstance(settings.DATA_MODE, str)

    def test_ors_base_url_default_and_alias(self) -> None:
        """Verify that ORS_BASE_URL defaults to HeiGIT endpoint and accepts alias."""
        cfg_default = Settings(_env_file=None)
        assert cfg_default.ORS_BASE_URL == "https://api.heigit.org/openrouteservice/v2/directions/driving-car/geojson"

        cfg_alias = Settings(OPENROUTESERVICE_BASE_URL="https://custom.ors/v2", _env_file=None)  # type: ignore[call-arg]
        assert cfg_alias.ORS_BASE_URL == "https://custom.ors/v2"
