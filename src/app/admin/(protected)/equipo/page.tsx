import React from "react";
import type { Metadata } from "next";
import { AdminForbidden } from "@/components/admin/admin-forbidden";
import { getVerifiedAuthContext } from "@/lib/auth/rbac";
import { listStaffMembers } from "@/lib/admin/staff/service";
import { TeamWorkspace, type TeamMemberView } from "./team-workspace";

export const metadata: Metadata = {
  title: "Equipo | Administración",
};

export const dynamic = "force-dynamic";

const CHANGED_AT_FORMAT = new Intl.DateTimeFormat("es-PE", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "America/Lima",
});

export default async function TeamPage() {
  const authContext = await getVerifiedAuthContext();

  if (authContext.status !== "READY" || !authContext.permissions.has("staff:manage")) {
    return (
      <AdminForbidden email={authContext.status === "READY" ? authContext.email : undefined} />
    );
  }

  const members = await listStaffMembers();
  const superAdminCount = members.filter((member) => member.standing === "SUPER_ADMIN").length;

  const views: TeamMemberView[] = members.map((member) => ({
    authUserId: member.authUserId,
    email: member.email,
    name: member.name,
    standing: member.standing,
    // Formatted here so server and browser render the same text.
    lastChanged: member.lastChangedAt
      ? CHANGED_AT_FORMAT.format(new Date(member.lastChangedAt))
      : null,
    isSelf: member.authUserId === authContext.authUserId,
    isLastSuperAdmin: member.standing === "SUPER_ADMIN" && superAdminCount <= 1,
  }));

  return <TeamWorkspace members={views} />;
}
