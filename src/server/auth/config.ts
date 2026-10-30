import "server-only";
import { randomUUID } from "node:crypto";
import { apiKey } from "@better-auth/api-key";
import { betterAuth, type SecondaryStorage } from "better-auth";
import { Redis } from "@upstash/redis";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { eq } from "drizzle-orm";
import type { AuthEnv } from "@/server/env";
import type { DatabaseExecutor } from "@/server/db";
import * as schema from "@/server/db/schema/auth.generated";
import { userPreferences } from "@/server/db/schema/identity";
import { createRequestContext } from "@/server/request-context";
import { apiKeyOptions } from "./api-key-options";
import { hasOwnerBinding, isOwnerProfile, ownerUserId } from "./owner";
import { authRateLimit } from "./schema-options";

let redis: Redis | undefined;
function redisStorage(env: AuthEnv): SecondaryStorage | undefined {
  if (!env.UPSTASH_REDIS_REST_URL || !env.UPSTASH_REDIS_REST_TOKEN) return;
  // Raw strings in and out; Better Auth does its own JSON encoding.
  const client = redis ??= new Redis({ url: env.UPSTASH_REDIS_REST_URL, token: env.UPSTASH_REDIS_REST_TOKEN, automaticDeserialization: false });
  return {
    get: (key) => client.get<string>(key),
    getAndDelete: (key) => client.getdel<string>(key),
    // INCR and its first-window EXPIRE in one atomic step, as Better Auth's rate limiter requires.
    increment: async (key, ttl) => Number(await client.eval("local n = redis.call('INCR', KEYS[1]) if n == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end return n", [key], [ttl])),
    set: async (key, value, ttl) => { await (ttl ? client.set(key, value, { ex: ttl }) : client.set(key, value)); },
    delete: async (key) => { await client.del(key); },
  };
}

export function createOwnerAuth(db: DatabaseExecutor, env: AuthEnv) {
  const ownerId = ownerUserId(env.OWNER_GITHUB_ID);
  const secondaryStorage = redisStorage(env);
  return betterAuth({
    appName: "Zenshin",
    baseURL: env.BETTER_AUTH_URL,
    secret: env.BETTER_AUTH_SECRET,
    trustedOrigins: [env.APP_ORIGIN],
    database: drizzleAdapter(db, { provider: "pg", schema, transaction: true }),
    emailAndPassword: { enabled: false },
    socialProviders: {
      github: {
        clientId: env.GITHUB_OAUTH_CLIENT_ID, clientSecret: env.GITHUB_OAUTH_CLIENT_SECRET,
        disableImplicitSignUp: true,
      },
    },
    user: {
      async validateUserInfo({ user, source }) {
        if (!isOwnerProfile(source, env.OWNER_GITHUB_ID) || source.action === "link-account"
          || (source.action === "sign-in" && user.id !== ownerId)) return { error: "owner_only" };
        if (source.action === "create-user") {
          const [existing] = await db.select({ id: schema.user.id }).from(schema.user).where(eq(schema.user.id, ownerId)).limit(1);
          if (existing) return { error: "registration_closed" };
        }
      },
    },
    account: { accountLinking: { enabled: false }, encryptOAuthTokens: true },
    secondaryStorage,
    // Sessions stay in Postgres too, so the owner-binding hook still runs and existing sign-ins keep working.
    session: { expiresIn: 7 * 24 * 60 * 60, updateAge: 24 * 60 * 60, cookieCache: { enabled: false }, storeSessionInDatabase: true },
    advanced: {
      useSecureCookies: env.APP_ORIGIN.startsWith("https://"),
      defaultCookieAttributes: { httpOnly: true, sameSite: "lax", path: "/" },
      database: { generateId: ({ model }) => model === "user" ? ownerId : randomUUID() },
    },
    databaseHooks: {
      account: { create: { before: async (data) => {
        if (data.providerId !== "github" || data.accountId !== env.OWNER_GITHUB_ID || data.userId !== ownerId) return false;
      } } },
      user: { create: { after: async (user) => {
        await db.insert(userPreferences).values({ userId: user.id }).onConflictDoNothing();
      } } },
      session: { create: { before: async (session) => {
        if (!await hasOwnerBinding(db, session.userId, env.OWNER_GITHUB_ID)) return false;
      } } },
    },
    plugins: [apiKey(apiKeyOptions)],
    rateLimit: secondaryStorage ? { ...authRateLimit, storage: "secondary-storage" } : authRateLimit,
    onAPIError: { errorURL: "/sign-in?error=authentication_failed" },
    // Provider/plugin errors can carry tokens, URLs or request bodies. Log only a fixed event.
    logger: { log: (level) => { if (level === "error" || level === "warn") createRequestContext().logError("authentication_error"); } },
  });
}
