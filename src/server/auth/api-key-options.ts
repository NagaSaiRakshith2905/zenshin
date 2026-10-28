import type { ApiKeyConfigurationOptions } from "@better-auth/api-key";

// Shared with offline schema generation. All key management uses owner services.
export const apiKeyOptions = {
  enableSessionForAPIKeys: false,
  defaultPrefix: "zenshin_",
  minimumNameLength: 1, maximumNameLength: 120,
  // The owner service supplies the 90-day default; null remains an explicit no-expiry choice.
  keyExpiration: { defaultExpiresIn: null, minExpiresIn: 1, maxExpiresIn: 3650 },
  rateLimit: { enabled: true, timeWindow: 60_000, maxRequests: 120 },
  deferUpdates: false,
} satisfies ApiKeyConfigurationOptions;
