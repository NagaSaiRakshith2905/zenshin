// Reuse schema-affecting options in both runtime auth and the offline generator.
export const authRateLimit = {
  enabled: true, storage: "database", window: 60, max: 120,
  customRules: { "/sign-in/social": { window: 60, max: 10 } },
} as const;
