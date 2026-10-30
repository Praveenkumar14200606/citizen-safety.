"""
Unit tests for Radius Expansion and Dispatch Escalation.
Verifies the MVP rule (300m initial, 30s threshold -> 500m expanded, stopped on claim),
backend timestamp calculation, and multi-worker alert deduplication.
"""

import pytest
from datetime import datetime, timezone, timedelta

from backend.app.schemas.dispatch import (
    IncidentDispatchQuery,
    Responder,
    ResponderType
)
from backend.app.services.radius_expansion import (
    RadiusExpansionService,
    radius_expansion_service
)


def test_initial_radius_under_30_seconds():
    """At t < 30 seconds, search radius must be strictly 300 meters."""
    service = RadiusExpansionService(initial_radius=300, expanded_radius=500, threshold_seconds=30)
    created_at = datetime(2026, 10, 30, 12, 0, 0, tzinfo=timezone.utc)
    current_time = datetime(2026, 10, 30, 12, 0, 20, tzinfo=timezone.utc)  # 20 seconds elapsed

    state = service.calculate_radius_state(
        created_at=created_at,
        claimed_at=None,
        status="RAISED",
        current_time=current_time
    )

    assert state.current_radius_meters == 300
    assert state.is_expanded is False
    assert state.elapsed_seconds == 20.0
    assert state.expansion_stopped is False


def test_expansion_threshold_boundary():
    """Tests exact threshold boundary at 29s (300m) and 30s (500m)."""
    service = RadiusExpansionService(threshold_seconds=30)
    created_at = datetime(2026, 10, 30, 12, 0, 0, tzinfo=timezone.utc)

    # At 29.9 seconds: 300m
    t_29 = created_at + timedelta(seconds=29.9)
    state_29 = service.calculate_radius_state(created_at=created_at, current_time=t_29)
    assert state_29.current_radius_meters == 300
    assert state_29.is_expanded is False

    # At 30.0 seconds: expands to 500m
    t_30 = created_at + timedelta(seconds=30.0)
    state_30 = service.calculate_radius_state(created_at=created_at, current_time=t_30)
    assert state_30.current_radius_meters == 500
    assert state_30.is_expanded is True

    # At 45 seconds: remains 500m
    t_45 = created_at + timedelta(seconds=45.0)
    state_45 = service.calculate_radius_state(created_at=created_at, current_time=t_45)
    assert state_45.current_radius_meters == 500
    assert state_45.is_expanded is True


def test_expansion_stopped_when_claimed():
    """When an incident is claimed, expansion is halted immediately."""
    service = RadiusExpansionService()
    created_at = datetime(2026, 10, 30, 12, 0, 0, tzinfo=timezone.utc)
    current_time = created_at + timedelta(seconds=40)  # > 30s

    # Claimed by responder
    state = service.calculate_radius_state(
        created_at=created_at,
        claimed_at=created_at + timedelta(seconds=15),
        status="ACKNOWLEDGED",
        current_time=current_time
    )

    assert state.expansion_stopped is True
    assert state.is_claimed is True
    assert "claimed" in state.stop_reason.lower()


def test_expansion_stopped_when_inactive():
    """When an incident is resolved or cancelled, expansion is halted."""
    service = RadiusExpansionService()
    created_at = datetime(2026, 10, 30, 12, 0, 0, tzinfo=timezone.utc)
    current_time = created_at + timedelta(seconds=40)

    state_resolved = service.calculate_radius_state(
        created_at=created_at,
        status="RESOLVED",
        current_time=current_time
    )
    assert state_resolved.expansion_stopped is True
    assert state_resolved.is_active is False

    state_cancelled = service.calculate_radius_state(
        created_at=created_at,
        status="CANCELLED",
        current_time=current_time
    )
    assert state_cancelled.expansion_stopped is True


def test_multi_worker_deduplication_and_tiered_notification(sample_location):
    """
    Simulates multi-worker execution over time:
    - Ring 1 (t=10s, 300m): Responders within 300m are alerted.
    - Ring 2 (t=35s, 500m): Responders between 300m and 500m are alerted.
      Responders already alerted in Ring 1 are NEVER redundantly re-notified.
    - Repeated check (t=36s, 500m): No new responders; newly_notified list is empty.
    """
    service = RadiusExpansionService(threshold_seconds=30)
    created_at = datetime(2026, 10, 30, 12, 0, 0, tzinfo=timezone.utc)
    base_lat = sample_location["latitude"]
    base_lon = sample_location["longitude"]

    # Responder A: 150m away (within 300m)
    resp_a = Responder(
        id="resp_ring1",
        name="Volunteer A",
        latitude=base_lat + 0.00135,
        longitude=base_lon,
        is_available=True,
        is_active=True,
        last_location_update=created_at
    )

    # Responder B: 400m away (between 300m and 500m)
    resp_b = Responder(
        id="resp_ring2",
        name="Volunteer B",
        latitude=base_lat + 0.00360,
        longitude=base_lon,
        is_available=True,
        is_active=True,
        last_location_update=created_at
    )

    all_responders = [resp_a, resp_b]

    # --- Worker Check 1 at t=10s ---
    t_10 = created_at + timedelta(seconds=10)
    query_1 = IncidentDispatchQuery(
        incident_id="inc_exp_001",
        latitude=base_lat,
        longitude=base_lon,
        created_at=created_at,
        status="RAISED",
        responders=all_responders,
        already_notified_responder_ids=[]
    )
    decision_1 = service.evaluate_dispatch(query_1, current_time=t_10)

    assert decision_1.radius_state.current_radius_meters == 300
    assert decision_1.radius_state.is_expanded is False
    assert decision_1.newly_notified_responder_ids == ["resp_ring1"]
    assert "resp_ring2" not in decision_1.newly_notified_responder_ids
    assert decision_1.all_notified_responder_ids == ["resp_ring1"]

    # --- Worker Check 2 at t=35s (escalation to 500m) ---
    t_35 = created_at + timedelta(seconds=35)
    query_2 = IncidentDispatchQuery(
        incident_id="inc_exp_001",
        latitude=base_lat,
        longitude=base_lon,
        created_at=created_at,
        status="RAISED",
        responders=all_responders,
        already_notified_responder_ids=decision_1.all_notified_responder_ids  # ["resp_ring1"]
    )
    decision_2 = service.evaluate_dispatch(query_2, current_time=t_35)

    assert decision_2.radius_state.current_radius_meters == 500
    assert decision_2.radius_state.is_expanded is True
    # Crucial deduplication check: only resp_ring2 is NEWLY notified!
    assert decision_2.newly_notified_responder_ids == ["resp_ring2"]
    assert "resp_ring1" not in decision_2.newly_notified_responder_ids
    assert set(decision_2.all_notified_responder_ids) == {"resp_ring1", "resp_ring2"}

    # --- Worker Check 3 at t=36s (another worker running concurrently) ---
    t_36 = created_at + timedelta(seconds=36)
    query_3 = IncidentDispatchQuery(
        incident_id="inc_exp_001",
        latitude=base_lat,
        longitude=base_lon,
        created_at=created_at,
        status="RAISED",
        responders=all_responders,
        already_notified_responder_ids=decision_2.all_notified_responder_ids  # ["resp_ring1", "resp_ring2"]
    )
    decision_3 = service.evaluate_dispatch(query_3, current_time=t_36)

    # Both are already notified, so newly_notified must be empty!
    assert decision_3.newly_notified_responder_ids == []
    assert set(decision_3.all_notified_responder_ids) == {"resp_ring1", "resp_ring2"}
