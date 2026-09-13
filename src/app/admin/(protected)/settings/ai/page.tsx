import { AdminForbidden } from "@/components/admin/admin-forbidden";
import { getVerifiedAuthContext } from "@/lib/auth/rbac";
import { getAdminAiSettings } from "@/lib/ai/admin/readers";
import { AiSettingsWorkspace } from "./settings-workspace";

export const dynamic = "force-dynamic";

export default async function AiSettingsPage() {
  const authContext = await getVerifiedAuthContext();
  if (authContext.status !== "READY" || !authContext.permissions.has("ai:manage_credentials")) {
    return (
      <AdminForbidden email={authContext.status === "READY" ? authContext.email : undefined} />
    );
  }
  const settings = await getAdminAiSettings({ authContext });
  return <AiSettingsWorkspace initialSettings={settings} />;
}
