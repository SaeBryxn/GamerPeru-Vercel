import React from "react";
import { redirect } from "next/navigation";
import {
  getVerifiedAuthContext,
  CANONICAL_STAFF_ROLES,
  AuthorizationUnavailableError,
} from "@/lib/auth/rbac";
import { AdminShell } from "@/components/admin/admin-shell";
import { AdminForbidden } from "@/components/admin/admin-forbidden";

export const dynamic = "force-dynamic";

export default async function AdminProtectedLayout({ children }: { children: React.ReactNode }) {
  const authContext = await getVerifiedAuthContext();

  if (authContext.status === "UNAUTHENTICATED") {
    redirect("/auth/login?redirect=%2Fadmin");
  }

  if (authContext.status === "ERROR") {
    throw new AuthorizationUnavailableError();
  }

  const isStaff =
    authContext.roles.some((role) => CANONICAL_STAFF_ROLES.includes(role)) &&
    authContext.permissions.size > 0;

  if (!isStaff) {
    return <AdminForbidden email={authContext.email} />;
  }

  return <AdminShell authContext={authContext}>{children}</AdminShell>;
}
