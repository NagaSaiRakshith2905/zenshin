import { betterAuth } from "better-auth";
import { apiKey } from "@better-auth/api-key";
import { apiKeyOptions } from "../src/server/auth/api-key-options";
import { authRateLimit } from "../src/server/auth/schema-options";

// Schema generation only; no routes, provider credentials, or database connection.
// Phase 3 must reuse these schema-affecting options in the runtime configuration.
export const auth = betterAuth({
  baseURL: "http://localhost:3000",
  rateLimit: authRateLimit,
  plugins: [apiKey(apiKeyOptions)],
});
