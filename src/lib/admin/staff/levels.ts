// Type-only: this module also runs in the browser, and rbac.ts pulls in the database client.
import type { RoleName } from "@/lib/auth/rbac";

/**
 * Access levels the team screen offers, mapped onto the canonical roles (ADR-003). "ADMIN" is
 * not a role: it is the three operational roles together.
 */
export const STAFF_LEVELS = [
  "SUPER_ADMIN",
  "ADMIN",
  "ADMIN_CATALOG",
  "ADMIN_ORDERS",
  "ADMIN_SUPPORT",
] as const;

export type StaffLevel = (typeof STAFF_LEVELS)[number];

/** What a member's current roles amount to; CUSTOM covers two of the three operational roles. */
export type StaffStanding = StaffLevel | "CUSTOM";

const OPERATIONAL_ROLES: RoleName[] = ["ADMIN_CATALOG", "ADMIN_ORDERS", "ADMIN_SUPPORT"];

export const LEVEL_ROLES: Readonly<Record<StaffLevel, readonly RoleName[]>> = {
  SUPER_ADMIN: ["SUPER_ADMIN"],
  ADMIN: OPERATIONAL_ROLES,
  ADMIN_CATALOG: ["ADMIN_CATALOG"],
  ADMIN_ORDERS: ["ADMIN_ORDERS"],
  ADMIN_SUPPORT: ["ADMIN_SUPPORT"],
};

export const STANDING_LABELS: Readonly<Record<StaffStanding, string>> = {
  SUPER_ADMIN: "Superadministrador",
  ADMIN: "Administrador",
  ADMIN_CATALOG: "Catálogo",
  ADMIN_ORDERS: "Pedidos y pagos",
  ADMIN_SUPPORT: "Soporte",
  CUSTOM: "Varias áreas",
};

/** What each level can do, in the operator's words; shown in the form and the confirmation. */
export const LEVEL_SUMMARIES: Readonly<Record<StaffLevel, string>> = {
  SUPER_ADMIN:
    "Acceso total: equipo y roles, inventario, credenciales de IA y exportación de auditoría, además de toda la operación.",
  ADMIN:
    "Operación completa: catálogo, home, menú, pedidos, pagos y soporte. No gestiona el equipo, el inventario ni las credenciales de IA.",
  ADMIN_CATALOG: "Productos, categorías, marcas, home, menú y asistente IA de productos.",
  ADMIN_ORDERS: "Pedidos, envíos y verificación de pagos Yape/Plin.",
  ADMIN_SUPPORT: "Atención de consultas, devoluciones y garantías.",
};

const STAFF_ROLES: readonly RoleName[] = ["SUPER_ADMIN", ...OPERATIONAL_ROLES];

export function isStaffRole(role: RoleName): boolean {
  return STAFF_ROLES.includes(role);
}

/** Reads a member's roles as a level; null when they hold no staff role. */
export function standingOf(roles: readonly RoleName[]): StaffStanding | null {
  if (roles.includes("SUPER_ADMIN")) return "SUPER_ADMIN";
  const operational = OPERATIONAL_ROLES.filter((role) => roles.includes(role));
  if (operational.length === OPERATIONAL_ROLES.length) return "ADMIN";
  if (operational.length === 1) return operational[0] as StaffLevel;
  if (operational.length > 1) return "CUSTOM";
  return null;
}

export type StaffChangeError = "SELF_CHANGE" | "LAST_SUPER_ADMIN" | "NO_CHANGE" | "NOT_STAFF";

export type StaffChangePlan =
  | {
      ok: true;
      action: "grant" | "change" | "revoke";
      add: RoleName[];
      remove: RoleName[];
      previousRoles: RoleName[];
      nextRoles: RoleName[];
    }
  | { ok: false; error: StaffChangeError };

export interface StaffChangeInput {
  actorAuthUserId: string;
  targetAuthUserId: string;
  /** Every role the target holds now, staff or not. */
  targetRoles: readonly RoleName[];
  /** null revokes administrative access. */
  nextLevel: StaffLevel | null;
  /** Distinct users holding SUPER_ADMIN, counted under the same lock as the change. */
  superAdminCount: number;
}

/**
 * Computes the role diff for a change and enforces the guardrails: nobody changes their own
 * access (a super admin cannot demote or lock out themselves), and the last SUPER_ADMIN is never
 * removed. Non-staff roles are left untouched.
 */
export function planStaffChange(input: StaffChangeInput): StaffChangePlan {
  if (input.actorAuthUserId === input.targetAuthUserId) return { ok: false, error: "SELF_CHANGE" };

  const previousRoles = input.targetRoles.filter(isStaffRole);
  const nextRoles = input.nextLevel ? [...LEVEL_ROLES[input.nextLevel]] : [];

  if (previousRoles.length === 0 && nextRoles.length === 0)
    return { ok: false, error: "NOT_STAFF" };

  const sameRoles =
    previousRoles.length === nextRoles.length &&
    nextRoles.every((role) => previousRoles.includes(role));
  if (sameRoles) return { ok: false, error: "NO_CHANGE" };

  const losesSuperAdmin =
    previousRoles.includes("SUPER_ADMIN") && !nextRoles.includes("SUPER_ADMIN");
  if (losesSuperAdmin && input.superAdminCount <= 1)
    return { ok: false, error: "LAST_SUPER_ADMIN" };

  return {
    ok: true,
    action: previousRoles.length === 0 ? "grant" : nextRoles.length === 0 ? "revoke" : "change",
    add: nextRoles.filter((role) => !previousRoles.includes(role)),
    remove: previousRoles.filter((role) => !nextRoles.includes(role)),
    previousRoles,
    nextRoles,
  };
}

export const STAFF_CHANGE_MESSAGES: Readonly<Record<StaffChangeError, string>> = {
  SELF_CHANGE: "No puedes cambiar tu propio acceso. Pídele a otro superadministrador que lo haga.",
  LAST_SUPER_ADMIN:
    "Es el último superadministrador. Asigna ese nivel a otra persona antes de cambiar este acceso.",
  NO_CHANGE: "Esa persona ya tiene ese nivel de acceso.",
  NOT_STAFF: "Esa persona no tiene acceso administrativo.",
};
