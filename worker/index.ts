type Env = {
  ASSETS: { fetch(request: Request): Promise<Response> };
  MODEL_API_KEY?: string;
  AI_ENABLED?: string;
  AI_QUOTA?: { get(key: string): Promise<string | null>; put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void> };
};
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), {
  status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
});
const SYSTEM = [
  "You are Soren, an insightful business development partner.",
  "You are direct, perceptive, encouraging, occasionally dryly funny, and never cruel.",
  "You may use light profanity if appropriate; do not insult people.",
  "Numerical metrics supplied by the application are authoritative calculations, not your own estimates.",
  "Distinguish observed facts, assumptions, hypotheses, and recommendations.",
  "Do not invent customer counts, conversion rates, margins, causes, or financial benchmarks.",
  "Never promise outcomes. Highlight data quality limits and ask for the most useful missing data.",
  "For each recommendation explain the evidence, expected mechanism, risk, and a measurable next step."
].join(" ");
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname !== "/api/analyze") return env.ASSETS.fetch(request);
    if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
    // Closed by default. Both a secret and a shared quota store must be configured.
    if (env.AI_ENABLED !== "true" || !env.MODEL_API_KEY || !env.AI_QUOTA) {
      return json({ error: "Live AI is disabled until a server-side usage limit is configured. Explore demo findings meanwhile.", demo: true }, 503);
    }
    const length = Number(request.headers.get("content-length") || "0");
    if (length > 12000) return json({ error: "Request too large" }, 413);
    let payload: { facts?: unknown; question?: unknown };
    try { payload = await request.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
    const facts = payload.facts;
    const question = payload.question;
    if (!facts || typeof facts !== "object" || Array.isArray(facts) ||
        typeof question !== "string" || question.length > 600) {
      return json({ error: "Invalid analysis request" }, 400);
    }
    const serialized = JSON.stringify(facts);
    if (serialized.length > 8000) return json({ error: "Data exceeds safe size" }, 413);
    // Single-use demo gate: a conservative global request counter, never a personal payment method.
    // KV operations are not atomic. Do not enable publicly until a durable atomic rate limiter is configured.
    return json({ error: "Live calls remain locked until an atomic spending guard is deployed.", demo: true }, 503);
  }
} satisfies ExportedHandler<Env>;
