"""Database session and connection management for Drishti-Himalaya.

Supports both PostgreSQL 15+ (production PostGIS) and SQLite (embedded zero-setup).
"""

from typing import Generator
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker, Session

from backend.app.core.config import settings

# Determine database engine arguments based on URL protocol
connect_args = {}
if settings.DATABASE_URL.startswith("sqlite"):
    connect_args["check_same_thread"] = False

engine = create_engine(
    settings.DATABASE_URL,
    connect_args=connect_args,
    pool_pre_ping=True,
    echo=False,
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def get_db() -> Generator[Session, None, None]:
    """FastAPI dependency yielding a scoped database session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db() -> None:
    """Initialize database tables according to declared ORM metadata."""
    # Ensure all models are imported before creating tables
    import backend.app.models.alert  # noqa: F401

    Base.metadata.create_all(bind=engine)
