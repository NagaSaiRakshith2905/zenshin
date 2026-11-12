import { describe, expect, it } from "vitest";
import { issueField, validationIssues } from "./validation";

describe("field validation", () => {
  it("maps both settings and work errors to fields, including nested input paths", () => {
    const issue = { path: ["input", "title"], message: "Enter a title." };
    expect(validationIssues({ details: { fields: [issue, null, { message: 1 }] } })).toEqual([issue]);
    expect(issueField(issue)).toBe("title");
    expect(validationIssues({ fields: [{ path: ["projectIds", 0], message: "Select a project." }] }).map(issueField)).toEqual(["projectIds"]);
    expect(validationIssues(new Error("Offline"))).toEqual([]);
  });
});
