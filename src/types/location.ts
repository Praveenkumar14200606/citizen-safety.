/**
 * Type definitions for Location Intelligence & Radius Escalation in Raksha.
 */

export interface Coordinates {
  latitude: number;
  longitude: number;
}

export interface RadiusEscalationState {
  incident_id: string;
  current_radius_meters: 300 | 500;
  is_expanded: boolean;
  expansion_threshold_seconds: number;
  elapsed_seconds: number;
  is_claimed: boolean;
  is_active: boolean;
  expansion_stopped: boolean;
  stop_reason?: string | null;
  evaluated_at: string;
}

export interface CandidateDuplicateMatch {
  incident_id: string;
  distance_meters: number;
  time_diff_seconds: number;
  category_match: boolean;
  text_similarity_score?: number | null;
  match_confidence: number;
  reason: string;
}

export interface DuplicateCheckResponse {
  is_possible_duplicate: boolean;
  possible_duplicate_ids: string[];
  candidates: CandidateDuplicateMatch[];
  highest_confidence: number;
  summary_reason: string;
  evaluated_at: string;
  advisory_notice: string;
}
