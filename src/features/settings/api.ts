"use client";

import type { FieldIssue } from "@/features/work/validation";

export class SettingsError extends Error {
  constructor(message: string, public fields: FieldIssue[] = []) { super(message); }
}

export async function settingsRequest<T>(path: string, method = "GET", body?: unknown): Promise<T> {
  const response = await fetch(`/api/v1/settings/${path}`, {
    method, credentials: "same-origin", cache: "no-store",
    ...(body === undefined ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
  });
  const data = await response.json();
  if (!response.ok) throw new SettingsError(data.error?.message ?? "Could not load or save settings. Try again.", data.error?.fields ?? data.error?.details?.fields ?? []);
  return data as T;
}
