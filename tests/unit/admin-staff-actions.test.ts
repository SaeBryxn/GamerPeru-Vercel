import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authContext: {
    status: "READY",
    authUserId: "0193b057-0000-7000-8000-0000000000a1",
    email: "super@example.pe",
    roles: ["SUPER_ADMIN"],
    permissions: new Set<string>(["staff:manage"]),
  },
  changeStaffAccess: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/auth/rbac", () => ({ getVerifiedAuthContext: async () => mocks.authContext }));
vi.mock("@/lib/admin/staff/service", () => ({ changeStaffAccess: mocks.changeStaffAccess }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

import { changeStaffAccessAction, grantStaffAccessAction } from "@/lib/admin/staff/actions";

const TARGET = "0193b057-0000-7000-8000-0000000000b2";

beforeEach(() => {
  mocks.changeStaffAccess.mockReset();
  mocks.revalidatePath.mockReset();
  mocks.authContext.status = "READY";
  mocks.authContext.permissions = new Set(["staff:manage"]);
});

describe("Staff actions", () => {
  it("refuses operators without staff:manage", async () => {
    mocks.authContext.permissions = new Set(["catalog:manage", "orders:manage", "orders:verify"]);
    const result = await grantStaffAccessAction({ email: "nuevo@example.pe", level: "ADMIN" });
    expect(result).toMatchObject({ success: false, code: "FORBIDDEN" });
    expect(mocks.changeStaffAccess).not.toHaveBeenCalled();
  });

  it("refuses anonymous requests", async () => {
    mocks.authContext.status = "UNAUTHENTICATED";
    const result = await changeStaffAccessAction({ authUserId: TARGET, level: null });
    expect(result).toMatchObject({ success: false, code: "AUTHENTICATION_REQUIRED" });
  });

  it("validates the email and the level before touching the database", async () => {
    expect(await grantStaffAccessAction({ email: "no-es-correo", level: "ADMIN" })).toMatchObject({
      code: "INVALID_INPUT",
    });
    expect(
      await grantStaffAccessAction({
        email: "nuevo@example.pe",
        level: "OWNER" as unknown as "ADMIN",
      })
    ).toMatchObject({ code: "INVALID_INPUT" });
    expect(await changeStaffAccessAction({ authUserId: "x", level: "ADMIN" })).toMatchObject({
      code: "INVALID_INPUT",
    });
    expect(mocks.changeStaffAccess).not.toHaveBeenCalled();
  });

  it("acts as the session user, normalizing the email", async () => {
    mocks.changeStaffAccess.mockResolvedValue({
      ok: true,
      action: "grant",
      email: "nuevo@example.pe",
      previousRoles: [],
      nextRoles: ["ADMIN_CATALOG", "ADMIN_ORDERS", "ADMIN_SUPPORT"],
    });

    const result = await grantStaffAccessAction({ email: " Nuevo@Example.pe ", level: "ADMIN" });

    expect(mocks.changeStaffAccess).toHaveBeenCalledWith({
      actorAuthUserId: "0193b057-0000-7000-8000-0000000000a1",
      target: { email: "nuevo@example.pe" },
      nextLevel: "ADMIN",
    });
    expect(result).toEqual({ success: true, data: { email: "nuevo@example.pe", action: "grant" } });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("explains unregistered emails and guardrail refusals", async () => {
    mocks.changeStaffAccess.mockResolvedValueOnce({ ok: false, error: "USER_NOT_FOUND" });
    const missing = await grantStaffAccessAction({ email: "nadie@example.pe", level: "ADMIN" });
    expect(missing).toMatchObject({ success: false, code: "USER_NOT_FOUND" });
    expect(missing.error).toMatch(/crear su cuenta en la tienda/);

    mocks.changeStaffAccess.mockResolvedValueOnce({ ok: false, error: "LAST_SUPER_ADMIN" });
    const last = await changeStaffAccessAction({ authUserId: TARGET, level: null });
    expect(last).toMatchObject({ success: false, code: "LAST_SUPER_ADMIN" });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});
