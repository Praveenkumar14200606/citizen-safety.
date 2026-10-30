"""
FastAPI Router for AI Triage and Location-Logic Services.
Mountable by Member 2 (Backend Owner) via app.include_router(ai_location_router).
"""

from fastapi import APIRouter, HTTPException, status
from typing import List

from backend.app.schemas.triage import TriageRequest, TriageResult
from backend.app.schemas.duplicate import DuplicateCheckRequest, DuplicateCheckResponse
from backend.app.schemas.dispatch import (
    IncidentDispatchQuery,
    RankRespondersRequest,
    DispatchDecision,
    RankedResponder,
    Responder
)
from backend.app.services.triage_service import triage_service
from backend.app.services.duplicate_detector import duplicate_detector
from backend.app.services.ranking_service import ranking_service
from backend.app.services.radius_expansion import radius_expansion_service


ai_location_router = APIRouter(prefix="/ai-location", tags=["AI Triage & Location Dispatch"])


@ai_location_router.post(
    "/triage",
    response_model=TriageResult,
    summary="Triage emergency incident description (Kannada, Hindi, English)"
)
async def triage_incident_endpoint(payload: TriageRequest) -> TriageResult:
    """
    Classifies incident description into structured triage schema.
    Guaranteed bounded timeout and non-blocking deterministic fallback on failure.
    """
    return await triage_service.triage_incident(payload)


@ai_location_router.post(
    "/duplicates/check",
    response_model=DuplicateCheckResponse,
    summary="Detect candidate duplicate incidents"
)
async def check_duplicates_endpoint(payload: DuplicateCheckRequest) -> DuplicateCheckResponse:
    """
    Identifies candidate duplicate reports via proximity, time, category, and text similarity.
    Advisory only: does NOT merge or delete records.
    """
    return duplicate_detector.evaluate_candidates(payload)


@ai_location_router.post(
    "/dispatch/evaluate",
    response_model=DispatchDecision,
    summary="Evaluate search radius expansion and responder notifications"
)
async def evaluate_dispatch_endpoint(payload: IncidentDispatchQuery) -> DispatchDecision:
    """
    Computes current search radius (300m -> 30s -> 500m) from incident timestamps and state.
    Returns ranked eligible responders and newly notified responder IDs with deduplication.
    """
    return radius_expansion_service.evaluate_dispatch(payload)


@ai_location_router.post(
    "/dispatch/rank",
    response_model=List[RankedResponder],
    summary="Rank responders deterministically around given coordinates"
)
async def rank_responders_endpoint(payload: RankRespondersRequest) -> List[RankedResponder]:
    """
    Ranks responders deterministically for incident dispatch or map visualization.
    Assigns radius rings (Ring 1: <=300m, Ring 2: 301-500m) and distinguishes verified responders.
    """
    return ranking_service.evaluate_and_rank(
        incident_lat=payload.latitude,
        incident_lon=payload.longitude,
        responders=payload.responders,
        max_radius_meters=payload.max_radius_meters
    )
