import "server-only";

import {
  AuthenticationRequiredError,
  AuthorizationUnavailableError,
  ForbiddenError,
  requirePermission,
  type VerifiedAuthContextReady,
} from "@/lib/auth/rbac";

export async function requireOrdersAdmin(): Promise<
  | { authorized: true; context: VerifiedAuthContextReady }
  | { authorized: false; code: "NOT_AVAILABLE" | "SYSTEM_ERROR" }
> {
  try {
    return { authorized: true, context: await requirePermission("orders:manage") };
  } catch (error) {
    if (error instanceof AuthorizationUnavailableError) {
      return { authorized: false, code: "SYSTEM_ERROR" };
    }
    if (error instanceof AuthenticationRequiredError || error instanceof ForbiddenError) {
      return { authorized: false, code: "NOT_AVAILABLE" };
    }
    return { authorized: false, code: "SYSTEM_ERROR" };
  }
}
