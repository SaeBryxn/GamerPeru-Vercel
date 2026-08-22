import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { validateUpdateProfileInput, CANONICAL_DOCUMENT_TYPES } from "@/lib/account/validation";
import { getCurrentCustomerProfile } from "@/lib/account/profile";
import { updateCustomerProfileAction } from "@/lib/account/actions";
import { toProfileFormDTO } from "@/lib/account/types";
import type { ProfileFormDTO, ServerProfileView, UpdateProfileInput } from "@/lib/account/types";
import { metadata as cuentaMetadata, dynamic as cuentaDynamic } from "@/app/cuenta/layout";
import { metadata as perfilMetadata, dynamic as perfilDynamic } from "@/app/cuenta/perfil/page";
import * as claimsModule from "@/lib/auth/claims";
import * as dbModule from "@/db";
import { logger } from "@/lib/logger";

vi.mock("@/lib/auth/claims", () => ({
  getVerifiedIdentity: vi.fn(),
}));

vi.mock("@/db", () => ({
  db: {
    select: vi.fn(),
    update: vi.fn(),
  },
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

function mockIdentity(authUserId: string, email: string) {
  return {
    success: true as const,
    identity: { authUserId, email, claims: {} },
  };
}

function mockDbSelectEmpty() {
  const mockLimit = vi.fn().mockResolvedValueOnce([]);
  const mockWhere = vi.fn().mockReturnValue({ limit: mockLimit });
  const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
  vi.mocked(dbModule.db.select).mockReturnValueOnce({
    from: mockFrom,
  } as unknown as ReturnType<typeof dbModule.db.select>);
}

function mockDbSelectProfile(profile: Record<string, unknown>) {
  const mockLimit = vi.fn().mockResolvedValueOnce([profile]);
  const mockWhere = vi.fn().mockReturnValue({ limit: mockLimit });
  const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
  vi.mocked(dbModule.db.select).mockReturnValueOnce({
    from: mockFrom,
  } as unknown as ReturnType<typeof dbModule.db.select>);
}

function mockDbSelectThrow(errorMessage: string) {
  const mockWhere = vi.fn().mockImplementation(() => {
    throw new Error(errorMessage);
  });
  const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
  vi.mocked(dbModule.db.select).mockReturnValueOnce({
    from: mockFrom,
  } as unknown as ReturnType<typeof dbModule.db.select>);
}

function mockDbUpdateReturning(rows: Record<string, unknown>[]) {
  const mockReturning = vi.fn().mockResolvedValueOnce(rows);
  const mockWhere = vi.fn().mockReturnValue({ returning: mockReturning });
  const mockSet = vi.fn().mockReturnValue({ where: mockWhere });
  vi.mocked(dbModule.db.update).mockReturnValueOnce({
    set: mockSet,
  } as unknown as ReturnType<typeof dbModule.db.update>);
  return { mockSet, mockWhere, mockReturning };
}

function mockDbUpdateThrow(errorMessage: string) {
  const mockWhere = vi.fn().mockImplementation(() => {
    throw new Error(errorMessage);
  });
  const mockSet = vi.fn().mockReturnValue({ where: mockWhere });
  vi.mocked(dbModule.db.update).mockReturnValueOnce({
    set: mockSet,
  } as unknown as ReturnType<typeof dbModule.db.update>);
  return { mockSet };
}

const HOSTILE_ERROR_READ =
  'Failed query: select "id", "auth_user_id" from "customer_profiles" ' +
  "WHERE auth_user_id = $1 limit $2\n" +
  "params: SYNTHETIC_AUTH_UUID_abc123, 1\n" +
  "email: SYNTHETIC_EMAIL_test@secret.com\n" +
  "document: SYNTHETIC_DOCUMENT_70001234";

const HOSTILE_ERROR_UPDATE =
  "update failed: SYNTHETIC_AUTH_UUID_xyz789\n" +
  "SYNTHETIC_EMAIL_admin@gamerperu.com\n" +
  "SYNTHETIC_DOCUMENT_99887766\n" +
  "phone: +51-999-SYNTHETIC";

describe("GP-016 ACCT4-BR1 — Customer Account Profile Privacy, Client-Boundary & Accessibility Remediation Suite", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(dbModule.db.select).mockReset();
    vi.mocked(dbModule.db.update).mockReset();
  });

  // ============================================================
  // A/B: Logger never includes raw error.message
  // ============================================================
  describe("Production Logging Privacy — zero exception-derived content", () => {
    it("A: profile reader logger emits only fixed event key, zero raw error.message content", async () => {
      vi.mocked(claimsModule.getVerifiedIdentity).mockResolvedValueOnce(
        mockIdentity("auth-read-err", "reader@gp.com")
      );
      mockDbSelectThrow(HOSTILE_ERROR_READ);

      const res = await getCurrentCustomerProfile();
      expect(res.status).toBe("ERROR");

      expect(logger.error).toHaveBeenCalledTimes(1);
      const logPayload = vi.mocked(logger.error).mock.calls[0]?.[0] as Record<string, unknown>;
      expect(logPayload.event).toBe("account_profile_read_failed");

      // Verify zero raw exception content leaked
      const serialized = JSON.stringify(logPayload);
      expect(serialized).not.toContain("SYNTHETIC_AUTH_UUID");
      expect(serialized).not.toContain("SYNTHETIC_EMAIL");
      expect(serialized).not.toContain("SYNTHETIC_DOCUMENT");
      expect(serialized).not.toContain("Failed query");
      expect(serialized).not.toContain("params:");
      expect(serialized).not.toContain("error.message");

      // No reason field should exist with exception content
      expect(logPayload).not.toHaveProperty("reason");
      expect(logPayload).not.toHaveProperty("message");
      expect(logPayload).not.toHaveProperty("stack");
    });

    it("B: profile update logger emits only fixed event key, zero raw error.message content", async () => {
      vi.mocked(claimsModule.getVerifiedIdentity).mockResolvedValueOnce(
        mockIdentity("auth-update-err", "updater@gp.com")
      );
      mockDbUpdateThrow(HOSTILE_ERROR_UPDATE);

      const res = await updateCustomerProfileAction(null, {
        firstName: "Test",
        lastName: "User",
      });

      expect(res.success).toBe(false);
      expect(logger.error).toHaveBeenCalledTimes(1);
      const logPayload = vi.mocked(logger.error).mock.calls[0]?.[0] as Record<string, unknown>;
      expect(logPayload.event).toBe("account_profile_update_failed");

      const serialized = JSON.stringify(logPayload);
      expect(serialized).not.toContain("SYNTHETIC_AUTH_UUID");
      expect(serialized).not.toContain("SYNTHETIC_EMAIL");
      expect(serialized).not.toContain("SYNTHETIC_DOCUMENT");
      expect(serialized).not.toContain("update failed");
      expect(serialized).not.toContain("SYNTHETIC");
    });

    it("C: synthetic auth UUID absent from all logger payloads on read failure", async () => {
      vi.mocked(claimsModule.getVerifiedIdentity).mockResolvedValueOnce(
        mockIdentity("SYNTHETIC_AUTH_UUID_injected", "secret@gp.com")
      );
      mockDbSelectThrow("connection error with SYNTHETIC_AUTH_UUID_injected embedded");

      await getCurrentCustomerProfile();

      const serialized = JSON.stringify(vi.mocked(logger.error).mock.calls);
      expect(serialized).not.toContain("SYNTHETIC_AUTH_UUID_injected");
    });

    it("D: synthetic email absent from all logger payloads on update failure", async () => {
      vi.mocked(claimsModule.getVerifiedIdentity).mockResolvedValueOnce(
        mockIdentity("auth-d", "SYNTHETIC_EMAIL_secret@gamerperu.com")
      );
      mockDbUpdateThrow("deadlock involving SYNTHETIC_EMAIL_secret@gamerperu.com");

      await updateCustomerProfileAction(null, { firstName: "A", lastName: "B" });

      const serialized = JSON.stringify(vi.mocked(logger.error).mock.calls);
      expect(serialized).not.toContain("SYNTHETIC_EMAIL_secret@gamerperu.com");
    });

    it("E: synthetic document values absent from all logger payloads", async () => {
      vi.mocked(claimsModule.getVerifiedIdentity).mockResolvedValueOnce(
        mockIdentity("auth-e", "doc@gp.com")
      );
      mockDbUpdateThrow("FK violation on document SYNTH_DOC_99001122");

      await updateCustomerProfileAction(null, {
        firstName: "X",
        lastName: "Y",
        documentType: "DNI",
        documentNumber: "SYNTH_DOC_99001122",
      });

      const serialized = JSON.stringify(vi.mocked(logger.error).mock.calls);
      expect(serialized).not.toContain("SYNTH_DOC_99001122");
    });
  });

  // ============================================================
  // F/G/H: Client DTO minimization
  // ============================================================
  describe("Client Profile DTO Minimization", () => {
    const serverProfile: ServerProfileView = {
      id: "prof-uuid-secret",
      authUserId: "auth-uuid-secret",
      firstName: "Rosa",
      lastName: "Flores",
      phone: "987654321",
      documentType: "DNI",
      documentNumber: "70809010",
      defaultShippingAddressId: "addr-uuid-secret",
      createdAt: new Date("2026-01-01T00:00:00Z"),
      updatedAt: new Date("2026-06-15T12:00:00Z"),
      email: "rosa@gp.com",
    };

    it("F: client form DTO excludes profile.id", () => {
      const dto = toProfileFormDTO(serverProfile);
      expect(dto).not.toHaveProperty("id");
    });

    it("G: client form DTO excludes authUserId", () => {
      const dto = toProfileFormDTO(serverProfile);
      expect(dto).not.toHaveProperty("authUserId");
    });

    it("H: client form DTO excludes defaultShippingAddressId, createdAt, updatedAt", () => {
      const dto = toProfileFormDTO(serverProfile);
      expect(dto).not.toHaveProperty("defaultShippingAddressId");
      expect(dto).not.toHaveProperty("createdAt");
      expect(dto).not.toHaveProperty("updatedAt");
    });

    it("F/G/H: client form DTO contains only editable/display fields", () => {
      const dto = toProfileFormDTO(serverProfile);
      const keys = Object.keys(dto).sort();
      expect(keys).toEqual(
        ["documentNumber", "documentType", "email", "firstName", "lastName", "phone"].sort()
      );
    });

    it("ProfileFormDTO type excludes internal identifiers structurally", () => {
      const dto: ProfileFormDTO = {
        firstName: "Test",
        lastName: "User",
        phone: null,
        documentType: null,
        documentNumber: null,
        email: "test@gp.com",
      };
      expect(dto).not.toHaveProperty("id");
      expect(dto).not.toHaveProperty("authUserId");
      expect(dto).not.toHaveProperty("defaultShippingAddressId");
    });
  });

  // ============================================================
  // I: Server Action success response minimization
  // ============================================================
  describe("Server Action Response Minimization", () => {
    it("I: Server Action success response excludes internal IDs", async () => {
      vi.mocked(claimsModule.getVerifiedIdentity).mockResolvedValueOnce(
        mockIdentity("auth-minimized", "min@gp.com")
      );
      mockDbUpdateReturning([
        {
          id: "should-not-appear",
          authUserId: "should-not-appear-auth",
          firstName: "MinFirst",
          lastName: "MinLast",
          phone: "999",
          documentType: "DNI",
          documentNumber: "12345678",
          defaultShippingAddressId: "should-not-appear-addr",
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);

      const res = await updateCustomerProfileAction(null, {
        firstName: "MinFirst",
        lastName: "MinLast",
        phone: "999",
        documentType: "DNI",
        documentNumber: "12345678",
      });

      expect(res.success).toBe(true);
      if (res.success) {
        const serialized = JSON.stringify(res);
        expect(serialized).not.toContain("should-not-appear");
        expect(res).not.toHaveProperty("profile");
        expect(res.fields.firstName).toBe("MinFirst");
        expect(res.fields.lastName).toBe("MinLast");
        expect(res.fields.phone).toBe("999");
        expect(res.fields.documentType).toBe("DNI");
        expect(res.fields.documentNumber).toBe("12345678");
      }
    });
  });

  // ============================================================
  // J/K: IDOR authority preservation
  // ============================================================
  describe("IDOR Authority Preservation", () => {
    it("J: Server Action still derives ownership from verified claims.sub", async () => {
      vi.mocked(claimsModule.getVerifiedIdentity).mockResolvedValueOnce(
        mockIdentity("auth-alice", "alice@gp.com")
      );
      const { mockSet } = mockDbUpdateReturning([
        {
          id: "prof-alice",
          authUserId: "auth-alice",
          firstName: "Alicia",
          lastName: "Updated",
          phone: null,
          documentType: null,
          documentNumber: null,
          defaultShippingAddressId: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);

      await updateCustomerProfileAction(null, {
        firstName: "Alicia",
        lastName: "Updated",
      });

      const setPayload = (mockSet.mock.calls[0] as Record<string, unknown>[])?.[0] ?? {};
      expect(setPayload.firstName).toBe("Alicia");
      expect(setPayload.authUserId).toBeUndefined();
      expect(setPayload.id).toBeUndefined();
    });

    it("K: malicious authority fields in payload remain ignored", async () => {
      vi.mocked(claimsModule.getVerifiedIdentity).mockResolvedValueOnce(
        mockIdentity("auth-alice", "alice@gp.com")
      );
      const { mockSet } = mockDbUpdateReturning([
        {
          id: "prof-alice",
          authUserId: "auth-alice",
          firstName: "Safe",
          lastName: "User",
          phone: null,
          documentType: null,
          documentNumber: null,
          defaultShippingAddressId: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);

      await updateCustomerProfileAction(null, {
        firstName: "Safe",
        lastName: "User",
        customerId: "bob-uuid",
        authUserId: "bob-auth-uuid",
        id: "bob-profile-uuid",
      } as unknown as UpdateProfileInput);

      const setPayload = (mockSet.mock.calls[0] as Record<string, unknown>[])?.[0] ?? {};
      expect(setPayload.customerId).toBeUndefined();
      expect(setPayload.authUserId).toBeUndefined();
      expect(setPayload.id).toBeUndefined();
    });
  });

  // ============================================================
  // L: Profile validation contract unchanged
  // ============================================================
  describe("Profile Validation Contract Preservation", () => {
    it("L: preserves canonical validation contract", () => {
      // firstName: trim, non-empty, max100, 1-char allowed
      expect(validateUpdateProfileInput({ firstName: " J ", lastName: "D" }).success).toBe(true);
      expect(validateUpdateProfileInput({ firstName: "", lastName: "D" }).success).toBe(false);
      expect(
        validateUpdateProfileInput({ firstName: "A".repeat(101), lastName: "D" }).success
      ).toBe(false);

      // lastName: trim, non-empty, max100, 1-char allowed
      expect(validateUpdateProfileInput({ firstName: "J", lastName: " D " }).success).toBe(true);
      expect(validateUpdateProfileInput({ firstName: "J", lastName: "" }).success).toBe(false);

      // phone: optional, trim, blank->NULL, max20, no regex
      const phoneBlank = validateUpdateProfileInput({
        firstName: "J",
        lastName: "D",
        phone: "   ",
      });
      expect(phoneBlank.success && phoneBlank.data.phone).toBeNull();

      // document pair: both NULL or both provided
      expect(
        validateUpdateProfileInput({
          firstName: "J",
          lastName: "D",
          documentType: "DNI",
          documentNumber: "",
        }).success
      ).toBe(false);
      expect(
        validateUpdateProfileInput({
          firstName: "J",
          lastName: "D",
          documentType: "",
          documentNumber: "12345678",
        }).success
      ).toBe(false);

      // canonical types
      expect(CANONICAL_DOCUMENT_TYPES).toEqual(["DNI", "CE", "RUC", "PASSPORT"]);
    });
  });

  // ============================================================
  // M: Nested interactive control elimination
  // ============================================================
  describe("Nested Interactive Control Elimination", () => {
    it("M: /cuenta page edit action uses no nested Link+Button structure", () => {
      const pageSource = readFileSync(resolve(process.cwd(), "src/app/cuenta/page.tsx"), "utf8");
      // Must not contain Link wrapping a Button
      expect(pageSource).not.toMatch(/<Link[^>]*>[\s\S]*?<Button[\s\S]*?<\/Link>/);
      // Must not import Button
      expect(pageSource).not.toContain('from "@/components/ui/button"');
      // Should use a Link with className for editLink styling
      expect(pageSource).toContain("styles.editLink");
    });
  });

  // ============================================================
  // N/O: Account metadata and dynamic routing
  // ============================================================
  describe("Account Security & Route Architecture", () => {
    it("N: account routes declare noindex/nofollow robots", () => {
      expect(cuentaMetadata.robots).toEqual({ index: false, follow: false });
      expect(perfilMetadata.robots).toEqual({ index: false, follow: false });
    });

    it("O: account routes remain force-dynamic", () => {
      expect(cuentaDynamic).toBe("force-dynamic");
      expect(perfilDynamic).toBe("force-dynamic");
    });
  });

  // ============================================================
  // P: Logout contract preservation
  // ============================================================
  describe("Logout Contract Preservation", () => {
    it("P: account navigation includes LogoutButton", () => {
      const navSource = readFileSync(
        resolve(process.cwd(), "src/components/account/account-navigation.tsx"),
        "utf8"
      );
      expect(navSource).toContain("LogoutButton");
      expect(navSource).toContain("@/components/auth/logout-button");
    });
  });

  // ============================================================
  // Reader and Action functional tests
  // ============================================================
  describe("getCurrentCustomerProfile Reader", () => {
    it("returns UNAUTHENTICATED when getVerifiedIdentity fails", async () => {
      vi.mocked(claimsModule.getVerifiedIdentity).mockResolvedValueOnce({
        success: false,
        reason: "no_session",
      });
      const res = await getCurrentCustomerProfile();
      expect(res.status).toBe("UNAUTHENTICATED");
    });

    it("returns NEEDS_PROFILE_COMPLETION when no profile row exists", async () => {
      vi.mocked(claimsModule.getVerifiedIdentity).mockResolvedValueOnce(
        mockIdentity("auth-123", "test@gp.com")
      );
      mockDbSelectEmpty();
      const res = await getCurrentCustomerProfile();
      expect(res.status).toBe("NEEDS_PROFILE_COMPLETION");
    });

    it("returns READY with server profile when profile exists", async () => {
      vi.mocked(claimsModule.getVerifiedIdentity).mockResolvedValueOnce(
        mockIdentity("auth-456", "gamer@gp.com")
      );
      mockDbSelectProfile({
        id: "prof-456",
        authUserId: "auth-456",
        firstName: "Diego",
        lastName: "Armando",
        phone: "987654321",
        documentType: "DNI",
        documentNumber: "70809010",
        defaultShippingAddressId: null,
        createdAt: new Date("2026-01-01"),
        updatedAt: new Date("2026-01-02"),
      });
      const res = await getCurrentCustomerProfile();
      expect(res.status).toBe("READY");
      if (res.status === "READY") {
        expect(res.profile.firstName).toBe("Diego");
        expect(res.profile.email).toBe("gamer@gp.com");
      }
    });
  });

  describe("updateCustomerProfileAction Functional", () => {
    it("returns unauthenticated error when no session", async () => {
      vi.mocked(claimsModule.getVerifiedIdentity).mockResolvedValueOnce({
        success: false,
        reason: "no_session",
      });
      const res = await updateCustomerProfileAction(null, {
        firstName: "A",
        lastName: "B",
      });
      expect(res.success).toBe(false);
    });

    it("returns validation errors for invalid input", async () => {
      vi.mocked(claimsModule.getVerifiedIdentity).mockResolvedValueOnce(
        mockIdentity("auth-v", "v@gp.com")
      );
      const res = await updateCustomerProfileAction(null, {
        firstName: "",
        lastName: "B",
      });
      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.errors.firstName).toBeDefined();
      }
    });
  });
});
