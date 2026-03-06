import { createHmac } from "crypto";
import { describe, it, expect } from "vitest";
import { verifyWebhookSignature } from "@/src/lib/security/hmac";

// Helper — builds a valid sha256= signature for the given body and secret.
function sign(body: string, secret: string): string {
  const digest = createHmac("sha256", secret).update(body).digest("hex");
  return `sha256=${digest}`;
}

const SECRET = "super-secret-webhook-key-for-testing-only";
const BODY = JSON.stringify({ action: "opened", number: 42 });
const BODY_BUF = Buffer.from(BODY, "utf8");

describe("verifyWebhookSignature", () => {
  it("returns true for a valid signature", () => {
    const sig = sign(BODY, SECRET);
    expect(verifyWebhookSignature(BODY_BUF, SECRET, sig)).toBe(true);
  });

  it("returns false when the signature is null", () => {
    expect(verifyWebhookSignature(BODY_BUF, SECRET, null)).toBe(false);
  });

  it("returns false when the signature header is an empty string", () => {
    expect(verifyWebhookSignature(BODY_BUF, SECRET, "")).toBe(false);
  });

  it("returns false when the sha256= prefix is missing", () => {
    const rawHex = createHmac("sha256", SECRET).update(BODY).digest("hex");
    expect(verifyWebhookSignature(BODY_BUF, SECRET, rawHex)).toBe(false);
  });

  it("returns false when the body has been tampered with", () => {
    const sig = sign(BODY, SECRET);
    const tamperedBody = Buffer.from(BODY + " tampered", "utf8");
    expect(verifyWebhookSignature(tamperedBody, SECRET, sig)).toBe(false);
  });

  it("returns false when the secret is wrong", () => {
    const sig = sign(BODY, "wrong-secret");
    expect(verifyWebhookSignature(BODY_BUF, SECRET, sig)).toBe(false);
  });

  it("returns false when the signature digest has one character flipped", () => {
    const sig = sign(BODY, SECRET);
    // Flip the last hex character to produce an equal-length but wrong value.
    const flipped = sig.slice(0, -1) + (sig.endsWith("a") ? "b" : "a");
    expect(verifyWebhookSignature(BODY_BUF, SECRET, flipped)).toBe(false);
  });

  it("accepts a Uint8Array body as well as a Buffer", () => {
    const uint8Body = new TextEncoder().encode(BODY);
    const sig = sign(BODY, SECRET);
    expect(verifyWebhookSignature(uint8Body, SECRET, sig)).toBe(true);
  });
});
