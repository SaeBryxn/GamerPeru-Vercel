import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToString } from "react-dom/server";
import AdminProtectedLayout from "@/app/admin/(protected)/layout";
import type { VerifiedAuthContext } from "@/lib/auth/rbac";
import type * as RbacModule from "@/lib/auth/rbac";

const mockState = {
  authContext: {
    status: "READY",
    authUserId: "018f0000-0000-7000-8000-000000000001",
    email: "superadmin@gamerperu.com",
    roles: ["SUPER_ADMIN"],
    permissions: new Set(["catalog:manage", "inventory:manage"]),
  } as VerifiedAuthContext,
  redirectUrl: null as string | null,
};

vi.mock("@/lib/auth/rbac", async (importOriginal) => {
  const actual = await importOriginal<typeof RbacModule>();
  return {
    ...actual,
    getVerifiedAuthContext: vi.fn(async () => mockState.authContext),
  };
});

vi.mock("@/lib/admin/staff/identity", () => ({
  getAdminIdentity: vi.fn(async (_id: string, email: string | null) => ({
    displayName: "Ana Torres",
    email,
    avatarUrl: null,
  })),
}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    mockState.redirectUrl = url;
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
  usePathname: vi.fn(() => "/admin"),
  useRouter: vi.fn(() => ({
    push: vi.fn(),
    refresh: vi.fn(),
  })),
  useSearchParams: vi.fn(() => new URLSearchParams()),
}));

describe("GP-022 / BR1 — AdminProtectedLayout Server Decision & Render Tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockState.redirectUrl = null;
    mockState.authContext = {
      status: "READY",
      authUserId: "018f0000-0000-7000-8000-000000000001",
      email: "superadmin@gamerperu.com",
      roles: ["SUPER_ADMIN"],
      permissions: new Set(["catalog:manage", "inventory:manage"]),
    };
  });

  it("proves unauthenticated visitor is redirected to /auth/login with internal redirect param", async () => {
    mockState.authContext = {
      status: "UNAUTHENTICATED",
      authUserId: null,
      email: null,
      roles: [],
      permissions: new Set(),
    };

    await expect(
      AdminProtectedLayout({
        children: <div data-testid="protected-child">Secret Admin Dashboard</div>,
      })
    ).rejects.toThrow("NEXT_REDIRECT:/auth/login?redirect=%2Fadmin");
  });

  it("proves DB/authorization failure renders safe AdminError directly without throwing to same-segment boundary", async () => {
    mockState.authContext = {
      status: "ERROR",
      error: "rbac_resolution_failed",
      authUserId: "018f0000-0000-7000-8000-000000000001",
      email: "staff@gamerperu.com",
      roles: [],
      permissions: new Set(),
    };

    const element = await AdminProtectedLayout({
      children: <div data-testid="protected-child">Secret Admin Dashboard</div>,
    });

    const html = renderToString(element);

    expect(html).toContain("Servicio no disponible");
    expect(html).toContain(
      "No se pudo verificar tu autorización en este momento. Por seguridad, el acceso ha sido bloqueado."
    );
    expect(html).not.toContain("Secret Admin Dashboard");
  });

  it("proves authenticated CUSTOMER renders AdminForbidden and never renders protected children", async () => {
    mockState.authContext = {
      status: "READY",
      authUserId: "018f0000-0000-7000-8000-000000000002",
      email: "customer@gamerperu.pe",
      roles: ["CUSTOMER"],
      permissions: new Set(),
    };

    const element = await AdminProtectedLayout({
      children: <div data-testid="protected-child">Secret Admin Dashboard</div>,
    });

    const html = renderToString(element);

    expect(html).toContain("Acceso no autorizado");
    expect(html).toContain("customer@gamerperu.pe");
    expect(html).not.toContain("Secret Admin Dashboard");
  });

  it("proves authenticated user with no roles is denied and renders AdminForbidden", async () => {
    mockState.authContext = {
      status: "READY",
      authUserId: "018f0000-0000-7000-8000-000000000003",
      email: "norole@gamerperu.pe",
      roles: [],
      permissions: new Set(),
    };

    const element = await AdminProtectedLayout({
      children: <div data-testid="protected-child">Secret Admin Dashboard</div>,
    });

    const html = renderToString(element);

    expect(html).toContain("Acceso no autorizado");
    expect(html).not.toContain("Secret Admin Dashboard");
  });

  it("proves authorized staff member enters AdminShell with protected children rendered", async () => {
    mockState.authContext = {
      status: "READY",
      authUserId: "018f0000-0000-7000-8000-000000000001",
      email: "superadmin@gamerperu.com",
      roles: ["SUPER_ADMIN"],
      permissions: new Set(["catalog:manage", "inventory:manage"]),
    };

    const element = await AdminProtectedLayout({
      children: <div data-testid="protected-child">Active Admin Content</div>,
    });

    const html = renderToString(element);

    expect(html).toContain("Active Admin Content");
    // The account menu names the operator once, with their level in words.
    expect(html).toContain("Ana Torres");
    expect(html).toContain("superadmin@gamerperu.com");
    expect(html).toContain("Superadministrador");
    expect(html).toContain("Gamer Perú");
  });
});
