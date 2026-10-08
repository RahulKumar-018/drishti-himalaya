"""Trip monitoring orchestration over the canonical route-risk engine."""

from datetime import datetime, timedelta, timezone
import logging
from typing import Any
from uuid import UUID, uuid4

from sqlalchemy import desc, select
from sqlalchemy.orm import Session

from backend.app.core.config import settings
from backend.app.models.monitoring import MonitoredTrip, NotificationDevice, TripAlert, TripRiskSnapshot
from backend.app.schemas.monitoring import MonitoringConfig, MonitoredTripCreate
from backend.app.services.analysis_service import analyze_route
from backend.app.services.firebase_service import get_firebase_service

logger = logging.getLogger(__name__)

_memory_trips: dict[UUID, dict[str, Any]] = {}
_memory_snapshots: dict[UUID, list[dict[str, Any]]] = {}
_memory_alerts: dict[UUID, list[dict[str, Any]]] = {}
_memory_devices: dict[UUID, dict[str, Any]] = {}

_TIER_ORDER = {"LOW": 0, "MODERATE": 1, "HIGH": 2, "SEVERE": 3}


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _tier(score: float) -> str:
    if score < 25:
        return "LOW"
    if score < 50:
        return "MODERATE"
    if score < 75:
        return "HIGH"
    return "SEVERE"


def _trip_dict(trip: MonitoredTrip | dict[str, Any]) -> dict[str, Any]:
    if isinstance(trip, dict):
        return trip
    return {
        "id": trip.id,
        "user_id": trip.user_id,
        "origin": {"latitude": trip.origin_lat, "longitude": trip.origin_lon, "name": trip.origin_name},
        "destination": {"latitude": trip.destination_lat, "longitude": trip.destination_lon, "name": trip.destination_name},
        "vehicle_profile": trip.vehicle_profile,
        "status": trip.status,
        "planned_departure": trip.planned_departure,
        "actual_departure": trip.actual_departure,
        "completed_at": trip.completed_at,
        "monitoring_config": trip.monitoring_config,
        "created_at": trip.created_at,
        "updated_at": trip.updated_at,
    }


def create_trip(payload: MonitoredTripCreate, db: Session | None) -> dict[str, Any]:
    now = _now()
    config = payload.monitoring_config.model_dump()
    if settings.DATABASE_ENABLED and db is not None:
        trip = MonitoredTrip(
            user_id=payload.user_id,
            origin_lat=payload.origin.latitude,
            origin_lon=payload.origin.longitude,
            destination_lat=payload.destination.latitude,
            destination_lon=payload.destination.longitude,
            origin_name=payload.origin.name,
            destination_name=payload.destination.name,
            vehicle_profile=payload.vehicle_profile,
            planned_departure=payload.planned_departure,
            monitoring_config=config,
        )
        db.add(trip)
        db.flush()
        return _trip_dict(trip)

    trip = {
        "id": uuid4(),
        "user_id": payload.user_id,
        "origin": payload.origin.model_dump(),
        "destination": payload.destination.model_dump(),
        "vehicle_profile": payload.vehicle_profile,
        "status": "ACTIVE",
        "planned_departure": payload.planned_departure,
        "actual_departure": None,
        "completed_at": None,
        "monitoring_config": config,
        "created_at": now,
        "updated_at": now,
    }
    _memory_trips[trip["id"]] = trip
    return trip


def get_trip(trip_id: UUID, db: Session | None) -> dict[str, Any] | None:
    if settings.DATABASE_ENABLED and db is not None:
        trip = db.get(MonitoredTrip, trip_id)
        return _trip_dict(trip) if trip else None
    return _memory_trips.get(trip_id)


def list_trips(db: Session | None, user_id: UUID | None = None) -> list[dict[str, Any]]:
    if settings.DATABASE_ENABLED and db is not None:
        query = select(MonitoredTrip).order_by(desc(MonitoredTrip.created_at))
        if user_id is not None:
            query = query.where(MonitoredTrip.user_id == user_id)
        return [_trip_dict(item) for item in db.scalars(query).all()]
    return [trip for trip in _memory_trips.values() if user_id is None or trip["user_id"] == user_id]


