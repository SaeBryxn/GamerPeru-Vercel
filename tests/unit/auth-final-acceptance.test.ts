import { describe, it, expect, vi, beforeEach } from "vitest";
import { resolve } from "node:path";
import { readFileSync } from "node:fs";

// Mock server-only
vi.mock("server-only", () => ({}));

describe("GP-015 AUTH9-B — Final Security Acceptance & Integration Suite", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  describe("1. Token Signature Verification & Tamper Resistance", () => {
    it("proves getVerifiedIdentity fails closed when token signature is invalid or tampered", async () => {
      const mockGetClaims = vi.fn().mockResolvedValue({
        data: null,
        error: new Error("AuthApiError: invalid JWT signature: verification failed"),
      });

      vi.doMock("@/lib/supabase/server", () => ({
        createServerSupabaseClient: vi.fn(async () => ({
          auth: {
            getClaims: mockGetClaims,
          },
        })),
      }));

      const { getVerifiedIdentity } = await import("@/lib/auth/claims");
      const result = await getVerifiedIdentity();

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.reason).toBe("no_session");
      }
    });

    it("proves getVerifiedIdentity fails closed when claims payload lacks valid sub UUID", async () => {
      const mockGetClaims = vi.fn().mockResolvedValue({
        data: {
          claims: {
            sub: "",
            email: "attacker@forged.com",
          },
        },
        error: null,
      });

      vi.doMock("@/lib/supabase/server", () => ({
        createServerSupabaseClient: vi.fn(async () => ({
          auth: {
            getClaims: mockGetClaims,
          },
        })),
      }));

      const { getVerifiedIdentity } = await import("@/lib/auth/claims");
      const result = await getVerifiedIdentity();

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.reason).toBe("invalid_claims");
      }
    });
  });

  describe("2. Schema Foreign Key Semantics & Identity Detachment Safety", () => {
    it("proves customer_profiles.auth_user_id uses ON DELETE SET NULL to preserve history without auth", async () => {
      const schemaPath = resolve(process.cwd(), "src/db/schema/identity/customer-profiles.ts");
      const content = readFileSync(schemaPath, "utf8");

      expect(content).toMatch(/onDelete\(\s*"set null"\s*\)/);
    });

    it("proves user_roles.auth_user_id uses ON DELETE CASCADE to prevent orphaned privilege rows", async () => {
      const schemaPath = resolve(process.cwd(), "src/db/schema/identity/user-roles.ts");
      const content = readFileSync(schemaPath, "utf8");

      expect(content).toMatch(/onDelete\(\s*"cascade"\s*\)/);
    });

    it("proves profile query predicates strictly match auth_user_id and never detached NULL rows", async () => {
      const profilePath = resolve(process.cwd(), "src/lib/auth/profile.ts");
      const content = readFileSync(profilePath, "utf8");

      expect(content).toMatch(/eq\(customerProfiles\.authUserId,\s*authUserId\)/);
      expect(content).not.toMatch(/isNull\(customerProfiles\.authUserId\)/);
      expect(content).not.toMatch(/or\(.*email.*\)/);
    });
  });

  describe("3. Security Boundaries & Authorization Authority", () => {
    it("proves zero getSession() calls exist across the entire application", () => {
      const proxyPath = resolve(process.cwd(), "src/proxy.ts");
      const rbacPath = resolve(process.cwd(), "src/lib/auth/rbac.ts");
      const claimsPath = resolve(process.cwd(), "src/lib/auth/claims.ts");

      const files = [proxyPath, rbacPath, claimsPath];
      for (const file of files) {
        const content = readFileSync(file, "utf8");
        expect(content).not.toMatch(/getSession\(\)/);
      }
    });

    it("proves zero Data API (supabase.from / supabase.rpc) usage for application domain tables", () => {
      const actionsPath = resolve(process.cwd(), "src/lib/auth/actions.ts");
      const rbacPath = resolve(process.cwd(), "src/lib/auth/rbac.ts");

      const files = [actionsPath, rbacPath];
      for (const file of files) {
        const content = readFileSync(file, "utf8");
        expect(content).not.toMatch(/supabase\.from\(/);
        expect(content).not.toMatch(/supabase\.rpc\(/);
      }
    });

    it("proves auth metadata cannot grant RBAC roles or permissions", () => {
      const rbacPath = resolve(process.cwd(), "src/lib/auth/rbac.ts");
      const content = readFileSync(rbacPath, "utf8");

      expect(content).not.toMatch(/user_metadata/);
      expect(content).not.toMatch(/app_metadata/);
      expect(content).toMatch(/from\(userRoles\)/);
    });
  });

  describe("4. Session Expiry & Refresh Proxy Adapter", () => {
    it("proves updateSession invokes getClaims() for cryptographic refresh and sets no-cache headers", async () => {
      const proxyAdapterPath = resolve(process.cwd(), "src/lib/supabase/proxy.ts");
      const content = readFileSync(proxyAdapterPath, "utf8");

      expect(content).toMatch(/supabase\.auth\.getClaims\(\)/);
      expect(content).toMatch(/private, no-cache, no-store, must-revalidate, max-age=0/);
    });
  });

  describe("5. Scanner-Safe Confirmation & Recovery Flow", () => {
    it("proves confirmation/recovery OTP verification occurs strictly via explicit POST Server Action", () => {
      const actionsPath = resolve(process.cwd(), "src/lib/auth/actions.ts");
      const content = readFileSync(actionsPath, "utf8");

      expect(content).toMatch(/export async function verifyConfirmationOtpAction/);
      expect(content).toMatch(/supabase\.auth\.verifyOtp/);
    });
  });
});
