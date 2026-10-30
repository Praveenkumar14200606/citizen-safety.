/**
 * Server-side Strict Validation for AI Triage Results.
 * Rejects out-of-range severities, invalid enums, and non-numeric confidence scores.
 */

import { IncidentType, TriageResult, TriageValidationResult } from "../../types/ai.js";
import { PERMITTED_INCIDENT_TYPES, MEDICAL_DISCLAIMER } from "./triageSchema.js";

export function validateTriageOutput(raw: unknown): TriageValidationResult {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { valid: false, error: "Triage output must be a non-null JSON object." };
  }

  const obj = raw as Record<string, unknown>;

  // 1. Validate incident_type
  if (typeof obj.incident_type !== "string") {
    return { valid: false, error: "Missing or invalid 'incident_type' field (must be string)." };
  }
  const incTypeUpper = obj.incident_type.trim().toUpperCase() as IncidentType;
  if (!PERMITTED_INCIDENT_TYPES.includes(incTypeUpper)) {
    return {
      valid: false,
      error: `Invalid incident_type '${obj.incident_type}'. Permitted: ${PERMITTED_INCIDENT_TYPES.join(", ")}`,
    };
  }

  // 2. Validate severity (Integer 1 - 5)
  if (typeof obj.severity !== "number" || !Number.isInteger(obj.severity)) {
    return { valid: false, error: "Severity must be an integer." };
  }
  if (obj.severity < 1 || obj.severity > 5) {
    return { valid: false, error: `Severity ${obj.severity} is out of range [1, 5].` };
  }

  // 3. Validate confidence (Float 0.0 - 1.0)
  if (typeof obj.confidence !== "number" || Number.isNaN(obj.confidence)) {
    return { valid: false, error: "Confidence must be a valid number." };
  }
  if (obj.confidence < 0.0 || obj.confidence > 1.0) {
    return { valid: false, error: `Confidence ${obj.confidence} is out of range [0.0, 1.0].` };
  }

  // 4. Validate booleans
  const possible_duplicate = Boolean(obj.possible_duplicate);
  const spam_flag = Boolean(obj.spam_flag);

  // 5. Validate reason
  if (typeof obj.reason !== "string" || obj.reason.trim().length === 0) {
    return { valid: false, error: "Reason must be a non-empty string explanation." };
  }
  const reason = obj.reason.trim().slice(0, 500);

  const result: TriageResult = {
    incident_type: incTypeUpper,
    severity: obj.severity,
    confidence: Math.round(obj.confidence * 1000) / 1000,
    possible_duplicate,
    spam_flag,
    reason,
    is_fallback: false,
    triage_error: null,
    detected_language: typeof obj.detected_language === "string" ? obj.detected_language : undefined,
    medical_disclaimer: MEDICAL_DISCLAIMER,
    triaged_at: new Date().toISOString(),
  };

  return { valid: true, data: result };
}
