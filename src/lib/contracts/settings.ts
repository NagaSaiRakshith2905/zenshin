import { z } from "zod";

export const preferenceValuesSchema = z.strictObject({
  timezone: z.string().min(1).max(100).refine((zone) => {
    try { new Intl.DateTimeFormat("en", { timeZone: zone }); return !/^[+-]/.test(zone); } catch { return false; }
  }, "Choose a valid IANA timezone."),
  theme: z.enum(["system", "light", "dark"]),
  defaultTaskView: z.enum(["list", "board", "calendar"]),
});
export const updatePreferencesSchema = preferenceValuesSchema.extend({ expectedRevision: z.number().int().positive() });
const credentialPolicySchema = z.strictObject({
  displayName: z.string().trim().min(1).max(120),
  projectIds: z.array(z.uuid()).min(1).max(100).refine((ids) => new Set(ids).size === ids.length),
  preset: z.enum(["read_only", "contributor"]),
  archive: z.boolean().default(false), complete: z.boolean().default(false),
});
export const createCredentialSchema = credentialPolicySchema.extend({ expiresInDays: z.number().int().min(1).max(3650).nullable().default(90) });
export const updateCredentialSchema = credentialPolicySchema.extend({ expectedRevision: z.number().int().positive() });
export const revokeCredentialSchema = z.strictObject({ expectedRevision: z.number().int().positive() });
export const credentialIdSchema = z.uuid();

export function credentialScopes(policy: z.infer<typeof credentialPolicySchema>) {
  return ["read", ...(policy.preset === "contributor" ? ["write", "upload"] : []),
    ...(policy.archive ? ["archive"] : []), ...(policy.complete ? ["complete"] : [])];
}

export type Preferences = z.infer<typeof preferenceValuesSchema> & { revision: number };
export type CredentialPolicy = z.infer<typeof updateCredentialSchema>;
export type CreateCredential = z.infer<typeof createCredentialSchema>;
export type CredentialSummary = {
  id: string; displayName: string; scopes: string[]; projectIds: string[]; revision: number;
  createdAt: string; expiresAt: string | null; lastUsedAt: string | null;
  status: "active" | "expired" | "revoked";
};
export type CredentialSettings = {
  credentials: CredentialSummary[];
  projects: { id: string; name: string; archived: boolean }[];
};
