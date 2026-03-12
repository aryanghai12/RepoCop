import { vi, describe, it, expect, beforeEach } from "vitest";

vi.mock("@/src/schemas/env", () => ({
  env: {
    GITHUB_APP_ID: "99999",
    GITHUB_APP_PRIVATE_KEY: "-----BEGIN RSA PRIVATE KEY-----\nFAKE\n-----END RSA PRIVATE KEY-----",
    GITHUB_WEBHOOK_SECRET: "webhook-secret-32-characters-long!!",
    GOOGLE_GENERATIVE_AI_API_KEY: "fake-google-key",
    ANTHROPIC_API_KEY: "fake-anthropic-key",
    OPENAI_API_KEY: "fake-openai-key",
    UPSTASH_REDIS_REST_URL: "https://fake.upstash.io",
    UPSTASH_REDIS_REST_TOKEN: "fake-redis-token",
    NEXT_PUBLIC_APP_VERSION: "0.0.0-test",
  },
}));

// We control what auth() resolves to on each test via `mockAuthImpl`.
let mockAuthImpl: () => Promise<{ token: string; expiresAt: string }>;

vi.mock("@octokit/auth-app", () => ({
  createAppAuth: vi.fn(() => vi.fn(() => mockAuthImpl())),
}));

import { createInstallationClient } from "@/src/lib/github/installation-client";
import { createAppAuth } from "@octokit/auth-app";

// Helper: ISO timestamp N seconds from now.
function isoFromNow(deltaSeconds: number): string {
  return new Date(Date.now() + deltaSeconds * 1000).toISOString();
}

describe("createInstallationClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: healthy token expires in 1 hour.
    mockAuthImpl = async () => ({
      token: "ghs_testInstallationToken",
      expiresAt: isoFromNow(3600),
    });
  });

  it("returns an Octokit instance with REST methods", async () => {
    const client = await createInstallationClient(123);
    expect(client).toBeDefined();
    expect(typeof client.rest.pulls.get).toBe("function");
  });

  it("creates app auth with the correct app credentials", async () => {
    await createInstallationClient(456);
    expect(createAppAuth).toHaveBeenCalledOnce();
    expect(createAppAuth).toHaveBeenCalledWith(
      expect.objectContaining({
        appId: "99999",
        privateKey: "-----BEGIN RSA PRIVATE KEY-----\nFAKE\n-----END RSA PRIVATE KEY-----",
      })
    );
  });

  it("calls auth() with type=installation and correct installationId", async () => {
    const capturedAuthArgs: unknown[] = [];
    mockAuthImpl = async () => {
      return { token: "tok", expiresAt: isoFromNow(3600) };
    };
    // Capture what the inner auth fn receives.
    const innerAuth = vi.fn(() => mockAuthImpl());
    vi.mocked(createAppAuth).mockReturnValueOnce(innerAuth as never);

    await createInstallationClient(789);

    expect(innerAuth).toHaveBeenCalledWith({ type: "installation", installationId: 789 });
    void capturedAuthArgs;
  });

  it("emits a console.warn when TTL < 60s", async () => {
    mockAuthImpl = async () => ({
      token: "ghs_shortLived",
      expiresAt: isoFromNow(30), // 30 s — below the 60s threshold
    });

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    await createInstallationClient(101);

    expect(warnSpy).toHaveBeenCalledOnce();
    expect(warnSpy.mock.calls[0][0]).toMatch(/TTL/);
    warnSpy.mockRestore();
  });

  it("does NOT warn when TTL is well above 60s", async () => {
    // default mockAuthImpl has 3600s TTL — no warning expected
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    await createInstallationClient(202);
    expect(warnSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it("returns a fresh instance on each call (no singleton caching)", async () => {
    const a = await createInstallationClient(303);
    const b = await createInstallationClient(303);
    expect(a).not.toBe(b);
  });
});
