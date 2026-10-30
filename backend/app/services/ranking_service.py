"""
Deterministic Responder Ranking Service for Raksha.
Ranks emergency responders based on distance, verified status, trust score,
and location freshness. Strictly avoids fabricating travel times (ETAs).
"""

from typing import List, Optional, Tuple
from datetime import datetime, timezone

from backend.app.core.config import settings
from backend.app.services.duplicate_detector import haversine_distance
from backend.app.schemas.dispatch import (
    Responder,
    RankedResponder,
    ResponderType
)


class DeterministicResponderRanker:
    """
    Ranks responders deterministically for incident dispatch.
    
    Formula components:
    - Distance Score (0.0 - 1.0): Proximity within maximum radius
    - Trust Score (0.0 - 1.0): Normalized trust level (0 to 5)
    - Freshness Score (0.0 - 1.0): Age of the most recent location ping
    - Verification Weight: Verified emergency personnel receive an explicit priority tier.
    """

    def __init__(
        self,
        max_location_age_seconds: int = settings.MAX_LOCATION_AGE_SECONDS,
        distance_weight: float = settings.DISTANCE_WEIGHT,
        trust_weight: float = settings.TRUST_LEVEL_WEIGHT,
        freshness_weight: float = settings.FRESHNESS_WEIGHT
    ):
        self.max_location_age = max_location_age_seconds
        self.distance_weight = distance_weight
        self.trust_weight = trust_weight
        self.freshness_weight = freshness_weight

    def evaluate_and_rank(
        self,
        incident_lat: float,
        incident_lon: float,
        responders: List[Responder],
        max_radius_meters: float = 500.0,
        current_time: Optional[datetime] = None
    ) -> List[RankedResponder]:
        now = current_time or datetime.now(timezone.utc)
        if now.tzinfo is None:
            now = now.replace(tzinfo=timezone.utc)

        evaluated: List[RankedResponder] = []

        for r in responders:
            # 1. Calculate great-circle distance
            dist = haversine_distance(incident_lat, incident_lon, r.latitude, r.longitude)

            # 2. Location freshness calculation
            r_time = r.last_location_update
            if r_time.tzinfo is None:
                r_time = r_time.replace(tzinfo=timezone.utc)
            freshness_seconds = max(0.0, (now - r_time).total_seconds())

            # 3. Eligibility check
            is_eligible = True
            ineligibility_reason = None

            if not r.is_active:
                is_eligible = False
                ineligibility_reason = "Responder account is inactive"
            elif not r.is_available:
                is_eligible = False
                ineligibility_reason = "Responder currently marked unavailable"
            elif freshness_seconds > self.max_location_age:
                is_eligible = False
                ineligibility_reason = f"Location ping is stale ({freshness_seconds/60:.1f}m old > limit {self.max_location_age/60:.0f}m)"

            # 4. Normalized score components (each in [0.0, 1.0])
            # Distance: 1.0 at 0m, decaying to 0.0 at max_radius_meters
            dist_score = max(0.0, 1.0 - (dist / max(max_radius_meters, 1.0)))

            # Trust: normalized from [0.0, 5.0] to [0.0, 1.0]
            trust_score = max(0.0, min(1.0, r.trust_score / 5.0))

            # Freshness: 1.0 at 0s, decaying to 0.0 at 10 minutes (600s)
            freshness_score = max(0.0, 1.0 - (freshness_seconds / 600.0))

            # Base composite score
            base_score = (
                (self.distance_weight * dist_score) +
                (self.trust_weight * trust_score) +
                (self.freshness_weight * freshness_score)
            )

            # Verification bonus tier:
            # Authorized verified responders receive an explicit +1.0 boost, placing them above
            # community volunteers while preserving deterministic intra-tier distance ranking.
            is_verified = (r.is_verified and r.responder_type == ResponderType.VERIFIED)
            verification_boost = 1.0 if is_verified else 0.0

            composite_score = round(base_score + verification_boost, 4)

            # If ineligible, score is zeroed
            if not is_eligible:
                composite_score = 0.0

            # 5. ETA Calculation (DO NOT FABRICATE TRAVEL TIMES)
            # Only calculate ETA if reliable velocity is available from telemetry
            eta_seconds: Optional[int] = None
            eta_source: Optional[str] = "UNESTIMATED"

            if r.reliable_speed_mps and r.reliable_speed_mps > 0:
                # Direct telemetry speed available
                eta_seconds = int(dist / r.reliable_speed_mps)
                eta_source = "VERIFIED_TELEMETRY"
            else:
                # No fabricated travel time; mark unestimated
                eta_seconds = None
                eta_source = "UNESTIMATED"

            # Ring classification (Ring 1: <= 300m, Ring 2: 301-500m, 0: > 500m)
            if dist <= 300.0:
                radius_ring = 1
            elif dist <= 500.0:
                radius_ring = 2
            else:
                radius_ring = 0

            is_within_radius = (dist <= max_radius_meters)

            evaluated.append(RankedResponder(
                responder=r,
                distance_meters=dist,
                location_freshness_seconds=round(freshness_seconds, 1),
                is_eligible=is_eligible,
                ineligibility_reason=ineligibility_reason,
                composite_score=composite_score,
                eta_seconds=eta_seconds,
                eta_source=eta_source,
                is_within_radius=is_within_radius,
                radius_ring=radius_ring
            ))

        # Deterministic sorting:
        # 1. Eligibility descending (eligible first)
        # 2. Composite score descending
        # 3. Distance ascending
        # 4. Responder ID ascending (strict tie-breaker)
        evaluated.sort(
            key=lambda item: (
                1 if item.is_eligible else 0,
                item.composite_score,
                -item.distance_meters,
                item.responder.id
            ),
            reverse=True
        )

        # Re-apply secondary tie-breaker with proper tuple
        evaluated.sort(
            key=lambda x: (
                not x.is_eligible,
                -x.composite_score,
                x.distance_meters,
                x.responder.id
            )
        )

        return evaluated


ranking_service = DeterministicResponderRanker()
