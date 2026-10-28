import { WorkspaceAccess } from "@/features/settings/workspace";
import { requireOwnerPage } from "@/server/auth/page";
import { getDatabase } from "@/server/db";
import { getAuthEnv } from "@/server/env";
import { createSettingsService } from "@/server/services/settings";

export default async function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  const actor = await requireOwnerPage();
  const preferences = await createSettingsService(getDatabase(), getAuthEnv()).preferences(actor);
  return <WorkspaceAccess preferences={preferences}>{children}</WorkspaceAccess>;
}
