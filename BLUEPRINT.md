# RepoCop — Master System Blueprint

> **Status:** Approved for Execution | **Stack Baseline:** Next.js 16 / TypeScript 5 / Vercel Serverless
> **Authored:** 2026-03-06

---

## 1. High-Level Architecture

### System Overview

RepoCop operates as a **serverless GitHub App** deployed on Vercel's Edge-adjacent Node.js runtime. It listens to GitHub webhook events, applies a multi-stage analysis pipeline, and acts as a hard gate *before* any external CI or review tooling fires.

```
GitHub PR Event
      │
      ▼
┌─────────────────────────────────────────────────────────┐
│  Vercel Serverless Function  (POST /api/webhook)         │
│                                                          │
│  1. HMAC-SHA256 Signature Verification (immediate)       │
│  2. Idempotency Check  (Upstash Redis)                   │
│  3. Webhook ACK → 200 OK  ← GitHub timeout-safe         │
│                                                          │
│  waitUntil(() => pipeline(payload))                      │
│  ┌────────────────────────────────────────────────────┐  │
│  │  STAGE 1: Cost Gate (Pre-flight Validator)         │  │
│  │    · Schema check, bot filter, draft filter        │  │
│  │    · Auto-close + post comment if invalid          │  │
│  │    · EXIT HERE if rejected (saves all downstream)  │  │
│  ├────────────────────────────────────────────────────┤  │
│  │  STAGE 2: Context Ingestion (Octokit)              │  │
│  │    · Fetch CONTRIBUTING.md, PR diff, description   │  │
│  │    · Fetch PR comments for toxicity analysis       │  │
│  ├────────────────────────────────────────────────────┤  │
│  │  STAGE 3: AI Analysis Pipeline                     │  │
│  │    · Provider Router (Gemini → Claude → OpenAI)    │  │
│  │    · Compliance scoring against CONTRIBUTING.md    │  │
│  │    · Tone & toxicity scoring on description/comms  │  │
│  ├────────────────────────────────────────────────────┤  │
│  │  STAGE 4: Action Execution                         │  │
│  │    · Smart label provisioning + application        │  │
│  │    · Post structured review comment                │  │
│  │    · Approve / Request Changes / Close PR          │  │
│  └────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

### Technology Choices & Rationale

| Concern | Choice | Rationale |
|---|---|---|
| **Framework** | Next.js 16 App Router | Native `waitUntil` via `after()`, serverless-first, edge-ready |
| **Runtime Target** | Vercel Node.js Serverless (fluid compute) | `waitUntil` / `after()` support; not available on pure Edge runtime |
| **AI Abstraction** | Vercel AI SDK (`ai` package) | Provider-agnostic `generateObject`, built-in `fallback()` chaining |
| **AI Providers** | Google Gemini 2.0 Flash → Anthropic Claude 3.5 Haiku → OpenAI GPT-4o-mini | Cost-ordered failover; Flash is fastest/cheapest first |
| **Schema Validation** | Zod v3 | Runtime type safety for webhook payloads, AI responses, and env vars |
| **GitHub SDK** | Octokit `@octokit/rest` + `@octokit/webhooks` | Official, typed, supports GitHub App JWT auth |
| **Rate Limiting / Idempotency** | Upstash Redis (`@upstash/ratelimit` + `@upstash/redis`) | Serverless-compatible, per-delivery-ID deduplication |
| **Auth** | GitHub App (JWT + Installation tokens) | Scoped, revocable; no personal tokens in production |
| **Secret Management** | Vercel Environment Variables + `WEBHOOK_SECRET` | HMAC-SHA256 verified on every inbound payload |
| **Testing** | Vitest + `@vitest/coverage-v8` | Native ESM, faster than Jest, excellent TypeScript support |
| **Logging** | Vercel structured logs (+ optional Axiom) | Zero-config on Vercel, searchable in production |

---

## 2. Folder Structure

All application source lives under `src/`. The Next.js `app/` directory at the root is the router entry point only — all business logic is in `src/`.

```
repocop/
├── app/
│   └── api/
│       ├── webhook/
│       │   └── route.ts          ← Thin handler: verify → ack → waitUntil(pipeline)
│       └── health/
│           └── route.ts          ← GET /api/health for uptime monitoring
│
├── src/
│   ├── pipeline/
│   │   └── index.ts              ← Orchestrates all 4 stages in sequence
│   │
│   ├── stages/
│   │   ├── cost-gate.ts          ← Stage 1: Pre-flight validator & auto-closer
│   │   ├── context-ingestion.ts  ← Stage 2: Fetch PR data, diff, CONTRIBUTING.md
│   │   ├── ai-analysis.ts        ← Stage 3: Run compliance + toxicity analysis
│   │   └── action-executor.ts    ← Stage 4: Apply labels, post comment, set status
│   │
│   ├── lib/
│   │   ├── github/
│   │   │   ├── app-client.ts     ← JWT-authenticated GitHub App Octokit factory
│   │   │   ├── installation-client.ts ← Per-installation token refresh logic
│   │   │   ├── pr.ts             ← PR data fetchers (diff, files, description)
│   │   │   └── labels.ts         ← Label provisioning & application helpers
│   │   │
│   │   ├── security/
│   │   │   └── hmac.ts           ← HMAC-SHA256 signature verification (timing-safe)
│   │   │
│   │   ├── ai/
│   │   │   ├── router.ts         ← Vercel AI SDK provider failover chain
│   │   │   ├── providers.ts      ← Provider instances (Gemini, Claude, OpenAI)
│   │   │   └── prompts.ts        ← Structured prompt templates
│   │   │
│   │   ├── rate-limit/
│   │   │   └── index.ts          ← Upstash rate limiter (per repo, per installation)
│   │   │
│   │   └── idempotency/
│   │       └── index.ts          ← Redis-backed delivery-ID deduplication
│   │
│   ├── schemas/
│   │   ├── env.ts                ← Zod schema for process.env validation at startup
│   │   ├── webhook.ts            ← Zod schemas for GitHub PR webhook payload
│   │   └── analysis.ts           ← Zod schemas for AI structured output responses
│   │
│   └── types/
│       └── index.ts              ← Shared TypeScript interfaces & domain types
│
├── tests/
│   ├── unit/
│   │   ├── security/
│   │   │   └── hmac.test.ts
│   │   ├── stages/
│   │   │   ├── cost-gate.test.ts
│   │   │   └── ai-analysis.test.ts
│   │   └── lib/
│   │       └── labels.test.ts
│   │
│   └── integration/
│       ├── webhook.test.ts       ← Full pipeline with mocked Octokit + AI
│       └── fixtures/
│           ├── pr-opened.json    ← Real sanitized GitHub webhook payloads
│           └── pr-bots.json
│
├── BLUEPRINT.md
├── .env.example
├── next.config.ts
├── tsconfig.json
├── vitest.config.ts
└── package.json
```

---

## 3. Phased Execution Plan

### Phase 1 — Foundation & Security Hardening
**Goal:** Install all dependencies, lock the environment contract, and build the HMAC-verified webhook ingestion endpoint. GitHub cannot reach a single handler until its signature is cryptographically validated.

**Scope of Work:**
- Install all production and dev dependencies in a single pass
- Create `src/schemas/env.ts` — Zod-validated environment schema (fails loudly at startup if any secret is missing)
- Create `src/lib/security/hmac.ts` — timing-safe HMAC-SHA256 verification using Node.js `crypto.timingSafeEqual`
- Create `app/api/webhook/route.ts` — thin POST handler: read raw body, verify signature, return `200 OK` immediately, then call `after()` (Next.js `waitUntil` equivalent) with a placeholder pipeline stub
- Create `app/api/health/route.ts` — simple `GET` returning `{ status: "ok", version }` for uptime monitoring
- Scaffold `vitest.config.ts` and write unit tests for the HMAC verifier (valid sig, invalid sig, missing header, timing-safe behavior)
- Create `.env.example` documenting every required environment variable

**Key Decisions Made Here:**
- Raw `Request` body is read as `ArrayBuffer` once and passed downstream; never re-read to avoid stream exhaustion bugs
- `after()` is used over background jobs so the function lifecycle is correctly managed by Vercel fluid compute
- All secrets accessed through the validated Zod env schema — never `process.env.X` raw in business logic

---

### Phase 2 — GitHub Client & PR Context Ingestion
**Goal:** Establish the authenticated GitHub App client and build the machinery to fetch everything RepoCop needs to make a decision about a PR.

**Scope of Work:**
- Install `@octokit/rest`, `@octokit/auth-app`, `@octokit/webhooks`
- Create `src/lib/github/app-client.ts` — JWT-authenticated Octokit factory; JWT is generated on demand (10-min TTL), never cached longer than its expiry
- Create `src/lib/github/installation-client.ts` — exchanges installation ID for a short-lived installation token; handles token refresh if TTL < 60 seconds
- Create `src/lib/github/pr.ts` — typed fetchers: `getPrDiff()`, `getPrFiles()`, `getPrComments()`, `getContributingMd()` (graceful null if file absent)
- Create `src/stages/context-ingestion.ts` — composes the above fetchers into a single `PrContext` object used by all downstream stages
- Add integration test fixture files under `tests/integration/fixtures/`

**Key Decisions Made Here:**
- Installation tokens are never stored in Redis; they are fetched per-invocation to keep the security surface minimal
- `getContributingMd()` returns `null` (not an error) if the file does not exist; downstream stages degrade gracefully

---

### Phase 3 — Cost Gate: Pre-flight Validator
**Goal:** Auto-reject and close clearly invalid PRs *instantly*, before any AI token is consumed or any downstream CI runner is triggered. This is the critical cost-savings feature.

**Scope of Work:**
- Create `src/stages/cost-gate.ts` implementing the following ordered checks:
  1. **Bot filter** — ignore PRs from `dependabot`, `renovate`, `github-actions[bot]`; do nothing and exit
  2. **Draft filter** — apply `repocop:draft` label and post a friendly comment; do not run AI
  3. **Empty body gate** — auto-close PRs with no description and post a structured comment with a template
  4. **Minimum diff gate** — auto-close PRs that touch fewer than N lines (configurable, default: 1), catching accidental empty commits
  5. **Forbidden branch gate** — reject PRs targeting `main` directly if repo config requires PR-to-develop workflow
- The gate posts a templated GitHub comment explaining exactly why the PR was closed and what must be fixed before reopening
- The gate returns a discriminated union: `{ action: "pass" }` or `{ action: "reject", reason: string }`
- Add unit tests covering each gate condition with mocked Octokit responses

**Key Decisions Made Here:**
- The gate runs synchronously within `waitUntil` but returns early before any network-heavy operations
- Comment templates are defined in `src/lib/ai/prompts.ts` as plain strings (not AI-generated) to guarantee zero cost

---

### Phase 4 — AI Router with Provider Failover
**Goal:** Build the provider-agnostic AI layer using Vercel AI SDK's `generateObject` with a cascading failover chain: Gemini → Claude → OpenAI.

**Scope of Work:**
- Install `ai`, `@ai-sdk/google`, `@ai-sdk/anthropic`, `@ai-sdk/openai`
- Create `src/lib/ai/providers.ts` — instantiate `google('gemini-2.0-flash')`, `anthropic('claude-3-5-haiku-20241022')`, `openai('gpt-4o-mini')`
- Create `src/lib/ai/router.ts` — implement `analyzeWithFallback(prompt, schema)` using the AI SDK's provider array pattern; the first provider to succeed wins; failures are logged with provider name and error code
- Create `src/schemas/analysis.ts` — Zod schemas for the two AI response shapes: `ComplianceResult` and `ToxicityResult`
- Create `src/lib/ai/prompts.ts` — prompt builder functions that inject CONTRIBUTING.md content and PR diff into structured prompt templates
- Add unit tests mocking the AI SDK to verify: primary provider success path, first-provider failure triggers second, all-providers failure throws a classified error

**Key Decisions Made Here:**
- `generateObject` with a Zod schema is used over `generateText` to guarantee structured, parseable responses — no regex parsing of AI output
- Temperature is pinned to `0` for compliance checks (determinism), `0.1` for tone analysis (slight variance acceptable)
- Provider failover is silent to the GitHub user; they never see a "retry" — only the final result

---

### Phase 5 — Semantic Compliance Analysis
**Goal:** Use the AI router to semantically evaluate the PR against the repository's `CONTRIBUTING.md` guidelines and produce a structured compliance report.

**Scope of Work:**
- Create `src/stages/ai-analysis.ts` (compliance sub-module):
  - If `CONTRIBUTING.md` is `null`, skip analysis and return `{ score: null, reason: "no-contributing-file" }`
  - Build the compliance prompt: inject cleaned CONTRIBUTING.md + PR title + description + diff summary
  - Call `analyzeWithFallback` with `ComplianceResult` schema
  - `ComplianceResult` shape: `{ approved: boolean, score: number (0–100), violations: string[], suggestions: string[] }`
- The score drives the final action: `>= 75` → approve, `50–74` → request changes, `< 50` → close

**Key Decisions Made Here:**
- Diff is truncated to a configurable max token budget (default: 8,000 tokens of diff) to control cost; largest files are summarized by filename only if over budget
- The compliance prompt explicitly instructs the model to return only JSON matching the schema — hallucination is structurally prevented by `generateObject`

---

### Phase 6 — Tone & Toxicity Guardrails
**Goal:** Protect open-source maintainers by analyzing the PR description and all comments for demanding, hostile, or toxic language, and automatically flagging or closing toxic PRs.

**Scope of Work:**
- Extend `src/stages/ai-analysis.ts` with a toxicity sub-module:
  - Fetch all PR comments via `getPrComments()` from context
  - Concatenate PR title + description + top 20 comments (by recency) into a single analysis payload
  - Call `analyzeWithFallback` with `ToxicityResult` schema
  - `ToxicityResult` shape: `{ toxic: boolean, severity: "none" | "low" | "medium" | "high", indicators: string[], recommendation: "monitor" | "warn" | "close" }`
- Severity routing:
  - `low` → apply `repocop:tone-warning` label silently
  - `medium` → apply label + post a maintainer-visible private note (GitHub review comment marked as `COMMENT`)
  - `high` → close PR with a firm but professional templated response
- Add unit tests with fixture comment payloads covering clean, borderline, and clearly toxic cases

**Key Decisions Made Here:**
- The toxicity prompt is carefully engineered to distinguish *demanding entitlement* from *assertive-but-respectful* communication — false positive rate must be low
- The AI is explicitly instructed *not* to reproduce toxic content in its response, only categorize it
- Toxicity analysis runs in parallel with compliance analysis using `Promise.all` to minimize latency

---

### Phase 7 — Smart Label Orchestration
**Goal:** Dynamically provision all required labels in the target repository (creating them if absent) and apply the correct set based on the combined analysis results.

**Scope of Work:**
- Create `src/lib/github/labels.ts`:
  - `ensureLabel(octokit, owner, repo, label)` — idempotently creates a label if it does not exist; catches and ignores `422 Already Exists`; uses a predefined color palette keyed to label semantic
  - `applyLabels(octokit, owner, repo, prNumber, labels)` — bulk-applies labels in a single API call
  - `removeLabels(octokit, owner, repo, prNumber, labels)` — removes stale RepoCop labels before applying fresh ones to avoid label accumulation
- Define the full label taxonomy in `src/types/index.ts`:
  - `repocop:approved` (green) — compliance score >= 75
  - `repocop:needs-changes` (yellow) — compliance score 50–74
  - `repocop:rejected` (red) — compliance score < 50
  - `repocop:draft` (gray) — PR is in draft state
  - `repocop:missing-tests` (orange) — AI detected no test files in diff
  - `repocop:needs-design` (purple) — AI flagged architectural concerns
  - `repocop:tone-warning` (dark red) — toxicity severity low/medium
  - `repocop:no-contributing` (light gray) — repo has no CONTRIBUTING.md
- Create `src/stages/action-executor.ts` — final stage that receives the full analysis result and executes all GitHub actions atomically: remove old labels → apply new labels → post review comment → set PR status

**Key Decisions Made Here:**
- Labels are always removed and re-applied (not accumulated) to prevent stale state from previous RepoCop runs
- The label color palette is hardcoded in source — it is a product decision, not a user-configurable one

---

### Phase 8 — Rate Limiting, Idempotency & Production Hardening
**Goal:** Make the system safe to run in production against high-traffic repositories with duplicate webhook deliveries, abusive request patterns, and observability requirements.

**Scope of Work:**
- Install `@upstash/redis`, `@upstash/ratelimit`
- Create `src/lib/idempotency/index.ts`:
  - On every webhook, check Redis for the `X-GitHub-Delivery` UUID
  - If already processed: return `200 OK` immediately, skip pipeline entirely
  - If new: set the key with a 24-hour TTL, then proceed
- Create `src/lib/rate-limit/index.ts`:
  - Implement per-installation sliding-window rate limit (e.g., 30 webhook events per minute per installation)
  - If rate limit exceeded: return `429 Too Many Requests` and post a single throttle notice as a PR comment (only once per window)
- Update `app/api/webhook/route.ts` to run idempotency check and rate limit check synchronously *before* calling `after()` — these are cheap Redis operations that must block the response
- Add structured JSON logging throughout the pipeline: `{ phase, installationId, prNumber, durationMs, outcome }`
- Final `package.json` audit: pin all dependency versions, add `postinstall` check, update all scripts
- Create `.env.example` with all 9 required environment variables documented with example values and descriptions

**Environment Variable Contract (from `src/schemas/env.ts`):**

| Variable | Description |
|---|---|
| `GITHUB_APP_ID` | GitHub App numeric ID |
| `GITHUB_APP_PRIVATE_KEY` | PEM private key (newlines as `\n`) |
| `GITHUB_WEBHOOK_SECRET` | HMAC secret set in GitHub App settings |
| `GOOGLE_GENERATIVE_AI_API_KEY` | Gemini API key (primary provider) |
| `ANTHROPIC_API_KEY` | Claude API key (secondary provider) |
| `OPENAI_API_KEY` | OpenAI API key (tertiary provider) |
| `UPSTASH_REDIS_REST_URL` | Upstash Redis REST endpoint |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash Redis auth token |
| `NEXT_PUBLIC_APP_VERSION` | Injected by CI; surfaced in `/api/health` |

---

## 4. Git Roadmap

### Branch Strategy
- `main` — production-ready, protected. Direct commits forbidden.
- `develop` — integration branch. All feature branches merge here first.
- `feat/*` — one branch per phase.

---

### Phase 1 — `feat/foundation-and-security`
```
feat: scaffold project dependencies and environment schema
feat: implement timing-safe HMAC-SHA256 webhook verification
feat: add webhook ingestion route with immediate 200 ack and waitUntil stub
feat: add /api/health endpoint for uptime monitoring
test: add unit tests for HMAC verifier (valid, invalid, missing header)
chore: add .env.example with all required variable definitions
```

### Phase 2 — `feat/github-client-and-context`
```
feat: implement JWT-authenticated GitHub App Octokit factory
feat: add installation token client with sub-60s refresh guard
feat: add typed PR data fetchers (diff, files, comments, contributing-md)
feat: compose context ingestion stage into unified PrContext shape
chore: add sanitized webhook payload fixtures for integration tests
```

### Phase 3 — `feat/cost-gate-preflight`
```
feat: add bot-filter to silently ignore automated PR authors
feat: add draft-PR handler with label and early-exit logic
feat: add empty-body gate with auto-close and template comment
feat: add minimum-diff gate to reject accidental empty commits
feat: add forbidden-branch gate for direct-to-main PR rejection
test: add unit tests for all cost gate conditions with mocked octokit
```

### Phase 4 — `feat/ai-router-with-failover`
```
feat: configure Gemini, Claude, and OpenAI provider instances
feat: implement cascading AI provider failover router using Vercel AI SDK
feat: define Zod schemas for ComplianceResult and ToxicityResult
feat: add prompt builder functions for compliance and toxicity analysis
test: add unit tests for provider fallback chain and schema validation
```

### Phase 5 — `feat/semantic-compliance-analysis`
```
feat: implement CONTRIBUTING.md compliance analysis stage
feat: add token-budget-aware diff truncation for cost control
feat: map compliance score to approve, request-changes, or close actions
fix: handle missing CONTRIBUTING.md with graceful no-op degradation
test: add unit tests for score threshold routing logic
```

### Phase 6 — `feat/tone-and-toxicity-guardrails`
```
feat: implement PR description and comment toxicity analysis stage
feat: add parallel execution of compliance and toxicity analysis
feat: add severity-based routing for monitor, warn, and close actions
feat: add maintainer-safe templated response for high-severity toxicity
test: add unit tests with clean, borderline, and toxic comment fixtures
```

### Phase 7 — `feat/smart-label-orchestration`
```
feat: implement idempotent label provisioning with full taxonomy
feat: add stale-label removal before applying fresh analysis labels
feat: implement action executor stage composing all GitHub side-effects
feat: define complete RepoCop label taxonomy with semantic color palette
test: add unit tests for label ensure, apply, and remove operations
```

### Phase 8 — `feat/production-hardening`
```
feat: add Redis-backed webhook idempotency using X-GitHub-Delivery UUID
feat: implement per-installation sliding-window rate limiter
feat: integrate idempotency and rate limit checks into webhook route
feat: add structured JSON logging with phase, duration, and outcome fields
chore: pin all dependency versions and finalize environment variable contract
chore: update .env.example with all nine variables fully documented
test: add integration test for full pipeline with mocked octokit and AI
```

### Merge Commit on `main` (after final QA)
```
chore: merge develop into main for v0.1.0 production release
```

---

## 5. Testing Strategy

### Unit Tests (Vitest)
Target the logic that is hardest to get right and most catastrophic if wrong:
- **HMAC verifier** — valid signature, tampered signature, missing header, wrong encoding
- **Cost gate** — each of the 5 gate conditions independently, with table-driven test cases
- **Compliance scorer** — score-to-action threshold mapping (boundary values: 49, 50, 74, 75)
- **AI fallback router** — provider 1 fails → provider 2 succeeds; all fail → classified error
- **Label operations** — idempotent create (422 swallowed), stale removal, bulk apply

### Integration Tests (Vitest + MSW or manual mocks)
- Full pipeline from raw webhook payload → final GitHub API calls with mocked Octokit and AI SDK
- Idempotency: send same `X-GitHub-Delivery` twice, assert pipeline runs exactly once
- Rate limit: simulate 31 events in a minute, assert 429 on the 31st

### What is explicitly NOT tested
- GitHub's webhook delivery mechanism (their responsibility)
- AI model output quality (prompt engineering is validated manually)
- Vercel's `after()` / `waitUntil` behavior (framework responsibility)

---

*Blueprint version 1.0 — all phases, branches, and commits are subject to amendment upon Lead Developer review.*

---

**Ready to build.** Do you approve this blueprint? If so, give me the go-ahead and I will begin writing the production code for **Phase 1** (`feat/foundation-and-security`) — installing all dependencies, locking the environment schema with Zod, implementing the HMAC verifier, and scaffolding the webhook ingestion route.
