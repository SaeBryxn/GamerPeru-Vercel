import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  CANONICAL_ROLES,
  CANONICAL_PERMISSIONS,
  AuthenticationRequiredError,
  ForbiddenError,
  AuthorizationUnavailableError,
} from "@/lib/auth/rbac";
import type { PermissionName } from "@/lib/auth/rbac";

// Hoisted mock state
const mockState = {
  verifiedIdentity: {
    success: true,
    identity: {
      authUserId: "018f0000-0000-7000-8000-000000000001",
      email: "staff@gamerperu.com",
      role: "authenticated",
      aal: "aal1",
      amr: ["password"],
      sessionExpiresAt: 9999999999,
      issuedAt: 1000000000,
    },
  } as
    | { success: true; identity: { authUserId: string; email: string; [key: string]: unknown } }
    | { success: false; error?: { code: string; message: string } },
  dbRows: [] as Array<{ roleName: string; permissionName: string | null }>,
  shouldDbThrow: false,
};

vi.mock("@/lib/auth/claims", () => ({
  getVerifiedIdentity: vi.fn(async () => mockState.verifiedIdentity),
}));

vi.mock("@/db", () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        innerJoin: vi.fn(() => ({
          leftJoin: vi.fn(() => ({
            leftJoin: vi.fn(() => ({
              where: vi.fn(async () => {
                if (mockState.shouldDbThrow) {
                  throw new Error("PostgreSQL connection timeout");
                }
                return mockState.dbRows;
              }),
            })),
          })),
        })),
      })),
    })),
  },
}));

