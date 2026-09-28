import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  baseAddressSchema,
  createAddressSchema,
  updateAddressSchema,
  validateCreateAddressInput,
  validateUpdateAddressInput,
  validateAddressIdOnly,
} from "@/lib/account/address-validation";
import { getCurrentCustomerAddresses } from "@/lib/account/addresses";
import {
  createCustomerAddressAction,
  updateCustomerAddressAction,
  setDefaultCustomerAddressAction,
  deleteCustomerAddressAction,
} from "@/lib/account/address-actions";
import DireccionesPage, {
  metadata as direccionesMetadata,
  dynamic as direccionesDynamic,
} from "@/app/(storefront)/cuenta/direcciones/page";
import { AddressErrorState } from "@/components/account/address-error-state";
import { AddressForm } from "@/components/account/address-form";
import * as addressesModule from "@/lib/account/addresses";
import * as claimsModule from "@/lib/auth/claims";
import * as dbModule from "@/db";
import { logger } from "@/lib/logger";

vi.mock("@/lib/auth/claims", () => ({
  getVerifiedIdentity: vi.fn(),
}));

vi.mock("@/db", () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    transaction: vi.fn(),
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

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
  redirect: vi.fn(),
}));

function mockIdentity(authUserId: string, email: string) {
  return {
    success: true as const,
    identity: { authUserId, email, claims: {} },
  };
}

