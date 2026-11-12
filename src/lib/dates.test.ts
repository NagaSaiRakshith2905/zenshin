import { describe, expect, it } from "vitest";
import { formatTimestamp, todayInTimezone } from "./dates";

describe("workspace dates", () => {
  it("uses the workspace day across midnight and year boundaries", () => {
    const now = new Date("2026-12-31T20:00:00Z");
    expect(todayInTimezone("Asia/Kolkata", now)).toBe("2027-01-01");
    expect(todayInTimezone("America/Los_Angeles", now)).toBe("2026-12-31");
  });
  it("formats instants in the selected timezone", () => {
    const now = "2026-12-31T20:00:00Z";
    expect(formatTimestamp(now, "Asia/Kolkata")).toBe(new Intl.DateTimeFormat(undefined, { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" }).format(new Date(now)));
  });
});
