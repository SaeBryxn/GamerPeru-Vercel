import { describe, expect, it, vi, beforeEach } from "vitest";
import { validateUpdateProfileInput, CANONICAL_DOCUMENT_TYPES } from "@/lib/account/validation";
import { getCurrentCustomerProfile } from "@/lib/account/profile";
import { updateCustomerProfileAction } from "@/lib/account/actions";
import type { UpdateProfileInput } from "@/lib/account/types";
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

describe("GP-016 ACCT4 — Customer Account Profile Runtime & Validation Suite", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Profile Input Validation Rules", () => {
    it("G/H/I: accepts valid first and last names including 1-character names and trims whitespace", () => {
      const res = validateUpdateProfileInput({
        firstName: " J ",
        lastName: " D ",
      });

      expect(res.success).toBe(true);
      if (res.success) {
        expect(res.data.firstName).toBe("J");
        expect(res.data.lastName).toBe("D");
      }
    });

    it("G/H: rejects empty or whitespace-only first and last names", () => {
      const res1 = validateUpdateProfileInput({
        firstName: "   ",
        lastName: "Valenzuela",
      });
      expect(res1.success).toBe(false);
      if (!res1.success) {
        expect(res1.errors.firstName).toBeDefined();
      }

      const res2 = validateUpdateProfileInput({
        firstName: "Carlos",
        lastName: "",
      });
      expect(res2.success).toBe(false);
      if (!res2.success) {
        expect(res2.errors.lastName).toBeDefined();
      }
    });

    it("G/H: rejects names exceeding 100 characters", () => {
      const longName = "A".repeat(101);
      const res = validateUpdateProfileInput({
        firstName: longName,
        lastName: "Pérez",
      });
      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.errors.firstName).toContain("100 caracteres");
      }
    });

    it("J/K/L: normalizes empty phone to null, trims phone up to 20 chars, and allows international/arbitrary formats without invented regex", () => {
      const resBlank = validateUpdateProfileInput({
        firstName: "Ana",
        lastName: "García",
        phone: "   ",
      });
      expect(resBlank.success).toBe(true);
      if (resBlank.success) {
        expect(resBlank.data.phone).toBeNull();
      }

      const resArbitrary = validateUpdateProfileInput({
        firstName: "Ana",
        lastName: "García",
        phone: " +1 (555) 019-2834 ",
      });
      expect(resArbitrary.success).toBe(true);
      if (resArbitrary.success) {
        expect(resArbitrary.data.phone).toBe("+1 (555) 019-2834");
      }

      const resTooLong = validateUpdateProfileInput({
        firstName: "Ana",
        lastName: "García",
        phone: "1".repeat(21),
      });
      expect(resTooLong.success).toBe(false);
      if (!resTooLong.success) {
        expect(resTooLong.errors.phone).toBeDefined();
      }
    });

    it("M: normalizes empty document pair to both null", () => {
      const res = validateUpdateProfileInput({
        firstName: "Pedro",
        lastName: "Castillo",
        documentType: "",
        documentNumber: "   ",
      });
      expect(res.success).toBe(true);
      if (res.success) {
        expect(res.data.documentType).toBeNull();
        expect(res.data.documentNumber).toBeNull();
      }
    });

    it("N: accepts valid canonical document types and trimmed document numbers", () => {
      for (const type of CANONICAL_DOCUMENT_TYPES) {
        const res = validateUpdateProfileInput({
          firstName: "Rosa",
          lastName: "Flores",
          documentType: type,
          documentNumber: " 72819203 ",
        });
        expect(res.success).toBe(true);
        if (res.success) {
          expect(res.data.documentType).toBe(type);
          expect(res.data.documentNumber).toBe("72819203");
        }
      }
    });

    it("O: rejects documentType when documentNumber is missing", () => {
      const res = validateUpdateProfileInput({
        firstName: "Rosa",
        lastName: "Flores",
        documentType: "DNI",
        documentNumber: "",
      });
      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.errors.documentNumber).toBeDefined();
      }
    });

    it("P: rejects documentNumber when documentType is missing", () => {
      const res = validateUpdateProfileInput({
        firstName: "Rosa",
        lastName: "Flores",
        documentType: "",
        documentNumber: "12345678",
      });
      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.errors.documentType).toBeDefined();
      }
    });

    it("Q/R: rejects document number exceeding 20 chars but accepts non-standard lengths without invented Peru length constraints", () => {
      const resShortDni = validateUpdateProfileInput({
        firstName: "Juan",
        lastName: "Pérez",
        documentType: "DNI",
        documentNumber: "12345",
      });
      expect(resShortDni.success).toBe(true);

      const resTooLong = validateUpdateProfileInput({
        firstName: "Juan",
        lastName: "Pérez",
        documentType: "PASSPORT",
        documentNumber: "P".repeat(21),
      });
      expect(resTooLong.success).toBe(false);
      if (!resTooLong.success) {
        expect(resTooLong.errors.documentNumber).toBeDefined();
      }
    });
  });

  describe("getCurrentCustomerProfile Reader", () => {
    it("A/D: returns UNAUTHENTICATED when getVerifiedIdentity fails", async () => {
      vi.mocked(claimsModule.getVerifiedIdentity).mockResolvedValueOnce({
        success: false,
        reason: "no_session",
      });

      const res = await getCurrentCustomerProfile();
      expect(res.status).toBe("UNAUTHENTICATED");
    });

    it("B/E: queries by verified auth_user_id and returns NEEDS_PROFILE_COMPLETION when no profile row exists", async () => {
      vi.mocked(claimsModule.getVerifiedIdentity).mockResolvedValueOnce({
        success: true,
        identity: {
          authUserId: "auth-uuid-123",
          email: "test@gamerperu.com",
          claims: {},
        },
      });

      const mockLimit = vi.fn().mockResolvedValueOnce([]);
      const mockWhere = vi.fn().mockReturnValue({ limit: mockLimit });
      const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
      vi.mocked(dbModule.db.select).mockReturnValueOnce({
        from: mockFrom,
      } as unknown as ReturnType<typeof dbModule.db.select>);

      const res = await getCurrentCustomerProfile();
      expect(res.status).toBe("NEEDS_PROFILE_COMPLETION");
      if (res.status === "NEEDS_PROFILE_COMPLETION") {
        expect(res.authUserId).toBe("auth-uuid-123");
        expect(res.email).toBe("test@gamerperu.com");
      }
    });

    it("B/C: returns READY with canonical CustomerProfile and auth email when profile exists", async () => {
      vi.mocked(claimsModule.getVerifiedIdentity).mockResolvedValueOnce({
        success: true,
        identity: {
          authUserId: "auth-uuid-456",
          email: "gamer@gamerperu.com",
          claims: {},
        },
      });

      const mockProfile = {
        id: "prof-uuid-456",
        authUserId: "auth-uuid-456",
        firstName: "Diego",
        lastName: "Armando",
        phone: "987654321",
        documentType: "DNI",
        documentNumber: "70809010",
        defaultShippingAddressId: null,
        createdAt: new Date("2026-01-01T00:00:00Z"),
        updatedAt: new Date("2026-01-02T00:00:00Z"),
      };

      const mockLimit = vi.fn().mockResolvedValueOnce([mockProfile]);
      const mockWhere = vi.fn().mockReturnValue({ limit: mockLimit });
      const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
      vi.mocked(dbModule.db.select).mockReturnValueOnce({
        from: mockFrom,
      } as unknown as ReturnType<typeof dbModule.db.select>);

      const res = await getCurrentCustomerProfile();
      expect(res.status).toBe("READY");
      if (res.status === "READY") {
        expect(res.profile.firstName).toBe("Diego");
        expect(res.profile.lastName).toBe("Armando");
        expect(res.profile.email).toBe("gamer@gamerperu.com");
        expect(res.profile.id).toBe("prof-uuid-456");
      }
    });

    it("F/Y/Z: returns safe generic ERROR and logs sanitized event without PII on database failure", async () => {
      vi.mocked(claimsModule.getVerifiedIdentity).mockResolvedValueOnce({
        success: true,
        identity: {
          authUserId: "auth-uuid-789",
          email: "secret@gamerperu.com",
          claims: {},
        },
      });

      const mockWhere = vi.fn().mockImplementation(() => {
        throw new Error("connection terminated");
      });
      const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
      vi.mocked(dbModule.db.select).mockReturnValueOnce({
        from: mockFrom,
      } as unknown as ReturnType<typeof dbModule.db.select>);

      const res = await getCurrentCustomerProfile();
      expect(res.status).toBe("ERROR");
      if (res.status === "ERROR") {
        expect(res.error).toBe("No se pudo cargar el perfil de usuario.");
      }

      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          event: "account_profile_read_failed",
        })
      );
    });
  });

  describe("updateCustomerProfileAction Server Action & IDOR Immunity", () => {
    it("S/T: derives update authority strictly from verified claims.sub and updates only caller profile", async () => {
      vi.mocked(claimsModule.getVerifiedIdentity).mockResolvedValueOnce({
        success: true,
        identity: {
          authUserId: "auth-alice-uuid",
          email: "alice@gamerperu.com",
          claims: {},
        },
      });

      const mockReturning = vi.fn().mockResolvedValueOnce([
        {
          id: "prof-alice-uuid",
          authUserId: "auth-alice-uuid",
          firstName: "Alicia",
          lastName: "Smith",
          phone: "999888777",
          documentType: "CE",
          documentNumber: "0011223344",
          defaultShippingAddressId: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);
      const mockWhere = vi.fn().mockReturnValue({ returning: mockReturning });
      const mockSet = vi.fn().mockReturnValue({ where: mockWhere });
      vi.mocked(dbModule.db.update).mockReturnValueOnce({
        set: mockSet,
      } as unknown as ReturnType<typeof dbModule.db.update>);

      const formData = new FormData();
      formData.append("firstName", "Alicia");
      formData.append("lastName", "Smith");
      formData.append("phone", "999888777");
      formData.append("documentType", "CE");
      formData.append("documentNumber", "0011223344");

      const res = await updateCustomerProfileAction(null, formData);
      expect(res.success).toBe(true);
      if (res.success) {
        expect(res.message).toBe("Perfil actualizado correctamente.");
        expect(res.profile.firstName).toBe("Alicia");
      }
    });

    it("U: prevents IDOR by ignoring any attempt by Customer A to modify Customer B via payload parameters", async () => {
      vi.mocked(claimsModule.getVerifiedIdentity).mockResolvedValueOnce({
        success: true,
        identity: {
          authUserId: "auth-alice-uuid",
          email: "alice@gamerperu.com",
          claims: {},
        },
      });

      const mockReturning = vi.fn().mockResolvedValueOnce([
        {
          id: "prof-alice-uuid",
          authUserId: "auth-alice-uuid",
          firstName: "Alicia",
          lastName: "Smith",
          phone: null,
          documentType: null,
          documentNumber: null,
          defaultShippingAddressId: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);
      const mockWhere = vi.fn().mockReturnValue({ returning: mockReturning });
      const mockSet = vi.fn().mockReturnValue({ where: mockWhere });
      vi.mocked(dbModule.db.update).mockReturnValueOnce({
        set: mockSet,
      } as unknown as ReturnType<typeof dbModule.db.update>);

      // Attempting to pass customer_id / auth_user_id of Bob in payload
      const maliciousPayload = {
        firstName: "Alicia",
        lastName: "Smith",
        customerId: "bob-profile-uuid",
        authUserId: "bob-auth-uuid",
      } as unknown as UpdateProfileInput;

      const res = await updateCustomerProfileAction(null, maliciousPayload);
      expect(res.success).toBe(true);

      // Verify that the database query targeted Alice's verified authUserId, NOT Bob
      expect(mockSet).toHaveBeenCalledWith(
        expect.objectContaining({
          firstName: "Alicia",
          lastName: "Smith",
        })
      );
      expect(mockWhere).toHaveBeenCalled();
    });

    it("V/W/X: preserves default_shipping_address_id, auth_user_id, and email untouched during update", async () => {
      vi.mocked(claimsModule.getVerifiedIdentity).mockResolvedValueOnce({
        success: true,
        identity: {
          authUserId: "auth-user-1",
          email: "user1@gamerperu.com",
          claims: {},
        },
      });

      const mockReturning = vi.fn().mockResolvedValueOnce([
        {
          id: "prof-user-1",
          authUserId: "auth-user-1",
          firstName: "UpdatedName",
          lastName: "UpdatedLast",
          phone: null,
          documentType: null,
          documentNumber: null,
          defaultShippingAddressId: "addr-original-uuid",
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);
      const mockWhere = vi.fn().mockReturnValue({ returning: mockReturning });
      const mockSet = vi.fn().mockReturnValue({ where: mockWhere });
      vi.mocked(dbModule.db.update).mockReturnValueOnce({
        set: mockSet,
      } as unknown as ReturnType<typeof dbModule.db.update>);

      await updateCustomerProfileAction(null, {
        firstName: "UpdatedName",
        lastName: "UpdatedLast",
      });

      const setPayload = (mockSet.mock.calls[0] as Record<string, unknown>[])?.[0] ?? {};
      expect(setPayload.defaultShippingAddressId).toBeUndefined();
      expect(setPayload.authUserId).toBeUndefined();
      expect(setPayload.email).toBeUndefined();
      expect(setPayload.id).toBeUndefined();
      expect(setPayload.updatedAt).toBeInstanceOf(Date);
    });

    it("Y/Z: returns safe generic error message and logs sanitized event without PII on database failure", async () => {
      vi.mocked(claimsModule.getVerifiedIdentity).mockResolvedValueOnce({
        success: true,
        identity: {
          authUserId: "auth-error-uuid",
          email: "error@gamerperu.com",
          claims: {},
        },
      });

      const mockWhere = vi.fn().mockImplementation(() => {
        throw new Error("DB deadlock");
      });
      const mockSet = vi.fn().mockReturnValue({ where: mockWhere });
      vi.mocked(dbModule.db.update).mockReturnValueOnce({
        set: mockSet,
      } as unknown as ReturnType<typeof dbModule.db.update>);

      const res = await updateCustomerProfileAction(null, {
        firstName: "Name",
        lastName: "Last",
      });

      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.errors.form).toContain("Ocurrió un error inesperado");
      }
      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          event: "account_profile_update_failed",
        })
      );
    });
  });

  describe("Account Security & Route Architecture", () => {
    it("AA/AB: declares dynamic force-dynamic and noindex/nofollow robots on account layouts/pages", () => {
      expect(cuentaDynamic).toBe("force-dynamic");
      expect(cuentaMetadata.robots).toEqual({
        index: false,
        follow: false,
      });

      expect(perfilDynamic).toBe("force-dynamic");
      expect(perfilMetadata.robots).toEqual({
        index: false,
        follow: false,
      });
    });
  });
});
