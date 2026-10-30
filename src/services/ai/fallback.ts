/**
 * Safe Deterministic Fallback for AI Emergency Triage.
 * Ensures the emergency response pipeline remains active and non-blocking
 * during LLM downtime, network failure, timeouts, or parsing errors.
 */

import { TriageResult } from "../../types/ai.js";
import { MEDICAL_DISCLAIMER } from "./triageSchema.js";

export function getSafeFallbackTriage(
  reasonDetail = "AI triage unavailable; manual assessment required",
  errorDetail: string | null = null,
  detectedLanguage?: string
): TriageResult {
  return {
    incident_type: "OTHER",
    severity: 3, // Safe median severity level ensuring responder alert
    confidence: 0.0, // Explicit low-confidence indicator
    possible_duplicate: false,
    spam_flag: false, // Never suppress or cancel an SOS
    reason: `Fallback triage: ${reasonDetail}`,
    is_fallback: true,
    triage_error: errorDetail,
    detected_language: detectedLanguage,
    medical_disclaimer: MEDICAL_DISCLAIMER,
    triaged_at: new Date().toISOString(),
  };
}
