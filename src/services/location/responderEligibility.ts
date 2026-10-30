/**
 * Responder Eligibility and Location Freshness Evaluation.
 * Filters out unavailable responders and those with stale location pings.
 */

import { Responder } from "../../types/responder.js";

export const DEFAULT_MAX_LOCATION_AGE_SECONDS = 120; // Suggested MVP freshness threshold (120s)

export interface EligibilityResult {
  is_eligible: boolean;
  ineligibility_reason?: string;
  freshness_seconds: number;
}

export function checkResponderEligibility(
  responder: Responder,
  options?: {
    maxLocationAgeSeconds?: number;
    currentTime?: Date;
  }
): EligibilityResult {
  const maxAge = options?.maxLocationAgeSeconds ?? DEFAULT_MAX_LOCATION_AGE_SECONDS;
  const now = options?.currentTime ?? new Date();

  const pingTime =
    typeof responder.location_updated_at === "string"
      ? new Date(responder.location_updated_at)
      : responder.location_updated_at;

  const freshnessSeconds = Math.max(0, (now.getTime() - pingTime.getTime()) / 1000);

  if (responder.is_active === false) {
    return {
      is_eligible: false,
      ineligibility_reason: "Responder account is inactive",
      freshness_seconds: freshnessSeconds,
    };
  }

  if (!responder.is_available) {
    return {
      is_eligible: false,
      ineligibility_reason: "Responder currently marked unavailable",
      freshness_seconds: freshnessSeconds,
    };
  }

  if (freshnessSeconds > maxAge) {
    return {
      is_eligible: false,
      ineligibility_reason: `Location ping is stale (${Math.round(freshnessSeconds)}s old > ${maxAge}s limit)`,
      freshness_seconds: freshnessSeconds,
    };
  }

  return {
    is_eligible: true,
    freshness_seconds: freshnessSeconds,
  };
}