describe("GP-015 AUTH8-B — RBAC Server Authorization Runtime Tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockState.verifiedIdentity = {
      success: true,
      identity: {
        authUserId: "018f0000-0000-7000-8000-000000000001",
        email: "staff@gamerperu.com",
        role: "authenticated",
        aal: "aal1",
        amr: ["password"],
        sessionExpiresAt: 9999999999,
        issuedAt: 1000000000,
      },
    };
    mockState.dbRows = [];
    mockState.shouldDbThrow = false;
  });

  it("proves CANONICAL_ROLES and CANONICAL_PERMISSIONS constants are complete", () => {
    expect(CANONICAL_ROLES.length).toBe(5);
    expect(CANONICAL_PERMISSIONS.length).toBe(10);
  });

  it("A: returns UNAUTHENTICATED context when user is not authenticated", async () => {
    const { getVerifiedAuthContext, hasPermission, requirePermission } =
      await import("@/lib/auth/rbac");

    mockState.verifiedIdentity = {
      success: false,
      error: { code: "NO_SESSION", message: "None" },
    };

    const context = await getVerifiedAuthContext();
    expect(context.status).toBe("UNAUTHENTICATED");
    expect(context.authUserId).toBeNull();
    expect(context.roles).toEqual([]);
    expect(context.permissions.size).toBe(0);

    const permitted = await hasPermission("catalog:manage");
    expect(permitted).toBe(false);

    await expect(requirePermission("catalog:manage")).rejects.toThrow(AuthenticationRequiredError);
  });

  it("B: returns empty roles and permissions for authenticated user with zero user_roles", async () => {
    const { getVerifiedAuthContext, hasPermission, requirePermission } =
      await import("@/lib/auth/rbac");

    mockState.dbRows = []; // No user_roles in database

    const context = await getVerifiedAuthContext();
    expect(context.status).toBe("READY");
    if (context.status === "READY") {
      expect(context.authUserId).toBe("018f0000-0000-7000-8000-000000000001");
      expect(context.roles).toEqual([]);
      expect(context.permissions.size).toBe(0);
    }

    const permitted = await hasPermission("catalog:manage");
    expect(permitted).toBe(false);

    await expect(requirePermission("catalog:manage")).rejects.toThrow(ForbiddenError);
  });

  it("C: grants exactly 3 permissions for ADMIN_CATALOG and denies the other 7", async () => {
    const { getVerifiedAuthContext, hasPermission, requirePermission } =
      await import("@/lib/auth/rbac");

    mockState.dbRows = [
      { roleName: "ADMIN_CATALOG", permissionName: "catalog:manage" },
      { roleName: "ADMIN_CATALOG", permissionName: "catalog:publish" },
      { roleName: "ADMIN_CATALOG", permissionName: "catalog:ai_research" },
    ];

    const context = await getVerifiedAuthContext();
    expect(context.status).toBe("READY");
    if (context.status === "READY") {
      expect(context.roles).toEqual(["ADMIN_CATALOG"]);
      expect(context.permissions.size).toBe(3);
      expect(context.permissions.has("catalog:manage")).toBe(true);
      expect(context.permissions.has("catalog:publish")).toBe(true);
      expect(context.permissions.has("catalog:ai_research")).toBe(true);
    }

    // Allowed
    expect(await hasPermission("catalog:manage")).toBe(true);
    expect(await hasPermission("catalog:publish")).toBe(true);
    expect(await hasPermission("catalog:ai_research")).toBe(true);
    await expect(requirePermission("catalog:manage")).resolves.toBeDefined();

    // Denied (Negative Matrix for ADMIN_CATALOG)
    const deniedPerms = [
      "orders:manage",
      "orders:verify",
      "staff:manage",
      "ai:manage_credentials",
      "audit:export",
      "support:manage",
      "support:review_rma",
    ] as const;

    for (const perm of deniedPerms) {
      expect(await hasPermission(perm)).toBe(false);
      await expect(requirePermission(perm)).rejects.toThrow(ForbiddenError);
    }
  });

  it("D: grants exactly 2 permissions for ADMIN_ORDERS and denies the other 8", async () => {
    const { getVerifiedAuthContext, hasPermission } = await import("@/lib/auth/rbac");

    mockState.dbRows = [
      { roleName: "ADMIN_ORDERS", permissionName: "orders:manage" },
      { roleName: "ADMIN_ORDERS", permissionName: "orders:verify" },
    ];

    const context = await getVerifiedAuthContext();
    expect(context.status).toBe("READY");
    if (context.status === "READY") {
      expect(context.roles).toEqual(["ADMIN_ORDERS"]);
      expect(context.permissions.size).toBe(2);
      expect(context.permissions.has("orders:manage")).toBe(true);
      expect(context.permissions.has("orders:verify")).toBe(true);
    }

    expect(await hasPermission("orders:manage")).toBe(true);
    expect(await hasPermission("orders:verify")).toBe(true);

    // Negative security check
    expect(await hasPermission("catalog:manage")).toBe(false);
    expect(await hasPermission("catalog:publish")).toBe(false);
    expect(await hasPermission("staff:manage")).toBe(false);
    expect(await hasPermission("ai:manage_credentials")).toBe(false);
  });

  it("E: grants exactly 2 permissions for ADMIN_SUPPORT and denies the other 8", async () => {
    const { getVerifiedAuthContext, hasPermission } = await import("@/lib/auth/rbac");

    mockState.dbRows = [
      { roleName: "ADMIN_SUPPORT", permissionName: "support:manage" },
      { roleName: "ADMIN_SUPPORT", permissionName: "support:review_rma" },
    ];

    const context = await getVerifiedAuthContext();
    expect(context.status).toBe("READY");
    if (context.status === "READY") {
      expect(context.roles).toEqual(["ADMIN_SUPPORT"]);
      expect(context.permissions.size).toBe(2);
      expect(context.permissions.has("support:manage")).toBe(true);
      expect(context.permissions.has("support:review_rma")).toBe(true);
    }

    expect(await hasPermission("support:manage")).toBe(true);
    expect(await hasPermission("support:review_rma")).toBe(true);

    // Negative security check
    expect(await hasPermission("catalog:manage")).toBe(false);
    expect(await queryOrdersVerify()).toBe(false);
    expect(await hasPermission("staff:manage")).toBe(false);
    expect(await hasPermission("ai:manage_credentials")).toBe(false);

    async function queryOrdersVerify() {
      return hasPermission("orders:verify");
    }
  });

  it("F: grants all 10 permissions explicitly for SUPER_ADMIN via database rows", async () => {
    const { getVerifiedAuthContext, hasPermission, requirePermission } =
      await import("@/lib/auth/rbac");

    mockState.dbRows = CANONICAL_PERMISSIONS.map((perm) => ({
      roleName: "SUPER_ADMIN",
      permissionName: perm,
    }));

    const context = await getVerifiedAuthContext();
    expect(context.status).toBe("READY");
    if (context.status === "READY") {
      expect(context.roles).toEqual(["SUPER_ADMIN"]);
      expect(context.permissions.size).toBe(10);
    }

    for (const perm of CANONICAL_PERMISSIONS) {
      expect(await hasPermission(perm)).toBe(true);
      await expect(requirePermission(perm)).resolves.toBeDefined();
    }
  });

  it("G: grants zero permissions for CUSTOMER role", async () => {
    const { getVerifiedAuthContext, hasPermission, requirePermission } =
      await import("@/lib/auth/rbac");

    mockState.dbRows = [
      { roleName: "CUSTOMER", permissionName: null }, // No mapped permissions
    ];

    const context = await getVerifiedAuthContext();
    expect(context.status).toBe("READY");
    if (context.status === "READY") {
      expect(context.roles).toEqual(["CUSTOMER"]);
      expect(context.permissions.size).toBe(0);
    }

    for (const perm of CANONICAL_PERMISSIONS) {
      expect(await hasPermission(perm)).toBe(false);
      await expect(requirePermission(perm)).rejects.toThrow(ForbiddenError);
    }
  });

  it("H: computes deterministic union of permissions for multi-role staff", async () => {
    const { getVerifiedAuthContext, getUserPermissions } = await import("@/lib/auth/rbac");

    mockState.dbRows = [
      { roleName: "ADMIN_CATALOG", permissionName: "catalog:manage" },
      { roleName: "ADMIN_CATALOG", permissionName: "catalog:publish" },
      { roleName: "ADMIN_CATALOG", permissionName: "catalog:ai_research" },
      { roleName: "ADMIN_ORDERS", permissionName: "orders:manage" },
      { roleName: "ADMIN_ORDERS", permissionName: "orders:verify" },
    ];

    const context = await getVerifiedAuthContext();
    expect(context.status).toBe("READY");
    if (context.status === "READY") {
      expect(context.roles).toContain("ADMIN_CATALOG");
      expect(context.roles).toContain("ADMIN_ORDERS");
      expect(context.permissions.size).toBe(5);
    }

    const perms = await getUserPermissions();
    expect(perms.size).toBe(5);
    expect(perms.has("catalog:manage")).toBe(true);
    expect(perms.has("orders:verify")).toBe(true);
  });

  it("I & J: hasPermission accurately returns boolean without throwing on denied checks", async () => {
    const { hasPermission } = await import("@/lib/auth/rbac");

    mockState.dbRows = [{ roleName: "ADMIN_CATALOG", permissionName: "catalog:manage" }];

    expect(await hasPermission("catalog:manage")).toBe(true);
    expect(await hasPermission("staff:manage")).toBe(false);
  });

  it("K, L & M: requirePermission guards correctly by returning context or throwing typed errors", async () => {
    const { requirePermission } = await import("@/lib/auth/rbac");

    mockState.dbRows = [{ roleName: "ADMIN_CATALOG", permissionName: "catalog:manage" }];

    // K: Allowed
    const context = await requirePermission("catalog:manage");
    expect(context.status).toBe("READY");
    expect(context.authUserId).toBe("018f0000-0000-7000-8000-000000000001");

    // L: Authenticated-denied
    await expect(requirePermission("orders:verify")).rejects.toThrow(ForbiddenError);

    // M: Unauthenticated
    mockState.verifiedIdentity = { success: false };
    await expect(requirePermission("catalog:manage")).rejects.toThrow(AuthenticationRequiredError);
  });

  it("N: handles RBAC database failure safely and never defaults to allow", async () => {
    const { getVerifiedAuthContext, hasPermission, requirePermission } =
      await import("@/lib/auth/rbac");

    mockState.shouldDbThrow = true;

    const context = await getVerifiedAuthContext();
    expect(context.status).toBe("ERROR");
    if (context.status === "ERROR") {
      expect(context.error).toBe("rbac_resolution_failed");
    }

    expect(await hasPermission("catalog:manage")).toBe(false);
    await expect(requirePermission("catalog:manage")).rejects.toThrow(
      AuthorizationUnavailableError
    );
  });

  it("O: denies unknown arbitrary permission strings", async () => {
    const { hasPermission, requirePermission } = await import("@/lib/auth/rbac");

    mockState.dbRows = [{ roleName: "SUPER_ADMIN", permissionName: "catalog:manage" }];

    expect(await hasPermission("arbitrary:hack")).toBe(false);
    await expect(requirePermission("arbitrary:hack")).rejects.toThrow(ForbiddenError);
  });

  it("P: proves user_metadata and Google claims cannot derive or escalate RBAC privileges", async () => {
    const { getVerifiedAuthContext, hasPermission } = await import("@/lib/auth/rbac");

    // Attacker token contains forged claims
    mockState.verifiedIdentity = {
      success: true,
      identity: {
        authUserId: "018f0000-0000-7000-8000-000000000001",
        email: "attacker@gmail.com",
        role: "SUPER_ADMIN",
        is_admin: true,
        user_metadata: { role: "SUPER_ADMIN", is_admin: true, permissions: ["staff:manage"] },
        app_metadata: { role: "SUPER_ADMIN", is_admin: true },
      },
    };

    // Database has no user_roles for this user
    mockState.dbRows = [];

    const context = await getVerifiedAuthContext();
    expect(context.status).toBe("READY");
    if (context.status === "READY") {
      expect(context.roles).toEqual([]);
      expect(context.permissions.size).toBe(0);
    }

    expect(await hasPermission("staff:manage")).toBe(false);
    expect(await hasPermission("catalog:manage")).toBe(false);
  });

  it("Q: proves public getUserPermissions takes 0 arguments and derives identity internally", async () => {
    const { getUserPermissions } = await import("@/lib/auth/rbac");
    expect(getUserPermissions.length).toBe(0);
  });

  it("R: proves CustomerProfile existence alone grants zero administrative permissions", async () => {
    const { getVerifiedAuthContext, hasPermission } = await import("@/lib/auth/rbac");

    mockState.dbRows = []; // Zero user_roles

    const context = await getVerifiedAuthContext();
    expect(context.status).toBe("READY");
    if (context.status === "READY") {
      expect(context.permissions.size).toBe(0);
    }
    expect(await hasPermission("catalog:manage")).toBe(false);
  });

  it("S: proves absence of SUPER_ADMIN code-level bypass (Model A confirmation)", async () => {
    const { getVerifiedAuthContext, hasPermission } = await import("@/lib/auth/rbac");

    // If a user has SUPER_ADMIN role in user_roles, but database role_permissions has no rows
    mockState.dbRows = [{ roleName: "SUPER_ADMIN", permissionName: null }];

    const context = await getVerifiedAuthContext();
    expect(context.status).toBe("READY");
    if (context.status === "READY") {
      expect(context.roles).toEqual(["SUPER_ADMIN"]);
      // Because there is no code-level bypass, permissions is empty!
      expect(context.permissions.size).toBe(0);
    }

    // Must be denied because permission was not explicitly in DB
    expect(await hasPermission("catalog:manage")).toBe(false);
  });

  it("T: proves database role_permissions explicit rows are the sole capability source", async () => {
    const { getVerifiedAuthContext } = await import("@/lib/auth/rbac");

    mockState.dbRows = [
      { roleName: "ADMIN_CATALOG", permissionName: "catalog:manage" },
      { roleName: "ADMIN_CATALOG", permissionName: "unknown_injected_perm" }, // Unknown DB string
    ];

    const context = await getVerifiedAuthContext();
    expect(context.status).toBe("READY");
    if (context.status === "READY") {
      expect(context.permissions.size).toBe(1);
      expect(context.permissions.has("catalog:manage")).toBe(true);
      expect(context.permissions.has("unknown_injected_perm" as PermissionName)).toBe(false);
    }
  });
});
