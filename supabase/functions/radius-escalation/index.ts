/**
 * Supabase Edge Function: radius-escalation
 * Evaluates 300m -> 30s threshold -> 500m expansion and returns deduplicated newly notified responders.
 */

import { evaluateDispatch } from "../../../src/services/location/radiusEscalation.js";
import { Responder } from "../../../src/types/responder.js";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

export default async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  try {
    const payload = (await req.json()) as {
      incident_id: string;
      latitude: number;
      longitude: number;
      created_at: string;
      claimed_at?: string | null;
      status: string;
      responders: Responder[];
      already_notified_responder_ids?: string[];
    };

    if (!payload.incident_id || payload.latitude === undefined || payload.longitude === undefined || !payload.created_at) {
      return new Response(
        JSON.stringify({ error: "Missing required incident dispatch fields." }),
        { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }

    const decision = evaluateDispatch(payload);

    return new Response(JSON.stringify(decision), {
      status: 200,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return new Response(
      JSON.stringify({ error: "Escalation calculation error", details: errorMsg }),
      { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
    );
  }
}
