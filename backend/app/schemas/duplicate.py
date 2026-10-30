"""
Pydantic Schemas for Candidate Duplicate Detection.
Preserves original incident records without destructive auto-merging.
"""

from typing import List, Optional, Any, Union
from datetime import datetime, timezone
from pydantic import BaseModel, Field, ConfigDict
from backend.app.schemas.triage import IncidentType


class ExistingIncidentRecord(BaseModel):
    """Snapshot of an active or recent incident used for candidate comparison."""
    model_config = ConfigDict(from_attributes=True)

    id: str
    incident_type: IncidentType
    description: Optional[str] = None
    latitude: float = Field(..., ge=-90.0, le=90.0)
    longitude: float = Field(..., ge=-180.0, le=180.0)
    created_at: datetime
    status: str = Field(default="RAISED")


class CandidateDuplicateMatch(BaseModel):
    """Details of a single candidate duplicate incident."""
    incident_id: str
    distance_meters: float = Field(..., ge=0.0)
    time_diff_seconds: float = Field(..., ge=0.0)
    category_match: bool
    text_similarity_score: Optional[float] = Field(None, ge=0.0, le=1.0)
    match_confidence: float = Field(..., ge=0.0, le=1.0)
    reason: str


class DuplicateCheckRequest(BaseModel):
    """Query payload to check if a new/incoming incident is a duplicate of existing ones."""
    model_config = ConfigDict(arbitrary_types_allowed=True)

    incident_id: Optional[str] = None
    incident_type: IncidentType
    description: Optional[str] = None
    latitude: float = Field(..., ge=-90.0, le=90.0)
    longitude: float = Field(..., ge=-180.0, le=180.0)
    created_at: Optional[datetime] = None
    recent_incidents: List[Any] = Field(
        default_factory=list,
        description="List of active or recent incidents (records, ORM models, or dicts)"
    )


class DuplicateCheckResponse(BaseModel):
    """
    Result of duplicate candidate detection.
    Advisory only: does NOT merge or delete records.
    """
    is_possible_duplicate: bool
    possible_duplicate_ids: List[str] = Field(default_factory=list)
    candidates: List[CandidateDuplicateMatch] = Field(default_factory=list)
    highest_confidence: float = Field(default=0.0, ge=0.0, le=1.0)
    summary_reason: str
    evaluated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    advisory_notice: str = Field(
        default="Advisory candidate match only. Incidents must NOT be auto-merged or closed without human operator review."
    )
