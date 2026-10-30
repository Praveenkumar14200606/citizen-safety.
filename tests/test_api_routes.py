"""
API route integration tests for Member 2 compatibility.
Ensures the ai_location_router mounts into FastAPI and handles HTTP requests cleanly.
"""

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from datetime import datetime, timezone, timedelta

from backend.app.api.routes import ai_location_router
from backend.app.schemas.triage import IncidentType


@pytest.fixture
def test_app():
    app = FastAPI(title="Raksha Test App")
    app.include_router(ai_location_router)
    return app


@pytest.fixture
def client(test_app):
    return TestClient(test_app)


def test_api_triage_kannada(client):
    payload = {
        "description": "ಇಲ್ಲಿ ತೀವ್ರವಾದ ಅಪಘಾತವಾಗಿದೆ, ರಸ್ತೆಯಲ್ಲಿ ರಕ್ತ ಸುರಿಯುತ್ತಿದೆ",
        "language_hint": "kn"
    }
    response = client.post("/ai-location/triage", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["incident_type"] == "ACCIDENT"
    assert data["severity"] in (4, 5)
    assert data["confidence"] >= 0.8
    assert data["spam_flag"] is False
    assert "advisory" in data["medical_disclaimer"].lower()


def test_api_duplicates_check(client):
    now_iso = datetime.now(timezone.utc).isoformat()
    past_iso = (datetime.now(timezone.utc) - timedelta(minutes=2)).isoformat()

    payload = {
        "incident_id": "inc_new",
        "incident_type": "FIRE",
        "description": "Thick smoke and fire in warehouse",
        "latitude": 12.9716,
        "longitude": 77.5946,
        "created_at": now_iso,
        "recent_incidents": [
            {
                "id": "inc_existing",
                "incident_type": "FIRE",
                "description": "Warehouse fire reported",
                "latitude": 12.9718,
                "longitude": 77.5946,
                "created_at": past_iso,
                "status": "RAISED"
            }
        ]
    }
    response = client.post("/ai-location/duplicates/check", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["is_possible_duplicate"] is True
    assert "inc_existing" in data["possible_duplicate_ids"]


def test_api_dispatch_evaluate(client):
    now = datetime.now(timezone.utc)
    created_at_iso = (now - timedelta(seconds=35)).isoformat()  # > 30s -> expanded to 500m
    ping_time_iso = now.isoformat()

    payload = {
        "incident_id": "inc_disp_01",
        "latitude": 12.9767,
        "longitude": 77.5713,
        "created_at": created_at_iso,
        "status": "RAISED",
        "responders": [
            {
                "id": "resp_01",
                "name": "Dr. Priya",
                "latitude": 12.9775,
                "longitude": 77.5713,
                "is_available": True,
                "is_active": True,
                "is_verified": True,
                "responder_type": "VERIFIED",
                "trust_score": 4.8,
                "last_location_update": ping_time_iso,
                "reliable_speed_mps": 5.0
            }
        ],
        "already_notified_responder_ids": []
    }
    response = client.post("/ai-location/dispatch/evaluate", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["radius_state"]["current_radius_meters"] == 500
    assert data["radius_state"]["is_expanded"] is True
    assert "resp_01" in data["newly_notified_responder_ids"]
