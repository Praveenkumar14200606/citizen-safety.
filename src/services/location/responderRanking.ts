/**
 * Deterministic Responder Ranking Service.
 * Scores and orders eligible emergency responders based on distance, verified status,
 * and location freshness.
 * Strictly avoids fabricating travel times (ETAs).
 */

import { Responder, RankedResponder } from "../../types/responder.js";
import { haversineDistance } from "./distance.js";
import { checkResponderEligibility, DEFAULT_MAX_LOCATION_AGE_SECONDS } from "./responderEligibility.js";

export function rankResponders(
  incidentLat: number,
  incidentLon: number,
  responders: Responder[],
  maxRadiusMeters = 500.0,
  currentTime = new Date(),
  maxLocationAgeSeconds = DEFAULT_MAX_LOCATION_AGE_SECONDS
): RankedResponder[] {
  const evaluated: RankedResponder[] = [];

  for (const r of responders) {
    const distance = haversineDistance(incidentLat, incidentLon, r.latitude, r.longitude);
    const eligibility = checkResponderEligibility(r, {
      maxLocationAgeSeconds,
      currentTime,
    });

    // Score components: [0.0, 1.0]
    // Distance decay
    const distScore = Math.max(0.0, 1.0 - distance / Math.max(maxRadiusMeters, 1.0));
    // Freshness decay (decay over maxLocationAgeSeconds)
    const freshnessScore = Math.max(0.0, 1.0 - eligibility.freshness_seconds / maxLocationAgeSeconds);

    // Trust preference bonus
    const isVerified = r.trust_level === "VERIFIED";
    const verificationBonus = isVerified ? 1.0 : 0.0;

    // Base score (Weights: distance 0.60, freshness 0.40)
    let compositeScore = 0.6 * distScore + 0.4 * freshnessScore + verificationBonus;
    compositeScore = Math.round(compositeScore * 10000) / 10000;

    if (!eligibility.is_eligible) {
      compositeScore = 0.0;
    }

    // ETA calculation (DO NOT FABRICATE TRAVEL TIMES)
    let etaSeconds: number | null = null;
    let etaSource: "VERIFIED_TELEMETRY" | "UNESTIMATED" = "UNESTIMATED";

    if (r.reliable_speed_mps && r.reliable_speed_mps > 0) {
      etaSeconds = Math.round(distance / r.reliable_speed_mps);
      etaSource = "VERIFIED_TELEMETRY";
    }

    // Ring classification (Ring 1 <= 300m, Ring 2 301-500m, 0 outside)
    let radiusRing: 1 | 2 | 0 = 0;
    if (distance <= 300.0) {
      radiusRing = 1;
    } else if (distance <= 500.0) {
      radiusRing = 2;
    }

    const isWithinRadius = distance <= maxRadiusMeters;

    evaluated.push({
      responder: r,
      distance_meters: distance,
      location_freshness_seconds: Math.round(eligibility.freshness_seconds * 10) / 10,
      is_eligible: eligibility.is_eligible,
      ineligibility_reason: eligibility.ineligibility_reason ?? null,
      composite_score: compositeScore,
      eta_seconds: etaSeconds,
      eta_source: etaSource,
      radius_ring: radiusRing,
      is_within_radius: isWithinRadius,
    });
  }

  // Deterministic sorting:
  // 1. Eligible first
  // 2. Composite score descending
  // 3. Distance ascending
  // 4. responder_id ascending
  evaluated.sort((a, b) => {
    if (a.is_eligible !== b.is_eligible) {
      return a.is_eligible ? -1 : 1;
    }
    if (b.composite_score !== a.composite_score) {
      return b.composite_score - a.composite_score;
    }
    if (a.distance_meters !== b.distance_meters) {
      return a.distance_meters - b.distance_meters;
    }
    return a.responder.responder_id.localeCompare(b.responder.responder_id);
  });

  return evaluated;
}
