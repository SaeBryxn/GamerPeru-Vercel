import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { NextRequest } from "next/server";

// Mock server-only module for testing
vi.mock("server-only", () => ({}));

// Mock publicEnv
vi.mock("@/config/public-env", () => ({
  publicEnv: {
    NEXT_PUBLIC_SITE_URL: "http://localhost:3000",
    NEXT_PUBLIC_CDN_URL: "http://localhost:3000/media",
    NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test_token_123",
  },
}));

interface CookieOptionItem {
  name: string;
  value: string;
  options: Record<string, unknown>;
}

interface MockCookieMethods {
  getAll: () => Array<{ name: string; value: string }>;
  setAll: (cookies: CookieOptionItem[], headers: Record<string, string>) => void;
}

describe("GP-015 AUTH4 — Core Supabase SSR Infrastructure Suite", () => {
  const rootProxyPath = resolve(process.cwd(), "src/proxy.ts");
  const proxyAdapterPath = resolve(process.cwd(), "src/lib/supabase/proxy.ts");
  const serverClientPath = resolve(process.cwd(), "src/lib/supabase/server.ts");
  const browserClientPath = resolve(process.cwd(), "src/lib/supabase/client.ts");
  const claimsPath = resolve(process.cwd(), "src/lib/auth/claims.ts");

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("A. proves root src/proxy.ts exists and delegates to updateSession", async () => {
    expect(existsSync(rootProxyPath)).toBe(true);
    const content = readFileSync(rootProxyPath, "utf8");
    expect(content).toMatch(/export\s+async\s+function\s+proxy\s*\(/);
    expect(content).toMatch(/updateSession\s*\(\s*request\s*\)/);
    expect(existsSync(resolve(process.cwd(), "src/middleware.ts"))).toBe(false);
  });

  it("B & C. verifies exact narrow proxy matcher and public route exclusion", async () => {
    const { config } = await import("@/proxy");
    expect(config).toBeDefined();
    expect(config.matcher).toBeDefined();

    const expectedPatterns = [
      "/cuenta/:path*",
      "/admin/:path*",
      "/auth/cambiar-password",
      "/auth/completar-perfil",
      "/api/admin/:path*",
    ];
    // Catalog listings pass through only to pick their route; they never reach updateSession.
    const catalogPatterns = ["/categorias/:slug", "/marcas/:slug"];

    expect(config.matcher).toEqual([...expectedPatterns, ...catalogPatterns]);

    function matchesProxy(pathname: string): boolean {
      return expectedPatterns.some((pattern: string) => {
        if (pattern.endsWith("/:path*")) {
          const prefix = pattern.replace("/:path*", "");
          return pathname === prefix || pathname.startsWith(prefix + "/");
        }
        return pathname === pattern;
      });
    }

    // Protected surfaces MUST match
    expect(matchesProxy("/cuenta")).toBe(true);
    expect(matchesProxy("/cuenta/pedidos")).toBe(true);
    expect(matchesProxy("/admin")).toBe(true);
    expect(matchesProxy("/admin/productos")).toBe(true);
    expect(matchesProxy("/auth/cambiar-password")).toBe(true);
    expect(matchesProxy("/auth/completar-perfil")).toBe(true);
    expect(matchesProxy("/api/admin/catalog")).toBe(true);

    // Public storefront & auth-unprotected routes MUST NOT match
    expect(matchesProxy("/")).toBe(false);
    expect(matchesProxy("/productos/mouse-pro")).toBe(false);
    expect(matchesProxy("/categorias/mouses")).toBe(false);
    expect(matchesProxy("/marcas/wlmouse")).toBe(false);
    expect(matchesProxy("/buscar")).toBe(false);
    expect(matchesProxy("/api/health")).toBe(false);
    expect(matchesProxy("/api/search/predictive")).toBe(false);
    expect(matchesProxy("/auth/login")).toBe(false);
    expect(matchesProxy("/auth/registro")).toBe(false);
    expect(matchesProxy("/auth/verificar")).toBe(false);
    expect(matchesProxy("/auth/confirm")).toBe(false);
    expect(matchesProxy("/auth/callback")).toBe(false);
    expect(matchesProxy("/auth/olvide-password")).toBe(false);
    expect(matchesProxy("/_next/static/chunks/app.js")).toBe(false);
    expect(matchesProxy("/media/products/mouse.png")).toBe(false);
    expect(matchesProxy("/favicon.ico")).toBe(false);
  });

  it("C2. routes catalog listings without touching the auth session", async () => {
    const { proxy } = await import("@/proxy");
    const withSession = { headers: { cookie: "sb-project-auth-token=abc" } };

    const clean = await proxy(new NextRequest("http://localhost/categorias/mouses", withSession));
    expect(clean.headers.get("x-middleware-rewrite")).toBeNull();
    expect(clean.headers.get("Cache-Control")).toBeNull();

    const filtered = await proxy(
      new NextRequest("http://localhost/categorias/mouses?marca=wlmouse&orden=precio", withSession)
    );
    expect(filtered.headers.get("x-middleware-rewrite")).toBe(
      "http://localhost/categorias/mouses/filtros?marca=wlmouse&orden=precio"
    );
    expect(filtered.headers.get("Cache-Control")).toBeNull();

    const brand = await proxy(new NextRequest("http://localhost/marcas/wlmouse?page=2"));
    expect(brand.headers.get("x-middleware-rewrite")).toBe(
      "http://localhost/marcas/wlmouse/filtros?page=2"
    );
  });

  it("D & E. proves proxy adapter invokes getClaims and never calls getSession", async () => {
    const proxyContent = readFileSync(proxyAdapterPath, "utf8");
    expect(proxyContent).toMatch(/supabase\.auth\.getClaims\(\)/);
    expect(proxyContent).not.toMatch(/supabase\.auth\.getSession/);

    const claimsContent = readFileSync(claimsPath, "utf8");
    expect(claimsContent).toMatch(/supabase\.auth\.getClaims\(\)/);
    expect(claimsContent).not.toMatch(/supabase\.auth\.getSession/);
  });

  it("F. proves zero application-domain Data API usage in auth core files", () => {
    const files = [
      rootProxyPath,
      proxyAdapterPath,
      serverClientPath,
      browserClientPath,
      claimsPath,
    ];
    for (const filePath of files) {
      const content = readFileSync(filePath, "utf8");
      expect(content).not.toMatch(/supabase\.from\s*\(/);
      expect(content).not.toMatch(/supabase\.rpc\s*\(/);
      expect(content).not.toMatch(/\/rest\/v1\//);
      expect(content).not.toMatch(/\/graphql\/v1\//);
    }
  });

  it("G & H. proves cookie setAll updates request cookies, response cookies, and preserves cache headers", async () => {
    let capturedCookieOptions: MockCookieMethods | null = null;
    let getClaimsCalled = false;

    vi.doMock("@supabase/ssr", () => ({
      createServerClient: vi.fn((_url, _key, options: { cookies: MockCookieMethods }) => {
        capturedCookieOptions = options.cookies;
        return {
          auth: {
            getClaims: vi.fn().mockImplementation(async () => {
              getClaimsCalled = true;
              if (capturedCookieOptions?.setAll) {
                capturedCookieOptions.setAll(
                  [
                    {
                      name: "sb-auth-token",
                      value: "refreshed-jwt-token",
                      options: { path: "/", httpOnly: false, sameSite: "lax", secure: false },
                    },
                  ],
                  {
                    "Cache-Control": "private, no-cache, no-store, must-revalidate, max-age=0",
                    Expires: "0",
                    Pragma: "no-cache",
                  }
                );
              }
              return { data: { claims: { sub: "user-123" } }, error: null };
            }),
          },
        };
      }),
    }));

    const { updateSession } = await import("@/lib/supabase/proxy");
    const req = new NextRequest("http://localhost:3000/cuenta", {
      headers: {
        cookie: "sb-auth-token=initial-token",
      },
    });

    const res = await updateSession(req);

    expect(getClaimsCalled).toBe(true);
    expect(res).toBeDefined();

    // Verify response cookie was set
    const setCookieHeader = res.headers.get("set-cookie");
    expect(setCookieHeader).toContain("sb-auth-token=refreshed-jwt-token");

    // Verify response cache headers were applied
    const cacheControl = res.headers.get("cache-control");
    expect(cacheControl).toContain("no-store");
    expect(cacheControl).toContain("private");
    expect(res.headers.get("pragma")).toBe("no-cache");
  });

  it("I & J. verifies getVerifiedIdentity derives identity from verified claims.sub without querying DB", async () => {
    vi.doMock("@/lib/supabase/server", () => ({
      createServerSupabaseClient: vi.fn().mockResolvedValue({
        auth: {
          getClaims: vi.fn().mockResolvedValue({
            data: {
              claims: {
                sub: "018f0000-0000-7000-8000-000000000u01",
                email: "customer@example.pe",
                role: "authenticated",
              },
            },
            error: null,
          }),
        },
      }),
    }));

    const { getVerifiedIdentity } = await import("@/lib/auth/claims");
    const result = await getVerifiedIdentity();

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.identity.authUserId).toBe("018f0000-0000-7000-8000-000000000u01");
      expect(result.identity.email).toBe("customer@example.pe");
      expect(result.identity.claims.sub).toBe("018f0000-0000-7000-8000-000000000u01");
    }

    const claimsContent = readFileSync(claimsPath, "utf8");
    expect(claimsContent).not.toMatch(/from\s+["']@\/db/);
    expect(claimsContent).not.toMatch(/customer_profiles/);
    expect(claimsContent).not.toMatch(/roles/);
    expect(claimsContent).not.toMatch(/permissions/);
    expect(claimsContent).not.toMatch(/user_roles/);
  });

  it("K. verifies getVerifiedIdentity rejects unauthenticated or invalid claims", async () => {
    vi.doMock("@/lib/supabase/server", () => ({
      createServerSupabaseClient: vi.fn().mockResolvedValue({
        auth: {
          getClaims: vi.fn().mockResolvedValue({
            data: null,
            error: { message: "Invalid JWT signature", status: 401 },
          }),
        },
      }),
    }));

    const { getVerifiedIdentity } = await import("@/lib/auth/claims");
    const result = await getVerifiedIdentity();

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.reason).toBe("no_session");
    }
  });

  it("L. proves SUPABASE_SECRET_KEY is not required or referenced in customer auth runtime", () => {
    const authFiles = [
      rootProxyPath,
      proxyAdapterPath,
      serverClientPath,
      browserClientPath,
      claimsPath,
    ];
    for (const filePath of authFiles) {
      const content = readFileSync(filePath, "utf8");
      expect(content).not.toMatch(/SUPABASE_SECRET_KEY/);
      expect(content).not.toMatch(/SUPABASE_SERVICE_ROLE_KEY/);
    }
  });
});
