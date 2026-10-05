"""Alembic environment configuration with PostGIS and dynamic settings integration."""

from logging.config import fileConfig
import sys
from pathlib import Path

from sqlalchemy import engine_from_config, pool

from alembic import context

# Ensure workspace root is in sys.path
root_dir = Path(__file__).resolve().parents[1]
if str(root_dir) not in sys.path:
    sys.path.insert(0, str(root_dir))

from backend.app.core.config import settings
from backend.app.core.database import db_manager
from backend.app.models import Base

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def include_object(object, name, type_, reflected, compare_to):
    """Filter out PostGIS system tables from schema migrations."""
    if type_ == "table" and name in ("spatial_ref_sys", "geometry_columns", "geography_columns", "raster_columns", "raster_overviews"):
        return False
    return True


def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode generating raw SQL."""
    url = config.get_main_option("sqlalchemy.url") or settings.DATABASE_URL
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        include_object=include_object,
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Run migrations in 'online' mode against the live database."""
    # Use the synchronous engine managed by db_manager
    connectable = db_manager.get_sync_engine()

    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            include_object=include_object,
        )

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