def update_trip_status(trip_id: UUID, status: str, db: Session | None) -> dict[str, Any] | None:
    trip = get_trip(trip_id, db)
    if trip is None:
        return None
    now = _now()
    if settings.DATABASE_ENABLED and db is not None:
        model = db.get(MonitoredTrip, trip_id)
        model.status = status  # type: ignore[union-attr]
        if status == "COMPLETED":
            model.completed_at = now  # type: ignore[union-attr]
        db.flush()
        return _trip_dict(model)  # type: ignore[arg-type]
    trip["status"] = status
    trip["updated_at"] = now
    if status == "COMPLETED":
        trip["completed_at"] = now
    return trip


def _snapshot_dict(snapshot: TripRiskSnapshot | dict[str, Any]) -> dict[str, Any]:
    if isinstance(snapshot, dict):
        return snapshot
    return {
        "id": snapshot.id,
        "trip_id": snapshot.trip_id,
        "risk_score": snapshot.risk_score,
        "risk_tier": snapshot.risk_tier,
        "risk_delta": snapshot.risk_delta,
        "p24_mm": snapshot.p24_mm,
        "route_average_risk": snapshot.route_average_risk,
        "route_max_risk": snapshot.route_max_risk,
        "weather_summary": snapshot.weather_summary,
        "assessed_at": snapshot.assessed_at,
    }


def _alert_dict(alert: TripAlert | dict[str, Any]) -> dict[str, Any]:
    if isinstance(alert, dict):
        return alert
    return {
        "id": alert.id,
        "trip_id": alert.trip_id,
        "alert_type": alert.alert_type,
        "severity": alert.severity,
        "title": alert.title,
        "message": alert.message,
        "previous_risk_tier": alert.previous_risk_tier,
        "current_risk_tier": alert.current_risk_tier,
        "risk_delta": alert.risk_delta,
        "trigger_source": alert.trigger_source,
        "fcm_sent": alert.fcm_sent,
        "acknowledged_at": alert.acknowledged_at,
        "created_at": alert.created_at,
    }


def _recent_alert(trip_id: UUID, trigger_source: str, cooldown_minutes: int, db: Session | None):
    cutoff = _now() - timedelta(minutes=cooldown_minutes)
    if settings.DATABASE_ENABLED and db is not None:
        return db.scalars(
            select(TripAlert)
            .where(TripAlert.trip_id == trip_id, TripAlert.trigger_source == trigger_source, TripAlert.created_at >= cutoff)
            .order_by(desc(TripAlert.created_at))
        ).first()
    return next(
        (alert for alert in reversed(_memory_alerts.get(trip_id, [])) if alert["trigger_source"] == trigger_source and alert["created_at"] >= cutoff),
        None,
    )


def _create_alert(
    trip: dict[str, Any],
    previous: dict[str, Any] | None,
    snapshot: dict[str, Any],
    trigger_source: str,
    db: Session | None,
) -> dict[str, Any] | None:
    if _recent_alert(trip["id"], trigger_source, settings.MONITOR_ALERT_COOLDOWN_MINUTES, db):
        return None
    current_tier = snapshot["risk_tier"]
    previous_tier = previous.get("risk_tier") if previous else None
    severity = current_tier
    reason = "route risk increased"
    if trigger_source == "RAIN_THRESHOLD":
        reason = f"24h rainfall reached {snapshot['p24_mm']:.1f} mm"
    title = f"{severity.title()} route safety alert"
    message = f"Your monitored route has {severity.lower()} risk because {reason}. Review current conditions before continuing."
    values = {
        "id": uuid4(),
        "trip_id": trip["id"],
        "alert_type": "TRIP_RISK_CHANGE",
        "severity": severity,
        "title": title,
        "message": message,
        "previous_risk_tier": previous_tier,
        "current_risk_tier": current_tier,
        "risk_delta": snapshot["risk_delta"],
        "trigger_source": trigger_source,
        "fcm_sent": False,
        "acknowledged_at": None,
        "created_at": _now(),
    }
    if settings.DATABASE_ENABLED and db is not None:
        alert = TripAlert(
            id=values["id"], trip_id=trip["id"], alert_type=values["alert_type"], severity=severity,
            title=title, message=message, previous_risk_tier=previous_tier, current_risk_tier=current_tier,
            risk_delta=snapshot["risk_delta"], trigger_source=trigger_source,
        )
        db.add(alert)
        db.flush()
        return _alert_dict(alert)
    _memory_alerts.setdefault(trip["id"], []).append(values)
    return values


