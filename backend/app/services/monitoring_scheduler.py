"""Background reassessment worker for active monitored trips."""

import logging

try:
    from apscheduler.schedulers.background import BackgroundScheduler
except ImportError:  # pragma: no cover - exercised only in minimal local installs
    BackgroundScheduler = None  # type: ignore[assignment,misc]
from sqlalchemy import select

from backend.app.core.config import settings
from backend.app.core.database import db_manager
from backend.app.models.monitoring import MonitoredTrip
from backend.app.services.monitoring_service import reassess_trip

logger = logging.getLogger(__name__)

_scheduler: BackgroundScheduler | None = None


def run_active_trip_checks() -> None:
    """Reassess each active trip independently and continue after failures."""
    if not settings.DATABASE_ENABLED:
        return
    try:
        with db_manager.session() as db:
            trip_ids = list(
                db.scalars(
                    select(MonitoredTrip.id).where(MonitoredTrip.status == "ACTIVE")
                ).all()
            )
            for trip_id in trip_ids:
                try:
                    reassess_trip(trip_id, db)
                except Exception:
                    logger.exception("Monitored trip reassessment failed for trip %s", trip_id)
    except Exception:
        logger.exception("Unable to load active monitored trips for reassessment")


def start_monitoring_scheduler() -> None:
    """Start one scheduler instance for production persistence mode."""
    global _scheduler
    if _scheduler is not None or not settings.DATABASE_ENABLED:
        return
    if BackgroundScheduler is None:
        logger.warning("Monitoring scheduler unavailable: apscheduler is not installed.")
        return
    _scheduler = BackgroundScheduler(daemon=True)
    _scheduler.add_job(
        run_active_trip_checks,
        "interval",
        minutes=settings.MONITOR_CHECK_INTERVAL_MINUTES,
        id="monitored-trip-reassessment",
        replace_existing=True,
        max_instances=1,
        coalesce=True,
    )
    _scheduler.start()
    logger.info("Monitored trip scheduler started with %s minute interval.", settings.MONITOR_CHECK_INTERVAL_MINUTES)


def stop_monitoring_scheduler() -> None:
    """Stop the scheduler during application shutdown."""
    global _scheduler
    if _scheduler is not None:
        _scheduler.shutdown(wait=False)
        _scheduler = None