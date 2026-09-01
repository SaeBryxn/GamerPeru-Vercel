import React from "react";
import { redirect } from "next/navigation";
import { getVerifiedAuthContext, hasAdminShellAccess } from "@/lib/auth/rbac";
import { AdminShell } from "@/components/admin/admin-shell";
import { AdminForbidden } from "@/components/admin/admin-forbidden";
import { AdminError } from "@/components/admin/admin-error";

export const dynamic = "force-dynamic";

export default async function AdminProtectedLayout({ children }: { children: React.ReactNode }) {
  const authContext = await getVerifiedAuthContext();

  if (authContext.status === "UNAUTHENTICATED") {
    redirect("/auth/login?redirect=%2Fadmin");
  }

  if (authContext.status === "ERROR") {
    return <AdminError />;
  }

  if (!hasAdminShellAccess(authContext)) {
    return <AdminForbidden email={authContext.email} />;
  }

  return <AdminShell authContext={authContext}>{children}</AdminShell>;
}
