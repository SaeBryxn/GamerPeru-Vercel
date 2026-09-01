import "server-only";

import { cache } from "react";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { roles, permissions, rolePermissions, userRoles } from "@/db/schema";
import { getVerifiedIdentity } from "@/lib/auth/claims";
import { logger } from "@/lib/logger";

/**
 * Canonical Gamer Perú v1 Roles (ADR-003)
 */
export const CANONICAL_ROLES = [
  "SUPER_ADMIN",
  "ADMIN_CATALOG",
  "ADMIN_ORDERS",
  "ADMIN_SUPPORT",
  "CUSTOMER",
] as const;

export type RoleName = (typeof CANONICAL_ROLES)[number];

/**
 * Canonical Gamer Perú Staff Roles (Authorized for Admin Foundation)
 */
export const CANONICAL_STAFF_ROLES: RoleName[] = [
  "SUPER_ADMIN",
  "ADMIN_CATALOG",
  "ADMIN_ORDERS",
  "ADMIN_SUPPORT",
];

/**
 * Canonical Gamer Perú Permissions (v1.1 — includes inventory:manage from GP-022)
 */
export const CANONICAL_PERMISSIONS = [
  "staff:manage",
  "ai:manage_credentials",
  "audit:export",
  "catalog:manage",
  "catalog:publish",
  "catalog:ai_research",
  "orders:manage",
  "orders:verify",
  "support:manage",
  "support:review_rma",
  "inventory:manage",
] as const;

export type PermissionName = (typeof CANONICAL_PERMISSIONS)[number];

/**
 * Server-only Typed Authorization Errors
 */
export class AuthenticationRequiredError extends Error {
  readonly code = "AUTHENTICATION_REQUIRED" as const;
  constructor(message = "Debes iniciar sesión para realizar esta acción.") {
    super(message);
    this.name = "AuthenticationRequiredError";
  }
}

export class ForbiddenError extends Error {
  readonly code = "FORBIDDEN" as const;
  constructor(message = "No tienes permisos para realizar esta acción.") {
    super(message);
    this.name = "ForbiddenError";
  }
}

export class AuthorizationUnavailableError extends Error {
  readonly code = "AUTHORIZATION_UNAVAILABLE" as const;
  constructor(message = "El servicio de autorización no está disponible en este momento.") {
    super(message);
    this.name = "AuthorizationUnavailableError";
  }
}

/**
 * Discriminated Verified Authorization Context Results
 */
export interface VerifiedAuthContextReady {
  status: "READY";
  authUserId: string;
  email: string | null;
  roles: RoleName[];
  permissions: Set<PermissionName>;
}

export interface VerifiedAuthContextUnauthenticated {
  status: "UNAUTHENTICATED";
  authUserId: null;
  email: null;
  roles: [];
  permissions: Set<never>;
}

export interface VerifiedAuthContextError {
  status: "ERROR";
  error: "rbac_resolution_failed";
  authUserId: string | null;
  email: string | null;
  roles: [];
  permissions: Set<never>;
}

export type VerifiedAuthContext =
  VerifiedAuthContextReady | VerifiedAuthContextUnauthenticated | VerifiedAuthContextError;

/**
 * Internal helper to resolve roles and permissions from direct PostgreSQL
 * exclusively for a cryptographically verified auth_user_id.
 */
async function resolveRbacForVerifiedAuthUserId(authUserId: string): Promise<{
  roles: RoleName[];
  permissions: Set<PermissionName>;
}> {
  const rows = await db
    .select({
      roleName: roles.name,
      permissionName: permissions.name,
    })
    .from(userRoles)
    .innerJoin(roles, eq(userRoles.roleId, roles.id))
    .leftJoin(rolePermissions, eq(roles.id, rolePermissions.roleId))
    .leftJoin(permissions, eq(rolePermissions.permissionId, permissions.id))
    .where(eq(userRoles.authUserId, authUserId));

  const resolvedRoles = new Set<RoleName>();
  const resolvedPermissions = new Set<PermissionName>();

  for (const row of rows) {
    if (!CANONICAL_ROLES.includes(row.roleName as RoleName)) {
      continue;
    }

    resolvedRoles.add(row.roleName as RoleName);

    if (
      row.permissionName &&
      CANONICAL_PERMISSIONS.includes(row.permissionName as PermissionName)
    ) {
      resolvedPermissions.add(row.permissionName as PermissionName);
    }
  }

  return {
    roles: Array.from(resolvedRoles),
    permissions: resolvedPermissions,
  };
}

