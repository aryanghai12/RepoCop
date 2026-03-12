import { vi, describe, it, expect } from "vitest";
import type { Octokit } from "@octokit/rest";

// ---------------------------------------------------------------------------
// Mock the four fetcher functions before importing the stage under test.
// ---------------------------------------------------------------------------
vi.mock("@/src/lib/github/pr", () => ({
  getPrDiff: vi.fn(),
  getPrFiles: vi.fn(),
  getPrComments: vi.fn(),
  getContributingMd: vi.fn(),
}));

import { ingestContext } from "@/src/stages/context-ingestion";
import {
  getPrDiff,
  getPrFiles,
  getPrComments,
  getContributingMd,
} from "@/src/lib/github/pr";
import type { PullRequestWebhookPayload } from "@/src/types";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
import prOpenedFixture from "../../integration/fixtures/pr-opened.json";
import prBotsFixture from "../../integration/fixtures/pr-bots.json";

const PAYLOAD = prOpenedFixture as PullRequestWebhookPayload;
const BOT_PAYLOAD = prBotsFixture as PullRequestWebhookPayload;

const MOCK_OCTOKIT = {} as Octokit;

const DIFF = "diff --git a/auth.ts b/auth.ts\n+new line\n";
const FILES = [
  { filename: "auth.ts", additions: 120, deletions: 15, changes: 135 },
];
const COMMENTS = ["Looks good!", "Can you add more tests?"];
const CONTRIBUTING = "# Contributing\n\nPlease follow the style guide.";

// ---------------------------------------------------------------------------
describe("ingestContext", () => {
  function setupMocks(overrides: {
    diff?: string;
    files?: typeof FILES;
    comments?: string[];
    contributing?: string | null;
  } = {}) {
    vi.mocked(getPrDiff).mockResolvedValue(overrides.diff ?? DIFF);
    vi.mocked(getPrFiles).mockResolvedValue(overrides.files ?? FILES);
    vi.mocked(getPrComments).mockResolvedValue(overrides.comments ?? COMMENTS);
    vi.mocked(getContributingMd).mockResolvedValue(
      overrides.contributing !== undefined ? overrides.contributing : CONTRIBUTING
    );
  }

  it("returns a PrContext with all fields populated", async () => {
    setupMocks();
    const ctx = await ingestContext(MOCK_OCTOKIT, PAYLOAD);

    expect(ctx).toEqual({
      owner: "octocat",
      repo: "hello-world",
      prNumber: 42,
      title: "feat: add user authentication flow",
      body: PAYLOAD.pull_request.body,
      diff: DIFF,
      files: FILES,
      comments: COMMENTS,
      contributingMd: CONTRIBUTING,
    });
  });

  it("populates owner, repo, and prNumber from the payload", async () => {
    setupMocks();
    const ctx = await ingestContext(MOCK_OCTOKIT, PAYLOAD);

    expect(ctx.owner).toBe("octocat");
    expect(ctx.repo).toBe("hello-world");
    expect(ctx.prNumber).toBe(42);
  });

  it("sets contributingMd to null when the file is absent", async () => {
    setupMocks({ contributing: null });
    const ctx = await ingestContext(MOCK_OCTOKIT, PAYLOAD);

    expect(ctx.contributingMd).toBeNull();
  });

  it("calls all four fetchers with the correct owner/repo/prNumber", async () => {
    setupMocks();
    await ingestContext(MOCK_OCTOKIT, PAYLOAD);

    expect(getPrDiff).toHaveBeenCalledWith(MOCK_OCTOKIT, "octocat", "hello-world", 42);
    expect(getPrFiles).toHaveBeenCalledWith(MOCK_OCTOKIT, "octocat", "hello-world", 42);
    expect(getPrComments).toHaveBeenCalledWith(MOCK_OCTOKIT, "octocat", "hello-world", 42);
    expect(getContributingMd).toHaveBeenCalledWith(MOCK_OCTOKIT, "octocat", "hello-world");
  });

  it("executes all four fetchers in parallel (Promise.all)", async () => {
    const order: string[] = [];
    vi.mocked(getPrDiff).mockImplementation(async () => { order.push("diff"); return DIFF; });
    vi.mocked(getPrFiles).mockImplementation(async () => { order.push("files"); return FILES; });
    vi.mocked(getPrComments).mockImplementation(async () => { order.push("comments"); return COMMENTS; });
    vi.mocked(getContributingMd).mockImplementation(async () => { order.push("contributing"); return CONTRIBUTING; });

    await ingestContext(MOCK_OCTOKIT, PAYLOAD);

    // All four must have been called — parallel execution means order is
    // non-deterministic but all items must be present.
    expect(order).toHaveLength(4);
    expect(order).toContain("diff");
    expect(order).toContain("files");
    expect(order).toContain("comments");
    expect(order).toContain("contributing");
  });

  it("works correctly with a bot PR payload (pr-bots fixture)", async () => {
    setupMocks({ comments: [], contributing: null });
    const ctx = await ingestContext(MOCK_OCTOKIT, BOT_PAYLOAD);

    expect(ctx.owner).toBe("octocat");
    expect(ctx.prNumber).toBe(7);
    expect(ctx.comments).toEqual([]);
    expect(ctx.contributingMd).toBeNull();
  });

  it("propagates a fetcher error without swallowing it", async () => {
    vi.mocked(getPrDiff).mockRejectedValue(new Error("GitHub API 503"));
    vi.mocked(getPrFiles).mockResolvedValue(FILES);
    vi.mocked(getPrComments).mockResolvedValue(COMMENTS);
    vi.mocked(getContributingMd).mockResolvedValue(null);

    await expect(ingestContext(MOCK_OCTOKIT, PAYLOAD)).rejects.toThrow("GitHub API 503");
  });
});
