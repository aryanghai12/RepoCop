// ── Webhook ───────────────────────────────────────────────────────────────────

export interface WebhookSender {
  login: string;
  type: string;
}

export interface WebhookRepository {
  id: number;
  name: string;
  full_name: string;
  owner: { login: string };
  default_branch: string;
}

export interface WebhookPullRequest {
  number: number;
  title: string;
  body: string | null;
  state: string;
  draft: boolean;
  head: { ref: string; sha: string };
  base: { ref: string };
  user: WebhookSender;
  additions: number;
  deletions: number;
  changed_files: number;
}

export interface PullRequestWebhookPayload {
  action: string;
  number: number;
  pull_request: WebhookPullRequest;
  repository: WebhookRepository;
  installation?: { id: number };
  sender: WebhookSender;
}

// ── Analysis ─────────────────────────────────────────────────────────────────

export type ComplianceAction = "approve" | "request-changes" | "close";
export type ToxicitySeverity = "none" | "low" | "medium" | "high";
export type ToxicityRecommendation = "monitor" | "warn" | "close";

// ── Pipeline ─────────────────────────────────────────────────────────────────

export type CostGateOutcome =
  | { action: "pass" }
  | { action: "reject"; reason: string };

// ── Labels ────────────────────────────────────────────────────────────────────

export type RepocopLabel =
  | "repocop:approved"
  | "repocop:needs-changes"
  | "repocop:rejected"
  | "repocop:draft"
  | "repocop:missing-tests"
  | "repocop:needs-design"
  | "repocop:tone-warning"
  | "repocop:no-contributing";
