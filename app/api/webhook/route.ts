import { after } from "next/server";
import { env } from "@/src/schemas/env";
import { verifyWebhookSignature } from "@/src/lib/security/hmac";

// Placeholder until the full pipeline is wired up in Phase 2.
async function runPipeline(payload: unknown): Promise<void> {
  console.log("[RepoCop] pipeline stub received payload", JSON.stringify(payload).slice(0, 120));
}

export async function POST(request: Request): Promise<Response> {
  // 1. Read the raw body exactly once (stream can only be consumed once).
  const rawBuffer = Buffer.from(await request.arrayBuffer());

  // 2. Verify HMAC-SHA256 signature — reject immediately if invalid.
  const signature = request.headers.get("x-hub-signature-256");
  if (!verifyWebhookSignature(rawBuffer, env.GITHUB_WEBHOOK_SECRET, signature)) {
    return new Response("Unauthorized", { status: 401 });
  }

  // 3. Parse JSON payload.
  let payload: unknown;
  try {
    payload = JSON.parse(rawBuffer.toString("utf8"));
  } catch {
    return new Response("Bad Request: invalid JSON", { status: 400 });
  }

  // 4. Only handle pull_request events; silently ignore everything else.
  const event = request.headers.get("x-github-event");
  if (event !== "pull_request") {
    return new Response("OK", { status: 200 });
  }

  // 5. ACK immediately — GitHub requires a response within 10 seconds.
  //    Heavy pipeline work runs after the response is sent via `after()`.
  after(async () => {
    await runPipeline(payload);
  });

  return new Response("Accepted", { status: 202 });
}
