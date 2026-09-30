"use client";

import React, { useEffect } from "react";
import { AdminError } from "@/components/admin/admin-error";
import { reportClientError } from "@/lib/observability/report-client-error";

export default function AdminProtectedError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    reportClientError(error);
  }, [error]);

  return <AdminError error={error} reset={reset} reason="load" />;
}