/**
 * Resolves the authoritative authentication and RBAC context for the current request.
 * Derives user identity strictly via cryptographic token verification (getVerifiedIdentity).
 * Request-scoped memoization via React cache() ensures identity and PostgreSQL queries run once per request.
 */
export const getVerifiedAuthContext = cache(async (): Promise<VerifiedAuthContext> => {
  const verified = await getVerifiedIdentity();
  if (!verified.success) {
    return {
      status: "UNAUTHENTICATED",
      authUserId: null,
      email: null,
      roles: [],
      permissions: new Set(),
    };
  }

  try {
    const { roles: userRoleList, permissions: userPermSet } =
      await resolveRbacForVerifiedAuthUserId(verified.identity.authUserId);

    return {
      status: "READY",
      authUserId: verified.identity.authUserId,
      email: verified.identity.email ?? null,
      roles: userRoleList,
      permissions: userPermSet,
    };
  } catch {
    logger.error({
      event: "rbac_resolution_failed",
    });
    return {
      status: "ERROR",
      error: "rbac_resolution_failed",
      authUserId: verified.identity.authUserId,
      email: verified.identity.email ?? null,
      roles: [],
      permissions: new Set(),
    };
  }
});

/**
 * Evaluates whether a resolved auth context qualifies for Admin shell entry.
 * Single source of truth for the Admin shell entry policy:
 * 1. Must be in READY state
 * 2. Must possess at least one canonical staff role
 * 3. Must possess at least one canonical permission
 */
export function hasAdminShellAccess(context: VerifiedAuthContext): boolean {
  if (context.status !== "READY") {
    return false;
  }
  const hasStaffRole = context.roles.some((role) => CANONICAL_STAFF_ROLES.includes(role));
  const hasPermissions = context.permissions.size > 0;
  return hasStaffRole && hasPermissions;
}

/**
 * Authoritative server guard for Admin layout and protected routes.
 * Takes ZERO caller-controlled identity arguments.
 *
 * Rules:
 * 1. Unauthenticated -> throws AuthenticationRequiredError
 * 2. RBAC DB resolution failure -> throws AuthorizationUnavailableError
 * 3. Authenticated CUSTOMER or user with 0 staff roles/permissions -> throws ForbiddenError
 * 4. Authorized staff -> returns VerifiedAuthContextReady
 */
export async function requireAdminAccess(): Promise<VerifiedAuthContextReady> {
  const context = await getVerifiedAuthContext();

  if (context.status === "UNAUTHENTICATED") {
    throw new AuthenticationRequiredError();
  }

  if (context.status === "ERROR") {
    throw new AuthorizationUnavailableError();
  }

  if (!hasAdminShellAccess(context)) {
    throw new ForbiddenError("No tienes permisos de personal para acceder a la administración.");
  }

  return context;
}

/**
 * Returns the resolved set of canonical permissions for the current authenticated user.
 * Takes NO caller-provided authUserId.
 * Throws AuthorizationUnavailableError if RBAC backend is unavailable.
 */
export async function getUserPermissions(): Promise<Set<PermissionName>> {
  const context = await getVerifiedAuthContext();
  if (context.status === "READY") {
    return context.permissions;
  }
  if (context.status === "UNAUTHENTICATED") {
    return new Set();
  }
  throw new AuthorizationUnavailableError();
}

/**
 * Evaluates whether the current authenticated user possesses the requested permission.
 * Fails closed on unauthenticated sessions, unknown permissions, or database errors.
 */
export async function hasPermission(permission: PermissionName | string): Promise<boolean> {
  const context = await getVerifiedAuthContext();
  if (context.status === "UNAUTHENTICATED" || context.status === "ERROR") {
    return false;
  }
  if (!CANONICAL_PERMISSIONS.includes(permission as PermissionName)) {
    return false;
  }
  return context.permissions.has(permission as PermissionName);
}

/**
 * Authoritative server guard for Server Actions, Route Handlers, and Server Components.
 * Throws typed errors on unauthenticated, forbidden, or unavailable states.
 */
export async function requirePermission(
  permission: PermissionName | string
): Promise<VerifiedAuthContextReady> {
  const context = await getVerifiedAuthContext();

  if (context.status === "UNAUTHENTICATED") {
    throw new AuthenticationRequiredError();
  }

  if (context.status === "ERROR") {
    throw new AuthorizationUnavailableError();
  }

  if (
    !CANONICAL_PERMISSIONS.includes(permission as PermissionName) ||
    !context.permissions.has(permission as PermissionName)
  ) {
    throw new ForbiddenError();
  }

  return context;
}
