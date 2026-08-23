import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

// Mock server-only module for testing
vi.mock("server-only", () => ({}));

// Mock redirect from next/navigation
const mockRedirect = vi.fn((url: string) => {
  const err = new Error("NEXT_REDIRECT");
  (err as unknown as { digest: string }).digest = `NEXT_REDIRECT;replace;${url};307;;`;
  throw err;
});

vi.mock("next/navigation", () => ({
  redirect: (url: string) => mockRedirect(url),
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

// Mock createServerSupabaseClient
const mockSignOut = vi.fn();
const mockSupabaseClient = {
  auth: {
    signOut: mockSignOut,
  },
};

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: vi.fn(async () => mockSupabaseClient),
}));

// Mock getVerifiedIdentity
const mockGetVerifiedIdentity = vi.fn();
vi.mock("@/lib/auth/claims", () => ({
  getVerifiedIdentity: () => mockGetVerifiedIdentity(),
}));

// Mock getCurrentCustomerProfile
const mockGetCurrentCustomerProfile = vi.fn();
vi.mock("@/lib/account/profile", () => ({
  getCurrentCustomerProfile: () => mockGetCurrentCustomerProfile(),
}));

describe("GP-015 AUTH9-A — Account Logout & Session Lifecycle Suite", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("A & B. proves signOutAction calls createServerSupabaseClient and signOut with { scope: 'local' }", async () => {
    mockSignOut.mockResolvedValueOnce({ error: null });

    const { signOutAction } = await import("@/lib/auth/actions");
    const { createServerSupabaseClient } = await import("@/lib/supabase/server");

    try {
      await signOutAction();
    } catch (e: unknown) {
      // Expected NEXT_REDIRECT
      expect((e as Error).message).toBe("NEXT_REDIRECT");
    }

    expect(createServerSupabaseClient).toHaveBeenCalledTimes(1);
    expect(mockSignOut).toHaveBeenCalledTimes(1);
    expect(mockSignOut).toHaveBeenCalledWith({ scope: "local" });
  });

  it("C. proves successful signOutAction redirects to /auth/login?signed_out=true", async () => {
    mockSignOut.mockResolvedValueOnce({ error: null });

    const { signOutAction } = await import("@/lib/auth/actions");

    try {
      await signOutAction();
    } catch {
      // NEXT_REDIRECT
    }

    expect(mockRedirect).toHaveBeenCalledWith("/auth/login?signed_out=true");
  });

  it("D & E. proves signOut failure returns generic safe error and leaks no raw error messages", async () => {
    mockSignOut.mockResolvedValueOnce({
      error: { message: "Internal Supabase Auth Service Exception 500", status: 500 },
    });

    const { signOutAction } = await import("@/lib/auth/actions");

    const result = await signOutAction();

    expect(result.success).toBe(false);
    expect(result.error).toBe("No pudimos cerrar la sesión. Inténtalo nuevamente.");
    expect(result.error).not.toContain("Supabase");
    expect(result.error).not.toContain("500");
    expect(mockRedirect).not.toHaveBeenCalled();
  });

  it("E2. proves thrown exceptions during signOut return generic safe error", async () => {
    mockSignOut.mockRejectedValueOnce(new Error("Network connection reset"));

    const { signOutAction } = await import("@/lib/auth/actions");

    const result = await signOutAction();

    expect(result.success).toBe(false);
    expect(result.error).toBe("No pudimos cerrar la sesión. Inténtalo nuevamente.");
    expect(mockRedirect).not.toHaveBeenCalled();
  });

  it("F. proves signOutAction accepts 0 identity/auth_user_id arguments", async () => {
    const { signOutAction } = await import("@/lib/auth/actions");
    expect(signOutAction.length).toBeLessThanOrEqual(1); // optional prevState only
  });

  it("G. proves signOutAction source code contains zero domain database writes", () => {
    const actionsPath = resolve(process.cwd(), "src/lib/auth/actions.ts");
    const content = readFileSync(actionsPath, "utf8");
    const signOutFn = content.slice(content.indexOf("export async function signOutAction"));

    expect(signOutFn).not.toMatch(/db\.(insert|update|delete)/);
    expect(signOutFn).not.toMatch(/customerProfiles/);
    expect(signOutFn).not.toMatch(/userRoles/);
    expect(signOutFn).not.toMatch(/roles/);
  });

  it("H. proves redirect is outside try/catch in signOutAction", () => {
    const actionsPath = resolve(process.cwd(), "src/lib/auth/actions.ts");
    const content = readFileSync(actionsPath, "utf8");
    const signOutFn = content.slice(content.indexOf("export async function signOutAction"));

    // redirect must appear after the catch block
    const catchIndex = signOutFn.lastIndexOf("catch");
    const redirectIndex = signOutFn.indexOf("redirect(");

    expect(redirectIndex).toBeGreaterThan(catchIndex);
  });

  it("I. proves /cuenta page redirects unauthenticated users to /auth/login", async () => {
    mockGetCurrentCustomerProfile.mockResolvedValueOnce({
      status: "UNAUTHENTICATED",
    });

    const { default: CuentaPage } = await import("@/app/cuenta/page");

    try {
      await CuentaPage();
    } catch {
      // NEXT_REDIRECT
    }

    expect(mockRedirect).toHaveBeenCalledWith("/auth/login");
  });

  it("J & K. proves /cuenta page renders for verified user and uses getCurrentCustomerProfile", async () => {
    mockGetCurrentCustomerProfile.mockResolvedValueOnce({
      status: "READY",
      profile: {
        id: "018f0000-0000-7000-8000-000000000001",
        authUserId: "018f0000-0000-7000-8000-000000000001",
        firstName: "Test",
        lastName: "User",
        phone: "+51999999999",
        documentType: "DNI",
        documentNumber: "12345678",
        defaultShippingAddressId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        email: "test@gamerperu.pe",
      },
    });

    const { default: CuentaPage } = await import("@/app/cuenta/page");
    const jsx = await CuentaPage();

    expect(mockGetCurrentCustomerProfile).toHaveBeenCalledTimes(1);
    expect(jsx).toBeDefined();
  });

  it("L. proves login page handles signed_out query param for presentation feedback", () => {
    const loginFormPath = resolve(process.cwd(), "src/components/auth/login-form.tsx");
    const content = readFileSync(loginFormPath, "utf8");

    expect(content).toMatch(/searchParams\.get\("signed_out"\)\s*===\s*"true"/);
    expect(content).toMatch(/Sesión cerrada correctamente\./);
  });

  it("M. proves proxy matcher covers bare /cuenta and /cuenta/:path*", async () => {
    const { config } = await import("@/proxy");
    expect(config.matcher).toContain("/cuenta/:path*");

    function matchesProxy(pathname: string): boolean {
      return config.matcher.some((pattern: string) => {
        if (pattern.endsWith("/:path*")) {
          const prefix = pattern.replace("/:path*", "");
          return pathname === prefix || pathname.startsWith(prefix + "/");
        }
        return pathname === pattern;
      });
    }

    expect(matchesProxy("/cuenta")).toBe(true);
    expect(matchesProxy("/cuenta/pedidos")).toBe(true);
  });

  it("N. proves storefront header does not import or invoke auth context or signOut", () => {
    const headerPath = resolve(
      process.cwd(),
      "src/components/navigation/header-utilities/header-utilities.tsx"
    );
    if (existsSync(headerPath)) {
      const content = readFileSync(headerPath, "utf8");
      expect(content).not.toMatch(/signOut/);
      expect(content).not.toMatch(/getVerifiedIdentity/);
      expect(content).not.toMatch(/getVerifiedAuthContext/);
      expect(content).toMatch(/accountHref\s*=\s*"\/cuenta"/);
    }
  });

  it("O. proves RBAC runtime code is untouched and maintains zero wildcard/bypass", () => {
    const rbacPath = resolve(process.cwd(), "src/lib/auth/rbac.ts");
    const content = readFileSync(rbacPath, "utf8");

    expect(content).not.toMatch(/permission\s*===?\s*"\*"/);
    expect(content).not.toMatch(/SUPER_ADMIN.*return\s+true/);
    expect(content).toMatch(/CANONICAL_ROLES\.includes/);
    expect(content).toMatch(/CANONICAL_PERMISSIONS\.includes/);
  });
});
