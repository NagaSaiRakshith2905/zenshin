import "server-only";
import { getDatabase } from "@/server/db";
import { getAuthEnv } from "@/server/env";
import { createOwnerAuth } from "./config";

let auth: ReturnType<typeof createOwnerAuth> | undefined;
export function getAuth() {
  auth ??= createOwnerAuth(getDatabase(), getAuthEnv());
  return auth;
}
