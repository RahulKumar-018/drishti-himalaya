"""API contracts for monitored trips, risk snapshots, alerts, and devices."""

from datetime import datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from backend.app.schemas.common import CoordinatePoint, RiskTier


class MonitoringConfig(BaseModel):
    check_interval_minutes: int = Field(default=30, ge=5, le=1440)
    rain_threshold_mm: float = Field(default=25.0, ge=0, le=500)
    risk_delta_threshold: float = Field(default=10.0, ge=0, le=100)
    enable_fcm: bool = True
    quiet_hours_start: int = Field(default=22, ge=0, le=23)
    quiet_hours_end: int = Field(default=6, ge=0, le=23)


class MonitoredTripCreate(BaseModel):
    origin: CoordinatePoint
    destination: CoordinatePoint
    user_id: UUID | None = None
    vehicle_profile: str = Field(default="driving-car", min_length=1, max_length=50)
    planned_departure: datetime | None = None
    monitoring_config: MonitoringConfig = Field(default_factory=MonitoringConfig)


class MonitoredTripStatusUpdate(BaseModel):
    status: Literal["ACTIVE", "PAUSED", "COMPLETED", "CANCELLED"]


class MonitoredTripResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    user_id: UUID | None = None
    origin: CoordinatePoint
    destination: CoordinatePoint
    vehicle_profile: str
    status: str
    planned_departure: datetime | None = None
    actual_departure: datetime | None = None
    completed_at: datetime | None = None
    monitoring_config: MonitoringConfig
    created_at: datetime
    updated_at: datetime


class RiskSnapshotResponse(BaseModel):
    id: UUID
    trip_id: UUID
    risk_score: float
    risk_tier: RiskTier
    risk_delta: float | None = None
    p24_mm: float | None = None
    route_average_risk: float | None = None
    route_max_risk: float | None = None
    weather_summary: dict[str, Any] = Field(default_factory=dict)
    assessed_at: datetime


class TripAlertResponse(BaseModel):
    id: UUID
    trip_id: UUID
    alert_type: str
    severity: str
    title: str
    message: str
    previous_risk_tier: str | None = None
    current_risk_tier: str | None = None
    risk_delta: float | None = None
    trigger_source: str
    fcm_sent: bool
    acknowledged_at: datetime | None = None
    created_at: datetime


class ReassessmentResponse(BaseModel):
    snapshot: RiskSnapshotResponse
    alert: TripAlertResponse | None = None
    data_mode: str
    route_id: str


class NotificationDeviceCreate(BaseModel):
    user_id: UUID
    fcm_token: str = Field(..., min_length=20, max_length=4096)
    platform: Literal["ios", "android", "web"]
    app_version: str | None = Field(default=None, max_length=50)
    device_model: str | None = Field(default=None, max_length=100)


class NotificationDeviceResponse(BaseModel):
    id: UUID
    user_id: UUID
    platform: str
    is_active: bool
    last_used_at: datetime