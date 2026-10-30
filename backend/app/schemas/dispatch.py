"""
Pydantic Schemas for Responder Ranking and Radius Escalation.
Defines strict types for responders, distance calculations, and dispatch decisions.
"""

from enum import Enum
from typing import List, Optional, Set
from datetime import datetime, timezone
from pydantic import BaseModel, Field, field_validator


class ResponderType(str, Enum):
    VERIFIED = "VERIFIED"        # Certified medical, police, fire, or NGO personnel
    COMMUNITY = "COMMUNITY"      # Good Samaritan / bystander / peer volunteer


class Responder(BaseModel):
    """
    Profile and dynamic location of a responder candidate.
    Distinguishes authorized verified responders from community volunteers.
    """
    id: str
    name: str
    latitude: float = Field(..., ge=-90.0, le=90.0)
    longitude: float = Field(..., ge=-180.0, le=180.0)
    is_available: bool = True
    is_active: bool = True
    is_verified: bool = Field(
        default=False,
        description="Must only be True if assigned through an authorized verification process."
    )
    responder_type: ResponderType = Field(default=ResponderType.COMMUNITY)
    trust_score: float = Field(
        default=1.0,
        ge=0.0,
        le=5.0,
        description="Standardized trust score from 0.0 to 5.0"
    )
    last_location_update: datetime = Field(
        ...,
        description="Timestamp of the responder's most recent GPS ping"
    )
    skills: List[str] = Field(default_factory=list, description="List of certified skills, e.g. CPR, FIRST_AID")
    reliable_speed_mps: Optional[float] = Field(
        default=None,
        ge=0.5,
        le=35.0,
        description="Known reliable velocity in m/s (e.g. from OSRM/GPS telemetry). None if no reliable source."
    )

    @field_validator("responder_type", mode="before")
    @classmethod
    def sync_responder_type_with_verification(cls, v, values):
        # We ensure responder_type reflects authorized status
        if isinstance(v, str):
            v_upper = v.strip().upper()
            if v_upper in ResponderType.__members__:
                return ResponderType[v_upper]
        return v


class RankedResponder(BaseModel):
    """
    A responder evaluated and ranked for a specific incident.
    All scores and distances are computed deterministically.
    """
    responder: Responder
    distance_meters: float = Field(..., ge=0.0)
    location_freshness_seconds: float = Field(..., ge=0.0)
    is_eligible: bool
    ineligibility_reason: Optional[str] = None
    composite_score: float = Field(
        ...,
        description="Deterministic rank score (higher is higher priority)"
    )
    eta_seconds: Optional[int] = Field(
        default=None,
        description="Estimated time of arrival in seconds. ONLY provided when reliable estimate exists (NO fabricated times)."
    )
    eta_source: Optional[str] = Field(
        default=None,
        description="'OSRM_ROUTING', 'VERIFIED_TELEMETRY', or 'UNESTIMATED'"
    )
    is_within_radius: bool = Field(
        default=True,
        description="True if responder distance is within evaluated search radius"
    )
    radius_ring: int = Field(
        default=1,
        description="1 for Ring 1 (<= 300m), 2 for Ring 2 (301m - 500m), 0 for outside search radius"
    )


class IncidentDispatchQuery(BaseModel):
    """Input payload to evaluate dispatch candidates for an incident."""
    incident_id: str
    latitude: float = Field(..., ge=-90.0, le=90.0)
    longitude: float = Field(..., ge=-180.0, le=180.0)
    created_at: datetime
    claimed_at: Optional[datetime] = None
    status: str = Field(default="RAISED")
    responders: List[Responder] = Field(default_factory=list)
    already_notified_responder_ids: List[str] = Field(default_factory=list)


class RankRespondersRequest(BaseModel):
    """Direct query to rank responders around a given coordinate."""
    latitude: float = Field(..., ge=-90.0, le=90.0)
    longitude: float = Field(..., ge=-180.0, le=180.0)
    responders: List[Responder] = Field(default_factory=list)
    max_radius_meters: float = Field(default=500.0, ge=1.0)


class RadiusExpansionState(BaseModel):
    """
    Calculated radius state based on incident timestamps and claim status.
    Determined strictly on backend to prevent client-side timer manipulation.
    """
    incident_id: str
    current_radius_meters: int = Field(..., description="300m initial or 500m expanded")
    is_expanded: bool = False
    expansion_threshold_seconds: int = 30
    elapsed_seconds: float
    is_claimed: bool
    is_active: bool
    expansion_stopped: bool
    stop_reason: Optional[str] = None
    evaluated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class DispatchDecision(BaseModel):
    """Complete dispatch decision report for an incident check."""
    incident_id: str
    radius_state: RadiusExpansionState
    eligible_responders_in_radius: List[RankedResponder] = Field(default_factory=list)
    newly_notified_responder_ids: List[str] = Field(
        default_factory=list,
        description="Responder IDs to notify in this expansion/check cycle (deduplicated against previously notified)"
    )
    all_notified_responder_ids: List[str] = Field(
        default_factory=list,
        description="Cumulative list of notified responders"
    )
    audit_notes: List[str] = Field(default_factory=list)
