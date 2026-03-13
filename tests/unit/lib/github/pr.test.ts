import { vi, describe, it, expect } from "vitest";
import type { Octokit } from "@octokit/rest";
import {
  getPrDiff,
  getPrFiles,
  getPrComments,
  getContributingMd,
} from "@/src/lib/github/pr";

// ---------------------------------------------------------------------------
// Minimal Octokit stub factory — only wires up the API paths we exercise.
// ---------------------------------------------------------------------------
function makeOctokit(overrides: Partial<{
  request: ReturnType<typeof vi.fn>;
  pulls_listFiles: ReturnType<typeof vi.fn>;
  issues_listComments: ReturnType<typeof vi.fn>;
  repos_getContent: ReturnType<typeof vi.fn>;
}>): Octokit {
  return {
    request: overrides.request ?? vi.fn(),
    rest: {
      pulls: {
        listFiles: overrides.pulls_listFiles ?? vi.fn(),
      },
      issues: {
        listComments: overrides.issues_listComments ?? vi.fn(),
      },
      repos: {
        getContent: overrides.repos_getContent ?? vi.fn(),
      },
    },
  } as unknown as Octokit;
}

// ---------------------------------------------------------------------------
describe("getPrDiff", () => {
  it("calls octokit.request with the diff media type and correct params", async () => {
    const rawDiff = "diff --git a/foo.ts b/foo.ts\n+added line\n";
    const requestFn = vi.fn().mockResolvedValue({ data: rawDiff });
    const octokit = makeOctokit({ request: requestFn });

    const result = await getPrDiff(octokit, "owner", "repo", 42);

    expect(result).toBe(rawDiff);
    expect(requestFn).toHaveBeenCalledOnce();
    expect(requestFn).toHaveBeenCalledWith(
      "GET /repos/{owner}/{repo}/pulls/{pull_number}",
      expect.objectContaining({
        owner: "owner",
        repo: "repo",
        pull_number: 42,
        headers: { accept: "application/vnd.github.v3.diff" },
      })
    );
  });

  it("returns an empty string diff without throwing", async () => {
    const requestFn = vi.fn().mockResolvedValue({ data: "" });
    const octokit = makeOctokit({ request: requestFn });
    const result = await getPrDiff(octokit, "owner", "repo", 1);
    expect(result).toBe("");
  });
});

// ---------------------------------------------------------------------------
describe("getPrFiles", () => {
  const RAW_FILES = [
    { filename: "src/foo.ts", additions: 10, deletions: 2, changes: 12, patch: "@@ -1 +1 @@" },
    { filename: "src/bar.ts", additions: 0, deletions: 5, changes: 5 }, // no patch (binary / large)
  ];

  it("returns mapped PrFile array", async () => {
    const listFiles = vi.fn().mockResolvedValue({ data: RAW_FILES });
    const octokit = makeOctokit({ pulls_listFiles: listFiles });

    const files = await getPrFiles(octokit, "owner", "repo", 7);

    expect(files).toHaveLength(2);
    expect(files[0]).toEqual({
      filename: "src/foo.ts",
      additions: 10,
      deletions: 2,
      changes: 12,
      patch: "@@ -1 +1 @@",
    });
    // No patch key when source has no patch property
    expect(files[1]).not.toHaveProperty("patch");
  });

  it("calls the API with per_page=100", async () => {
    const listFiles = vi.fn().mockResolvedValue({ data: [] });
    const octokit = makeOctokit({ pulls_listFiles: listFiles });

    await getPrFiles(octokit, "owner", "repo", 7);

    expect(listFiles).toHaveBeenCalledWith(
      expect.objectContaining({ per_page: 100, pull_number: 7 })
    );
  });
});

// ---------------------------------------------------------------------------
describe("getPrComments", () => {
  it("returns an array of comment body strings", async () => {
    const listComments = vi.fn().mockResolvedValue({
      data: [
        { body: "Looks good!" },
        { body: "Please fix the tests." },
        { body: null },   // should be filtered out
        { body: "  " },  // whitespace-only — should be filtered out
      ],
    });
    const octokit = makeOctokit({ issues_listComments: listComments });

    const comments = await getPrComments(octokit, "owner", "repo", 5);

    expect(comments).toEqual(["Looks good!", "Please fix the tests."]);
  });

  it("returns an empty array when there are no comments", async () => {
    const listComments = vi.fn().mockResolvedValue({ data: [] });
    const octokit = makeOctokit({ issues_listComments: listComments });

    const comments = await getPrComments(octokit, "owner", "repo", 5);

    expect(comments).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
describe("getContributingMd", () => {
  const CONTRIBUTING_CONTENT = "# Contributing\n\nPlease open an issue first.";
  const BASE64_CONTENT = Buffer.from(CONTRIBUTING_CONTENT).toString("base64");

  it("returns decoded CONTRIBUTING.md content when the file exists", async () => {
    const getContent = vi.fn().mockResolvedValue({
      data: { type: "file", content: BASE64_CONTENT },
    });
    const octokit = makeOctokit({ repos_getContent: getContent });

    const result = await getContributingMd(octokit, "owner", "repo");

    expect(result).toBe(CONTRIBUTING_CONTENT);
  });

  it("returns null when CONTRIBUTING.md is not found (404)", async () => {
    const notFoundError = Object.assign(new Error("Not Found"), { status: 404 });
    const getContent = vi.fn().mockRejectedValue(notFoundError);
    const octokit = makeOctokit({ repos_getContent: getContent });

    const result = await getContributingMd(octokit, "owner", "repo");

    expect(result).toBeNull();
  });

  it("re-throws non-404 errors", async () => {
    const serverError = Object.assign(new Error("Internal Server Error"), { status: 500 });
    const getContent = vi.fn().mockRejectedValue(serverError);
    const octokit = makeOctokit({ repos_getContent: getContent });

    await expect(getContributingMd(octokit, "owner", "repo")).rejects.toThrow("Internal Server Error");
  });

  it("returns null when the API returns a directory listing instead of a file", async () => {
    // getContent can return an array if the path is a directory.
    const getContent = vi.fn().mockResolvedValue({ data: [] });
    const octokit = makeOctokit({ repos_getContent: getContent });

    const result = await getContributingMd(octokit, "owner", "repo");

    expect(result).toBeNull();
  });
});
