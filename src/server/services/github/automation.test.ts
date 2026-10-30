import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { automationEvents } from "./automation";
import type { GithubItemState } from "@/lib/contracts/github";
const now = new Date("2026-10-30T12:05:00Z"); const baseline = new Date("2026-10-30T12:00:00Z");
const pr = (extra: Partial<GithubItemState & { syncedAt: Date | null }> = {}) => ({ id: "pr-1", type: "pr" as const, state: "open", isDraft: false, isMerged: false, availability: "available", remoteUpdatedAt: now, openedAt: new Date("2026-10-30T12:01:00Z"), readyAt: null, mergedAt: null, syncedAt: now, ...extra });
describe("GitHub automation event eligibility", () => {
  it("ignores historical opens, drafts, merged/closed PRs and unverified/stale data", () => {
    for (const value of [pr({ openedAt: baseline }), pr({ isDraft: true }), pr({ isMerged: true }), pr({ state: "closed" }), pr({ availability: "deleted" }), pr({ availability: "unavailable" }), pr({ syncedAt: null }), pr({ syncedAt: baseline })]) expect(automationEvents("pr_open", [value], baseline, now)).toEqual([]);
  });
  it("identifies new opens and draft-to-ready events with stable fingerprints", () => {
    expect(automationEvents("pr_open", [pr()], baseline, now)).toEqual(["open:pr-1:2026-10-30T12:01:00.000Z"]);
    expect(automationEvents("pr_open", [pr({ openedAt: baseline, readyAt: now })], baseline, now)).toEqual(["open:pr-1:2026-10-30T12:05:00.000Z"]);
  });
  it("requires a nonempty, fully verified merged set and a merge after baseline", () => {
    const merged = pr({ state: "closed", isMerged: true, mergedAt: now });
    for (const set of [[], [pr()], [merged, pr({ id: "other", state: "closed" })], [merged, { ...merged, id: "other", isDraft: true }], [merged, { ...merged, id: "other", availability: "unavailable" }], [{ ...merged, mergedAt: baseline }]]) expect(automationEvents("all_prs_merged", set, baseline, now)).toEqual([]);
    expect(automationEvents("all_prs_merged", [merged, { ...merged, id: "other", mergedAt: baseline }], baseline, now)).toHaveLength(1);
  });
  it("uses baseline remote states to suppress historical events despite provider clock skew", () => {
    const known = [{ id: "pr-1", updatedAt: now.toISOString(), state: "open", isDraft: false, isMerged: false }];
    expect(automationEvents("pr_open", [pr()], baseline, now, known)).toEqual([]);
    expect(automationEvents("all_prs_merged", [pr({ isMerged: true, mergedAt: now })], baseline, now, [{ ...known[0], isMerged: true }])).toEqual([]);
  });
  it("fingerprints the linked PR set independently of ordering", () => {
    const a = pr({ isMerged: true, mergedAt: now }); const b = { ...a, id: "other" };
    expect(automationEvents("all_prs_merged", [a, b], baseline, now)).toEqual(automationEvents("all_prs_merged", [b, a], baseline, now));
  });
});
