"use client";
import { createContext, useContext, useEffect, useId, useRef, type ComponentProps } from "react";

export type FieldIssue = { path: PropertyKey[]; message: string };
export function validationIssues(error: unknown): FieldIssue[] {
  if (!error || typeof error !== "object") return [];
  const value = error as { fields?: unknown; details?: { fields?: unknown } };
  const fields = value.fields ?? value.details?.fields;
  return Array.isArray(fields) ? fields.filter((field): field is FieldIssue => field && Array.isArray(field.path) && typeof field.message === "string") : [];
}
export function issueField(issue: FieldIssue) {
  return String(issue.path[0] === "input" ? issue.path[1] ?? "" : issue.path[0] ?? "");
}
const Validation = createContext<{ id: string; issues: FieldIssue[] } | null>(null);
export const useFormValidation = () => useContext(Validation);
export function useFieldValidation(name?: string) {
  const form = useFormValidation();
  return { id: form && name ? `${form.id}-${name}` : undefined, error: form?.issues.filter((issue) => issueField(issue) === name).map((issue) => issue.message).join(" ") };
}

export function ErrorSummary({ issues, linked = false }: { issues: FieldIssue[]; linked?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const signature = JSON.stringify(issues);
  useEffect(() => { if (signature !== "[]") ref.current?.focus(); }, [signature]);
  if (!issues.length) return null;
  return <div ref={ref} role="alert" tabIndex={-1} className="rounded-lg border border-destructive p-3 text-sm text-destructive outline-offset-2"><p className="font-medium">Check the following fields</p><ul className="mt-2 flex list-inside list-disc flex-col gap-1">{issues.map((issue, index) => <li key={index}>{linked ? <a href="#" className="underline" onClick={(event) => {
    event.preventDefault();
    const name = CSS.escape(issueField(issue));
    const form = ref.current?.closest("form");
    const target = form?.querySelector<HTMLElement>(`[name="${name}"], [data-field="${name}"]`);
    const control = target?.matches("input,select,textarea,button") ? target : target?.querySelector<HTMLElement>("input,select,textarea,button");
    control?.focus(); target?.scrollIntoView({ block: "nearest" });
  }}>{issue.message}</a> : issue.message}</li>)}</ul></div>;
}

export function ValidationForm({ error, issues = validationIssues(error), busy = false, children, ...props }: ComponentProps<"form"> & { error?: unknown; issues?: FieldIssue[]; busy?: boolean }) {
  const id = useId();
  return <Validation.Provider value={{ id, issues }}><form {...props} aria-busy={busy || props["aria-busy"]}><ErrorSummary issues={issues} linked /><fieldset disabled={busy || props["aria-busy"] === true} className="flex min-w-0 flex-col gap-[inherit] border-0 p-0">{children}</fieldset></form></Validation.Provider>;
}
