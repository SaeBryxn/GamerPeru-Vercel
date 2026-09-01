"use client";

import React, { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";
import { AdminError } from "@/components/admin/admin-error";

export default function AdminProtectedError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return <AdminError error={error} reset={reset} />;
}
