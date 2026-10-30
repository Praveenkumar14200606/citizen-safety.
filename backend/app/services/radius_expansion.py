"""
Server-side Radius Expansion & Dispatch Coordinator for Raksha.
Implements the 300m -> 30s threshold -> 500m expansion MVP rule.
Guarantees idempotent evaluation, timestamp-based calculation, and worker deduplication.
"""

from typing import List, Optional, Set
from datetime import datetime, timezone

from backend.app.core.config import settings
from backend.app.core.logging import logger
from backend.app.schemas.dispatch import (
    Responder,
    RankedResponder,
    IncidentDispatchQuery,
    RadiusExpansionState,
    DispatchDecision
)
from backend.app.services.ranking_service import ranking_service


INACTIVE_STATUSES = {
    "CLAIMED",
    "ACKNOWLEDGED",
    "EN_ROUTE",
    "ARRIVED",
    "RESOLVED",
    "CANCELLED"
}


class RadiusExpansionService:
    """
    Manages search radius escalation and responder alert candidate filtering.
    """

    def __init__(
        self,
        initial_radius: int = settings.INITIAL_SEARCH_RADIUS_METERS,
        expanded_radius: int = settings.EXPANDED_SEARCH_RADIUS_METERS,
        threshold_seconds: int = settings.RADIUS_EXPANSION_THRESHOLD_SECONDS
    ):
        self.initial_radius = initial_radius
        self.expanded_radius = expanded_radius
        self.threshold_seconds = threshold_seconds

    def calculate_radius_state(
        self,
        created_at: datetime,
        claimed_at: Optional[datetime] = None,
        status: str = "RAISED",
        current_time: Optional[datetime] = None
    ) -> RadiusExpansionState:
        """
        Determines current search radius and expansion lifecycle based on backend timestamps.
        Does NOT rely on client timers.
        """
        now = current_time or datetime.now(timezone.utc)
        if now.tzinfo is None:
            now = now.replace(tzinfo=timezone.utc)

        c_time = created_at
        if c_time.tzinfo is None:
            c_time = c_time.replace(tzinfo=timezone.utc)

        elapsed = max(0.0, (now - c_time).total_seconds())

        status_upper = status.strip().upper()
        is_claimed = (claimed_at is not None) or (status_upper in ("CLAIMED", "ACKNOWLEDGED"))
        is_active = status_upper not in ("RESOLVED", "CANCELLED")

        # Check if expansion should be halted
        if is_claimed:
            return RadiusExpansionState(
                incident_id="",
                current_radius_meters=self.initial_radius,
                is_expanded=False,
                expansion_threshold_seconds=self.threshold_seconds,
                elapsed_seconds=round(elapsed, 1),
                is_claimed=True,
                is_active=is_active,
                expansion_stopped=True,
                stop_reason="Incident has been claimed by a responder",
                evaluated_at=now
            )

        if not is_active:
            return RadiusExpansionState(
                incident_id="",
                current_radius_meters=self.initial_radius,
                is_expanded=False,
                expansion_threshold_seconds=self.threshold_seconds,
                elapsed_seconds=round(elapsed, 1),
                is_claimed=is_claimed,
                is_active=False,
                expansion_stopped=True,
                stop_reason=f"Incident is no longer active (status: {status_upper})",
                evaluated_at=now
            )

        # Active & Unclaimed: Check threshold
        if elapsed >= self.threshold_seconds:
            current_radius = self.expanded_radius
            is_expanded = True
        else:
            current_radius = self.initial_radius
            is_expanded = False

        return RadiusExpansionState(
            incident_id="",
            current_radius_meters=current_radius,
            is_expanded=is_expanded,
            expansion_threshold_seconds=self.threshold_seconds,
            elapsed_seconds=round(elapsed, 1),
            is_claimed=False,
            is_active=True,
            expansion_stopped=False,
            stop_reason=None,
            evaluated_at=now
        )

    def evaluate_dispatch(
        self,
        query: IncidentDispatchQuery,
        current_time: Optional[datetime] = None
    ) -> DispatchDecision:
        """
        Evaluates an incident for responder notifications.
        Deduplicates against already notified responders so multiple workers
        never send redundant alerts.
        """
        now = current_time or datetime.now(timezone.utc)
        if now.tzinfo is None:
            now = now.replace(tzinfo=timezone.utc)

        # 1. Compute radius state
        rad_state = self.calculate_radius_state(
            created_at=query.created_at,
            claimed_at=query.claimed_at,
            status=query.status,
            current_time=now
        )
        rad_state.incident_id = query.incident_id

        audit_notes: List[str] = [
            f"Evaluated at {now.isoformat()}",
            f"Elapsed time: {rad_state.elapsed_seconds:.1f}s",
            f"Active radius: {rad_state.current_radius_meters}m"
        ]

        if rad_state.expansion_stopped:
            audit_notes.append(f"Dispatch stopped: {rad_state.stop_reason}")
            return DispatchDecision(
                incident_id=query.incident_id,
                radius_state=rad_state,
                eligible_responders_in_radius=[],
                newly_notified_responder_ids=[],
                all_notified_responder_ids=query.already_notified_responder_ids,
                audit_notes=audit_notes
            )

        # 2. Rank all responders deterministically
        ranked = ranking_service.evaluate_and_rank(
            incident_lat=query.latitude,
            incident_lon=query.longitude,
            responders=query.responders,
            max_radius_meters=float(rad_state.current_radius_meters),
            current_time=now
        )

        # 3. Filter eligible responders within current radius
        in_radius_eligible: List[RankedResponder] = [
            r for r in ranked
            if r.is_eligible and r.distance_meters <= rad_state.current_radius_meters
        ]

        # 4. Worker deduplication: determine who is NEWLY alerted
        already_notified_set = set(query.already_notified_responder_ids)
        newly_notified: List[str] = []

        for item in in_radius_eligible:
            r_id = item.responder.id
            if r_id not in already_notified_set:
                newly_notified.append(r_id)
                already_notified_set.add(r_id)

        audit_notes.append(
            f"Found {len(in_radius_eligible)} eligible responders within {rad_state.current_radius_meters}m. "
            f"Newly notified: {len(newly_notified)}, Previously notified: {len(query.already_notified_responder_ids)}"
        )

        return DispatchDecision(
            incident_id=query.incident_id,
            radius_state=rad_state,
            eligible_responders_in_radius=in_radius_eligible,
            newly_notified_responder_ids=newly_notified,
            all_notified_responder_ids=sorted(list(already_notified_set)),
            audit_notes=audit_notes
        )


radius_expansion_service = RadiusExpansionService()
