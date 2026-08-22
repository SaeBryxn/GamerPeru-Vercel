import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { getTableColumns } from "drizzle-orm";
import { getTableConfig } from "drizzle-orm/pg-core";
import { customerAddresses, customerProfiles } from "@/db/schema";

interface ColumnWithLength {
  length?: number;
}

describe("GP-016 ACCT1 — Customer Account Schema & Migration Candidate", () => {
  describe("CustomerAddresses Drizzle Schema Definition", () => {
    it("defines the canonical CustomerAddress field inventory", () => {
      const columns = getTableColumns(customerAddresses);
      const columnNames = Object.keys(columns);

      expect(columnNames).toContain("id");
      expect(columnNames).toContain("customerId");
      expect(columnNames).toContain("recipientName");
      expect(columnNames).toContain("phone");
      expect(columnNames).toContain("streetAddress");
      expect(columnNames).toContain("apartmentSuite");
      expect(columnNames).toContain("department");
      expect(columnNames).toContain("province");
      expect(columnNames).toContain("district");
      expect(columnNames).toContain("postalCode");
      expect(columnNames).toContain("referenceNotes");
      expect(columnNames).toContain("createdAt");
      expect(columnNames).toContain("updatedAt");
      expect(columnNames).toHaveLength(13);
    });

    it("verifies field nullability constraints", () => {
      const columns = getTableColumns(customerAddresses);

      expect(columns.id.notNull).toBe(true);
      expect(columns.customerId.notNull).toBe(true);
      expect(columns.recipientName.notNull).toBe(true);
      expect(columns.phone.notNull).toBe(true);
      expect(columns.streetAddress.notNull).toBe(true);
      expect(columns.department.notNull).toBe(true);
      expect(columns.province.notNull).toBe(true);
      expect(columns.district.notNull).toBe(true);
      expect(columns.createdAt.notNull).toBe(true);
      expect(columns.updatedAt.notNull).toBe(true);

      // Optional fields
      expect(columns.apartmentSuite.notNull).toBe(false);
      expect(columns.postalCode.notNull).toBe(false);
      expect(columns.referenceNotes.notNull).toBe(false);
    });

    it("verifies exact column lengths where canonically constrained", () => {
      const columns = getTableColumns(customerAddresses);

      expect((columns.recipientName as unknown as ColumnWithLength).length).toBe(150);
      expect((columns.phone as unknown as ColumnWithLength).length).toBe(20);
      expect((columns.streetAddress as unknown as ColumnWithLength).length).toBe(255);
      expect((columns.apartmentSuite as unknown as ColumnWithLength).length).toBe(100);
      expect((columns.department as unknown as ColumnWithLength).length).toBe(100);
      expect((columns.province as unknown as ColumnWithLength).length).toBe(100);
      expect((columns.district as unknown as ColumnWithLength).length).toBe(100);
      expect((columns.postalCode as unknown as ColumnWithLength).length).toBe(20);
    });

    it("does not contain speculative or prohibited courier / is_default fields", () => {
      const columns = getTableColumns(customerAddresses);
      const columnNames = Object.keys(columns);

      expect(columnNames).not.toContain("isDefault");
      expect(columnNames).not.toContain("is_default");
      expect(columnNames).not.toContain("country");
      expect(columnNames).not.toContain("latitude");
      expect(columnNames).not.toContain("longitude");
      expect(columnNames).not.toContain("ubigeo");
      expect(columnNames).not.toContain("courier");
      expect(columnNames).not.toContain("shippingPrice");
    });

    it("defines unique candidate key on (customer_id, id) for composite FK targeting", () => {
      const config = getTableConfig(customerAddresses);
      const uniqueConstraint = config.uniqueConstraints.find(
        (u) => u.name === "customer_addresses_customer_id_id_unique"
      );

      expect(uniqueConstraint).toBeDefined();
      expect(uniqueConstraint?.columns.map((c) => c.name)).toEqual(["customer_id", "id"]);
    });

    it("configures customer_id FK referencing customer_profiles.id with ON DELETE CASCADE", () => {
      const config = getTableConfig(customerAddresses);
      const customerFk = config.foreignKeys.find((fk) =>
        fk.reference().columns.some((c) => c.name === "customer_id")
      );

      expect(customerFk).toBeDefined();
      expect(customerFk?.onDelete).toBe("cascade");
      expect(customerFk?.reference().foreignTable).toBe(customerProfiles);
      expect(customerFk?.reference().foreignColumns.map((c) => c.name)).toEqual(["id"]);
    });
  });

  describe("CustomerProfiles Schema Delta & Same-Owner Invariant", () => {
    it("includes default_shipping_address_id column as nullable UUID", () => {
      const columns = getTableColumns(customerProfiles);

      expect(columns.defaultShippingAddressId).toBeDefined();
      expect(columns.defaultShippingAddressId.notNull).toBe(false);
      expect(columns.defaultShippingAddressId.dataType).toBe("string");
    });

    it("enforces same-owner composite FK from customer_profiles to customer_addresses", () => {
      const config = getTableConfig(customerProfiles);
      const defaultFk = config.foreignKeys.find(
        (fk) => fk.getName() === "customer_profiles_default_shipping_address_fk"
      );

      expect(defaultFk).toBeDefined();
      const ref = defaultFk?.reference();
      expect(ref?.columns.map((c) => c.name)).toEqual(["id", "default_shipping_address_id"]);
      expect(ref?.foreignColumns.map((c) => c.name)).toEqual(["customer_id", "id"]);
      expect(defaultFk?.onDelete).toBe("no action");
    });

    it("preserves existing auth_user_id FK with ON DELETE SET NULL", () => {
      const config = getTableConfig(customerProfiles);
      const authFk = config.foreignKeys.find(
        (fk) => fk.getName() === "customer_profiles_auth_user_fk"
      );

      expect(authFk).toBeDefined();
      expect(authFk?.onDelete).toBe("set null");
    });
  });

  describe("Migration 0007 & Journal Integrity", () => {
    const journalPath = resolve(process.cwd(), "src/db/migrations/meta/_journal.json");
    const migration0007Path = resolve(
      process.cwd(),
      "src/db/migrations/0007_customer_account_addresses.sql"
    );

    it("contains journal entry at index 7 with tag 0007_customer_account_addresses", () => {
      const journalContent = JSON.parse(readFileSync(journalPath, "utf-8"));
      expect(journalContent.entries).toHaveLength(8);

      const entry7 = journalContent.entries[7];
      expect(entry7.idx).toBe(7);
      expect(entry7.tag).toBe("0007_customer_account_addresses");
    });

    it("verifies migration 0007 SQL creates customer_addresses and alters customer_profiles", () => {
      const sql = readFileSync(migration0007Path, "utf-8");

      expect(sql).toContain('CREATE TABLE "customer_addresses"');
      expect(sql).toContain(
        '"customer_addresses_customer_id_id_unique" UNIQUE("customer_id","id")'
      );
      expect(sql).toContain(
        'ALTER TABLE "customer_profiles" ADD COLUMN "default_shipping_address_id" uuid;'
      );
      expect(sql).toContain(
        'FOREIGN KEY ("customer_id") REFERENCES "public"."customer_profiles"("id") ON DELETE cascade'
      );
      expect(sql).toContain(
        'FOREIGN KEY ("id","default_shipping_address_id") REFERENCES "public"."customer_addresses"("customer_id","id") ON DELETE no action'
      );
    });

    it("verifies migration 0007 contains zero future-GP tables or grants", () => {
      const sql = readFileSync(migration0007Path, "utf-8");

      expect(sql).not.toContain("wishlist_items");
      expect(sql).not.toContain("orders");
      expect(sql).not.toContain("order_items");
      expect(sql).not.toContain("referral_codes");
      expect(sql).not.toContain("affiliate");
      expect(sql).not.toContain("GRANT ALL");
      expect(sql).not.toContain("GRANT SELECT");
      expect(sql).not.toContain("anon");
      expect(sql).not.toContain("authenticated");
    });
  });
});
