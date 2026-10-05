"""Database connection management and session factories for Drishti-Himalaya.

Supports Supabase PostgreSQL + PostGIS in production and SQLite for offline demo mode.
Provides both synchronous (Alembic/sync services) and asynchronous (FastAPI/asyncpg) engines.
"""

from contextlib import asynccontextmanager, contextmanager
import logging
from typing import AsyncGenerator, Generator, Optional, Tuple
from urllib.parse import urlparse

from sqlalchemy import create_engine, event, text
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from backend.app.core.config import settings

logger = logging.getLogger(__name__)


class Base(DeclarativeBase):
    """Base declarative class for all Drishti-Himalaya SQLAlchemy models."""

    pass


class DatabaseManager:
    """Centralized lifecycle and session manager for relational persistence."""

    def __init__(self) -> None:
        self._sync_engine = None
        self._async_engine: Optional[AsyncEngine] = None
        self._sync_sessionmaker = None
        self._async_sessionmaker = None

    def get_sync_engine(self):
        """Lazily initialize and return the synchronous SQLAlchemy engine."""
        if self._sync_engine is None:
            db_url = settings.DATABASE_URL
            connect_args = {}
            if db_url.startswith("sqlite"):
                connect_args["check_same_thread"] = False
                self._sync_engine = create_engine(
                    db_url,
                    connect_args=connect_args,
                    echo=False,
                )
                @event.listens_for(self._sync_engine, "connect")
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
            else:
                # Production PostgreSQL / Supabase
                self._sync_engine = create_engine(
                    db_url,
                    pool_size=10,
                    max_overflow=20,
                    pool_pre_ping=True,
                    echo=False,
                )
            self._sync_sessionmaker = sessionmaker(
                bind=self._sync_engine,
                autocommit=False,
                autoflush=False,
                expire_on_commit=False,
            )
        return self._sync_engine

    def get_async_engine(self) -> AsyncEngine:
        """Lazily initialize and return the asynchronous SQLAlchemy engine."""
        if self._async_engine is None:
            async_url = settings.async_database_url
            if async_url.startswith("sqlite"):
                # SQLite async via aiosqlite if available, else in-memory dummy
                self._async_engine = create_async_engine(
                    async_url,
                    echo=False,
                )
            else:
                self._async_engine = create_async_engine(
                    async_url,
                    pool_size=10,
                    max_overflow=20,
                    pool_pre_ping=True,
                    echo=False,
                )
            self._async_sessionmaker = async_sessionmaker(
                bind=self._async_engine,
                autocommit=False,
                autoflush=False,
                expire_on_commit=False,
            )
        return self._async_engine

    @contextmanager
    def session(self) -> Generator[Session, None, None]:
        """Provide a transactional synchronous session scope."""
        self.get_sync_engine()
        session = self._sync_sessionmaker()
        try:
            yield session
            session.commit()
        except Exception:
            session.rollback()
            raise
        finally:
            session.close()

    session_scope = session

    @asynccontextmanager
    async def async_session(self) -> AsyncGenerator[AsyncSession, None]:
        """Provide a transactional asynchronous session scope."""
        self.get_async_engine()
        session = self._async_sessionmaker()
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()

    def check_readiness(self) -> Tuple[bool, str, dict]:
        """Inspect database reachability and verify PostGIS extension when PostgreSQL is configured.

        Returns (is_ready, descriptor, details_dict).
        """
        db_url = settings.DATABASE_URL
        if not settings.DATABASE_ENABLED and db_url.startswith("sqlite"):
            return (
                True,
                "connected (SQLite DEMO mode)",
                {"driver": "sqlite", "postgis": False, "mode": "DEMO"},
            )

        if db_url.startswith("sqlite"):
            try:
                engine = self.get_sync_engine()
                with engine.connect() as conn:
                    conn.execute(text("SELECT 1;"))
                return (
                    True,
                    "connected (SQLite)",
                    {"driver": "sqlite", "postgis": False, "mode": "LOCAL"},
                )
            except Exception as exc:
                return (
                    False,
                    f"disconnected (SQLite error: {exc})",
                    {"driver": "sqlite", "error": str(exc)},
                )
        elif settings.is_postgres:
            try:
                engine = self.get_sync_engine()
                with engine.connect() as conn:
                    conn.execute(text("SELECT 1;"))
                    # Verify PostGIS extension
                    postgis_ver = None
                    try:
                        res = conn.execute(text("SELECT postgis_version();"))
                        postgis_ver = res.scalar()
                    except Exception:
                        pass
                if postgis_ver:
                    return (
                        True,
                        f"connected (PostgreSQL with PostGIS {postgis_ver})",
                        {"driver": "postgresql", "postgis": True, "version": str(postgis_ver)},
                    )
                return (
                    True,
                    "connected (PostgreSQL, PostGIS extension not active)",
                    {"driver": "postgresql", "postgis": False},
                )
            except Exception as exc:
                return (
                    False,
                    f"disconnected (PostgreSQL connection failed: {exc.__class__.__name__})",
                    {"driver": "postgresql", "error": str(exc)},
                )
        return (
            False,
            f"disconnected (unsupported URI scheme: {urlparse(db_url).scheme})",
            {"driver": "unknown"},
        )


db_manager = DatabaseManager()


def get_db() -> Generator[Session, None, None]:
    """FastAPI dependency for synchronous DB session injection."""
    with db_manager.session() as s:
        yield s


async def get_async_db() -> AsyncGenerator[AsyncSession, None]:
    """FastAPI dependency for asynchronous DB session injection."""
    async with db_manager.async_session() as s:
        yield s
