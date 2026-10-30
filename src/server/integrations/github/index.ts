import "server-only";
import { createHmac, sign, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { parseGithubEnv } from "@/server/env";

const externalId = z.number().int().positive().safe();
const timestamp = z.iso.datetime({ offset: true });
export const remoteInstallation = z.object({ id: externalId, account: z.object({ id: externalId, login: z.string() }), suspended_at: timestamp.nullable(), permissions: z.record(z.string(), z.string()) });
export const remoteRepository = z.object({ id: externalId, name: z.string(), owner: z.object({ login: z.string() }), default_branch: z.string().optional() });
export const remoteItem = z.object({ id: externalId, number: z.number().int().positive(), html_url: z.url().startsWith("https://github.com/"), title: z.string().min(1), body: z.string().nullable().default(null), state: z.enum(["open", "closed"]), created_at: timestamp, updated_at: timestamp, draft: z.boolean().optional(), merged: z.boolean().optional(), merged_at: timestamp.nullable().optional(), head: z.object({ sha: z.string().regex(/^[a-f0-9]{40}$/) }).optional(), pull_request: z.unknown().optional() });
export type RemoteItem = z.infer<typeof remoteItem>;
export type RemoteRepository = z.infer<typeof remoteRepository>;
export type RemoteInstallation = z.infer<typeof remoteInstallation>;
export type Conditional = { etag?: string | null; lastModified?: string | null };
export type GithubResult<T> = { data: T | null; etag: string | null; lastModified: string | null };
export interface GithubProvider {
  readonly blockedUntil?: Date;
  installations(page: number, signal: AbortSignal): Promise<RemoteInstallation[]>;
  repositories(installationId: string, page: number, signal: AbortSignal): Promise<{ repositories: RemoteRepository[]; total_count: number }>;
  repository(installationId: string, owner: string, name: string, signal: AbortSignal): Promise<RemoteRepository>;
  issues(installationId: string, owner: string, name: string, page: number, signal: AbortSignal): Promise<RemoteItem[]>;
  item(installationId: string, owner: string, name: string, type: "issue" | "pr", number: number, conditional: Conditional, signal: AbortSignal): Promise<GithubResult<RemoteItem>>;
  checks(installationId: string, owner: string, name: string, sha: string, signal: AbortSignal): Promise<Record<string, unknown>>;
}
export class GithubError extends Error {
  constructor(public status: number, public retryAt: Date | null = null) { super("GitHub request unavailable."); }
}
export function retryAt(headers: Headers, now = Date.now()) {
  const retry = headers.get("retry-after");
  const reset = headers.get("x-ratelimit-reset");
  const times = [now + 60_000];
  if (retry) times.push(/^\d+$/.test(retry) ? now + Number(retry) * 1000 : Date.parse(retry));
  if (reset && headers.get("x-ratelimit-remaining") === "0") times.push(Number(reset) * 1000);
  return new Date(Math.max(...times.filter(Number.isFinite)));
}
export function verifyWebhook(body: string, signature: string | null, secret: string) {
  if (!signature || !/^sha256=[a-f0-9]{64}$/.test(signature)) return false;
  const expected = createHmac("sha256", secret).update(body).digest();
  return timingSafeEqual(expected, Buffer.from(signature.slice(7), "hex"));
}
export function appJwt(appId: string, key: string, now = Date.now()) {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const data = `${encode({ alg: "RS256", typ: "JWT" })}.${encode({ iat: Math.floor(now / 1000) - 60, exp: Math.floor(now / 1000) + 540, iss: appId })}`;
  return `${data}.${sign("RSA-SHA256", Buffer.from(data), key.replaceAll("\\n", "\n")).toString("base64url")}`;
}
export function createGithubProvider(env = parseGithubEnv(process.env), transport: typeof fetch = fetch): GithubProvider {
  // Tokens remain in this request/job instance and are never persisted or returned.
  let blockedUntil: Date | undefined;
  const tokens = new Map<string, { token: string; expires: number }>();
  async function request(path: string, token: string, signal: AbortSignal, conditional: Conditional = {}, method = "GET") {
    if (blockedUntil && blockedUntil.getTime() > Date.now()) throw new GithubError(429, blockedUntil);
    let url = new URL(path, "https://api.github.com");
    let response: Response;
    for (let redirects = 0;; redirects++) {
    response = await transport(url.href, { method, redirect: "manual", cache: "no-store", signal, headers: { Accept: "application/vnd.github+json", Authorization: `Bearer ${token}`, "X-GitHub-Api-Version": "2026-03-10", "User-Agent": "Zenshin", ...(conditional.etag ? { "If-None-Match": conditional.etag } : conditional.lastModified ? { "If-Modified-Since": conditional.lastModified } : {}) } });
    if (![301, 302, 303, 307, 308].includes(response.status)) break;
    if (method !== "GET" || redirects >= 3 || !response.headers.get("location")) throw new GithubError(502);
    const next = new URL(response.headers.get("location")!, url);
    if (next.origin !== "https://api.github.com" || next.username || next.password) throw new GithubError(502);
    url = next;
    }
    if (response.headers.get("x-ratelimit-remaining") === "0") blockedUntil = retryAt(response.headers);
    if (response.status !== 304 && !response.ok) {
      let secondary = false;
      if (response.status === 403) { try { secondary = /rate limit|abuse/i.test(String((await response.json()).message)); } catch { /* No provider body is exposed. */ } }
      const limited = response.status === 429 || (response.status === 403 && (secondary || response.headers.has("retry-after") || response.headers.get("x-ratelimit-remaining") === "0"));
      throw new GithubError(response.status, limited ? retryAt(response.headers) : null);
    }
    return { data: response.status === 304 ? null : await response.json(), etag: response.headers.get("etag"), lastModified: response.headers.get("last-modified") };
  }
  async function token(installationId: string, signal: AbortSignal) {
    let value = tokens.get(installationId);
    if (!value || value.expires < Date.now() + 60_000) {
      const result = await request(`/app/installations/${installationId}/access_tokens`, appJwt(env.GITHUB_APP_ID, env.GITHUB_APP_PRIVATE_KEY), signal, {}, "POST");
      const data = z.object({ token: z.string(), expires_at: timestamp }).parse(result.data);
      value = { token: data.token, expires: Date.parse(data.expires_at) }; tokens.set(installationId, value);
    }
    return value.token;
  }
  const repoPath = (owner: string, name: string) => `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`;
  return {
    get blockedUntil() { return blockedUntil; },
    async installations(page, signal) { return z.array(remoteInstallation).parse((await request(`/app/installations?per_page=100&page=${page}`, appJwt(env.GITHUB_APP_ID, env.GITHUB_APP_PRIVATE_KEY), signal)).data); },
    async repositories(id, page, signal) { return z.object({ repositories: z.array(remoteRepository), total_count: z.number() }).parse((await request(`/installation/repositories?per_page=100&page=${page}`, await token(id, signal), signal)).data); },
    async repository(id, owner, name, signal) { return remoteRepository.parse((await request(repoPath(owner, name), await token(id, signal), signal)).data); },
    async issues(id, owner, name, page, signal) { return z.array(remoteItem).parse((await request(`${repoPath(owner, name)}/issues?state=all&per_page=100&page=${page}`, await token(id, signal), signal)).data); },
    async item(id, owner, name, type, number, conditional, signal) { const result = await request(`${repoPath(owner, name)}/${type === "pr" ? "pulls" : "issues"}/${number}`, await token(id, signal), signal, conditional); return { ...result, data: result.data === null ? null : remoteItem.parse(result.data) }; },
    async checks(id, owner, name, sha, signal) {
      const auth = await token(id, signal); const path = `${repoPath(owner, name)}/commits/${sha}`;
      const checks = z.object({ total_count: z.number(), check_runs: z.array(z.object({ name: z.string(), status: z.string(), conclusion: z.string().nullable() })) }).parse((await request(`${path}/check-runs?per_page=100`, auth, signal)).data);
      const statuses = z.object({ state: z.string(), total_count: z.number(), statuses: z.array(z.object({ context: z.string(), state: z.string() })) }).parse((await request(`${path}/status?per_page=100`, auth, signal)).data);
      return { checks: checks.check_runs, statuses: statuses.statuses, state: statuses.state, complete: checks.total_count <= checks.check_runs.length && statuses.total_count <= statuses.statuses.length };
    },
  };
}
