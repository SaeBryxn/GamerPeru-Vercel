import "server-only";

import { NextResponse } from "next/server";
import {
  AuthenticationRequiredError,
  ForbiddenError,
  requireAdminAccess,
  type PermissionName,
} from "@/lib/auth/rbac";

/** Per-operator data: never stored by a shared cache. */
const PRIVATE = { "Cache-Control": "private, no-store" };

export function adminJson(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: PRIVATE });
}

/**
 * Runs a read-only admin endpoint for the signed-in staff member, with their permission check.
 * Auth failures answer with a status and no data; anything else is a 503.
 */
export async function withAdminAccess(
  handler: (can: (permission: PermissionName) => boolean) => Promise<Response>
): Promise<Response> {
  try {
    const auth = await requireAdminAccess();
    return await handler((permission) => auth.permissions.has(permission));
  } catch (error) {
    if (error instanceof AuthenticationRequiredError)
      return adminJson({ error: "UNAUTHENTICATED" }, 401);
    if (error instanceof ForbiddenError) return adminJson({ error: "FORBIDDEN" }, 403);
    return adminJson({ error: "UNAVAILABLE" }, 503);
  }
}
