"""Core configuration management for Drishti-Himalaya using Pydantic Settings.

Supports DEMO (offline deterministic) and LIVE (production API/PostGIS) modes,
database connection parameters, CORS origins, and Uttarakhand spatial boundaries.
"""

from functools import lru_cache
from typing import Literal
from pydantic import AliasChoices, Field, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings with environment variable loading and validation."""

    # System Operating Mode: DEMO (local synthetic/deterministic) | LIVE (external APIs/PostGIS)
    DATA_MODE: Literal["DEMO", "LIVE"] = Field(
        default="DEMO",
        description="Operating mode: DEMO uses offline datasets, LIVE connects to external feeds.",
    )

    # Database & Supabase Persistence Configuration
    DATABASE_URL: str = Field(
        default="sqlite:///./drishti_himalaya.db",
        min_length=1,
        description="Database connection URI (SQLite for local demo, PostgreSQL/PostGIS for production).",
    )
    DATABASE_ENABLED: bool = Field(
        default=False,
        description="Explicit toggle for database persistence. False by default in local DEMO mode.",
    )
    SUPABASE_URL: str | None = Field(
        default=None,
        description="Supabase project URL.",
    )
    SUPABASE_ANON_KEY: str | None = Field(
        default=None,
        description="Supabase anonymous client API key.",
    )
    SUPABASE_SERVICE_ROLE_KEY: str | None = Field(
        default=None,
        description="Supabase privileged service role key (backend only).",
    )

    @property
    def is_postgres(self) -> bool:
        """True if the configured database URI targets PostgreSQL/Supabase."""
        return self.DATABASE_URL.lower().startswith(("postgresql", "postgres"))

    @property
    def async_database_url(self) -> str:
        """Produce an async-driver-compatible connection string."""
        url = self.DATABASE_URL
        if url.startswith("postgresql://"):
            return url.replace("postgresql://", "postgresql+asyncpg://", 1)
        elif url.startswith("postgres://"):
            return url.replace("postgres://", "postgresql+asyncpg://", 1)
        elif url.startswith("sqlite:///"):
            return url.replace("sqlite:///", "sqlite+aiosqlite:///", 1)
        return url


    # Server Configuration
    HOST: str = Field(default="127.0.0.1", description="Host address for the ASGI server.")
    PORT: int = Field(default=8000, description="Listening port for the ASGI server.")
    DEBUG: bool = Field(default=True, description="Enable debug mode and verbose log outputs.")
    ENVIRONMENT: str = Field(default="development", description="Runtime environment name.")

    # CORS Origins (accepts comma-separated string or list of origins)
    CORS_ORIGINS: list[str] = Field(
        default=["http://localhost:5173", "http://127.0.0.1:5173"],
        description="Allowed CORS origins for frontend web communication.",
    )

    # Uttarakhand Spatial Bounding Box
    LAT_MIN: float = Field(
        default=28.7,
        validation_alias=AliasChoices("LAT_MIN", "MIN_LAT"),
        description="Southern latitude boundary of Uttarakhand corridor.",
    )
    LAT_MAX: float = Field(
        default=31.5,
        validation_alias=AliasChoices("LAT_MAX", "MAX_LAT"),
        description="Northern latitude boundary of Uttarakhand corridor.",
    )
    LON_MIN: float = Field(
        default=77.5,
        validation_alias=AliasChoices("LON_MIN", "MIN_LON"),
        description="Western longitude boundary of Uttarakhand corridor.",
    )
    LON_MAX: float = Field(
        default=81.1,
        validation_alias=AliasChoices("LON_MAX", "MAX_LON"),
        description="Eastern longitude boundary of Uttarakhand corridor.",
    )

    # Route Segmentation Configuration
    SEGMENT_LENGTH_M: float = Field(
        default=250.0,
        gt=0,
        validation_alias=AliasChoices("SEGMENT_LENGTH_M", "SPATIAL_SEGMENT_LENGTH_METERS"),
        description="Discrete road segment length in meters for risk scoring.",
    )

    # Topographic DEM Configuration
    DEM_DIRECTORY: str = Field(
        default="data/raw/dem/copernicus_glo30",
        validation_alias=AliasChoices("DEM_DIRECTORY", "COPERNICUS_DEM_DIR", "DEM_DIR"),
        description="Path to local Copernicus GLO-30 DEM raster directory.",
    )

    # Road Cut-Slope Configuration (OpenStreetMap)
    OSM_CUT_SLOPES_PATH: str = Field(
        default="data/raw/osm/uttarakhand_cut_slopes.geojson",
        validation_alias=AliasChoices("OSM_CUT_SLOPES_PATH", "CUT_SLOPES_PATH", "OSM_CUT_SLOPE_PATH"),
        description="Path to OpenStreetMap road cut-slope GeoJSON dataset for Uttarakhand.",
    )

    # External APIs and Cache
    OPENROUTESERVICE_API_KEY: str | None = Field(
        default=None,
        validation_alias=AliasChoices("OPENROUTESERVICE_API_KEY", "ORS_API_KEY"),
        description="API key for OpenRouteService directions (optional in DEMO mode).",
    )

    @property
    def ORS_API_KEY(self) -> str | None:
        """Convenience alias property for OPENROUTESERVICE_API_KEY."""
        return self.OPENROUTESERVICE_API_KEY
    ORS_BASE_URL: str = Field(
        default="https://api.heigit.org/openrouteservice/v2/directions/driving-car/geojson",
        validation_alias=AliasChoices("ORS_BASE_URL", "OPENROUTESERVICE_BASE_URL"),
        description="Base URL for OpenRouteService directions endpoint.",
    )
    ORS_PROFILE: str = Field(
        default="driving-car",
        description="Routing profile for vehicle traversal (e.g. driving-car).",
    )
    ORS_MAX_ALTERNATIVE_DISTANCE_METERS: float = Field(
        default=100000.0,
        gt=0,
        validation_alias=AliasChoices(
            "ORS_MAX_ALTERNATIVE_DISTANCE_METERS",
            "ORS_MAX_ALTERNATIVE_DISTANCE_M",
            "MAX_ALTERNATIVE_ROUTE_DISTANCE_METERS",
        ),
        description="Maximum approximated route distance in meters supported by HeiGIT native alternative-route algorithm.",
    )
    ORS_DEFAULT_SNAPPING_RADIUS_METERS: float = Field(
        default=350.0,
        gt=0,
        validation_alias=AliasChoices("ORS_DEFAULT_SNAPPING_RADIUS_METERS", "ORS_DEFAULT_SNAPPING_RADIUS_M"),
        description="Default road-snapping search radius in meters for ORS driving-car profile.",
    )
    ORS_SNAPPING_RETRY_RADII_METERS: list[float] = Field(
        default=[1000.0, 2000.0, 3000.0],
        description="Progressive search radius thresholds in meters when error 2010 occurs.",
    )
    ORS_MAX_SNAPPING_RADIUS_METERS: float = Field(
        default=3000.0,
        gt=0,
        validation_alias=AliasChoices("ORS_MAX_SNAPPING_RADIUS_METERS", "ORS_MAX_SNAPPING_RADIUS_M"),
        description="Maximum permissible road-snapping radius in meters for Himalayan settlements.",
    )
    OPEN_METEO_BASE_URL: str = Field(
        default="https://api.open-meteo.com/v1/forecast",
        description="Base URL for Open-Meteo weather forecasts.",
    )
    WEATHER_API_KEY: str | None = Field(
        default=None,
        description="Optional API key for external commercial weather provider.",
    )
    WEATHER_CACHE_TTL_HOURS: int = Field(
        default=3,
        gt=0,
        description="Cache time-to-live in hours for meteorological observations.",
    )

    model_config = SettingsConfigDict(
        env_file=(".env", "../.env", "../../.env"),
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    @field_validator("DATA_MODE", mode="before")
    @classmethod
    def normalize_data_mode(cls, v: object) -> object:
        """Normalize DATA_MODE string to uppercase before validation."""
        if isinstance(v, str):
            v_upper = v.strip().upper()
            if v_upper in ("DEMO", "LIVE"):
                return v_upper
        return v

    @field_validator("CORS_ORIGINS", mode="before")
    @classmethod
    def parse_cors_origins(cls, v: object) -> list[str]:
        """Parse comma-separated string or list into a list of trimmed origin strings."""
        if isinstance(v, str):
            return [origin.strip() for origin in v.split(",") if origin.strip()]
        if isinstance(v, (list, tuple)):
            return [str(origin).strip() for origin in v if str(origin).strip()]
        return v  # type: ignore[return-value]

    @model_validator(mode="after")
    def validate_spatial_bounds(self) -> "Settings":
        """Ensure coordinate boundaries form a valid bounding box."""
        if self.LAT_MIN >= self.LAT_MAX:
            raise ValueError(
                f"LAT_MIN ({self.LAT_MIN}) must be strictly less than LAT_MAX ({self.LAT_MAX})."
            )
        if self.LON_MIN >= self.LON_MAX:
            raise ValueError(
                f"LON_MIN ({self.LON_MIN}) must be strictly less than LON_MAX ({self.LON_MAX})."
            )
        return self


@lru_cache()
def get_settings() -> Settings:
    """Return a cached singleton instance of application settings."""
    return Settings()


# Singleton instance for standard import across application modules
settings: Settings = get_settings()

__all__ = ["Settings", "get_settings", "settings"]
