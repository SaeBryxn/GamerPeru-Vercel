import { describe, expect, it } from "vitest";
import {
  LEVEL_ROLES,
  STAFF_LEVELS,
  planStaffChange,
  standingOf,
  type StaffChangeInput,
} from "@/lib/admin/staff/levels";

const ACTOR = "0193b057-0000-7000-8000-0000000000a1";
const TARGET = "0193b057-0000-7000-8000-0000000000b2";

function plan(overrides: Partial<StaffChangeInput>) {
  return planStaffChange({
    actorAuthUserId: ACTOR,
    targetAuthUserId: TARGET,
    targetRoles: [],
    nextLevel: "ADMIN",
    superAdminCount: 2,
    ...overrides,
  });
}

describe("Staff levels", () => {
  it("maps Administrador to the three operational roles and never to SUPER_ADMIN", () => {
    expect(LEVEL_ROLES.ADMIN).toEqual(["ADMIN_CATALOG", "ADMIN_ORDERS", "ADMIN_SUPPORT"]);
    for (const level of STAFF_LEVELS.filter((option) => option !== "SUPER_ADMIN")) {
      expect(LEVEL_ROLES[level]).not.toContain("SUPER_ADMIN");
    }
  });

  it("reads a member's roles as a level", () => {
    expect(standingOf(["SUPER_ADMIN", "ADMIN_CATALOG"])).toBe("SUPER_ADMIN");
    expect(standingOf(["ADMIN_CATALOG", "ADMIN_ORDERS", "ADMIN_SUPPORT"])).toBe("ADMIN");
    expect(standingOf(["ADMIN_ORDERS", "CUSTOMER"])).toBe("ADMIN_ORDERS");
    expect(standingOf(["ADMIN_CATALOG", "ADMIN_ORDERS"])).toBe("CUSTOM");
    expect(standingOf(["CUSTOMER"])).toBeNull();
  });
});

describe("Staff change planner", () => {
  it("grants a level to an account without staff roles", () => {
    const result = plan({ targetRoles: ["CUSTOMER"], nextLevel: "ADMIN" });
    expect(result).toEqual({
      ok: true,
      action: "grant",
      add: ["ADMIN_CATALOG", "ADMIN_ORDERS", "ADMIN_SUPPORT"],
      remove: [],
      previousRoles: [],
      nextRoles: ["ADMIN_CATALOG", "ADMIN_ORDERS", "ADMIN_SUPPORT"],
    });
  });

  it("promotes to SUPER_ADMIN replacing the operational roles", () => {
    const result = plan({
      targetRoles: ["ADMIN_CATALOG", "ADMIN_ORDERS", "ADMIN_SUPPORT"],
      nextLevel: "SUPER_ADMIN",
    });
    expect(result).toMatchObject({
      ok: true,
      action: "change",
      add: ["SUPER_ADMIN"],
      remove: ["ADMIN_CATALOG", "ADMIN_ORDERS", "ADMIN_SUPPORT"],
    });
  });

  it("revokes every staff role and keeps CUSTOMER", () => {
    const result = plan({ targetRoles: ["ADMIN_ORDERS", "CUSTOMER"], nextLevel: null });
    expect(result).toMatchObject({ ok: true, action: "revoke", add: [], remove: ["ADMIN_ORDERS"] });
  });

  it("rejects any change to the actor's own access", () => {
    for (const nextLevel of [null, "ADMIN", "SUPER_ADMIN"] as const) {
      expect(plan({ targetAuthUserId: ACTOR, targetRoles: ["SUPER_ADMIN"], nextLevel })).toEqual({
        ok: false,
        error: "SELF_CHANGE",
      });
    }
  });

  it("never removes the last SUPER_ADMIN", () => {
    expect(plan({ targetRoles: ["SUPER_ADMIN"], nextLevel: "ADMIN", superAdminCount: 1 })).toEqual({
      ok: false,
      error: "LAST_SUPER_ADMIN",
    });
    expect(plan({ targetRoles: ["SUPER_ADMIN"], nextLevel: null, superAdminCount: 1 })).toEqual({
      ok: false,
      error: "LAST_SUPER_ADMIN",
    });
    expect(
      plan({ targetRoles: ["SUPER_ADMIN"], nextLevel: "ADMIN", superAdminCount: 2 })
    ).toMatchObject({ ok: true, action: "change" });
  });

  it("reports no-ops instead of writing them", () => {
    expect(plan({ targetRoles: ["ADMIN_ORDERS"], nextLevel: "ADMIN_ORDERS" })).toEqual({
      ok: false,
      error: "NO_CHANGE",
    });
    expect(plan({ targetRoles: ["CUSTOMER"], nextLevel: null })).toEqual({
      ok: false,
      error: "NOT_STAFF",
    });
  });
});

describe("Staff levels module boundary", () => {
  it("stays importable from the browser: no runtime import of the RBAC module", async () => {
    const { readFileSync } = await import("node:fs");
    const source = readFileSync("src/lib/admin/staff/levels.ts", "utf8");
    expect(source).not.toMatch(/^import \{[^}]*\} from "@\/lib\/auth\/rbac";/m);
    const { CANONICAL_STAFF_ROLES } = await import("@/lib/auth/rbac");
    const { isStaffRole } = await import("@/lib/admin/staff/levels");
    expect(CANONICAL_STAFF_ROLES.every((role) => isStaffRole(role))).toBe(true);
    expect(isStaffRole("CUSTOMER")).toBe(false);
  });
});
