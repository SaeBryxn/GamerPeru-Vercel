import { AdminForbidden } from "@/components/admin/admin-forbidden";
import { getVerifiedAuthContext } from "@/lib/auth/rbac";
import { getResearchWorkspaceBootstrap } from "@/lib/ai/admin/readers";
import { AiImportWorkspace } from "./workspace";

export const dynamic = "force-dynamic";

export default async function AiImportPage() {
  const authContext = await getVerifiedAuthContext();
  if (authContext.status !== "READY" || !authContext.permissions.has("catalog:ai_research")) {
    return (
      <AdminForbidden email={authContext.status === "READY" ? authContext.email : undefined} />
    );
  }
  const bootstrap = await getResearchWorkspaceBootstrap({ authContext });
  return (
    <AiImportWorkspace
      {...bootstrap}
      canManageAiSettings={authContext.permissions.has("ai:manage_credentials")}
    />
  );
}
