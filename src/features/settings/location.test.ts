import { describe, expect, it } from "vitest";
import { readSettingsLocation, settingsHref } from "./location";

describe("settings locations", () => {
  const projectId = "00000000-0000-4000-8000-000000000001";
  it("round-trips a project setting without losing task and view context", () => {
    const href = settingsHref("/", new URLSearchParams("view=board&task=t1"), "properties", projectId);
    const query = new URL(href, "https://example.com").searchParams;
    expect(readSettingsLocation(query)).toEqual({ section: "properties", projectId });
    expect(settingsHref("/", query, null)).toBe("/?view=board&task=t1");
  });
  it("supports provider return and ignores unknown sections or project values", () => {
    expect(readSettingsLocation(new URLSearchParams("github=setup")).section).toBe("github");
    expect(readSettingsLocation(new URLSearchParams("settings=unknown&settingsProject=oops"))).toEqual({ section: null, projectId: "" });
    expect(settingsHref("/", new URLSearchParams("github=setup"), null)).toBe("/");
  });
});
