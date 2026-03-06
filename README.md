<div align="center">

# 🚔 RepoCop

**An AI-native, serverless GitHub App that acts as an intelligent pre-compute gatekeeper for CI/CD pipelines.**

RepoCop semantically evaluates Pull Requests against your repository's `CONTRIBUTING.md` guidelines — completely replacing brittle, regex-based review tools. It protects your pipeline costs, your maintainers, and your codebase quality, all before a single CI runner fires.

[![CI](https://img.shields.io/github/actions/workflow/status/your-org/repocop/ci.yml?label=CI&style=flat-square)](https://github.com/your-org/repocop)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue?style=flat-square)](LICENSE)
[![Next.js](https://img.shields.io/badge/Next.js-16-black?style=flat-square&logo=next.js)](https://nextjs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?style=flat-square&logo=typescript)](https://www.typescriptlang.org)
[![Vercel](https://img.shields.io/badge/deployed%20on-Vercel-black?style=flat-square&logo=vercel)](https://vercel.com)

</div>

---

## Table of Contents

- [Overview](#overview)
- [Key Features](#key-features)
- [How It Works](#how-it-works)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [1. Clone and Install](#1-clone-and-install)
  - [2. Create a GitHub App](#2-create-a-github-app)
  - [3. Configure Environment Variables](#3-configure-environment-variables)
  - [4. Run Locally](#4-run-locally)
- [Architecture](#architecture)
  - [Pipeline Stages](#pipeline-stages)
  - [AI Provider Failover](#ai-provider-failover)
- [Label Taxonomy](#label-taxonomy)
- [API Reference](#api-reference)
- [Testing](#testing)
- [Deployment](#deployment)
- [Roadmap](#roadmap)
- [Contributing](#contributing)
- [License](#license)

---

## Overview

Modern open-source repositories face two compounding problems:

1. **Cost bleed** — low-quality or spam PRs trigger expensive CI runners (CodeRabbit, large GitHub Actions matrices) before any human reviews them.
2. **Maintainer burnout** — hostile or demanding PR descriptions go unchecked, eroding the culture of open-source communities.

RepoCop solves both. It installs as a GitHub App, receives webhook events, and runs a 4-stage serverless pipeline that makes a gate decision *in seconds* — before your CI pipeline even wakes up.

---

## Key Features

| Feature | Description |
|---|---|
| 🛡️ **Cost-Optimized Gatekeeping** | Auto-closes invalid PRs instantly — before CodeRabbit, heavy runners, or any downstream tool fires. Saves real money at scale. |
| 🔄 **Dynamic Provider Failover** | Provider-agnostic AI router: Gemini 2.0 Flash → Claude 3.5 Haiku → GPT-4o-mini. If one API goes down, the next silently takes over. |
| 🧠 **Semantic Compliance Analysis** | Scores PRs against your actual `CONTRIBUTING.md` using structured AI output — not regex. Returns a 0–100 score with specific violations. |
| 💬 **Tone & Toxicity Guardrails** | Analyzes PR descriptions and comments for demanding or hostile language. Protects maintainers from burnout with automatic warnings or closures. |
| 🏷️ **Smart Label Orchestration** | Dynamically provisions and applies context-aware labels (`repocop:approved`, `repocop:missing-tests`, `repocop:tone-warning`, etc.) to drive your project board. |
| 🔒 **HMAC-SHA256 Security** | Every webhook is verified with timing-safe HMAC-SHA256 before a single byte of business logic runs. |
| ♻️ **Idempotency & Rate Limiting** | Redis-backed deduplication (by `X-GitHub-Delivery` UUID) and per-installation rate limiting prevent duplicate processing and abuse. |
| ⏱️ **GitHub Timeout-Safe** | ACKs `202 Accepted` to GitHub immediately, then runs the full pipeline via Vercel's `after()` — never hits the 10-second webhook timeout. |

---

## How It Works

```
GitHub PR Opened / Synchronized
           │
           ▼
  POST /api/webhook
           │
  ┌────────┴─────────────────────────────────────────────────┐
  │  1. HMAC-SHA256 Verification   (reject if tampered)       │
  │  2. Idempotency Check          (Redis — skip if duplicate)│
  │  3. Rate Limit Check           (Redis — 429 if exceeded)  │
  │  4. ACK 202 → GitHub ──────────────────────────────────── │ ← GitHub satisfied
  │                                                           │
  │  after() / waitUntil:                                     │
  │  ┌───────────────────────────────────────────────────┐    │
  │  │  STAGE 1 — Cost Gate                              │    │
  │  │    Bot filter / Draft filter / Empty body         │    │
  │  │    Minimum diff gate / Forbidden branch gate      │    │
  │  │    → Auto-close + post comment if invalid         │    │
  │  │    → EXIT (no AI tokens spent)                    │    │
  │  ├───────────────────────────────────────────────────┤    │
  │  │  STAGE 2 — Context Ingestion                      │    │
  │  │    Fetch CONTRIBUTING.md, diff, comments (Octokit)│    │
  │  ├───────────────────────────────────────────────────┤    │
  │  │  STAGE 3 — AI Analysis  (parallel)                │    │
  │  │    Compliance score vs. CONTRIBUTING.md           │    │
  │  │    Tone & toxicity analysis of description/comms  │    │
  │  ├───────────────────────────────────────────────────┤    │
  │  │  STAGE 4 — Action Execution                       │    │
  │  │    Provision + apply labels                       │    │
  │  │    Post structured review comment                 │    │
  │  │    Approve / Request Changes / Close              │    │
  │  └───────────────────────────────────────────────────┘    │
  └──────────────────────────────────────────────────────────┘
```

---

## Tech Stack

| Layer | Technology | Why |
|---|---|---|
| **Framework** | [Next.js 16](https://nextjs.org) App Router | Native `after()` for `waitUntil` semantics; serverless-first |
| **Language** | TypeScript 5 (strict mode) | End-to-end type safety across webhook, AI, and GitHub API layers |
| **Validation** | [Zod v3](https://zod.dev) | Runtime safety for env vars, webhook payloads, and all AI responses |
| **GitHub SDK** | [@octokit/rest](https://github.com/octokit/rest.js) + [@octokit/auth-app](https://github.com/octokit/auth-app.js) | Official typed client; GitHub App JWT + installation token auth |
| **AI Abstraction** | [Vercel AI SDK](https://sdk.vercel.ai) (`ai`) | Provider-agnostic `generateObject`; structured output with Zod schemas |
| **AI Providers** | Gemini 2.0 Flash · Claude 3.5 Haiku · GPT-4o-mini | Cost-ordered; cheapest/fastest first in failover chain |
| **Rate Limiting** | [@upstash/ratelimit](https://github.com/upstash/ratelimit) + [@upstash/redis](https://github.com/upstash/redis) | Serverless-compatible sliding-window rate limiter |
| **Testing** | [Vitest](https://vitest.dev) + `@vitest/coverage-v8` | Native ESM, fast, excellent TypeScript support |
| **Deployment** | [Vercel](https://vercel.com) Fluid Compute | `after()` support; zero-config serverless |

---

## Project Structure

```
repocop/
├── app/
│   └── api/
│       ├── webhook/route.ts      ← POST handler: verify → ack → pipeline
│       └── health/route.ts       ← GET /api/health
│
├── src/
│   ├── pipeline/
│   │   └── index.ts              ← Orchestrates all 4 stages
│   │
│   ├── stages/
│   │   ├── cost-gate.ts          ← Stage 1: Pre-flight validator
│   │   ├── context-ingestion.ts  ← Stage 2: Fetch PR data
│   │   ├── ai-analysis.ts        ← Stage 3: Compliance + toxicity
│   │   └── action-executor.ts    ← Stage 4: Labels + comment + status
│   │
│   ├── lib/
│   │   ├── github/
│   │   │   ├── app-client.ts     ← JWT-authenticated Octokit factory
│   │   │   ├── installation-client.ts
│   │   │   ├── pr.ts             ← PR data fetchers
│   │   │   └── labels.ts         ← Label provisioning helpers
│   │   ├── security/
│   │   │   └── hmac.ts           ← Timing-safe HMAC-SHA256 verifier
│   │   ├── ai/
│   │   │   ├── router.ts         ← Provider failover chain
│   │   │   ├── providers.ts      ← Gemini, Claude, OpenAI instances
│   │   │   └── prompts.ts        ← Structured prompt templates
│   │   ├── rate-limit/index.ts
│   │   └── idempotency/index.ts
│   │
│   ├── schemas/
│   │   ├── env.ts                ← Zod env validation (startup-fail if invalid)
│   │   ├── webhook.ts            ← GitHub PR webhook payload schemas
│   │   └── analysis.ts           ← AI structured output schemas
│   │
│   └── types/index.ts            ← Shared domain interfaces
│
├── tests/
│   ├── unit/
│   │   ├── security/hmac.test.ts
│   │   ├── stages/cost-gate.test.ts
│   │   └── lib/labels.test.ts
│   └── integration/
│       ├── webhook.test.ts
│       └── fixtures/
│
├── .env.example
├── vitest.config.ts
├── next.config.ts
└── BLUEPRINT.md
```

---

## Getting Started

### Prerequisites

- **Node.js** 20 or later
- **npm** 10 or later
- A **GitHub App** (see below)
- An **Upstash Redis** database ([free tier available](https://upstash.com))
- API keys for at least **one** AI provider (Gemini recommended as primary)

---

### 1. Clone and Install

```bash
git clone https://github.com/your-org/repocop.git
cd repocop
npm install
```

---

### 2. Create a GitHub App

1. Go to **GitHub → Settings → Developer Settings → GitHub Apps → New GitHub App**.
2. Set the **Webhook URL** to `https://your-vercel-deployment.vercel.app/api/webhook`.
3. Generate a random **Webhook Secret** (minimum 32 characters — `openssl rand -hex 32` works perfectly).
4. Set the following **Repository Permissions**:

| Permission | Access |
|---|---|
| Pull requests | Read & Write |
| Contents | Read |
| Issues | Read & Write |
| Metadata | Read |

5. Subscribe to the **Pull request** webhook event.
6. Download the **Private Key** (`.pem` file) from the App settings page.

---

### 3. Configure Environment Variables

Copy `.env.example` to `.env.local` and fill in all values:

```bash
cp .env.example .env.local
```

```env
# GitHub App
GITHUB_APP_ID=your_app_id
GITHUB_APP_PRIVATE_KEY=-----BEGIN RSA PRIVATE KEY-----\n...\n-----END RSA PRIVATE KEY-----
GITHUB_WEBHOOK_SECRET=your_minimum_32_char_random_secret

# AI Providers (failover order: Gemini → Claude → OpenAI)
GOOGLE_GENERATIVE_AI_API_KEY=
ANTHROPIC_API_KEY=
OPENAI_API_KEY=

# Upstash Redis
UPSTASH_REDIS_REST_URL=https://your-db.upstash.io
UPSTASH_REDIS_REST_TOKEN=your_token

# App Metadata
NEXT_PUBLIC_APP_VERSION=0.1.0
```

> **Note:** For `GITHUB_APP_PRIVATE_KEY`, replace literal newlines in the PEM file with `\n` so it can be stored as a single-line environment variable. The env schema will restore them automatically.

---

### 4. Run Locally

```bash
npm run dev
```

To test webhooks locally, use [smee.io](https://smee.io) or the [GitHub CLI](https://cli.github.com) to forward events to your local server:

```bash
npx smee-client --url https://smee.io/your-channel --target http://localhost:3000/api/webhook
```

---

## Architecture

### Pipeline Stages

| Stage | Name | Responsibility | Exits Early? |
|---|---|---|---|
| **1** | Cost Gate | Validates PR before any AI or GitHub API calls | ✅ Yes — on bot, draft, empty, tiny, or wrong-branch PRs |
| **2** | Context Ingestion | Fetches diff, `CONTRIBUTING.md`, and comments via Octokit | No |
| **3** | AI Analysis | Runs compliance + toxicity analysis in parallel | No |
| **4** | Action Executor | Applies labels, posts comment, sets PR status | No |

### AI Provider Failover

The AI router attempts providers in cost-ascending order. The first successful response wins; failures are logged with provider name and error code but are never surfaced to the GitHub user.

```
Attempt 1: google/gemini-2.0-flash-exp   (fastest, cheapest)
    ↓ fail
Attempt 2: anthropic/claude-3-5-haiku   (mid-tier)
    ↓ fail
Attempt 3: openai/gpt-4o-mini           (fallback)
    ↓ fail
→ Classified error logged; PR left untouched (fail-safe)
```

All AI responses are validated against a **Zod schema** via `generateObject`. If the model produces malformed output, it is treated as a provider failure and triggers failover.

---

## Label Taxonomy

RepoCop provisions all labels automatically on first use. Labels are idempotent — existing labels with the same name are never duplicated.

| Label | Color | Applied When |
|---|---|---|
| `repocop:approved` | 🟢 Green | Compliance score ≥ 75 |
| `repocop:needs-changes` | 🟡 Yellow | Compliance score 50–74 |
| `repocop:rejected` | 🔴 Red | Compliance score < 50 |
| `repocop:draft` | ⬜ Gray | PR is in draft state |
| `repocop:missing-tests` | 🟠 Orange | No test files detected in diff |
| `repocop:needs-design` | 🟣 Purple | AI flagged architectural concerns |
| `repocop:tone-warning` | 🔴 Dark Red | Toxicity severity: low or medium |
| `repocop:no-contributing` | 🔘 Light Gray | Repo has no `CONTRIBUTING.md` |

---

## API Reference

### `POST /api/webhook`

Receives GitHub App webhook events.

**Headers required:**

| Header | Description |
|---|---|
| `X-Hub-Signature-256` | HMAC-SHA256 signature from GitHub |
| `X-GitHub-Event` | Event type (only `pull_request` is processed) |
| `X-GitHub-Delivery` | Unique delivery UUID (used for idempotency) |

**Responses:**

| Status | Meaning |
|---|---|
| `202 Accepted` | Valid `pull_request` event; pipeline enqueued |
| `200 OK` | Valid signature but non-`pull_request` event; ignored |
| `401 Unauthorized` | HMAC signature verification failed |
| `400 Bad Request` | Payload is not valid JSON |
| `429 Too Many Requests` | Rate limit exceeded for this installation |

---

### `GET /api/health`

Returns the service health status.

**Response:**
```json
{
  "status": "ok",
  "service": "repocop",
  "version": "0.1.0",
  "timestamp": "2026-03-06T11:00:00.000Z"
}
```

---

## Testing

```bash
# Run all tests once
npm test

# Run tests in watch mode during development
npm run test:watch

# Run tests with coverage report
npm run test:coverage
```

### Test Coverage Strategy

| Layer | Approach |
|---|---|
| HMAC verifier | 8 unit tests: valid sig, null header, missing prefix, tampered body, wrong secret, bit-flip, `Uint8Array` input |
| Cost gate | Table-driven unit tests for each of the 5 gate conditions |
| Compliance scorer | Boundary-value tests: scores 49, 50, 74, 75 map to correct actions |
| AI failover router | Mock all 3 providers; verify cascade and all-fail error path |
| Full pipeline | Integration test with mocked Octokit + AI SDK using real fixture payloads |
| Idempotency | Send same `X-GitHub-Delivery` twice; assert pipeline runs exactly once |

---

## Deployment

RepoCop is designed to deploy to **Vercel** with zero configuration.

1. Push this repository to GitHub.
2. Import the project in [Vercel](https://vercel.com/new).
3. Add all environment variables from `.env.example` in the Vercel project settings.
4. Deploy. The `POST /api/webhook` and `GET /api/health` endpoints are live instantly.

> **Important:** Ensure the **Node.js runtime** is selected (not Edge) in your Vercel project settings. The `after()` API is not available on the Edge runtime.

---

## Roadmap

- [x] **Phase 1** — Foundation & Security (HMAC verification, env validation, webhook ingestion)
- [ ] **Phase 2** — GitHub Client & PR Context Ingestion
- [ ] **Phase 3** — Cost Gate: Pre-flight Validator
- [ ] **Phase 4** — AI Router with Provider Failover
- [ ] **Phase 5** — Semantic Compliance Analysis
- [ ] **Phase 6** — Tone & Toxicity Guardrails
- [ ] **Phase 7** — Smart Label Orchestration
- [ ] **Phase 8** — Rate Limiting, Idempotency & Production Hardening

---

## Contributing

RepoCop practices what it preaches. Before opening a PR, please read [CONTRIBUTING.md](CONTRIBUTING.md) (coming in Phase 3).

All PRs are automatically evaluated by RepoCop itself once deployed.

---

## License

MIT © 2026 RepoCop Contributors

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
