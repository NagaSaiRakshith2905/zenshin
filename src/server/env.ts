import "server-only";
import { z } from "zod";

const serverEnvSchema = z.object({
  APP_ENV: z.enum(["development", "preview", "production"]),
  APP_ORIGIN: z.url().refine((value) => {
    if (!URL.canParse(value)) return false;
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol)
      && !url.username && !url.password && !url.search && !url.hash
      && url.pathname === "/";
  }).transform((value) => new URL(value).origin),
}).refine((env) => env.APP_ENV === "development" || env.APP_ORIGIN.startsWith("https://"), {
  path: ["APP_ORIGIN"],
});

export function parseServerEnv(input: Record<string, string | undefined>) {
  const result = serverEnvSchema.safeParse(input);
  if (!result.success) {
    const fields = [...new Set(result.error.issues.map((issue) => issue.path.join(".")))];
    // Never include received values: future settings may contain secrets.
    throw new Error(`Invalid server environment: ${fields.join(", ")}. See docs/ENVIRONMENT.md.`);
  }
  return result.data;
}

export function getServerEnv() {
  return parseServerEnv(process.env);
}

const authEnvSchema = z.object({
  BETTER_AUTH_SECRET: z.string().min(32).refine((value) => !/placeholder|change.?me|example/i.test(value)),
  BETTER_AUTH_URL: z.url(),
  GITHUB_OAUTH_CLIENT_ID: z.string().trim().min(1),
  GITHUB_OAUTH_CLIENT_SECRET: z.string().trim().min(1),
  OWNER_GITHUB_ID: z.string().regex(/^[1-9]\d*$/),
  // Optional: without them, sessions and rate limits stay in Postgres (tests, offline dev).
  UPSTASH_REDIS_REST_URL: z.url().startsWith("https://").optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().trim().min(1).optional(),
}).refine((env) => !env.UPSTASH_REDIS_REST_URL === !env.UPSTASH_REDIS_REST_TOKEN, { path: ["UPSTASH_REDIS_REST_TOKEN"] });

export function parseAuthEnv(input: Record<string, string | undefined>) {
  const app = parseServerEnv(input);
  const result = authEnvSchema.safeParse(input);
  if (!result.success) {
    const fields = [...new Set(result.error.issues.map((issue) => issue.path.join(".")))];
    throw new Error(`Invalid server environment: ${fields.join(", ")}. See docs/ENVIRONMENT.md.`);
  }
  if (result.data.BETTER_AUTH_URL !== app.APP_ORIGIN && result.data.BETTER_AUTH_URL !== `${app.APP_ORIGIN}/`) {
    throw new Error("Invalid server environment: BETTER_AUTH_URL must match APP_ORIGIN. See docs/ENVIRONMENT.md.");
  }
  return { ...app, ...result.data, BETTER_AUTH_URL: app.APP_ORIGIN };
}

export const getAuthEnv = () => parseAuthEnv(process.env);
export type AuthEnv = ReturnType<typeof parseAuthEnv>;

const storageEnvSchema = z.object({
  R2_ENDPOINT: z.url().regex(/^https:\/\/[a-f0-9]{32}(?:\.(?:eu|fedramp))?\.r2\.cloudflarestorage\.com\/?$/),
  R2_BUCKET: z.string().regex(/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/),
  R2_ACCESS_KEY_ID: z.string().min(1),
  R2_SECRET_ACCESS_KEY: z.string().min(1),
});
export function parseStorageEnv(input: Record<string, string | undefined>) {
  const result = storageEnvSchema.safeParse(input);
  if (!result.success) throw new Error(`Invalid server environment: ${[...new Set(result.error.issues.map((issue) => issue.path.join(".")))].join(", ")}. See docs/R2.md.`);
  return result.data;
}
