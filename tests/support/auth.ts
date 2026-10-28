import { vi } from "vitest";
import type { createOwnerAuth } from "../../src/server/auth/config";
import type { AuthEnv } from "../../src/server/env";

export const authEnvironment: AuthEnv = {
  APP_ENV: "development", APP_ORIGIN: "http://localhost:3000", BETTER_AUTH_URL: "http://localhost:3000",
  BETTER_AUTH_SECRET: "test-only-auth-signing-value-0000000000", GITHUB_OAUTH_CLIENT_ID: "test-client",
  GITHUB_OAUTH_CLIENT_SECRET: "test-only-oauth-value", OWNER_GITHUB_ID: "42",
};

// Only synthetic responses are used. Any unexpected provider request fails closed.
export function mockGithub(profile: { id: number; email: string; login: string }) {
  const fetch = vi.fn(async (input: string | URL | Request) => {
    const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
    if (url.origin === "https://github.com" && url.pathname === "/login/oauth/access_token") {
      return Response.json({ access_token: "test-only-provider-token", token_type: "bearer", scope: "read:user,user:email" });
    }
    if (url.origin === "https://api.github.com" && url.pathname === "/user") {
      return Response.json({ ...profile, name: profile.login, avatar_url: null });
    }
    if (url.origin === "https://api.github.com" && url.pathname === "/user/emails") {
      return Response.json([{ email: profile.email, verified: true, primary: true }]);
    }
    throw new Error("Unexpected mocked provider request.");
  });
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

export async function githubCallback(auth: ReturnType<typeof createOwnerAuth>, requestSignUp = true) {
  const start = await auth.handler(new Request(`${authEnvironment.APP_ORIGIN}/api/auth/sign-in/social`, {
    method: "POST", headers: { "Content-Type": "application/json", origin: authEnvironment.APP_ORIGIN },
    body: JSON.stringify({ provider: "github", requestSignUp, callbackURL: "/", errorCallbackURL: "/sign-in?error=authentication_failed" }),
  }));
  if (!start.ok) throw new Error("Mock OAuth initiation failed.");
  const { url } = await start.json() as { url: string };
  const state = new URL(url).searchParams.get("state");
  if (!state) throw new Error("Mock OAuth state missing.");
  const cookie = start.headers.getSetCookie().map((value) => value.split(";")[0]).join("; ");
  const response = await auth.handler(new Request(`${authEnvironment.APP_ORIGIN}/api/auth/callback/github?code=test-only-code&state=${encodeURIComponent(state)}`, { headers: { cookie } }));
  const sessionCookies = response.headers.getSetCookie().map((value) => value.split(";")[0]).join("; ");
  return { response, headers: new Headers({ cookie: sessionCookies }) };
}
