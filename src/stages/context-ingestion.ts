import { Octokit } from "@octokit/rest";
import {
  getPrDiff,
  getPrFiles,
  getPrComments,
  getContributingMd,
} from "@/src/lib/github/pr";
import type { PullRequestWebhookPayload, PrContext } from "@/src/types";

/**
 * Stage 2 — Context Ingestion.
 *
 * Composes all four PR data-fetchers in parallel and returns a single
 * `PrContext` value that is passed unchanged to every downstream stage.
 *
 * The four fetches (diff, files, comments, CONTRIBUTING.md) are executed with
 * `Promise.all` so they run concurrently instead of serially.
 */
export async function ingestContext(
  octokit: Octokit,
  payload: PullRequestWebhookPayload
): Promise<PrContext> {
  const owner = payload.repository.owner.login;
  const repo = payload.repository.name;
  const prNumber = payload.pull_request.number;

  const [diff, files, comments, contributingMd] = await Promise.all([
    getPrDiff(octokit, owner, repo, prNumber),
    getPrFiles(octokit, owner, repo, prNumber),
    getPrComments(octokit, owner, repo, prNumber),
    getContributingMd(octokit, owner, repo),
  ]);

  return {
    owner,
    repo,
    prNumber,
    title: payload.pull_request.title,
    body: payload.pull_request.body,
    diff,
    files,
    comments,
    contributingMd,
  };
}
