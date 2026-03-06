import { createHmac, timingSafeEqual } from "crypto";

const ALGORITHM = "sha256";
const SIGNATURE_PREFIX = "sha256=";

/**
 * Verifies a GitHub webhook signature using HMAC-SHA256.
 *
 * Uses crypto.timingSafeEqual to prevent timing-based side-channel attacks.
 * Returns false (never throws) so the caller controls the HTTP response.
 *
 * @param rawBody  The raw request body as a Buffer or Uint8Array.
 * @param secret   The webhook secret configured in the GitHub App settings.
 * @param signature The value of the `X-Hub-Signature-256` header.
 */
export function verifyWebhookSignature(
  rawBody: Buffer | Uint8Array,
  secret: string,
  signature: string | null
): boolean {
  if (!signature) return false;
  if (!signature.startsWith(SIGNATURE_PREFIX)) return false;

  const digest = createHmac(ALGORITHM, secret)
    .update(rawBody)
    .digest("hex");

  const expected = Buffer.from(`${SIGNATURE_PREFIX}${digest}`, "utf8");
  const received = Buffer.from(signature, "utf8");

  // Buffers must be the same length for timingSafeEqual; length mismatch is
  // itself not a secret, so an early false return here is acceptable.
  if (expected.length !== received.length) return false;

  return timingSafeEqual(expected, received);
}
