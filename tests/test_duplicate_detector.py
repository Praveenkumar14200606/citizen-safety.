"""
Unit tests for Candidate Duplicate Detector.
Verifies geographic proximity, recent time window, category matching,
text similarity, and the non-destructive MVP policy.
"""

import pytest
from datetime import datetime, timezone, timedelta

from backend.app.schemas.triage import IncidentType
from backend.app.schemas.duplicate import (
    ExistingIncidentRecord,
    DuplicateCheckRequest,
    DuplicateCheckResponse
)
from backend.app.services.duplicate_detector import (
    CandidateDuplicateDetector,
    haversine_distance,
    compute_text_similarity
)


def test_haversine_distance_accuracy():
    """Validates distance between two known coordinates."""
    # Vidhana Soudha to Chinnaswamy Stadium (~1.2 km)
    lat1, lon1 = 12.9797, 77.5907
    lat2, lon2 = 12.9788, 77.5996
    dist = haversine_distance(lat1, lon1, lat2, lon2)
    assert 900 <= dist <= 1100  # ~970 meters


def test_nearby_same_category_duplicate_detected():
    """An incident 45m away reported 3 minutes ago with identical category is flagged."""
    detector = CandidateDuplicateDetector(distance_threshold_meters=200.0, time_window_seconds=1800)
    now = datetime.now(timezone.utc)

    existing = [
        ExistingIncidentRecord(
            id="inc_001",
            incident_type=IncidentType.ACCIDENT,
            description="Car hit a divider on Ring Road",
            latitude=12.9716,
            longitude=77.5946,
            created_at=now - timedelta(minutes=3),
            status="RAISED"
        )
    ]

    # New incident 45m away
    # ~0.0004 deg lat is ~44m
    request = DuplicateCheckRequest(
        incident_id="inc_002",
        incident_type=IncidentType.ACCIDENT,
        description="Major car accident on Ring Road, divider damaged",
        latitude=12.9720,
        longitude=77.5946,
        created_at=now,
        recent_incidents=existing
    )

    result = detector.evaluate_candidates(request)

    assert result.is_possible_duplicate is True
    assert "inc_001" in result.possible_duplicate_ids
    assert result.highest_confidence >= 0.70
    assert len(result.candidates) == 1
    assert result.candidates[0].category_match is True
    assert result.candidates[0].distance_meters < 60.0
    assert "Distance:" in result.candidates[0].reason


def test_distant_incident_not_flagged():
    """An incident 1.5 km away is not considered a duplicate candidate."""
    detector = CandidateDuplicateDetector(distance_threshold_meters=200.0, time_window_seconds=1800)
    now = datetime.now(timezone.utc)

    existing = [
        ExistingIncidentRecord(
            id="inc_far",
            incident_type=IncidentType.FIRE,
            description="Shop fire",
            latitude=12.9900,  # ~2km north
            longitude=77.5946,
            created_at=now - timedelta(minutes=5),
            status="RAISED"
        )
    ]

    request = DuplicateCheckRequest(
        incident_id="inc_new",
        incident_type=IncidentType.FIRE,
        description="Shop fire near bus stop",
        latitude=12.9716,
        longitude=77.5946,
        created_at=now,
        recent_incidents=existing
    )

    result = detector.evaluate_candidates(request)
    assert result.is_possible_duplicate is False
    assert len(result.possible_duplicate_ids) == 0


def test_old_incident_outside_time_window_not_flagged():
    """An incident at the exact same location but 4 hours ago is not a candidate."""
    detector = CandidateDuplicateDetector(distance_threshold_meters=200.0, time_window_seconds=1800)
    now = datetime.now(timezone.utc)

    existing = [
        ExistingIncidentRecord(
            id="inc_old",
            incident_type=IncidentType.ACCIDENT,
            description="Bike accident",
            latitude=12.9716,
            longitude=77.5946,
            created_at=now - timedelta(hours=4),  # 240 minutes ago (> 30 min window)
            status="RESOLVED"
        )
    ]

    request = DuplicateCheckRequest(
        incident_id="inc_current",
        incident_type=IncidentType.ACCIDENT,
        description="Bike accident",
        latitude=12.9716,
        longitude=77.5946,
        created_at=now,
        recent_incidents=existing
    )

    result = detector.evaluate_candidates(request)
    assert result.is_possible_duplicate is False


def test_cross_category_compatible_incidents():
    """ACCIDENT and MEDICAL within 60m are identified as related duplicate candidates."""
    detector = CandidateDuplicateDetector(distance_threshold_meters=200.0)
    now = datetime.now(timezone.utc)

    existing = [
        ExistingIncidentRecord(
            id="inc_acc",
            incident_type=IncidentType.ACCIDENT,
            description="Two wheelers collision",
            latitude=12.9716,
            longitude=77.5946,
            created_at=now - timedelta(minutes=2),
            status="RAISED"
        )
    ]

    # Second caller reports injuries (MEDICAL) from the same crash
    request = DuplicateCheckRequest(
        incident_id="inc_med",
        incident_type=IncidentType.MEDICAL,
        description="Injured rider bleeding heavily on road",
        latitude=12.9718,
        longitude=77.5946,
        created_at=now,
        recent_incidents=existing
    )

    result = detector.evaluate_candidates(request)
    assert result.is_possible_duplicate is True
    assert "inc_acc" in result.possible_duplicate_ids
    assert result.candidates[0].category_match is False
    assert "related" in result.candidates[0].reason


def test_text_similarity_computation():
    """Tests multilingual token similarity."""
    en1 = "Severe bus fire near Majestic"
    en2 = "Bus catching fire close to Majestic bus stand"
    sim_en = compute_text_similarity(en1, en2)
    assert sim_en >= 0.25

    kn1 = "ರಸ್ತೆಯಲ್ಲಿ ಅಪಘಾತವಾಗಿದೆ ರಕ್ತ ಬರುತ್ತಿದೆ"
    kn2 = "ಅಪಘಾತವಾಗಿದೆ ರಕ್ತ ರಸ್ತೆಯಲ್ಲಿ"
    sim_kn = compute_text_similarity(kn1, kn2)
    assert sim_kn >= 0.50


def test_non_destructive_contract():
    """
    Ensures that evaluating duplicate candidates does NOT alter or mutate
    the original records.
    """
    detector = CandidateDuplicateDetector()
    now = datetime.now(timezone.utc)
    original_status = "RAISED"

    record = ExistingIncidentRecord(
        id="inc_preserve",
        incident_type=IncidentType.FIRE,
        description="Kitchen fire",
        latitude=12.9716,
        longitude=77.5946,
        created_at=now - timedelta(minutes=1),
        status=original_status
    )

    request = DuplicateCheckRequest(
        incident_id="inc_check",
        incident_type=IncidentType.FIRE,
        description="Kitchen fire",
        latitude=12.9716,
        longitude=77.5946,
        created_at=now,
        recent_incidents=[record]
    )

    response = detector.evaluate_candidates(request)

    # Verify original record remains untouched
    assert record.status == original_status
    assert record.id == "inc_preserve"
    # Verify advisory warning is returned to operator
    assert "NOT be auto-merged" in response.advisory_notice
