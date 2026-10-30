/**
 * Supabase Edge Function: responder-discovery
 * Ranks eligible responders deterministically within active search radius.
 */

import { rankResponders } from "../../../src/services/location/responderRanking.js";
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
      latitude: number;
      longitude: number;
      responders: Responder[];
      max_radius_meters?: number;
    };

    if (payload.latitude === undefined || payload.longitude === undefined || !Array.isArray(payload.responders)) {
      return new Response(
        JSON.stringify({ error: "Missing latitude, longitude, or responders array." }),
        { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }

    const ranked = rankResponders(
      payload.latitude,
      payload.longitude,
      payload.responders,
      payload.max_radius_meters ?? 500.0
    );

    return new Response(JSON.stringify(ranked), {
      status: 200,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return new Response(
      JSON.stringify({ error: "Discovery calculation error", details: errorMsg }),
      { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
    );
  }
}
