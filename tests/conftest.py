"""
Pytest configuration and shared fixtures for Raksha test suite.
"""

import sys
import os
from pathlib import Path
from datetime import datetime, timezone, timedelta
import pytest

# Ensure project root is on sys.path
ROOT_DIR = Path(__file__).resolve().parent.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from backend.app.schemas.dispatch import Responder, ResponderType


@pytest.fixture
def sample_location():
    """Coordinates near Majestic, Bengaluru."""
    return {"latitude": 12.9767, "longitude": 77.5713}


@pytest.fixture
def mock_responders(sample_location):
    """Set of responders at varying distances, trust scores, and verification levels."""
    now = datetime.now(timezone.utc)
    base_lat = sample_location["latitude"]
    base_lon = sample_location["longitude"]

    # 1 deg lat is ~111km, 0.001 deg is ~111m
    # 0.0018 deg lat is ~200m
    # 0.0036 deg lat is ~400m
    # 0.0090 deg lat is ~1000m
    return [
        Responder(
            id="resp_verified_close",
            name="Dr. Priya (Doctor)",
            latitude=base_lat + 0.0010,  # ~111m away
            longitude=base_lon,
            is_available=True,
            is_active=True,
            is_verified=True,
            responder_type=ResponderType.VERIFIED,
            trust_score=4.9,
            last_location_update=now - timedelta(seconds=20),
            skills=["CPR", "FIRST_AID"],
            reliable_speed_mps=4.0  # ~14.4 km/h
        ),
        Responder(
            id="resp_community_very_close",
            name="Rahul (Citizen Volunteer)",
            latitude=base_lat + 0.0005,  # ~55m away
            longitude=base_lon,
            is_available=True,
            is_active=True,
            is_verified=False,
            responder_type=ResponderType.COMMUNITY,
            trust_score=3.5,
            last_location_update=now - timedelta(seconds=15),
            skills=["FIRST_AID"],
            reliable_speed_mps=None  # No speed telemetry: ETA must remain unestimated
        ),
        Responder(
            id="resp_community_mid",
            name="Ananya (Bystander)",
            latitude=base_lat + 0.0032,  # ~355m away (outside 300m, inside 500m)
            longitude=base_lon,
            is_available=True,
            is_active=True,
            is_verified=False,
            responder_type=ResponderType.COMMUNITY,
            trust_score=4.0,
            last_location_update=now - timedelta(seconds=45)
        ),
        Responder(
            id="resp_stale_location",
            name="Suresh (Stale)",
            latitude=base_lat + 0.0008,  # ~90m away
            longitude=base_lon,
            is_available=True,
            is_active=True,
            is_verified=False,
            responder_type=ResponderType.COMMUNITY,
            trust_score=3.0,
            last_location_update=now - timedelta(minutes=45)  # > 30m limit
        ),
        Responder(
            id="resp_unavailable",
            name="Kavita (Busy)",
            latitude=base_lat + 0.0007,
            longitude=base_lon,
            is_available=False,  # Unavailable
            is_active=True,
            is_verified=True,
            responder_type=ResponderType.VERIFIED,
            trust_score=5.0,
            last_location_update=now - timedelta(seconds=10)
        )
    ]
