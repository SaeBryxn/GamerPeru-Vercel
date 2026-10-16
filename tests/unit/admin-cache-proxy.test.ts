import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { hasSupabaseSessionCookie, updateSession } from "@/lib/supabase/proxy";

vi.mock("@supabase/ssr", () => ({
  createServerClient: vi.fn((_url, _key, options) => ({
    auth: {
      getClaims: vi.fn(async () => {
        // Mock getClaims execution
        return { data: { claims: null }, error: null };
      }),
    },
    // Mock helper for tests that trigger cookie writes
    _triggerCookieSet: () => {
      options.cookies.setAll([{ name: "sb-access-token", value: "test-token", options: {} }], {
        "x-custom-header": "test",
      });
    },
  })),
}));

describe("GP-022 — Admin Cache-Control & Proxy Security Tests", () => {
  it("C1: /admin emits explicit private, no-store headers when no cookie write occurs", async () => {
    const request = new NextRequest("https://gamerperu.com/admin");
    const response = await updateSession(request);

    expect(response.headers.get("Cache-Control")).toBe(
      "private, no-cache, no-store, must-revalidate, max-age=0"
    );
    expect(response.headers.get("Pragma")).toBe("no-cache");
  });

  it("C2: /admin/subpath emits explicit private, no-store headers when no cookie write occurs", async () => {
    const request = new NextRequest("https://gamerperu.com/admin/pedidos");
    const response = await updateSession(request);

    expect(response.headers.get("Cache-Control")).toBe(
      "private, no-cache, no-store, must-revalidate, max-age=0"
    );
    expect(response.headers.get("Pragma")).toBe("no-cache");
  });

  it("C3: /api/admin/* emits explicit private, no-store headers", async () => {
    const request = new NextRequest("https://gamerperu.com/api/admin/metrics");
    const response = await updateSession(request);

    expect(response.headers.get("Cache-Control")).toBe(
      "private, no-cache, no-store, must-revalidate, max-age=0"
    );
    expect(response.headers.get("Pragma")).toBe("no-cache");
  });

  it("C4: /cuenta emits explicit private, no-store headers", async () => {
    const request = new NextRequest("https://gamerperu.com/cuenta/pedidos");
    const response = await updateSession(request);

    expect(response.headers.get("Cache-Control")).toBe(
      "private, no-cache, no-store, must-revalidate, max-age=0"
    );
  });

  it("skips the Supabase client when the request has no session cookie", async () => {
    vi.mocked(createServerClient).mockClear();
    const response = await updateSession(new NextRequest("https://gamerperu.com/admin"));

    expect(createServerClient).not.toHaveBeenCalled();
    expect(response.headers.get("Cache-Control")).toContain("no-store");
  });

  it("refreshes the session when a chunked sb- cookie is present", async () => {
    vi.mocked(createServerClient).mockClear();
    const request = new NextRequest("https://gamerperu.com/cuenta", {
      headers: { cookie: "sb-project-auth-token.0=chunk" },
    });

    expect(hasSupabaseSessionCookie(request)).toBe(true);
    await updateSession(request);
    expect(createServerClient).toHaveBeenCalledTimes(1);
  });

  it("continues with no-store headers when the session refresh throws", async () => {
    vi.mocked(createServerClient).mockImplementationOnce(() => ({
      auth: {
        getClaims: vi.fn(async () => {
          throw new Error("network unavailable");
        }),
      },
    }));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const request = new NextRequest("https://gamerperu.com/admin/products", {
      headers: { cookie: "sb-project-auth-token=token" },
    });

    const response = await updateSession(request);

    expect(response.headers.get("Cache-Control")).toBe(
      "private, no-cache, no-store, must-revalidate, max-age=0"
    );
    expect(errorSpy).toHaveBeenCalledTimes(1);
    errorSpy.mockRestore();
  });

  it("keeps the proxy module free of import-time environment parsing", () => {
    const source = readFileSync(resolve(process.cwd(), "src/lib/supabase/proxy.ts"), "utf8");
    expect(source).not.toMatch(/@\/config\/public-env/);
    expect(source).not.toMatch(/from "zod"/);
  });
});
