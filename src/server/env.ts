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
