import { Octokit } from "@octokit/rest";
import { createAppAuth } from "@octokit/auth-app";
import { env } from "@/src/schemas/env";

/**
 * Creates an installation-scoped Octokit instance using a short-lived token.
 *
 * Tokens are fetched fresh on every call — they are never cached so the
 * security surface stays minimal.  Emits a warning if the returned token
 * will expire within 60 seconds (should never happen under normal conditions
 * but acts as a canary for clock-skew or GitHub service degradation).
 */
export async function createInstallationClient(
  installationId: number
): Promise<Octokit> {
  const auth = createAppAuth({
    appId: env.GITHUB_APP_ID,
    privateKey: env.GITHUB_APP_PRIVATE_KEY,
  });

  const result = await auth({ type: "installation", installationId });
  // Cast to known shape — @octokit/auth-app guarantees token + expiresAt for
  // the "installation" type even though the return union is broad.
  const { token, expiresAt } = result as { token: string; expiresAt: string };

  const ttlSeconds = (new Date(expiresAt).getTime() - Date.now()) / 1000;
  if (ttlSeconds < 60) {
    console.warn(
      `[RepoCop] Installation token TTL is ${ttlSeconds.toFixed(0)}s — token may expire mid-request`
    );
  }

  return new Octokit({ auth: token });
}
