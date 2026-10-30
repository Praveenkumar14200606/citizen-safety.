/**
 * Unit Tests for Radius Escalation Logic (TypeScript).
 */

import test from "node:test";
import assert from "node:assert";
import {
  shouldExpandRadius,
  calculateRadiusExpansionState,
  evaluateDispatch,
} from "../dist/services/location/radiusEscalation.js";
import type { Responder } from "../dist/types/responder.js";

test("Escalation - shouldExpandRadius Timing & Status Rules", () => {
  // 1. Under 30 seconds -> false
  const resUnder30 = shouldExpandRadius({
    incidentStatus: "OPEN",
    activeRadius: 300,
    elapsedSeconds: 20,
  });
  assert.strictEqual(resUnder30.should_expand, false);
  assert.strictEqual(resUnder30.next_radius, 300);

  // 2. Exactly 30 seconds -> true, expand to 500m
  const resExact30 = shouldExpandRadius({
    incidentStatus: "OPEN",
    activeRadius: 300,
    elapsedSeconds: 30,
  });
  assert.strictEqual(resExact30.should_expand, true);
  assert.strictEqual(resExact30.next_radius, 500);

  // 3. Over 30 seconds -> true, expand to 500m
  const resOver30 = shouldExpandRadius({
    incidentStatus: "OPEN",
    activeRadius: 300,
    elapsedSeconds: 45,
  });
  assert.strictEqual(resOver30.should_expand, true);
  assert.strictEqual(resOver30.next_radius, 500);

  // 4. Assigned / claimed incident -> false
  const resClaimed = shouldExpandRadius({
    incidentStatus: "OPEN",
    assignedResponderId: "resp_hero_1",
    activeRadius: 300,
    elapsedSeconds: 45,
  });
  assert.strictEqual(resClaimed.should_expand, false);

  // 5. Inactive incident (RESOLVED / CANCELLED) -> false
  const resResolved = shouldExpandRadius({
    incidentStatus: "RESOLVED",
    activeRadius: 300,
    elapsedSeconds: 45,
  });
  assert.strictEqual(resResolved.should_expand, false);

  // 6. Already expanded (500m) -> false
  const resAlreadyExpanded = shouldExpandRadius({
    incidentStatus: "OPEN",
    activeRadius: 500,
    elapsedSeconds: 45,
  });
  assert.strictEqual(resAlreadyExpanded.should_expand, false);
});

test("Escalation - Timestamp-based State Calculation", () => {
  const createdAt = new Date("2026-10-30T10:00:00Z");

  // At t = 15s
  const t15 = new Date("2026-10-30T10:00:15Z");
  const state15 = calculateRadiusExpansionState({ id: "inc_01", created_at: createdAt, status: "OPEN" }, t15);
  assert.strictEqual(state15.current_radius_meters, 300);
  assert.strictEqual(state15.is_expanded, false);

  // At t = 35s
  const t35 = new Date("2026-10-30T10:00:35Z");
  const state35 = calculateRadiusExpansionState({ id: "inc_01", created_at: createdAt, status: "OPEN" }, t35);
  assert.strictEqual(state35.current_radius_meters, 500);
  assert.strictEqual(state35.is_expanded, true);

  // Claimed incident at t = 35s
  const stateClaimed = calculateRadiusExpansionState(
    {
      id: "inc_01",
      created_at: createdAt,
      claimed_at: new Date("2026-10-30T10:00:20Z"),
      status: "CLAIMED",
    },
    t35
  );
  assert.strictEqual(stateClaimed.expansion_stopped, true);
  assert.strictEqual(stateClaimed.is_claimed, true);
});

test("Escalation - Tiered Notification and Worker Deduplication", () => {
  const createdAt = new Date("2026-10-30T10:00:00Z");
  const baseLat = 12.9767;
  const baseLon = 77.5713;

  // Responder 1: 150m away (in Ring 1)
  const resp1: Responder = {
    responder_id: "r1",
    name: "Volunteer Ring 1",
    trust_level: "COMMUNITY",
    is_available: true,
    latitude: baseLat + 0.00135,
    longitude: baseLon,
    location_updated_at: createdAt,
  };

  // Responder 2: 400m away (in Ring 2)
  const resp2: Responder = {
    responder_id: "r2",
    name: "Volunteer Ring 2",
    trust_level: "COMMUNITY",
    is_available: true,
    latitude: baseLat + 0.0036,
    longitude: baseLon,
    location_updated_at: createdAt,
  };

  const allResponders = [resp1, resp2];

  // Pass 1 at t = 10s: Ring 1 (300m)
  const t10 = new Date("2026-10-30T10:00:10Z");
  const decision1 = evaluateDispatch(
    {
      incident_id: "inc_exp",
      latitude: baseLat,
      longitude: baseLon,
      created_at: createdAt,
      status: "OPEN",
      responders: allResponders,
      already_notified_responder_ids: [],
    },
    t10
  );

  assert.strictEqual(decision1.radius_state.current_radius_meters, 300);
  assert.deepStrictEqual(decision1.newly_notified_responder_ids, ["r1"]);
  assert.deepStrictEqual(decision1.all_notified_responder_ids, ["r1"]);

  // Pass 2 at t = 35s: Ring 2 (500m)
  const t35 = new Date("2026-10-30T10:00:35Z");
  const decision2 = evaluateDispatch(
    {
      incident_id: "inc_exp",
      latitude: baseLat,
      longitude: baseLon,
      created_at: createdAt,
      status: "OPEN",
      responders: allResponders,
      already_notified_responder_ids: decision1.all_notified_responder_ids,
    },
    t35
  );

  assert.strictEqual(decision2.radius_state.current_radius_meters, 500);
  // Crucial deduplication: only r2 is newly notified, r1 is NOT re-notified
  assert.deepStrictEqual(decision2.newly_notified_responder_ids, ["r2"]);
  assert.deepStrictEqual(decision2.all_notified_responder_ids.sort(), ["r1", "r2"]);

  // Pass 3 at t = 36s (concurrent worker check)
  const t36 = new Date("2026-10-30T10:00:36Z");
  const decision3 = evaluateDispatch(
    {
      incident_id: "inc_exp",
      latitude: baseLat,
      longitude: baseLon,
      created_at: createdAt,
      status: "OPEN",
      responders: allResponders,
      already_notified_responder_ids: decision2.all_notified_responder_ids,
    },
    t36
  );

  // Both are already notified; newly_notified must be empty
  assert.deepStrictEqual(decision3.newly_notified_responder_ids, []);
});