describe("GP-016 ACCT5 — Customer Address Book Suite", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(dbModule.db.select).mockReset();
    vi.mocked(dbModule.db.insert).mockReset();
    vi.mocked(dbModule.db.update).mockReset();
    vi.mocked(dbModule.db.delete).mockReset();
    vi.mocked(dbModule.db.transaction).mockReset();
  });

  // ============================================================
  // Validation Suite
  // ============================================================
  describe("Address Validation Contract", () => {
    const validBase = {
      recipientName: "María José O'Connor-García",
      phone: "+51 987 654 321",
      streetAddress: "Av. Las Camelias 450, Urb. San Isidro",
      apartmentSuite: "Dpto 402-B",
      department: "Lima",
      province: "Lima",
      district: "San Isidro",
      postalCode: "15046",
      referenceNotes: "Frente al parque principal, reja negra",
      setAsDefault: false,
    };

    it("17. recipientName: string, trim, non-empty, max 150, accepts accents, hyphens, spaces", () => {
      expect(
        validateCreateAddressInput({ ...validBase, recipientName: "  María José  " }).success
      ).toBe(true);
      expect(validateCreateAddressInput({ ...validBase, recipientName: "" }).success).toBe(false);
      expect(validateCreateAddressInput({ ...validBase, recipientName: "   " }).success).toBe(
        false
      );
      expect(
        validateCreateAddressInput({ ...validBase, recipientName: "A".repeat(151) }).success
      ).toBe(false);
      expect(
        validateCreateAddressInput({ ...validBase, recipientName: "A".repeat(150) }).success
      ).toBe(true);
    });

    it("18. phone: required, trim, non-empty, max 20, no Peru-only mobile regex", () => {
      expect(
        validateCreateAddressInput({ ...validBase, phone: " +1 (555) 123-4567 " }).success
      ).toBe(true);
      expect(validateCreateAddressInput({ ...validBase, phone: "01-4445555" }).success).toBe(true);
      expect(validateCreateAddressInput({ ...validBase, phone: "" }).success).toBe(false);
      expect(validateCreateAddressInput({ ...validBase, phone: "   " }).success).toBe(false);
      expect(validateCreateAddressInput({ ...validBase, phone: "9".repeat(21) }).success).toBe(
        false
      );
      expect(validateCreateAddressInput({ ...validBase, phone: "9".repeat(20) }).success).toBe(
        true
      );
    });

    it("19. streetAddress: required, trim, non-empty, max 255", () => {
      expect(
        validateCreateAddressInput({ ...validBase, streetAddress: " Jr. Huallaga 123 " }).success
      ).toBe(true);
      expect(validateCreateAddressInput({ ...validBase, streetAddress: "" }).success).toBe(false);
      expect(
        validateCreateAddressInput({ ...validBase, streetAddress: "S".repeat(256) }).success
      ).toBe(false);
      expect(
        validateCreateAddressInput({ ...validBase, streetAddress: "S".repeat(255) }).success
      ).toBe(true);
    });

    it("20. apartmentSuite: optional, trim, blank/whitespace -> NULL, max 100", () => {
      const resBlank = validateCreateAddressInput({ ...validBase, apartmentSuite: "   " });
      expect(resBlank.success && resBlank.data.apartmentSuite).toBeNull();

      const resNull = validateCreateAddressInput({ ...validBase, apartmentSuite: null });
      expect(resNull.success && resNull.data.apartmentSuite).toBeNull();

      const resVal = validateCreateAddressInput({ ...validBase, apartmentSuite: "  Piso 3  " });
      expect(resVal.success && resVal.data.apartmentSuite).toBe("Piso 3");

      expect(
        validateCreateAddressInput({ ...validBase, apartmentSuite: "X".repeat(101) }).success
      ).toBe(false);
    });

    it("21. department, province, district: required, trim, non-empty, max 100", () => {
      expect(validateCreateAddressInput({ ...validBase, department: "" }).success).toBe(false);
      expect(validateCreateAddressInput({ ...validBase, province: "" }).success).toBe(false);
      expect(validateCreateAddressInput({ ...validBase, district: "" }).success).toBe(false);
      expect(
        validateCreateAddressInput({ ...validBase, department: "D".repeat(101) }).success
      ).toBe(false);
      expect(validateCreateAddressInput({ ...validBase, province: "P".repeat(101) }).success).toBe(
        false
      );
      expect(validateCreateAddressInput({ ...validBase, district: "D".repeat(101) }).success).toBe(
        false
      );
    });

    it("22. postalCode: optional, trim, blank -> NULL, max 20", () => {
      const resBlank = validateCreateAddressInput({ ...validBase, postalCode: "   " });
      expect(resBlank.success && resBlank.data.postalCode).toBeNull();

      const resVal = validateCreateAddressInput({ ...validBase, postalCode: " 15001 " });
      expect(resVal.success && resVal.data.postalCode).toBe("15001");

      expect(validateCreateAddressInput({ ...validBase, postalCode: "1".repeat(21) }).success).toBe(
        false
      );
    });

    it("23. referenceNotes: optional, trim, blank -> NULL", () => {
      const resBlank = validateCreateAddressInput({ ...validBase, referenceNotes: "   " });
      expect(resBlank.success && resBlank.data.referenceNotes).toBeNull();

      const resVal = validateCreateAddressInput({
        ...validBase,
        referenceNotes: "  Portón verde  ",
      });
      expect(resVal.success && resVal.data.referenceNotes).toBe("Portón verde");
    });

    it("updateAddress validation requires valid UUID addressId", () => {
      expect(validateUpdateAddressInput({ ...validBase, addressId: "invalid-uuid" }).success).toBe(
        false
      );
      expect(
        validateUpdateAddressInput({
          ...validBase,
          addressId: "01900000-0000-7000-8000-000000000001",
        }).success
      ).toBe(true);
    });

    it("addressIdOnly validation requires valid UUID", () => {
      expect(validateAddressIdOnly({ addressId: "not-a-uuid" }).success).toBe(false);
      expect(
        validateAddressIdOnly({ addressId: "01900000-0000-7000-8000-000000000001" }).success
      ).toBe(true);
    });
  });

  // ============================================================
  // Reader Suite
  // ============================================================
  describe("Address Reader (getCurrentCustomerAddresses)", () => {
    it("1. uses getVerifiedIdentity and returns UNAUTHENTICATED when not logged in", async () => {
      vi.mocked(claimsModule.getVerifiedIdentity).mockResolvedValueOnce({
        success: false,
        reason: "no_session",
      });

      const res = await getCurrentCustomerAddresses();
      expect(res.status).toBe("UNAUTHENTICATED");
    });

    it("2/3/4/5. queries by verified profile.id, derives isDefault, exposes zero customerId in DTO", async () => {
      vi.mocked(claimsModule.getVerifiedIdentity).mockResolvedValueOnce(
        mockIdentity("auth-user-123", "user@gp.com")
      );

      // Mock profile select
      const mockProfileLimit = vi
        .fn()
        .mockResolvedValueOnce([{ id: "prof-uuid-999", defaultShippingAddressId: "addr-2" }]);
      const mockProfileWhere = vi.fn().mockReturnValue({ limit: mockProfileLimit });
      const mockProfileFrom = vi.fn().mockReturnValue({ where: mockProfileWhere });

      // Mock addresses select
      const mockOrderBy = vi.fn().mockResolvedValueOnce([
        {
          id: "addr-1",
          customerId: "prof-uuid-999",
          recipientName: "User One",
          phone: "999111222",
          streetAddress: "Calle Uno 100",
          apartmentSuite: null,
          department: "Lima",
          province: "Lima",
          district: "Miraflores",
          postalCode: null,
          referenceNotes: null,
          createdAt: new Date("2026-01-01"),
          updatedAt: new Date("2026-01-01"),
        },
        {
          id: "addr-2",
          customerId: "prof-uuid-999",
          recipientName: "User One Alt",
          phone: "999333444",
          streetAddress: "Calle Dos 200",
          apartmentSuite: "Dpto 101",
          department: "Lima",
          province: "Lima",
          district: "San Borja",
          postalCode: "15036",
          referenceNotes: "Timbre 101",
          createdAt: new Date("2026-01-02"),
          updatedAt: new Date("2026-01-02"),
        },
      ]);
      const mockAddrWhere = vi.fn().mockReturnValue({ orderBy: mockOrderBy });
      const mockAddrFrom = vi.fn().mockReturnValue({ where: mockAddrWhere });

      vi.mocked(dbModule.db.select)
        .mockReturnValueOnce({ from: mockProfileFrom } as unknown as ReturnType<
          typeof dbModule.db.select
        >)
        .mockReturnValueOnce({ from: mockAddrFrom } as unknown as ReturnType<
          typeof dbModule.db.select
        >);

      const res = await getCurrentCustomerAddresses();
      expect(res.status).toBe("READY");

      if (res.status === "READY" && res.addresses[0] && res.addresses[1]) {
        expect(res.addresses).toHaveLength(2);

        // Verify isDefault derivation
        expect(res.addresses[0].isDefault).toBe(false);
        expect(res.addresses[1].isDefault).toBe(true);

        // Verify zero customerId / internal identifiers leaked
        expect(res.addresses[0]).not.toHaveProperty("customerId");
        expect(res.addresses[0]).not.toHaveProperty("authUserId");
        expect(res.addresses[1]).not.toHaveProperty("customerId");
        expect(res.addresses[1]).not.toHaveProperty("authUserId");
      }
    });

    it("24/25/26. sanitizes errors and never leaks raw error strings or PII to logger or caller", async () => {
      vi.mocked(claimsModule.getVerifiedIdentity).mockResolvedValueOnce(
        mockIdentity("auth-err-uuid", "error@secret.com")
      );

      const mockFrom = vi.fn().mockImplementation(() => {
        throw new Error("DB connection crash on SYNTHETIC_USER_DATA");
      });
      vi.mocked(dbModule.db.select).mockReturnValueOnce({ from: mockFrom } as unknown as ReturnType<
        typeof dbModule.db.select
      >);

      const res = await getCurrentCustomerAddresses();
      expect(res.status).toBe("ERROR");

      expect(logger.error).toHaveBeenCalledTimes(1);
      const logCall = vi.mocked(logger.error).mock.calls[0]?.[0] as Record<string, unknown>;
      expect(logCall.event).toBe("account_addresses_read_failed");

      const serializedLog = JSON.stringify(logCall);
      expect(serializedLog).not.toContain("DB connection crash");
      expect(serializedLog).not.toContain("SYNTHETIC_USER_DATA");
      expect(serializedLog).not.toContain("error@secret.com");
    });
  });

  // ============================================================
  // Create Address Action Suite
  // ============================================================
  describe("Create Address Action (createCustomerAddressAction)", () => {
    it("6/7. create derives customerId from verified profile; first address is NOT automatically default", async () => {
      vi.mocked(claimsModule.getVerifiedIdentity).mockResolvedValueOnce(
        mockIdentity("auth-creator", "creator@gp.com")
      );

      // Mock profile select
      const mockProfileLimit = vi.fn().mockResolvedValueOnce([{ id: "prof-creator-id" }]);
      const mockProfileWhere = vi.fn().mockReturnValue({ limit: mockProfileLimit });
      const mockProfileFrom = vi.fn().mockReturnValue({ where: mockProfileWhere });
      vi.mocked(dbModule.db.select).mockReturnValueOnce({
        from: mockProfileFrom,
      } as unknown as ReturnType<typeof dbModule.db.select>);

      // Mock insert without transaction
      const mockReturning = vi.fn().mockResolvedValueOnce([{ id: "new-addr-uuid" }]);
      const mockValues = vi.fn().mockReturnValue({ returning: mockReturning });
      vi.mocked(dbModule.db.insert).mockReturnValueOnce({
        values: mockValues,
      } as unknown as ReturnType<typeof dbModule.db.insert>);

      const res = await createCustomerAddressAction(null, {
        recipientName: "Destinatario Uno",
        phone: "999888777",
        streetAddress: "Av. Principal 123",
        department: "Lima",
        province: "Lima",
        district: "San Borja",
        setAsDefault: false,
      });

      expect(res.success).toBe(true);
      expect(dbModule.db.transaction).not.toHaveBeenCalled();

      const insertedPayload = mockValues.mock.calls[0]?.[0] as Record<string, unknown>;
      expect(insertedPayload.customerId).toBe("prof-creator-id");
      expect(insertedPayload.recipientName).toBe("Destinatario Uno");
    });

    it("8. create with setAsDefault=true executes atomic insert + default pointer update inside transaction", async () => {
      vi.mocked(claimsModule.getVerifiedIdentity).mockResolvedValueOnce(
        mockIdentity("auth-creator-def", "creatordef@gp.com")
      );

      const mockProfileLimit = vi.fn().mockResolvedValueOnce([{ id: "prof-creator-def-id" }]);
      const mockProfileWhere = vi.fn().mockReturnValue({ limit: mockProfileLimit });
      const mockProfileFrom = vi.fn().mockReturnValue({ where: mockProfileWhere });
      vi.mocked(dbModule.db.select).mockReturnValueOnce({
        from: mockProfileFrom,
      } as unknown as ReturnType<typeof dbModule.db.select>);

      // Mock transaction execution
      const mockTxInsertReturning = vi.fn().mockResolvedValueOnce([{ id: "new-default-addr-id" }]);
      const mockTxInsertValues = vi.fn().mockReturnValue({ returning: mockTxInsertReturning });
      const mockTxInsert = vi.fn().mockReturnValue({ values: mockTxInsertValues });

      const mockTxUpdateWhere = vi.fn().mockResolvedValueOnce([]);
      const mockTxUpdateSet = vi.fn().mockReturnValue({ where: mockTxUpdateWhere });
      const mockTxUpdate = vi.fn().mockReturnValue({ set: mockTxUpdateSet });

      const mockTx = {
        insert: mockTxInsert,
        update: mockTxUpdate,
      };

      (dbModule.db.transaction as unknown as ReturnType<typeof vi.fn>).mockImplementationOnce(
        async (cb: (tx: unknown) => unknown) => {
          return cb(mockTx);
        }
      );

      const res = await createCustomerAddressAction(null, {
        recipientName: "Default Dest",
        phone: "987654321",
        streetAddress: "Calle Default 456",
        department: "Arequipa",
        province: "Arequipa",
        district: "Cayma",
        setAsDefault: true,
      });

      expect(res.success).toBe(true);
      expect(dbModule.db.transaction).toHaveBeenCalledTimes(1);
      expect(mockTxInsert).toHaveBeenCalled();
      expect(mockTxUpdate).toHaveBeenCalled();
    });

    it("24/26. create failure logs fixed event with zero PII", async () => {
      vi.mocked(claimsModule.getVerifiedIdentity).mockResolvedValueOnce(
        mockIdentity("auth-fail", "fail@gp.com")
      );

      vi.mocked(dbModule.db.select).mockImplementationOnce(() => {
        throw new Error("deadlock on SYNTHETIC_RECIPIENT_SECRET");
      });

      const res = await createCustomerAddressAction(null, {
        recipientName: "SYNTHETIC_RECIPIENT_SECRET",
        phone: "987654321",
        streetAddress: "Calle Fail 123",
        department: "Lima",
        province: "Lima",
        district: "Lima",
      });

      expect(res.success).toBe(false);
      expect(logger.error).toHaveBeenCalledWith({ event: "account_address_create_failed" });
      const serializedLog = JSON.stringify(vi.mocked(logger.error).mock.calls);
      expect(serializedLog).not.toContain("SYNTHETIC_RECIPIENT_SECRET");
    });
  });

  // ============================================================
  // Update Address Action Suite
  // ============================================================
  describe("Update Address Action (updateCustomerAddressAction)", () => {
    it("9/10. requires addressId + current customerId ownership; cross-owner fails generically", async () => {
      vi.mocked(claimsModule.getVerifiedIdentity).mockResolvedValueOnce(
        mockIdentity("auth-updater", "updater@gp.com")
      );

      const mockProfileLimit = vi.fn().mockResolvedValueOnce([{ id: "prof-alice-id" }]);
      const mockProfileWhere = vi.fn().mockReturnValue({ limit: mockProfileLimit });
      const mockProfileFrom = vi.fn().mockReturnValue({ where: mockProfileWhere });
      vi.mocked(dbModule.db.select).mockReturnValueOnce({
        from: mockProfileFrom,
      } as unknown as ReturnType<typeof dbModule.db.select>);

      // Simulate zero rows updated because addressId belongs to Bob
      const mockReturning = vi.fn().mockResolvedValueOnce([]);
      const mockWhere = vi.fn().mockReturnValue({ returning: mockReturning });
      const mockSet = vi.fn().mockReturnValue({ where: mockWhere });
      vi.mocked(dbModule.db.update).mockReturnValueOnce({ set: mockSet } as unknown as ReturnType<
        typeof dbModule.db.update
      >);

      const res = await updateCustomerAddressAction(null, {
        addressId: "01900000-0000-7000-8000-00000000000b",
        recipientName: "Alice Updated",
        phone: "999888777",
        streetAddress: "Calle Bob 123",
        department: "Lima",
        province: "Lima",
        district: "Miraflores",
      });

      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.errors.form).toContain("no encontrada o no autorizada");
      }
    });
  });

  // ============================================================
  // Set Default Address Action Suite
  // ============================================================
  describe("Set Default Action (setDefaultCustomerAddressAction)", () => {
    it("11/12. verifies address ownership before setting default; cross-owner fails generically", async () => {
      vi.mocked(claimsModule.getVerifiedIdentity).mockResolvedValueOnce(
        mockIdentity("auth-setter", "setter@gp.com")
      );

      const mockProfileLimit = vi.fn().mockResolvedValueOnce([{ id: "prof-setter-id" }]);
      const mockProfileWhere = vi.fn().mockReturnValue({ limit: mockProfileLimit });
      const mockProfileFrom = vi.fn().mockReturnValue({ where: mockProfileWhere });

      // Mock address lookup returning empty (not owned)
      const mockAddrLimit = vi.fn().mockResolvedValueOnce([]);
      const mockAddrWhere = vi.fn().mockReturnValue({ limit: mockAddrLimit });
      const mockAddrFrom = vi.fn().mockReturnValue({ where: mockAddrWhere });

      vi.mocked(dbModule.db.select)
        .mockReturnValueOnce({ from: mockProfileFrom } as unknown as ReturnType<
          typeof dbModule.db.select
        >)
        .mockReturnValueOnce({ from: mockAddrFrom } as unknown as ReturnType<
          typeof dbModule.db.select
        >);

      const res = await setDefaultCustomerAddressAction(null, {
        addressId: "01900000-0000-7000-8000-00000000000b",
      });

      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.errors.form).toContain("no encontrada o no disponible");
      }
      expect(dbModule.db.update).not.toHaveBeenCalled();
    });
  });

  // ============================================================
  // Delete Address Action Suite
  // ============================================================
  describe("Delete Address Action (deleteCustomerAddressAction)", () => {
    it("13. delete non-default address deletes directly with ownership check", async () => {
      vi.mocked(claimsModule.getVerifiedIdentity).mockResolvedValueOnce(
        mockIdentity("auth-deleter", "deleter@gp.com")
      );

      // Profile has default addr-1, deleting addr-2 (non-default)
      const mockProfileLimit = vi.fn().mockResolvedValueOnce([
        {
          id: "prof-deleter-id",
          defaultShippingAddressId: "01900000-0000-7000-8000-000000000001",
        },
      ]);
      const mockProfileWhere = vi.fn().mockReturnValue({ limit: mockProfileLimit });
      const mockProfileFrom = vi.fn().mockReturnValue({ where: mockProfileWhere });
      vi.mocked(dbModule.db.select).mockReturnValueOnce({
        from: mockProfileFrom,
      } as unknown as ReturnType<typeof dbModule.db.select>);

      const mockReturning = vi
        .fn()
        .mockResolvedValueOnce([{ id: "01900000-0000-7000-8000-000000000002" }]);
      const mockWhere = vi.fn().mockReturnValue({ returning: mockReturning });
      vi.mocked(dbModule.db.delete).mockReturnValueOnce({
        where: mockWhere,
      } as unknown as ReturnType<typeof dbModule.db.delete>);

      const res = await deleteCustomerAddressAction(null, {
        addressId: "01900000-0000-7000-8000-000000000002",
      });

      expect(res.success).toBe(true);
      expect(dbModule.db.transaction).not.toHaveBeenCalled();
    });

    it("14/15. delete current default clears pointer transactionally; does not auto-promote another address", async () => {
      vi.mocked(claimsModule.getVerifiedIdentity).mockResolvedValueOnce(
        mockIdentity("auth-del-def", "deldef@gp.com")
      );

      // Profile has default addr-1, deleting addr-1 (current default)
      const targetId = "01900000-0000-7000-8000-000000000001";
      const mockProfileLimit = vi
        .fn()
        .mockResolvedValueOnce([{ id: "prof-del-def-id", defaultShippingAddressId: targetId }]);
      const mockProfileWhere = vi.fn().mockReturnValue({ limit: mockProfileLimit });
      const mockProfileFrom = vi.fn().mockReturnValue({ where: mockProfileWhere });
      vi.mocked(dbModule.db.select).mockReturnValueOnce({
        from: mockProfileFrom,
      } as unknown as ReturnType<typeof dbModule.db.select>);

      // Mock transaction
      const mockTxUpdateWhere = vi.fn().mockResolvedValueOnce([]);
      const mockTxUpdateSet = vi.fn().mockReturnValue({ where: mockTxUpdateWhere });
      const mockTxUpdate = vi.fn().mockReturnValue({ set: mockTxUpdateSet });

      const mockTxDeleteReturning = vi.fn().mockResolvedValueOnce([{ id: targetId }]);
      const mockTxDeleteWhere = vi.fn().mockReturnValue({ returning: mockTxDeleteReturning });
      const mockTxDelete = vi.fn().mockReturnValue({ where: mockTxDeleteWhere });

      const mockTx = {
        update: mockTxUpdate,
        delete: mockTxDelete,
      };

      (dbModule.db.transaction as unknown as ReturnType<typeof vi.fn>).mockImplementationOnce(
        async (cb: (tx: unknown) => unknown) => {
          return cb(mockTx);
        }
      );

      const res = await deleteCustomerAddressAction(null, { addressId: targetId });

      expect(res.success).toBe(true);
      expect(dbModule.db.transaction).toHaveBeenCalledTimes(1);
      expect(mockTxUpdate).toHaveBeenCalled();
      expect(mockTxDelete).toHaveBeenCalled();

      // Verify pointer is set to NULL (no auto-promotion)
      const setPayload = mockTxUpdateSet.mock.calls[0]?.[0] as Record<string, unknown>;
      expect(setPayload.defaultShippingAddressId).toBeNull();
    });

    it("16. malicious cross-owner delete fails generically and deletes zero rows", async () => {
      vi.mocked(claimsModule.getVerifiedIdentity).mockResolvedValueOnce(
        mockIdentity("auth-attacker", "attacker@gp.com")
      );

      const mockProfileLimit = vi
        .fn()
        .mockResolvedValueOnce([{ id: "prof-attacker-id", defaultShippingAddressId: null }]);
      const mockProfileWhere = vi.fn().mockReturnValue({ limit: mockProfileLimit });
      const mockProfileFrom = vi.fn().mockReturnValue({ where: mockProfileWhere });
      vi.mocked(dbModule.db.select).mockReturnValueOnce({
        from: mockProfileFrom,
      } as unknown as ReturnType<typeof dbModule.db.select>);

      // Delete returns empty array because customerId does not match
      const mockReturning = vi.fn().mockResolvedValueOnce([]);
      const mockWhere = vi.fn().mockReturnValue({ returning: mockReturning });
      vi.mocked(dbModule.db.delete).mockReturnValueOnce({
        where: mockWhere,
      } as unknown as ReturnType<typeof dbModule.db.delete>);

      const res = await deleteCustomerAddressAction(null, {
        addressId: "01900000-0000-7000-8000-00000000000b",
      });

      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.errors.form).toContain("no encontrada o no autorizada");
      }
    });
  });

  // ============================================================
  // Security & Route Architecture
  // ============================================================
  describe("Security & Route Architecture", () => {
    it("30. /cuenta/direcciones declares force-dynamic and noindex/nofollow robots", () => {
      expect(direccionesDynamic).toBe("force-dynamic");
      expect(direccionesMetadata.robots).toEqual({ index: false, follow: false });
    });

    it("31/32. account navigation activates Direcciones and Pedidos, and nothing unbuilt", () => {
      const navSource = readFileSync(
        resolve(process.cwd(), "src/components/account/account-navigation.tsx"),
        "utf8"
      );
      expect(navSource).toContain('{ label: "Direcciones", href: "/cuenta/direcciones"');
      expect(navSource).toContain('{ label: "Mis pedidos", href: "/cuenta/pedidos"');
      expect(navSource).not.toContain("/cuenta/favoritos");
      expect(navSource).not.toContain("/cuenta/referidos");
    });

    it("40. /cuenta overview has an active link to /cuenta/direcciones", () => {
      const overviewSource = readFileSync(
        resolve(process.cwd(), "src/app/(storefront)/cuenta/page.tsx"),
        "utf8"
      );
      expect(overviewSource).toContain('href: "/cuenta/direcciones"');
      expect(overviewSource).not.toContain(
        "Direcciones</span>\n            <span className={styles.badgeComingSoon}>Próximamente"
      );
    });
  });

  // ============================================================
  // Error-State Truthfulness & Fail-Closed Behavior Suite (ACCT5-BR1)
  // ============================================================
  describe("Error-State Truthfulness & Fail-Closed Behavior", () => {
    it("proves reader ERROR is distinct from READY empty", async () => {
      vi.mocked(claimsModule.getVerifiedIdentity).mockResolvedValueOnce(
        mockIdentity("auth-err-test", "err@gp.com")
      );
      const mockFrom = vi.fn().mockImplementation(() => {
        throw new Error("DB connection failure");
      });
      vi.mocked(dbModule.db.select).mockReturnValueOnce({
        from: mockFrom,
      } as unknown as ReturnType<typeof dbModule.db.select>);

      const res = await getCurrentCustomerAddresses();
      expect(res.status).toBe("ERROR");
      expect(res.status).not.toBe("READY");
    });

    it("DireccionesPage renders AddressErrorState and does NOT render legitimate empty state when reader fails", async () => {
      vi.spyOn(addressesModule, "getCurrentCustomerAddresses").mockResolvedValueOnce({
        status: "ERROR",
        error: "No se pudieron cargar las direcciones de entrega.",
      });

      const pageElement = await DireccionesPage();
      expect(pageElement.type).toBe(AddressErrorState);
    });

    it("DireccionesPage renders AddressList when reader succeeds with empty address book", async () => {
      vi.spyOn(addressesModule, "getCurrentCustomerAddresses").mockResolvedValueOnce({
        status: "READY",
        addresses: [],
        defaultShippingAddressId: null,
      });

      const pageElement = await DireccionesPage();
      expect(pageElement.props.addresses).toEqual([]);
      expect(pageElement.props.defaultShippingAddressId).toBeNull();
    });

    it("AddressErrorState renders safe generic message and retry button without raw error strings or PII", () => {
      const errorComponent = AddressErrorState();
      const serialized = JSON.stringify(errorComponent);
      expect(serialized).toContain("No pudimos cargar tus direcciones");
      expect(serialized).toContain("Intentar nuevamente");
      expect(serialized).not.toContain("No tienes direcciones guardadas");
      expect(serialized).not.toContain("Agregar mi primera dirección");
      expect(serialized).not.toContain("SQL");
      expect(serialized).not.toContain("SELECT");
    });
  });

  // ============================================================
  // Default-Address Edit Contract Suite (ACCT5-BR2)
  // ============================================================
  describe("Default-Address Edit Contract Suite (ACCT5-BR2)", () => {
    it("A. create schema accepts setAsDefault and update schema excludes it", () => {
      expect(baseAddressSchema.shape.recipientName).toBeDefined();
      expect(createAddressSchema.shape.setAsDefault).toBeDefined();
      expect("setAsDefault" in updateAddressSchema.shape).toBe(false);

      const res = validateCreateAddressInput({
        recipientName: "Test Recipient",
        phone: "987654321",
        streetAddress: "Av. Principal 123",
        department: "Lima",
        province: "Lima",
        district: "Miraflores",
        setAsDefault: true,
      });
      expect(res.success).toBe(true);
      if (res.success) {
        expect(res.data.setAsDefault).toBe(true);
      }
    });

    it("B. update schema strips and excludes setAsDefault", () => {
      const res = validateUpdateAddressInput({
        addressId: "01900000-0000-7000-8000-000000000001",
        recipientName: "Test Recipient",
        phone: "987654321",
        streetAddress: "Av. Principal 123",
        department: "Lima",
        province: "Lima",
        district: "Miraflores",
        setAsDefault: true,
      });
      expect(res.success).toBe(true);
      if (res.success) {
        expect("setAsDefault" in res.data).toBe(false);
      }
    });

    it("D. edit form renders no set-default checkbox and shows static notice when default", () => {
      // Create mode: initialAddress is null -> renders checkbox
      const createHtml = renderToStaticMarkup(
        React.createElement(AddressForm, {
          initialAddress: null,
          onSave: vi.fn(),
          onCancel: vi.fn(),
          isPending: false,
        })
      );
      expect(createHtml).toContain("Establecer como dirección de entrega predeterminada");

      // Edit non-default mode: renders NO checkbox and NO default notice
      const editNonDefaultHtml = renderToStaticMarkup(
        React.createElement(AddressForm, {
          initialAddress: {
            id: "01900000-0000-7000-8000-000000000001",
            recipientName: "Non Default User",
            phone: "987654321",
            streetAddress: "Calle Secundaria 456",
            apartmentSuite: null,
            department: "Lima",
            province: "Lima",
            district: "San Isidro",
            postalCode: null,
            referenceNotes: null,
            isDefault: false,
          },
          onSave: vi.fn(),
          onCancel: vi.fn(),
          isPending: false,
        })
      );
      expect(editNonDefaultHtml).not.toContain(
        "Establecer como dirección de entrega predeterminada"
      );
      expect(editNonDefaultHtml).not.toContain("Esta es tu dirección de entrega predeterminada.");

      // Edit default mode: renders NO interactive checkbox, renders static notice
      const editDefaultHtml = renderToStaticMarkup(
        React.createElement(AddressForm, {
          initialAddress: {
            id: "01900000-0000-7000-8000-000000000002",
            recipientName: "Default User",
            phone: "987654321",
            streetAddress: "Av. Principal 123",
            apartmentSuite: null,
            department: "Lima",
            province: "Lima",
            district: "Miraflores",
            postalCode: null,
            referenceNotes: null,
            isDefault: true,
          },
          onSave: vi.fn(),
          onCancel: vi.fn(),
          isPending: false,
        })
      );
      expect(editDefaultHtml).not.toContain("Establecer como dirección de entrega predeterminada");
      expect(editDefaultHtml).toContain("Esta es tu dirección de entrega predeterminada.");
    });

    it("G. malicious update with setAsDefault=true only updates content and NEVER mutates profile default", async () => {
      vi.mocked(claimsModule.getVerifiedIdentity).mockResolvedValueOnce(
        mockIdentity("auth-update-malicious", "mal@gp.com")
      );

      const mockProfileLimit = vi.fn().mockResolvedValueOnce([{ id: "prof-mal-id" }]);
      const mockProfileWhere = vi.fn().mockReturnValue({ limit: mockProfileLimit });
      const mockProfileFrom = vi.fn().mockReturnValue({ where: mockProfileWhere });
      vi.mocked(dbModule.db.select).mockReturnValueOnce({
        from: mockProfileFrom,
      } as unknown as ReturnType<typeof dbModule.db.select>);

      const mockReturning = vi
        .fn()
        .mockResolvedValueOnce([{ id: "01900000-0000-7000-8000-000000000001" }]);
      const mockWhere = vi.fn().mockReturnValue({ returning: mockReturning });
      const mockSet = vi.fn().mockReturnValue({ where: mockWhere });
      vi.mocked(dbModule.db.update).mockReturnValueOnce({ set: mockSet } as unknown as ReturnType<
        typeof dbModule.db.update
      >);

      const res = await updateCustomerAddressAction(null, {
        addressId: "01900000-0000-7000-8000-000000000001",
        recipientName: "Updated Content Only",
        phone: "987654321",
        streetAddress: "Av. Benavides 123",
        department: "Lima",
        province: "Lima",
        district: "Miraflores",
        // @ts-expect-error malicious payload injection
        setAsDefault: true,
      });

      expect(res.success).toBe(true);
      // Verify db.transaction was NOT called (content update only)
      expect(dbModule.db.transaction).not.toHaveBeenCalled();
      // Verify db.update was called exactly once (for customer_addresses, not customer_profiles)
      expect(dbModule.db.update).toHaveBeenCalledTimes(1);
    });
  });
});
