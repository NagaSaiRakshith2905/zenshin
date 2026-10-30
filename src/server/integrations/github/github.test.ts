import { createHmac, generateKeyPairSync, verify } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { appJwt, createGithubProvider, GithubError, retryAt, verifyWebhook } from ".";
import { githubMarkdown } from "./markdown";
import { notePlainText } from "@/lib/contracts/notes";

const keys = generateKeyPairSync("rsa", { modulusLength: 2048 });
const env = { GITHUB_APP_ID: "123", GITHUB_APP_SLUG: "zenshin-test", GITHUB_APP_PRIVATE_KEY: keys.privateKey.export({ type: "pkcs8", format: "pem" }).toString(), GITHUB_APP_WEBHOOK_SECRET: "s".repeat(32) };
const item = { id: 23, number: 1, title: "Issue", state: "open", body: "Hello", html_url: "https://github.com/owner/repo/issues/1", created_at: "2026-10-01T00:00:00Z", updated_at: "2026-10-02T00:00:00Z" };
describe("GitHub provider boundary", () => {
  it("signs an expiring RS256 App JWT independently from login credentials", () => {
    const token = appJwt("123", env.GITHUB_APP_PRIVATE_KEY, 1000_000); const [header, payload, signature] = token.split(".");
    expect(JSON.parse(Buffer.from(payload, "base64url").toString())).toEqual({ iss: "123", iat: 940, exp: 1540 });
    expect(verify("RSA-SHA256", Buffer.from(`${header}.${payload}`), keys.publicKey, Buffer.from(signature, "base64url"))).toBe(true);
  });
  it("verifies exact webhook bytes and rejects missing, malformed and tampered signatures", () => {
    const body = '{"action":"opened"}'; const sig = `sha256=${createHmac("sha256", env.GITHUB_APP_WEBHOOK_SECRET).update(body).digest("hex")}`;
    expect(verifyWebhook(body, sig, env.GITHUB_APP_WEBHOOK_SECRET)).toBe(true);
    for (const signature of [null, "sha1=abc", "sha256=x", sig.replace(/.$/, sig.endsWith("0") ? "1" : "0")]) expect(verifyWebhook(body, signature, env.GITHUB_APP_WEBHOOK_SECRET)).toBe(false);
    expect(verifyWebhook(`${body}\n`, sig, env.GITHUB_APP_WEBHOOK_SECRET)).toBe(false);
  });
  it("honors primary resets and secondary Retry-After dates/seconds", () => {
    expect(retryAt(new Headers({ "retry-after": "120" }), 1000).getTime()).toBe(121000);
    expect(retryAt(new Headers({ "x-ratelimit-remaining": "0", "x-ratelimit-reset": "500" }), 1000).getTime()).toBe(500000);
    expect(retryAt(new Headers({ "retry-after": "Thu, 01 Jan 1970 00:05:00 GMT" }), 1000).getTime()).toBe(300000);
  });
  it("uses installation tokens, bounded pages and conditional requests with no credential leakage", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json({ token: "private-test-token", expires_at: "2099-01-01T00:00:00Z" })).mockResolvedValueOnce(Response.json(item, { headers: { etag: '"abc"' } })).mockResolvedValueOnce(new Response(null, { status: 304 }));
    const api = createGithubProvider(env, fetcher);
    const result = await api.item("456", "owner", "repo", "issue", 1, {}, AbortSignal.timeout(1000));
    expect(result.data?.id).toBe(23);
    expect((fetcher.mock.calls[0][1]?.headers as Record<string, string>).Authorization).toMatch(/^Bearer ey/);
    expect((fetcher.mock.calls[1][1]?.headers as Record<string, string>).Authorization).toBe("Bearer private-test-token");
    const unchanged = await api.item("456", "owner", "repo", "issue", 1, { etag: result.etag }, AbortSignal.timeout(1000));
    expect(unchanged.data).toBeNull(); expect(fetcher).toHaveBeenCalledTimes(3);
    expect((fetcher.mock.calls[2][1]?.headers as Record<string, string>)["If-None-Match"]).toBe('"abc"');
    expect(JSON.stringify(result)).not.toContain("token");
  });
  it("preserves issue-feed page boundaries even when a page contains only PRs", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json({ token: "t", expires_at: "2099-01-01T00:00:00Z" })).mockResolvedValueOnce(Response.json([{ ...item, pull_request: {} }]));
    const result = await createGithubProvider(env, fetcher).issues("456", "owner", "repo", 2, AbortSignal.timeout(1000));
    expect(result).toHaveLength(1); expect(fetcher.mock.calls[1][0]).toContain("per_page=100&page=2");
  });
  it("follows bounded same-origin redirects for renamed repositories without leaking tokens off-origin", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json({ token: "t", expires_at: "2099-01-01T00:00:00Z" })).mockResolvedValueOnce(new Response(null, { status: 301, headers: { location: "https://api.github.com/repos/owner/new/issues/1" } })).mockResolvedValueOnce(Response.json(item));
    expect((await createGithubProvider(env, fetcher).item("456", "owner", "old", "issue", 1, {}, AbortSignal.timeout(1000))).data?.id).toBe(23);
    expect(fetcher.mock.calls[2][0]).toBe("https://api.github.com/repos/owner/new/issues/1");
    const unsafe = vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json({ token: "t", expires_at: "2099-01-01T00:00:00Z" })).mockResolvedValueOnce(new Response(null, { status: 302, headers: { location: "https://attacker.invalid/collect" } }));
    await expect(createGithubProvider(env, unsafe).item("456", "owner", "old", "issue", 1, {}, AbortSignal.timeout(1000))).rejects.toBeInstanceOf(GithubError);
    expect(unsafe).toHaveBeenCalledTimes(2);
  });
  it("stops additional calls when GitHub reports exhausted primary quota", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json({ token: "t", expires_at: "2099-01-01T00:00:00Z" })).mockResolvedValueOnce(Response.json(item, { headers: { "x-ratelimit-remaining": "0", "x-ratelimit-reset": String(Math.floor(Date.now() / 1000) + 1000) } }));
    const api = createGithubProvider(env, fetcher); await api.item("456", "owner", "repo", "issue", 1, {}, AbortSignal.timeout(1000));
    await expect(api.item("456", "owner", "repo", "issue", 1, {}, AbortSignal.timeout(1000))).rejects.toBeInstanceOf(GithubError);
    expect(fetcher).toHaveBeenCalledTimes(2); expect(api.blockedUntil!.getTime()).toBeGreaterThan(Date.now());
  });
});
describe("safe issue Markdown snapshot", () => {
  it("converts supported blocks and marks without fetching images or executing HTML", () => {
    const doc = githubMarkdown('# Heading\n\n**bold** and [safe](https://example.com)\n\n- [x] checked\n- [ ] pending\n\n```ts\nconst a = 1;\n```\n\n> quote\n\n![image](https://example.com/image.png)\n<script>alert(1)</script>\n[bad](javascript:alert)');
    expect(doc.content.map((node) => node.type)).toEqual(["heading", "paragraph", "taskList", "codeBlock", "blockquote", "paragraph", "paragraph", "paragraph"]);
    expect(doc.content[1].content![0].marks).toEqual([{ type: "bold" }]);
    expect(notePlainText(doc)).toContain("<script>alert(1)</script>");
    expect(JSON.stringify(doc)).not.toContain('"type":"image"'); expect(JSON.stringify(doc)).not.toContain("javascript:");
  });
  it("rejects content beyond the existing note bounds", () => { expect(() => githubMarkdown("x".repeat(1_048_577))).toThrow(); });
});
