import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ pending: false }));
vi.mock("./action", () => ({ useAction: () => ({ pending: state.pending, notice: "", error: null, run: vi.fn() }), ActionFeedback: () => null }));
vi.mock("./api", () => ({ useCollection: (resource: string) => ({
  items: resource === "statuses" ? [{ id: "status", name: "In progress", category: "in_progress" }] : resource === "properties" ? [{ id: "area", name: "Area", type: "text", icon: null, options: [] }] : [],
  error: null, hasNextPage: false, refetch: vi.fn(),
}) }));
import { DatePicker } from "./date-picker";
import { TaskProperties } from "./task-properties";
import { TextField } from "./primitives";
import { ValidationForm } from "./validation";
import type { Task } from "./types";

afterEach(() => { state.pending = false; });
describe("accessible editing surfaces", () => {
  it("exposes calendar rows and a single tabbable date", () => {
    const html = renderToStaticMarkup(createElement(DatePicker, { value: "2026-11-04", label: "Due date", pick: vi.fn() }));
    expect(html.match(/role="row"/g)).toHaveLength(7);
    expect(html.match(/role="gridcell"/g)).toHaveLength(42);
    expect(html.match(/tabindex="0"/g)).toHaveLength(1);
    expect(html).toContain('aria-selected="true"');
  });
  it("names properties with their field context and current value", () => {
    const task = { id: "task", projectId: "project", revision: 1, statusId: "status", category: "in_progress", priority: "high", dueDate: null, labelIds: [], properties: { area: "Workspace" } } as unknown as Task;
    const html = renderToStaticMarkup(createElement(TaskProperties, { task }));
    expect(html).toContain('aria-label="Area: Workspace"');
    expect(html).toContain("Status: ");
    expect(html).toContain("In progress");
    expect(html).toContain("aria-labelledby=");
  });
  it("locks property editing while a request is pending, including popover triggers", () => {
    state.pending = true;
    const task = { id: "task", projectId: "project", revision: 1, statusId: "status", category: "in_progress", priority: "none", dueDate: null, labelIds: [], properties: {} } as unknown as Task;
    const html = renderToStaticMarkup(createElement(TaskProperties, { task }));
    expect(html).toContain('<fieldset disabled="" aria-busy="true"');
    expect(html.match(/class="property-value" disabled=""/g)).toHaveLength(4);
    expect(html).toContain("Saving task properties");
  });
  it("associates server validation with the input and provides summary navigation", () => {
    const error = { details: { fields: [{ path: ["input", "title"], message: "Enter a title." }] } };
    const html = renderToStaticMarkup(createElement(ValidationForm, { error }, createElement(TextField, { name: "title", label: "Title", value: "", readOnly: true })));
    expect(html).toContain('aria-invalid="true"');
    expect(html).toContain('aria-describedby="');
    expect(html).toContain("Check the following fields");
    expect(html).toContain("Enter a title.</a>");
    expect(html).toContain('data-slot="field-error"');
  });
});
