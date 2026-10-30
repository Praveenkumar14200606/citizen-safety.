/**
 * Supabase Edge Function: triage-incident
 * Serverless asynchronous AI emergency incident classification.
 */

import { triageService } from "../../../src/services/ai/triageService.js";
import { TriageRequest } from "../../../src/types/ai.js";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

export default async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  try {
    const payload = (await req.json()) as TriageRequest;
    if (!payload || !payload.description) {
      return new Response(
        JSON.stringify({ error: "Missing required field 'description'." }),
        { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }

    const result = await triageService.triageIncident(payload);

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return new Response(
      JSON.stringify({ error: "Internal triage error", details: errorMsg }),
      { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
    );
  }
}
