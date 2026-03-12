import { vi, describe, it, expect, beforeEach } from "vitest";

// Must be declared before any module that imports env is loaded.
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

const mockAuthFn = vi.fn();
vi.mock("@octokit/auth-app", () => ({
  createAppAuth: vi.fn(() => mockAuthFn),
}));

import { createAppClient } from "@/src/lib/github/app-client";
import { createAppAuth } from "@octokit/auth-app";

describe("createAppClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns an Octokit instance with REST methods", () => {
    const client = createAppClient();
    expect(client).toBeDefined();
    expect(typeof client.rest.pulls.get).toBe("function");
    expect(typeof client.rest.issues.createComment).toBe("function");
  });

  it("configures createAppAuth with GITHUB_APP_ID and GITHUB_APP_PRIVATE_KEY", () => {
    createAppClient();
    expect(createAppAuth).toHaveBeenCalledOnce();
    // Octokit merges its own internals (octokit, log, request) into the auth
    // options, so use objectContaining to assert only the fields we set.
    expect(createAppAuth).toHaveBeenCalledWith(
      expect.objectContaining({
        appId: "99999",
        privateKey: "-----BEGIN RSA PRIVATE KEY-----\nFAKE\n-----END RSA PRIVATE KEY-----",
      })
    );
  });

  it("returns a new Octokit instance on each call (no shared singleton)", () => {
    const a = createAppClient();
    const b = createAppClient();
    expect(a).not.toBe(b);
  });
});