def _deliver_alert(alert: dict[str, Any], trip: dict[str, Any], db: Session | None) -> None:
    """Attempt delivery without allowing notification failures to affect risk processing."""
    if not trip["monitoring_config"].get("enable_fcm", True) or trip.get("user_id") is None:
        return

    devices: list[NotificationDevice | dict[str, Any]]
    if settings.DATABASE_ENABLED and db is not None:
        devices = list(
            db.scalars(
                select(NotificationDevice).where(
                    NotificationDevice.user_id == trip["user_id"],
                    NotificationDevice.is_active.is_(True),
                )
            ).all()
        )
    else:
        devices = [
            device for device in _memory_devices.values()
            if device["user_id"] == trip["user_id"] and device["is_active"]
        ]

    firebase = get_firebase_service()
    delivered = False
    for device in devices:
        token = device.fcm_token if isinstance(device, NotificationDevice) else device["fcm_token"]
        if firebase.send_notification(
            token,
            alert["title"],
            alert["message"],
            {"trip_id": str(trip["id"]), "alert_id": str(alert["id"]), "severity": alert["severity"]},
        ):
            delivered = True

    if settings.DATABASE_ENABLED and db is not None:
        model = db.get(TripAlert, alert["id"])
        if model is not None:
            model.fcm_sent = delivered
            model.fcm_sent_at = _now() if delivered else None
            db.flush()
    else:
        alert["fcm_sent"] = delivered


