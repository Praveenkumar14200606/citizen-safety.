/**
 * Type definitions for AI Emergency Triage in Raksha.
 */

export type IncidentType =
  | "MEDICAL"
  | "HARASSMENT"
  | "VIOLENCE"
  | "ACCIDENT"
  | "FIRE"
  | "OTHER";

export interface TriageRequest {
  incident_id?: string;
  description: string;
  language_hint?: string;
  latitude?: number;
  longitude?: number;
}

export interface TriageResult {
  incident_type: IncidentType;
  severity: number; // Integer 1 - 5
  confidence: number; // 0.0 - 1.0
  possible_duplicate: boolean;
  spam_flag: boolean;
  reason: string;
  is_fallback?: boolean;
  triage_error?: string | null;
  detected_language?: string;
  medical_disclaimer: string;
  triaged_at: string;
}

export interface TriageValidationResult {
  valid: boolean;
  data?: TriageResult;
  error?: string;
}
