/**
 * Type definitions for Responders and Ranking in Raksha.
 */

export type TrustCategory = "COMMUNITY" | "VERIFIED";

export interface Responder {
  responder_id: string;
  name?: string;
  trust_level: TrustCategory;
  is_available: boolean;
  is_active?: boolean;
  latitude: number;
  longitude: number;
  location_updated_at: string | Date;
  reliable_speed_mps?: number | null; // Velocity from GPS/OSRM telemetry; null if unavailable
  skills?: string[];
}

export interface RankedResponder {
  responder: Responder;
  distance_meters: number;
  location_freshness_seconds: number;
  is_eligible: boolean;
  ineligibility_reason?: string | null;
  composite_score: number;
  eta_seconds: number | null; // ONLY populated if reliable_speed_mps is present; strictly unestimated otherwise
  eta_source: "VERIFIED_TELEMETRY" | "UNESTIMATED";
  radius_ring: 1 | 2 | 0; // 1 for <=300m, 2 for 301-500m, 0 for outside
  is_within_radius: boolean;
}

export interface DispatchDecision {
  incident_id: string;
  radius_state: import("./location.js").RadiusEscalationState;
  eligible_responders_in_radius: RankedResponder[];
  newly_notified_responder_ids: string[];
  all_notified_responder_ids: string[];
  audit_notes: string[];
}
