import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  AuthenticationRequiredError,
  ForbiddenError,
  AuthorizationUnavailableError,
  requireAdminAccess,
  requirePermission,
  hasPermission,
  hasAdminShellAccess,
} from "@/lib/auth/rbac";

// Hoisted mock state
const mockState = {
  verifiedIdentity: {
    success: true,
    identity: {
      authUserId: "018f0000-0000-7000-8000-000000000001",
      email: "staff@gamerperu.com",
      claims: { sub: "018f0000-0000-7000-8000-000000000001" },
    },
  } as
    | {
        success: true;
        identity: { authUserId: string; email: string; claims: Record<string, unknown> };
      }
    | { success: false; reason: "no_session" | "invalid_claims" | "error" },
  dbRows: [] as Array<{ roleName: string; permissionName: string | null }>,
  shouldDbThrow: false,
  thrownDbError: new Error("PostgreSQL connection timeout"),
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
                  throw mockState.thrownDbError;
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

describe("GP-022 — Admin Server Authoritative Access Tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockState.verifiedIdentity = {
      success: true,
      identity: {
        authUserId: "018f0000-0000-7000-8000-000000000001",
        email: "staff@gamerperu.com",
        claims: { sub: "018f0000-0000-7000-8000-000000000001" },
      },
    };
    mockState.dbRows = [];
    mockState.shouldDbThrow = false;
    mockState.thrownDbError = new Error("PostgreSQL connection timeout");
  });

  it("A1: anonymous Admin access throws AuthenticationRequiredError", async () => {
    mockState.verifiedIdentity = {
      success: false,
      reason: "no_session",
    };

    await expect(requireAdminAccess()).rejects.toThrow(AuthenticationRequiredError);
  });

  it("A2: CUSTOMER role with 0 permissions throws ForbiddenError", async () => {
    mockState.dbRows = [{ roleName: "CUSTOMER", permissionName: null }];

    await expect(requireAdminAccess()).rejects.toThrow(ForbiddenError);
  });

  it("A3: authenticated user with no valid staff role throws ForbiddenError", async () => {
    mockState.dbRows = []; // No roles assigned

    await expect(requireAdminAccess()).rejects.toThrow(ForbiddenError);
  });

  it("A4: SUPER_ADMIN is allowed and receives all 11 permissions including inventory:manage", async () => {
    mockState.dbRows = [
      { roleName: "SUPER_ADMIN", permissionName: "staff:manage" },
      { roleName: "SUPER_ADMIN", permissionName: "ai:manage_credentials" },
      { roleName: "SUPER_ADMIN", permissionName: "audit:export" },
      { roleName: "SUPER_ADMIN", permissionName: "catalog:manage" },
      { roleName: "SUPER_ADMIN", permissionName: "catalog:publish" },
      { roleName: "SUPER_ADMIN", permissionName: "catalog:ai_research" },
      { roleName: "SUPER_ADMIN", permissionName: "orders:manage" },
      { roleName: "SUPER_ADMIN", permissionName: "orders:verify" },
      { roleName: "SUPER_ADMIN", permissionName: "support:manage" },
      { roleName: "SUPER_ADMIN", permissionName: "support:review_rma" },
      { roleName: "SUPER_ADMIN", permissionName: "inventory:manage" },
    ];

    const context = await requireAdminAccess();
    expect(context.status).toBe("READY");
    expect(context.roles).toContain("SUPER_ADMIN");
    expect(context.permissions.has("inventory:manage")).toBe(true);
    expect(context.permissions.size).toBe(11);
  });

  it("A5: ADMIN_CATALOG is allowed and receives catalog permissions", async () => {
    mockState.dbRows = [
      { roleName: "ADMIN_CATALOG", permissionName: "catalog:manage" },
      { roleName: "ADMIN_CATALOG", permissionName: "catalog:publish" },
      { roleName: "ADMIN_CATALOG", permissionName: "catalog:ai_research" },
    ];

    const context = await requireAdminAccess();
    expect(context.status).toBe("READY");
    expect(context.roles).toContain("ADMIN_CATALOG");
    expect(context.permissions.has("catalog:manage")).toBe(true);
    expect(context.permissions.has("inventory:manage")).toBe(false);
  });

  it("A6: ADMIN_ORDERS is allowed and receives orders permissions", async () => {
    mockState.dbRows = [
      { roleName: "ADMIN_ORDERS", permissionName: "orders:manage" },
      { roleName: "ADMIN_ORDERS", permissionName: "orders:verify" },
    ];

    const context = await requireAdminAccess();
    expect(context.status).toBe("READY");
    expect(context.roles).toContain("ADMIN_ORDERS");
    expect(context.permissions.has("orders:manage")).toBe(true);
    expect(context.permissions.has("inventory:manage")).toBe(false);
  });

  it("A7: ADMIN_SUPPORT is allowed and receives support permissions", async () => {
    mockState.dbRows = [
      { roleName: "ADMIN_SUPPORT", permissionName: "support:manage" },
      { roleName: "ADMIN_SUPPORT", permissionName: "support:review_rma" },
    ];

    const context = await requireAdminAccess();
    expect(context.status).toBe("READY");
    expect(context.roles).toContain("ADMIN_SUPPORT");
    expect(context.permissions.has("support:manage")).toBe(true);
    expect(context.permissions.has("inventory:manage")).toBe(false);
  });

  it("A8: unknown role cannot grant Admin access", async () => {
    mockState.dbRows = [{ roleName: "INVENTED_ROLE", permissionName: "catalog:manage" }];

    await expect(requireAdminAccess()).rejects.toThrow(ForbiddenError);
  });

  it("A9: unknown permission cannot grant capability", async () => {
    mockState.dbRows = [{ roleName: "ADMIN_CATALOG", permissionName: "invented:permission" }];

    const permitted = await hasPermission("invented:permission");
    expect(permitted).toBe(false);
  });

  it("A10: RBAC database failure fails closed with AuthorizationUnavailableError", async () => {
    mockState.shouldDbThrow = true;

    await expect(requireAdminAccess()).rejects.toThrow(AuthorizationUnavailableError);
  });

  it("A11: requireAdminAccess accepts no caller-controlled auth user identity", () => {
    // Proves requireAdminAccess signature has 0 parameters
    expect(requireAdminAccess.length).toBe(0);
  });

  it("A12: specific requirePermission remains authoritative for granular module operations", async () => {
    mockState.dbRows = [
      { roleName: "ADMIN_ORDERS", permissionName: "orders:manage" },
      { roleName: "ADMIN_ORDERS", permissionName: "orders:verify" },
    ];

    await expect(requirePermission("orders:manage")).resolves.toBeDefined();
    await expect(requirePermission("catalog:manage")).rejects.toThrow(ForbiddenError);
    await expect(requirePermission("inventory:manage")).rejects.toThrow(ForbiddenError);
  });

  it("A13: hasAdminShellAccess returns true only when status is READY, staff role exists, and permissions > 0", () => {
    expect(
      hasAdminShellAccess({
        status: "READY",
        authUserId: "user-1",
        email: "staff@gamerperu.com",
        roles: ["SUPER_ADMIN"],
        permissions: new Set(["catalog:manage"]),
      })
    ).toBe(true);

    expect(
      hasAdminShellAccess({
        status: "READY",
        authUserId: "user-2",
        email: "customer@gamerperu.pe",
        roles: ["CUSTOMER"],
        permissions: new Set(),
      })
    ).toBe(false);

    expect(
      hasAdminShellAccess({
        status: "UNAUTHENTICATED",
        authUserId: null,
        email: null,
        roles: [],
        permissions: new Set(),
      })
    ).toBe(false);

    expect(
      hasAdminShellAccess({
        status: "ERROR",
        error: "rbac_resolution_failed",
        authUserId: null,
        email: null,
        roles: [],
        permissions: new Set(),
      })
    ).toBe(false);
  });
});
