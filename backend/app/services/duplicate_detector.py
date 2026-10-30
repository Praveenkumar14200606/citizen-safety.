"""
Lightweight Candidate Duplicate Detector for Raksha.
Detects potential duplicates using geographic proximity, recent time windows,
category matching, and token-based text similarity.
Strictly non-destructive: flags candidate IDs for operator review without auto-merging.
"""

import math
from typing import List, Tuple, Set, Optional
from datetime import datetime, timezone

from backend.app.core.config import settings
from backend.app.schemas.triage import IncidentType
from backend.app.schemas.duplicate import (
    ExistingIncidentRecord,
    CandidateDuplicateMatch,
    DuplicateCheckRequest,
    DuplicateCheckResponse
)


def haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """
    Computes great-circle distance between two GPS coordinates in meters.
    Formula: d = 2 * R * asin(sqrt(sin^2(dlat/2) + cos(lat1)*cos(lat2)*sin^2(dlon/2)))
    """
    R = 6371000.0  # Earth's radius in meters
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)

    a = (math.sin(delta_phi / 2.0) ** 2 +
         math.cos(phi1) * math.cos(phi2) * (math.sin(delta_lambda / 2.0) ** 2))
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))

    return round(R * c, 2)


def compute_text_similarity(text1: Optional[str], text2: Optional[str]) -> float:
    """
    Computes token-based Jaccard similarity between two emergency descriptions.
    Robust across Kannada, Hindi, and English script tokens.
    """
    if not text1 or not text2:
        return 0.0

    # Tokenize on whitespace and punctuation
    def tokenize(s: str) -> Set[str]:
        words = s.lower().replace(",", " ").replace(".", " ").replace("!", " ").split()
        return {w.strip() for w in words if len(w.strip()) > 1}

    tokens1 = tokenize(text1)
    tokens2 = tokenize(text2)

    if not tokens1 or not tokens2:
        return 0.0

    intersection = tokens1.intersection(tokens2)
    union = tokens1.union(tokens2)

    return round(len(intersection) / len(union), 4)