def reassess_trip(trip_id: UUID, db: Session | None) -> tuple[dict[str, Any], dict[str, Any] | None, str]:
    trip = get_trip(trip_id, db)
    if trip is None:
        raise KeyError("Monitored trip not found")
    if trip["status"] != "ACTIVE":
        raise ValueError("Only ACTIVE trips can be reassessed")

    origin = trip["origin"]
    destination = trip["destination"]
    result = analyze_route(
        origin=(origin["longitude"], origin["latitude"]),
        destination=(destination["longitude"], destination["latitude"]),
        data_mode=settings.DATA_MODE,
    )
    route = next((item for item in result.routes if item.is_recommended), result.routes[0])
    if route.route_risk is None:
        raise RuntimeError("Route risk is unavailable; no snapshot was created")

    score = route.route_risk.composite_route_risk
    tier = _tier(score)
    p24_values = [segment.p24_mm for segment in route.segments if segment.p24_mm is not None]
    p24 = max(p24_values) if p24_values else None
    previous = None
    if settings.DATABASE_ENABLED and db is not None:
        previous_model = db.scalars(
            select(TripRiskSnapshot).where(TripRiskSnapshot.trip_id == trip_id).order_by(desc(TripRiskSnapshot.assessed_at))
        ).first()
        previous = _snapshot_dict(previous_model) if previous_model else None
    else:
        prior = _memory_snapshots.get(trip_id, [])
        previous = prior[-1] if prior else None
    delta = score - previous["risk_score"] if previous else None
    snapshot_values = {
        "id": uuid4(), "trip_id": trip_id, "risk_score": round(score, 2), "risk_tier": tier,
        "risk_delta": round(delta, 2) if delta is not None else None, "p24_mm": p24,
        "route_average_risk": route.route_risk.average_risk, "route_max_risk": route.route_risk.max_bottleneck_risk,
        "weather_summary": {"p24_mm": p24, "data_mode": result.data_mode, "source": route.data_provenance.weather_source},
        "assessed_at": _now(),
    }
    if settings.DATABASE_ENABLED and db is not None:
        snapshot = TripRiskSnapshot(
            id=snapshot_values["id"], trip_id=trip_id, risk_score=snapshot_values["risk_score"], risk_tier=tier,
            risk_delta=snapshot_values["risk_delta"], p24_mm=p24, route_average_risk=route.route_risk.average_risk,
            route_max_risk=route.route_risk.max_bottleneck_risk, composite_route_risk=score,
            weather_summary=snapshot_values["weather_summary"],
        )
        db.add(snapshot)
        db.flush()
        snapshot_values = _snapshot_dict(snapshot)
    else:
        _memory_snapshots.setdefault(trip_id, []).append(snapshot_values)

    config = trip["monitoring_config"]
    trigger = None
    if previous and delta is not None and delta >= config.get("risk_delta_threshold", settings.MONITOR_RISK_DELTA_THRESHOLD):
        trigger = "RISK_ESCALATION"
    if p24 is not None and p24 >= config.get("rain_threshold_mm", settings.MONITOR_RAIN_THRESHOLD_MM):
        prior_p24 = previous.get("p24_mm") if previous else None
        if prior_p24 is None or prior_p24 < config.get("rain_threshold_mm", settings.MONITOR_RAIN_THRESHOLD_MM):
            trigger = "RAIN_THRESHOLD"
    if previous and _TIER_ORDER[tier] > _TIER_ORDER.get(previous["risk_tier"], 0):
        trigger = trigger or "RISK_ESCALATION"
    alert = _create_alert(trip, previous, snapshot_values, trigger, db) if trigger else None
    if alert is not None:
        _deliver_alert(alert, trip, db)
    return snapshot_values, alert, route.route_id


def list_alerts(trip_id: UUID, db: Session | None) -> list[dict[str, Any]]:
    if settings.DATABASE_ENABLED and db is not None:
        return [_alert_dict(item) for item in db.scalars(select(TripAlert).where(TripAlert.trip_id == trip_id).order_by(desc(TripAlert.created_at))).all()]
    return list(reversed(_memory_alerts.get(trip_id, [])))


def acknowledge_alert(alert_id: UUID, db: Session | None) -> dict[str, Any] | None:
    now = _now()
    if settings.DATABASE_ENABLED and db is not None:
        alert = db.get(TripAlert, alert_id)
        if alert is None:
            return None
        alert.acknowledged_at = now
        db.flush()
        return _alert_dict(alert)
    for alerts in _memory_alerts.values():
        for alert in alerts:
            if alert["id"] == alert_id:
                alert["acknowledged_at"] = now
                return alert
    return None


def register_device(payload, db: Session | None) -> dict[str, Any]:
    now = _now()
    if settings.DATABASE_ENABLED and db is not None:
        device = db.scalars(select(NotificationDevice).where(NotificationDevice.user_id == payload.user_id, NotificationDevice.fcm_token == payload.fcm_token)).first()
        if device is None:
            device = NotificationDevice(**payload.model_dump())
            db.add(device)
        else:
            device.is_active = True
            device.last_used_at = now
        db.flush()
        return {"id": device.id, "user_id": device.user_id, "platform": device.platform, "is_active": device.is_active, "last_used_at": device.last_used_at}
    existing = next(
        (
            item for item in _memory_devices.values()
            if item["user_id"] == payload.user_id and item["fcm_token"] == payload.fcm_token
        ),
        None,
    )
    if existing is not None:
        existing["is_active"] = True
        existing["last_used_at"] = now
        return existing
    device = {"id": uuid4(), **payload.model_dump(), "is_active": True, "last_used_at": now}
    _memory_devices[device["id"]] = device
    return device