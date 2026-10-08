"""API tests for the Phase 3 monitoring workflow in DEMO mode."""

from uuid import uuid4

from fastapi.testclient import TestClient

from backend.app.core.config import settings
from backend.app.main import app


def test_create_reassess_and_list_monitored_trip(monkeypatch) -> None:
    monkeypatch.setattr(settings, "DATABASE_ENABLED", False)
    client = TestClient(app)
    response = client.post(
        "/api/v1/monitoring/trips",
        json={
            "origin": {"latitude": 30.1033, "longitude": 78.2947, "name": "Rishikesh"},
            "destination": {"latitude": 30.7433, "longitude": 79.4938, "name": "Badrinath"},
        },
    )
    assert response.status_code == 201
    trip = response.json()
    trip_id = trip["id"]
    assert trip["status"] == "ACTIVE"

    reassessment = client.post(f"/api/v1/monitoring/trips/{trip_id}/reassess")
    assert reassessment.status_code == 200
    payload = reassessment.json()
    assert payload["data_mode"] == "DEMO"
    assert 0 <= payload["snapshot"]["risk_score"] <= 100
    assert payload["snapshot"]["risk_tier"] in {"LOW", "MODERATE", "HIGH", "SEVERE"}

    listed = client.get(f"/api/v1/monitoring/trips/{trip_id}/alerts")
    assert listed.status_code == 200
    assert isinstance(listed.json(), list)


def test_monitoring_status_and_device_registration(monkeypatch) -> None:
    monkeypatch.setattr(settings, "DATABASE_ENABLED", False)
    client = TestClient(app)
    created = client.post(
        "/api/v1/monitoring/trips",
        json={
            "origin": {"latitude": 30.1033, "longitude": 78.2947},
            "destination": {"latitude": 30.2858, "longitude": 78.9810},
        },
    ).json()

    paused = client.patch(
        f"/api/v1/monitoring/trips/{created['id']}",
        json={"status": "PAUSED"},
    )
    assert paused.status_code == 200
    assert paused.json()["status"] == "PAUSED"

    device = client.post(
        "/api/v1/monitoring/devices",
        json={
            "user_id": str(uuid4()),
            "fcm_token": "test-device-token-1234567890",
            "platform": "web",
        },
    )
    assert device.status_code == 201
    assert device.json()["is_active"] is True