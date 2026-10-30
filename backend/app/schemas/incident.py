"""
Shared Incident Contract for Raksha Platform.
Defines interfaces and lifecycle states coordinating with Member 2 (Backend Owner).
"""

from enum import Enum
from typing import Optional, List
from datetime import datetime, timezone
from pydantic import BaseModel, Field
from backend.app.schemas.triage import IncidentType, TriageResult


class IncidentStatus(str, Enum):
    RAISED = "RAISED"
    TRIAGED = "TRIAGED"
    ACKNOWLEDGED = "ACKNOWLEDGED"
    EN_ROUTE = "EN_ROUTE"
    ARRIVED = "ARRIVED"
    RESOLVED = "RESOLVED"
    CANCELLED = "CANCELLED"


class IncidentBase(BaseModel):
    citizen_id: Optional[str] = None
    description: Optional[str] = None
    latitude: float = Field(..., ge=-90.0, le=90.0)
    longitude: float = Field(..., ge=-180.0, le=180.0)
    accuracy_meters: Optional[float] = None
    language: Optional[str] = "kn"


class IncidentCreate(IncidentBase):
    """
    Immediate SOS trigger payload.
    SOS creation must return immediately without blocking on AI triage.
    """
    pass


class IncidentResponse(IncidentBase):
    id: str
    status: IncidentStatus = IncidentStatus.RAISED
    created_at: datetime
    claimed_by: Optional[str] = None
    claimed_at: Optional[datetime] = None
    current_radius_meters: int = 300
    triage: Optional[TriageResult] = None
    notified_responders: List[str] = Field(default_factory=list)
