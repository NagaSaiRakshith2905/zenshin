import { expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { actionScopes, type AgentActor } from "@/server/auth/access";
import type { Database } from "@/server/db";
import { createExportService } from "./exports";

it("enforces owner-only export service access before any database or storage operation", async () => {
  const agent: AgentActor = { kind: "agent", ownerId: "github:42", credentialId: "credential", scopes: actionScopes, projectIds: ["project"] };
  const forbidden = () => { throw new Error("Database or storage reached before authorization."); };
  const service = createExportService(new Proxy({}, { get: forbidden }) as Database, forbidden);
  await expect(service.request(agent, {})).rejects.toMatchObject({ code: "forbidden" });
  await expect(service.list(agent, {})).rejects.toMatchObject({ code: "forbidden" });
  await expect(service.download(agent, {})).rejects.toMatchObject({ code: "forbidden" });
});
