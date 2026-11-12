const sections = ["preferences", "credentials", "archived", "exports", "health", "general", "statuses", "labels", "properties", "github"] as const;
export type SettingsSection = typeof sections[number];

export function readSettingsLocation(search: URLSearchParams) {
  const raw = search.get("settings");
  const section = sections.find((value) => value === raw) ?? (search.get("github") === "setup" ? "github" : null);
  const project = search.get("settingsProject") ?? "";
  return { section, projectId: /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(project) ? project : "" };
}

export function settingsHref(path: string, search: URLSearchParams, section: SettingsSection | null, projectId = "") {
  const next = new URLSearchParams(search);
  next.delete("settings"); next.delete("settingsProject");
  if (next.get("github") === "setup") next.delete("github");
  if (section) { next.set("settings", section); if (projectId) next.set("settingsProject", projectId); }
  return `${path}${next.size ? `?${next}` : ""}`;
}
