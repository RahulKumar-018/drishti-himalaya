"""Pytest configuration and test isolation for Drishti-Himalaya.

Ensures that tests run deterministically in DEMO mode by default and without
ambient environment keys leaking into unmocked tests, preventing real external
network calls to upstream APIs during test execution.
"""

import pytest
from backend.app.core.config import settings


@pytest.fixture(autouse=True)
def default_test_mode(monkeypatch):
    """Ensure tests default to DEMO mode and unauthenticated state unless explicitly mocked."""
    monkeypatch.setattr(settings, "DATA_MODE", "DEMO")
    monkeypatch.setattr(settings, "OPENROUTESERVICE_API_KEY", None)
