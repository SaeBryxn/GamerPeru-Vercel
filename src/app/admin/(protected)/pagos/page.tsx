import React from "react";
import type { Metadata } from "next";
import { getVerifiedAuthContext } from "@/lib/auth/rbac";
import { AdminForbidden } from "@/components/admin/admin-forbidden";
import { listPaymentVerificationQueue } from "@/lib/payments/verification-queue";
import { VerificationWorkspace } from "./verification-workspace";

export const metadata: Metadata = {
  title: "Verificación de pagos | Administración",
};

export const dynamic = "force-dynamic";

export default async function PaymentVerificationPage() {
  const authContext = await getVerifiedAuthContext();

  if (authContext.status !== "READY" || !authContext.permissions.has("orders:verify")) {
    return (
      <AdminForbidden email={authContext.status === "READY" ? authContext.email : undefined} />
    );
  }

  const queue = await listPaymentVerificationQueue();

  return (
    <VerificationWorkspace
      queue={queue}
      currentUserId={authContext.authUserId}
      canReleaseOthers={authContext.permissions.has("staff:manage")}
      renderedAt={new Date().toISOString()}
    />
  );
}
