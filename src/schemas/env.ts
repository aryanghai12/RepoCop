import { z } from "zod";

const envSchema = z.object({
  // GitHub App
  GITHUB_APP_ID: z.string().min(1, "GITHUB_APP_ID is required"),
  GITHUB_APP_PRIVATE_KEY: z
    .string()
    .min(1, "GITHUB_APP_PRIVATE_KEY is required")
    .transform((key) => key.replace(/\\n/g, "\n")),
  GITHUB_WEBHOOK_SECRET: z
    .string()
    .min(32, "GITHUB_WEBHOOK_SECRET must be at least 32 characters"),

  // AI Providers
  GOOGLE_GENERATIVE_AI_API_KEY: z
    .string()
    .min(1, "GOOGLE_GENERATIVE_AI_API_KEY is required"),
  ANTHROPIC_API_KEY: z.string().min(1, "ANTHROPIC_API_KEY is required"),
  OPENAI_API_KEY: z.string().min(1, "OPENAI_API_KEY is required"),

  // Upstash Redis
  UPSTASH_REDIS_REST_URL: z
    .string()
    .url("UPSTASH_REDIS_REST_URL must be a valid URL"),
  UPSTASH_REDIS_REST_TOKEN: z
    .string()
    .min(1, "UPSTASH_REDIS_REST_TOKEN is required"),

  // App metadata
  NEXT_PUBLIC_APP_VERSION: z.string().default("0.0.0"),
});

export type Env = z.infer<typeof envSchema>;

let cachedEnv: Env | null = null;

function validateEnv(): Env {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    const errors = result.error.flatten().fieldErrors;
    const messages = Object.entries(errors)
      .map(([key, msgs]) => `  • ${key}: ${msgs?.join(", ")}`)
      .join("\n");

    throw new Error(
      `[RepoCop] Missing or invalid environment variables:\n${messages}\n\nSee .env.example for reference.`
    );
  }

  return result.data;
}

export function getEnv(): Env {
  if (cachedEnv) {
    return cachedEnv;
  }

  cachedEnv = validateEnv();
  return cachedEnv;
}

// Lazy proxy so modules can import `env` without forcing validation during
// Next.js build-time module evaluation. Validation still happens on first use.
export const env = new Proxy({} as Env, {
  get(_target, prop) {
    return getEnv()[prop as keyof Env];
  },
  has(_target, prop) {
    return prop in getEnv();
  },
  ownKeys() {
    return Reflect.ownKeys(getEnv());
  },
  getOwnPropertyDescriptor(_target, prop) {
    return {
      configurable: true,
      enumerable: true,
      value: getEnv()[prop as keyof Env],
      writable: false,
    };
  },
});
