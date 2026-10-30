/**
 * Radius Escalation Service for Raksha.
 * Implements the 300m initial -> 30 seconds threshold -> 500m escalation rule.
 * Ensures backend timestamp authority and prevents duplicate notifications across workers.
 */

import { Responder, DispatchDecision } from "../../types/responder.js";
import { RadiusEscalationState } from "../../types/location.js";
import { rankResponders } from "./responderRanking.js";

export interface ShouldExpandRadiusParams {
  incidentStatus: string;
  assignedResponderId?: string | null;
  activeRadius: number;
  elapsedSeconds: number;
}

export interface ShouldExpandRadiusResult {
  should_expand: boolean;
  next_radius: 300 | 500;
  reason: string;
}

export function shouldExpandRadius(params: ShouldExpandRadiusParams): ShouldExpandRadiusResult {
  const statusUpper = params.incidentStatus.trim().toUpperCase();

  // If incident is claimed/assigned
  if (params.assignedResponderId || ["ASSIGNED", "CLAIMED", "ACKNOWLEDGED", "EN_ROUTE"].includes(statusUpper)) {
    return {
      should_expand: false,
      next_radius: params.activeRadius as 300 | 500,
      reason: "Incident has been claimed or assigned to a responder.",
    };
  }

  // If incident is inactive
  if (["RESOLVED", "CANCELLED"].includes(statusUpper)) {
    return {
      should_expand: false,
      next_radius: params.activeRadius as 300 | 500,
      reason: `Incident is no longer active (status: ${statusUpper}).`,
    };
  }

  // If already at or above expanded radius
  if (params.activeRadius >= 500) {
    return {
      should_expand: false,
      next_radius: 500,
      reason: "Radius has already been expanded to maximum limit (500m).",
    };
  }

  // Check elapsed time against 30s threshold
  if (params.elapsedSeconds >= 30.0) {
    return {
      should_expand: true,
      next_radius: 500,
      reason: `Unclaimed for ${Math.round(params.elapsedSeconds)}s (>= 30s threshold). Expanding to 500m.`,
    };
  }

  return {
    should_expand: false,
    next_radius: 300,
    reason: `Elapsed time ${Math.round(params.elapsedSeconds)}s is under 30s threshold. Keeping initial 300m radius.`,
  };
}

export function calculateRadiusExpansionState(
  incident: {
    id: string;
    created_at: string | Date;
    claimed_at?: string | Date | null;
    status: string;
  },
  currentTime = new Date()
): RadiusEscalationState {
  const createdAt =
    typeof incident.created_at === "string" ? new Date(incident.created_at) : incident.created_at;
  const elapsed = Math.max(0, (currentTime.getTime() - createdAt.getTime()) / 1000);

  const statusUpper = incident.status.trim().toUpperCase();
  const isClaimed = Boolean(incident.claimed_at) || ["CLAIMED", "ASSIGNED", "ACKNOWLEDGED"].includes(statusUpper);
  const isActive = !["RESOLVED", "CANCELLED"].includes(statusUpper);

  if (isClaimed) {
    return {
      incident_id: incident.id,
      current_radius_meters: 300,
      is_expanded: false,
      expansion_threshold_seconds: 30,
      elapsed_seconds: Math.round(elapsed * 10) / 10,
      is_claimed: true,
      is_active: isActive,
      expansion_stopped: true,
      stop_reason: "Incident claimed by responder",
      evaluated_at: currentTime.toISOString(),
    };
  }

  if (!isActive) {
    return {
      incident_id: incident.id,
      current_radius_meters: 300,
      is_expanded: false,
      expansion_threshold_seconds: 30,
      elapsed_seconds: Math.round(elapsed * 10) / 10,
      is_claimed: false,
      is_active: false,
      expansion_stopped: true,
      stop_reason: `Incident inactive (${statusUpper})`,
      evaluated_at: currentTime.toISOString(),
    };
  }

  const isExpanded = elapsed >= 30.0;
  const currentRadius = isExpanded ? 500 : 300;

  return {
    incident_id: incident.id,
    current_radius_meters: currentRadius,
    is_expanded: isExpanded,
    expansion_threshold_seconds: 30,
    elapsed_seconds: Math.round(elapsed * 10) / 10,
    is_claimed: false,
    is_active: true,
    expansion_stopped: false,
    stop_reason: null,
    evaluated_at: currentTime.toISOString(),
  };
}

export function evaluateDispatch(
  query: {
    incident_id: string;
    latitude: number;
    longitude: number;
    created_at: string | Date;
    claimed_at?: string | Date | null;
    status: string;
    responders: Responder[];
    already_notified_responder_ids?: string[];
  },
  currentTime = new Date()
): DispatchDecision {
  const radState = calculateRadiusExpansionState(
    {
      id: query.incident_id,
      created_at: query.created_at,
      claimed_at: query.claimed_at,
      status: query.status,
    },
    currentTime
  );

  const auditNotes: string[] = [
    `Evaluated at ${currentTime.toISOString()}`,
    `Elapsed: ${radState.elapsed_seconds}s`,
    `Active radius: ${radState.current_radius_meters}m`,
  ];

  if (radState.expansion_stopped) {
    auditNotes.push(`Dispatch halted: ${radState.stop_reason}`);
    return {
      incident_id: query.incident_id,
      radius_state: radState,
      eligible_responders_in_radius: [],
      newly_notified_responder_ids: [],
      all_notified_responder_ids: query.already_notified_responder_ids ?? [],
      audit_notes: auditNotes,
    };
  }

  // Rank responders deterministically
  const ranked = rankResponders(
    query.latitude,
    query.longitude,
    query.responders,
    radState.current_radius_meters,
    currentTime
  );

  // Filter eligible responders within current active radius
  const eligibleInRadius = ranked.filter(
    (r) => r.is_eligible && r.distance_meters <= radState.current_radius_meters
  );

  // Deduplicate against already notified responders
  const alreadyNotified = new Set(query.already_notified_responder_ids ?? []);
  const newlyNotified: string[] = [];

  for (const item of eligibleInRadius) {
    const id = item.responder.responder_id;
    if (!alreadyNotified.has(id)) {
      newlyNotified.push(id);
      alreadyNotified.add(id);
    }
  }

  auditNotes.push(
    `Found ${eligibleInRadius.length} eligible responders within ${radState.current_radius_meters}m. ` +
      `Newly notified: ${newlyNotified.length}`
  );

  return {
    incident_id: query.incident_id,
    radius_state: radState,
    eligible_responders_in_radius: eligibleInRadius,
    newly_notified_responder_ids: newlyNotified,
    all_notified_responder_ids: Array.from(alreadyNotified).sort(),
    audit_notes: auditNotes,
  };
}
