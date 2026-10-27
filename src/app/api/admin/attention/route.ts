import { adminJson, withAdminAccess } from "@/lib/admin/admin-api";
import { buildAttentionSnapshot, fetchStoreSnapshot } from "@/lib/admin/dashboard-overview";

export const dynamic = "force-dynamic";

/** Pending work for the sidebar badges and the bell: one aggregate query, filtered by role. */
export function GET() {
  return withAdminAccess(async (can) => {
    const snapshot = await fetchStoreSnapshot(can);
    return adminJson(buildAttentionSnapshot(snapshot, can, new Date()));
  });
}