class CandidateDuplicateDetector:
    """
    Evaluates new incidents against existing active or recent incidents.
    Returns matched candidate IDs and confidence reasons without modifying original records.
    """

    COMPATIBLE_CATEGORIES = {
        (IncidentType.ACCIDENT, IncidentType.MEDICAL),
        (IncidentType.MEDICAL, IncidentType.ACCIDENT),
        (IncidentType.VIOLENCE, IncidentType.HARASSMENT),
        (IncidentType.HARASSMENT, IncidentType.VIOLENCE),
        (IncidentType.FIRE, IncidentType.ACCIDENT),
        (IncidentType.ACCIDENT, IncidentType.FIRE)
    }

    def __init__(
        self,
        distance_threshold_meters: float = settings.DUPLICATE_DISTANCE_THRESHOLD_METERS,
        time_window_seconds: int = settings.DUPLICATE_TIME_WINDOW_SECONDS
    ):
        self.distance_threshold = distance_threshold_meters
        self.time_window = time_window_seconds

    @staticmethod
    def _extract_record_fields(record) -> Tuple[str, IncidentType, float, float, datetime, Optional[str]]:
        """Extracts fields uniformly from Pydantic models, dicts, or ORM objects."""
        if isinstance(record, dict):
            r_id = str(record.get("id", ""))
            r_type = record.get("incident_type")
            r_lat = float(record.get("latitude", 0.0))
            r_lon = float(record.get("longitude", 0.0))
            r_time = record.get("created_at") or datetime.now(timezone.utc)
            r_desc = record.get("description")
        else:
            r_id = str(getattr(record, "id", ""))
            r_type = getattr(record, "incident_type")
            r_lat = float(getattr(record, "latitude", 0.0))
            r_lon = float(getattr(record, "longitude", 0.0))
            r_time = getattr(record, "created_at", None) or datetime.now(timezone.utc)
            r_desc = getattr(record, "description", None)

        if isinstance(r_type, str):
            r_type = IncidentType[r_type.strip().upper()]

        if isinstance(r_time, str):
            try:
                r_time = datetime.fromisoformat(r_time)
            except (ValueError, TypeError):
                r_time = datetime.now(timezone.utc)

        return r_id, r_type, r_lat, r_lon, r_time, r_desc

    def evaluate_candidates(self, request: DuplicateCheckRequest) -> DuplicateCheckResponse:
        target_lat = request.latitude
        target_lon = request.longitude
        target_type = request.incident_type
        target_desc = request.description
        target_time = request.created_at or datetime.now(timezone.utc)

        # Ensure target_time is timezone-aware
        if target_time.tzinfo is None:
            target_time = target_time.replace(tzinfo=timezone.utc)

        candidates: List[CandidateDuplicateMatch] = []

        for raw_record in request.recent_incidents:
            rec_id, rec_type, rec_lat, rec_lon, rec_time, rec_desc = self._extract_record_fields(raw_record)

            # Skip if comparing to itself
            if request.incident_id and rec_id == request.incident_id:
                continue

            if rec_time.tzinfo is None:
                rec_time = rec_time.replace(tzinfo=timezone.utc)

            time_diff = abs((target_time - rec_time).total_seconds())

            # 1. Time Window Filter: ignore if older than threshold
            if time_diff > self.time_window:
                continue

            # 2. Geographic Distance
            dist_meters = haversine_distance(target_lat, target_lon, rec_lat, rec_lon)
            if dist_meters > (self.distance_threshold * 2.5):  # Cutoff at 500m
                continue

            # 3. Category Relationship
            category_match = (rec_type == target_type)
            is_compatible = (target_type, rec_type) in self.COMPATIBLE_CATEGORIES

            # Category score
            if category_match:
                cat_score = 1.0
            elif is_compatible:
                cat_score = 0.5
            else:
                cat_score = 0.1

            # Geo score (linear decay from 0m to distance_threshold)
            geo_score = max(0.0, 1.0 - (dist_meters / (self.distance_threshold * 2.0)))

            # Time score (linear decay from 0s to time_window)
            time_score = max(0.0, 1.0 - (time_diff / self.time_window))

            # 4. Text similarity score
            text_sim = compute_text_similarity(target_desc, rec_desc)

            # Composite match confidence
            # Weights: Geo 40%, Time 25%, Category 25%, Text 10%
            confidence = (0.40 * geo_score) + (0.25 * time_score) + (0.25 * cat_score) + (0.10 * text_sim)
            confidence = round(min(1.0, max(0.0, confidence)), 3)

            # Candidate qualification threshold (0.50 or higher)
            if confidence >= 0.50 or (dist_meters <= self.distance_threshold and (category_match or is_compatible)):
                reason_parts = [
                    f"Distance: {dist_meters:.0f}m (within radius)",
                    f"Reported {time_diff / 60.0:.1f}m apart",
                    f"Category: {rec_type.value}" + (" (exact match)" if category_match else " (related)")
                ]
                if text_sim > 0.3:
                    reason_parts.append(f"Text similarity: {text_sim*100:.0f}%")

                candidate = CandidateDuplicateMatch(
                    incident_id=rec_id,
                    distance_meters=dist_meters,
                    time_diff_seconds=round(time_diff, 1),
                    category_match=category_match,
                    text_similarity_score=text_sim if target_desc and rec_desc else None,
                    match_confidence=confidence,
                    reason="; ".join(reason_parts)
                )
                candidates.append(candidate)

        # Sort candidates by match confidence descending
        candidates.sort(key=lambda c: c.match_confidence, reverse=True)

        is_duplicate = len(candidates) > 0
        candidate_ids = [c.incident_id for c in candidates]
        highest_conf = candidates[0].match_confidence if candidates else 0.0

        if is_duplicate:
            summary_reason = (
                f"Identified {len(candidates)} candidate duplicate(s). "
                f"Closest is #{candidates[0].incident_id} at {candidates[0].distance_meters:.0f}m "
                f"with {candidates[0].match_confidence*100:.0f}% confidence."
            )
        else:
            summary_reason = "No candidate duplicates found within time and geographic thresholds."

        return DuplicateCheckResponse(
            is_possible_duplicate=is_duplicate,
            possible_duplicate_ids=candidate_ids,
            candidates=candidates,
            highest_confidence=highest_conf,
            summary_reason=summary_reason
        )


duplicate_detector = CandidateDuplicateDetector()
