import { Octokit } from "@octokit/rest";

/** Minimal shape of a file entry returned by the GitHub list-files API. */
export interface PrFile {
  filename: string;
  additions: number;
  deletions: number;
  changes: number;
  /** Unified-diff patch — absent for binary files or files over the API size limit. */
  patch?: string;
}

/**
 * Fetches the unified diff of a pull request as a raw text string.
 *
 * Uses the `application/vnd.github.v3.diff` media type so the API returns
 * the plain diff instead of the default JSON representation.
 */
export async function getPrDiff(
  octokit: Octokit,
  owner: string,
  repo: string,
  prNumber: number
): Promise<string> {
  const response = await octokit.request(
    "GET /repos/{owner}/{repo}/pulls/{pull_number}",
    {
      owner,
      repo,
      pull_number: prNumber,
      headers: { accept: "application/vnd.github.v3.diff" },
    }
  );
  return response.data as unknown as string;
}

/**
 * Lists the files changed in a pull request (up to 100 files per call).
 *
 * Each entry includes per-file statistics and the unified diff `patch` (if
 * the file is small enough for GitHub to include it).
 */
export async function getPrFiles(
  octokit: Octokit,
  owner: string,
  repo: string,
  prNumber: number
): Promise<PrFile[]> {
  const { data } = await octokit.rest.pulls.listFiles({
    owner,
    repo,
    pull_number: prNumber,
    per_page: 100,
  });
  return data.map((f) => ({
    filename: f.filename,
    additions: f.additions,
    deletions: f.deletions,
    changes: f.changes,
    ...(f.patch !== undefined ? { patch: f.patch } : {}),
  }));
}

/**
 * Fetches human-written comments on the PR issue thread (not review comments).
 *
 * Returns the comment bodies as plain strings; empty bodies are filtered out.
 */
export async function getPrComments(
  octokit: Octokit,
  owner: string,
  repo: string,
  prNumber: number
): Promise<string[]> {
  const { data } = await octokit.rest.issues.listComments({
    owner,
    repo,
    issue_number: prNumber,
    per_page: 100,
  });
  return data
    .map((c) => c.body ?? "")
    .filter((body) => body.trim().length > 0);
}

/**
 * Fetches the contents of `CONTRIBUTING.md` from the default branch.
 *
 * Returns `null` (not an error) if the file does not exist so that downstream
 * stages can degrade gracefully instead of throwing.
 */
export async function getContributingMd(
  octokit: Octokit,
  owner: string,
  repo: string
): Promise<string | null> {
  try {
    const { data } = await octokit.rest.repos.getContent({
      owner,
      repo,
      path: "CONTRIBUTING.md",
    });

    if (
      !Array.isArray(data) &&
      data.type === "file" &&
      typeof data.content === "string"
    ) {
      return Buffer.from(data.content, "base64").toString("utf8");
    }
    return null;
  } catch (err: unknown) {
    if (
      typeof err === "object" &&
      err !== null &&
      (err as { status?: number }).status === 404
    ) {
      return null;
    }
    throw err;
  }
}
