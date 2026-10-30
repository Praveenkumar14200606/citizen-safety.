/**
 * Unit Tests for Location Intelligence, Distance, and Responder Ranking (TypeScript).
 */

import test from "node:test";
import assert from "node:assert";
import { haversineDistance } from "../dist/services/location/distance.js";
import { validateCoordinates } from "../dist/utils/coordinateValidation.js";
import { checkResponderEligibility } from "../dist/services/location/responderEligibility.js";
import { rankResponders } from "../dist/services/location/responderRanking.js";
import type { Responder } from "../dist/types/responder.js";

test("Location - Coordinate Validation", () => {
  assert.strictEqual(validateCoordinates(12.9716, 77.5946).valid, true);
  assert.strictEqual(validateCoordinates(95.0, 77.5946).valid, false);
  assert.strictEqual(validateCoordinates(12.9716, 200.0).valid, false);
  assert.strictEqual(validateCoordinates(NaN, 77.5946).valid, false);
  assert.strictEqual(validateCoordinates(null, 77.5946).valid, false);
});

test("Location - Haversine Distance Calculation", () => {
  // Majestic to Vidhana Soudha (~2.1 km)
  const dist = haversineDistance(12.9767, 77.5713, 12.9797, 77.5907);
  assert.ok(dist >= 2000 && dist <= 2300);
});

test("Location - Responder Eligibility and Freshness Filter", () => {
  const now = new Date();

  // Fresh ping (20s old <= 120s limit)
  const freshResp: Responder = {
    responder_id: "r_fresh",
    trust_level: "COMMUNITY",
    is_available: true,
    latitude: 12.9716,
    longitude: 77.5946,
    location_updated_at: new Date(now.getTime() - 20000),
  };
  const resFresh = checkResponderEligibility(freshResp, { currentTime: now, maxLocationAgeSeconds: 120 });
  assert.strictEqual(resFresh.is_eligible, true);

  // Stale ping (180s old > 120s limit)
  const staleResp: Responder = {
    responder_id: "r_stale",
    trust_level: "COMMUNITY",
    is_available: true,
    latitude: 12.9716,
    longitude: 77.5946,
    location_updated_at: new Date(now.getTime() - 180000),
  };
  const resStale = checkResponderEligibility(staleResp, { currentTime: now, maxLocationAgeSeconds: 120 });
  assert.strictEqual(resStale.is_eligible, false);
  assert.ok(resStale.ineligibility_reason?.includes("stale"));

  // Unavailable responder
  const unavailResp: Responder = {
    responder_id: "r_busy",
    trust_level: "VERIFIED",
    is_available: false,
    latitude: 12.9716,
    longitude: 77.5946,
    location_updated_at: now,
  };
  const resBusy = checkResponderEligibility(unavailResp, { currentTime: now });
  assert.strictEqual(resBusy.is_eligible, false);
  assert.ok(resBusy.ineligibility_reason?.includes("unavailable"));
});

test("Location - Deterministic Ranking and Verified Preference", () => {
  const now = new Date();
  const baseLat = 12.9767;
  const baseLon = 77.5713;

  const verifiedResp: Responder = {
    responder_id: "resp_verified",
    name: "Dr. Priya",
    trust_level: "VERIFIED",
    is_available: true,
    latitude: baseLat + 0.001, // ~111m
    longitude: baseLon,
    location_updated_at: now,
  };

  const communityResp: Responder = {
    responder_id: "resp_community",
    name: "Ravi Volunteer",
    trust_level: "COMMUNITY",
    is_available: true,
    latitude: baseLat + 0.0009, // ~100m (slightly closer)
    longitude: baseLon,
    location_updated_at: now,
  };

  const ranked = rankResponders(baseLat, baseLon, [communityResp, verifiedResp], 500, now);

  // Verified responder gets verification tier bonus and leads
  assert.strictEqual(ranked[0].responder.responder_id, "resp_verified");
  assert.ok(ranked[0].composite_score > ranked[1].composite_score);
});

test("Location - Strict Non-Fabrication of Travel Times (ETA)", () => {
  const now = new Date();
  const baseLat = 12.9767;
  const baseLon = 77.5713;

  const unmeteredResp: Responder = {
    responder_id: "r_unmetered",
    trust_level: "COMMUNITY",
    is_available: true,
    latitude: baseLat + 0.001,
    longitude: baseLon,
    location_updated_at: now,
    reliable_speed_mps: null, // No telemetry speed
  };

  const meteredResp: Responder = {
    responder_id: "r_metered",
    trust_level: "VERIFIED",
    is_available: true,
    latitude: baseLat + 0.002, // ~222m
    longitude: baseLon,
    location_updated_at: now,
    reliable_speed_mps: 5.0, // 5 m/s verified speed
  };

  const ranked = rankResponders(baseLat, baseLon, [unmeteredResp, meteredResp], 500, now);

  const unmeteredResult = ranked.find((r) => r.responder.responder_id === "r_unmetered")!;
  assert.strictEqual(unmeteredResult.eta_seconds, null);
  assert.strictEqual(unmeteredResult.eta_source, "UNESTIMATED");

  const meteredResult = ranked.find((r) => r.responder.responder_id === "r_metered")!;
  assert.ok(meteredResult.eta_seconds! > 0);
  assert.strictEqual(meteredResult.eta_source, "VERIFIED_TELEMETRY");
});
