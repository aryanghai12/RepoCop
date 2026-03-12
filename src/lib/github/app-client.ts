import { Octokit } from "@octokit/rest";
import { createAppAuth } from "@octokit/auth-app";
import { env } from "@/src/schemas/env";

/**
 * Creates a GitHub App-level Octokit instance authenticated via JWT.
 *
 * The JWT is generated on demand by @octokit/auth-app with a 10-minute TTL.
 * Do not cache this instance longer than a single short-lived operation.
 */
export function createAppClient(): Octokit {
  return new Octokit({
    authStrategy: createAppAuth,
    auth: {
      appId: env.GITHUB_APP_ID,
      privateKey: env.GITHUB_APP_PRIVATE_KEY,
    },
  });
}
