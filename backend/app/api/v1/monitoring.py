"""Monitoring and alert endpoints backed by the canonical route analysis engine."""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from backend.app.core.config import settings
from backend.app.core.database import get_db
from backend.app.schemas.monitoring import (
    MonitoredTripCreate, MonitoredTripResponse, MonitoredTripStatusUpdate,
    NotificationDeviceCreate, NotificationDeviceResponse, ReassessmentResponse,
    TripAlertResponse,
)
from backend.app.services.monitoring_service import (
    acknowledge_alert, create_trip, get_trip, list_alerts, list_trips, reassess_trip,
    register_device, update_trip_status,
)

router = APIRouter(prefix="/monitoring", tags=["Trip Monitoring"])


@router.post("/trips", response_model=MonitoredTripResponse, status_code=status.HTTP_201_CREATED)
def create_monitored_trip(payload: MonitoredTripCreate, db: Session = Depends(get_db)):
    return create_trip(payload, db)


@router.get("/trips", response_model=list[MonitoredTripResponse])
def get_monitored_trips(user_id: UUID | None = Query(default=None), db: Session = Depends(get_db)):
    return list_trips(db, user_id)


@router.get("/trips/{trip_id}", response_model=MonitoredTripResponse)
def get_monitored_trip(trip_id: UUID, db: Session = Depends(get_db)):
    trip = get_trip(trip_id, db)
    if trip is None:
        raise HTTPException(status_code=404, detail="Monitored trip not found")
    return trip


@router.patch("/trips/{trip_id}", response_model=MonitoredTripResponse)
def set_trip_status(trip_id: UUID, payload: MonitoredTripStatusUpdate, db: Session = Depends(get_db)):
    trip = update_trip_status(trip_id, payload.status, db)
    if trip is None:
        raise HTTPException(status_code=404, detail="Monitored trip not found")
    return trip


@router.post("/trips/{trip_id}/reassess", response_model=ReassessmentResponse)
def reassess_monitored_trip(trip_id: UUID, db: Session = Depends(get_db)):
    try:
        snapshot, alert, route_id = reassess_trip(trip_id, db)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    return {"snapshot": snapshot, "alert": alert, "data_mode": settings.DATA_MODE, "route_id": route_id}


@router.get("/trips/{trip_id}/alerts", response_model=list[TripAlertResponse])
def get_trip_alerts(trip_id: UUID, db: Session = Depends(get_db)):
    if get_trip(trip_id, db) is None:
        raise HTTPException(status_code=404, detail="Monitored trip not found")
    return list_alerts(trip_id, db)


@router.post("/alerts/{alert_id}/acknowledge", response_model=TripAlertResponse)
def acknowledge_trip_alert(alert_id: UUID, db: Session = Depends(get_db)):
    alert = acknowledge_alert(alert_id, db)
    if alert is None:
        raise HTTPException(status_code=404, detail="Trip alert not found")
    return alert


@router.post("/devices", response_model=NotificationDeviceResponse, status_code=status.HTTP_201_CREATED)
def register_notification_device(payload: NotificationDeviceCreate, db: Session = Depends(get_db)):
    return register_device(payload, db)