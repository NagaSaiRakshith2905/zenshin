import { describe, expect, it } from "vitest";
import { createFormDraftStore } from "./form-drafts";

describe("workspace form drafts", () => {
  it("retains edits across form visits, including unchecked and empty values", () => {
    const store = createFormDraftStore();
    store.write("task:1:name", "Attempted title");
    store.write("task:1:complete", false);
    store.write("task:1:description", "");
    expect(store.read("task:1:name", "Server title")).toBe("Attempted title");
    expect(store.read("task:1:complete", true)).toBe(false);
    expect(store.read("task:1:description", "Server description")).toBe("");
    expect(createFormDraftStore().read("task:1:name", "Another owner")).toBe("Another owner");
  });
  it("clears only the saved or explicitly discarded form", () => {
    const store = createFormDraftStore();
    store.write("task:1:name", "First");
    store.write("task:10:name", "Other");
    store.clear("task:1");
    expect(store.read("task:1:name", "Saved")).toBe("Saved");
    expect(store.read("task:10:name", "Saved")).toBe("Other");
  });
});
