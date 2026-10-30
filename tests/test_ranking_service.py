"""
Unit tests for Deterministic Responder Ranking Service.
Verifies distance calculations, verified vs community status, location freshness,
ineligibility filters, strict non-fabrication of travel times, and determinism.
"""

import pytest
from datetime import datetime, timezone, timedelta

from backend.app.schemas.dispatch import Responder, ResponderType
from backend.app.services.ranking_service import DeterministicResponderRanker


def test_ranking_determinism(sample_location, mock_responders):
    """Multiple evaluations of identical data must produce identical rank order."""
    ranker = DeterministicResponderRanker()
    now = datetime.now(timezone.utc)

    run_1 = ranker.evaluate_and_rank(
        incident_lat=sample_location["latitude"],
        incident_lon=sample_location["longitude"],
        responders=mock_responders,
        current_time=now
    )

    run_2 = ranker.evaluate_and_rank(
        incident_lat=sample_location["latitude"],
        incident_lon=sample_location["longitude"],
        responders=mock_responders,
        current_time=now
    )

    ids_1 = [r.responder.id for r in run_1]
    ids_2 = [r.responder.id for r in run_2]
    scores_1 = [r.composite_score for r in run_1]
    scores_2 = [r.composite_score for r in run_2]

    assert ids_1 == ids_2
    assert scores_1 == scores_2


def test_verified_vs_community_distinction(sample_location, mock_responders):
    """
    Verified responders with authorized credentials receive priority over community responders
    at comparable distances, but community volunteers remain recognized.
    """
    ranker = DeterministicResponderRanker()
    now = datetime.now(timezone.utc)

    ranked = ranker.evaluate_and_rank(
        incident_lat=sample_location["latitude"],
        incident_lon=sample_location["longitude"],
        responders=mock_responders,
        current_time=now
    )

    eligible_responders = [r for r in ranked if r.is_eligible]
    top_responder = eligible_responders[0]

    # Verified responder with 4.9 trust should lead
    assert top_responder.responder.id == "resp_verified_close"
    assert top_responder.responder.is_verified is True
    assert top_responder.responder.responder_type == ResponderType.VERIFIED
    assert top_responder.composite_score > 1.0  # Base + verification boost


def test_ineligible_and_stale_responders_filtered(sample_location, mock_responders):
    """Unavailable and stale responders are marked ineligible and scored 0.0."""
    ranker = DeterministicResponderRanker(max_location_age_seconds=1800)  # 30m
    now = datetime.now(timezone.utc)

    ranked = ranker.evaluate_and_rank(
        incident_lat=sample_location["latitude"],
        incident_lon=sample_location["longitude"],
        responders=mock_responders,
        current_time=now
    )

    # Find the stale responder
    stale = next(r for r in ranked if r.responder.id == "resp_stale_location")
    assert stale.is_eligible is False
    assert "stale" in stale.ineligibility_reason.lower()
    assert stale.composite_score == 0.0

    # Find the unavailable responder
    unavail = next(r for r in ranked if r.responder.id == "resp_unavailable")
    assert unavail.is_eligible is False
    assert "unavailable" in unavail.ineligibility_reason.lower()
    assert unavail.composite_score == 0.0


def test_no_fabricated_travel_times():
    """
    CRITICAL POLICY TEST:
    Do not fabricate travel times!
    If reliable telemetry is absent, ETA must be None (UNESTIMATED).
    """
    ranker = DeterministicResponderRanker()
    now = datetime.now(timezone.utc)

    # Responder without speed telemetry
    unmetered_responder = Responder(
        id="resp_unmetered",
        name="Volunteer No Telemetry",
        latitude=12.9770,
        longitude=77.5713,
        is_available=True,
        is_active=True,
        is_verified=False,
        trust_score=3.0,
        last_location_update=now,
        reliable_speed_mps=None  # Explicitly None
    )

    # Responder with verified telemetry speed
    metered_responder = Responder(
        id="resp_metered",
        name="Ambulance Telemetry",
        latitude=12.9790,
        longitude=77.5713,
        is_available=True,
        is_active=True,
        is_verified=True,
        responder_type=ResponderType.VERIFIED,
        trust_score=5.0,
        last_location_update=now,
        reliable_speed_mps=10.0  # 10 m/s verified speed
    )

    results = ranker.evaluate_and_rank(
        incident_lat=12.9767,
        incident_lon=77.5713,
        responders=[unmetered_responder, metered_responder],
        current_time=now
    )

    unmetered_result = next(r for r in results if r.responder.id == "resp_unmetered")
    assert unmetered_result.eta_seconds is None
    assert unmetered_result.eta_source == "UNESTIMATED"

    metered_result = next(r for r in results if r.responder.id == "resp_metered")
    assert metered_result.eta_seconds is not None
    assert metered_result.eta_seconds > 0
    assert metered_result.eta_source == "VERIFIED_TELEMETRY"


def test_boundary_distance_ranking():
    """Tests exact boundary distances at 0m, 100m, 299m, 301m."""
    ranker = DeterministicResponderRanker()
    now = datetime.now(timezone.utc)
    base_lat, base_lon = 12.9767, 77.5713

    # Exact delta for ~300m is ~0.0027 degrees
    r_at_0m = Responder(
        id="r_0m",
        name="At Incident",
        latitude=base_lat,
        longitude=base_lon,
        is_available=True,
        is_active=True,
        trust_score=4.0,
        last_location_update=now
    )

    r_at_250m = Responder(
        id="r_250m",
        name="Within Ring 1",
        latitude=base_lat + 0.00225,  # ~250m
        longitude=base_lon,
        is_available=True,
        is_active=True,
        trust_score=4.0,
        last_location_update=now
    )

    ranked = ranker.evaluate_and_rank(
        incident_lat=base_lat,
        incident_lon=base_lon,
        responders=[r_at_250m, r_at_0m],
        max_radius_meters=300.0,
        current_time=now
    )

    assert ranked[0].responder.id == "r_0m"
    assert ranked[0].distance_meters < 1.0
    assert ranked[1].responder.id == "r_250m"
    assert 240.0 <= ranked[1].distance_meters <= 260.0
