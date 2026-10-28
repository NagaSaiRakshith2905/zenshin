import { betterAuth } from "better-auth";
import { apiKey } from "@better-auth/api-key";

// Schema generation only; no routes, provider credentials, or database connection.
// Phase 3 must reuse these schema-affecting options in the runtime configuration.
export const auth = betterAuth({
  baseURL: "http://localhost:3000",
  plugins: [apiKey({ enableSessionForAPIKeys: false })],
});
