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
});

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
