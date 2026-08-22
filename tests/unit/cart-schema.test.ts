import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { getTableColumns } from "drizzle-orm";
import { getTableConfig } from "drizzle-orm/pg-core";
import { cartItems, carts, customerProfiles, productVariants } from "@/db/schema";

interface ColumnWithLength {
  length?: number;
}

describe("GP-017 CART1 — Cart Schema & Migration Candidate", () => {
  describe("Carts Drizzle Schema Definition", () => {
    it("defines the canonical Carts field inventory", () => {
      const columns = getTableColumns(carts);
      const columnNames = Object.keys(columns);

      expect(columnNames).toContain("id");
      expect(columnNames).toContain("customerId");
      expect(columnNames).toContain("sessionToken");
      expect(columnNames).toContain("status");
      expect(columnNames).toContain("currency");
      expect(columnNames).toContain("expiresAt");
      expect(columnNames).toContain("createdAt");
      expect(columnNames).toContain("updatedAt");
      expect(columnNames).toHaveLength(8);
    });

    it("verifies Carts nullability constraints", () => {
      const columns = getTableColumns(carts);

      expect(columns.id.notNull).toBe(true);
      expect(columns.status.notNull).toBe(true);
      expect(columns.currency.notNull).toBe(true);
      expect(columns.expiresAt.notNull).toBe(true);
      expect(columns.createdAt.notNull).toBe(true);
      expect(columns.updatedAt.notNull).toBe(true);

      // Ownership fields are nullable at column level (enforced mutually exclusive via XOR check)
      expect(columns.customerId.notNull).toBe(false);
      expect(columns.sessionToken.notNull).toBe(false);
    });

    it("verifies sessionToken column length and currency default", () => {
      const columns = getTableColumns(carts);

      expect((columns.sessionToken as unknown as ColumnWithLength).length).toBe(255);
      expect((columns.currency as unknown as ColumnWithLength).length).toBe(3);
      expect(columns.currency.default).toBe("PEN");
      expect(columns.status.default).toBe("ACTIVE");
    });

    it("configures customer_id FK referencing customer_profiles.id with ON DELETE CASCADE", () => {
      const config = getTableConfig(carts);
      const customerFk = config.foreignKeys.find((fk) =>
        fk.reference().columns.some((c) => c.name === "customer_id")
      );

      expect(customerFk).toBeDefined();
      expect(customerFk?.onDelete).toBe("cascade");
      expect(customerFk?.reference().foreignTable).toBe(customerProfiles);
      expect(customerFk?.reference().foreignColumns.map((c) => c.name)).toEqual(["id"]);
    });

    it("defines ownership XOR check constraint and partial unique indexes for active carts", () => {
      const config = getTableConfig(carts);

      // XOR Check constraint
      const xorCheck = config.checks.find((c) => c.name === "carts_ownership_xor_check");
      expect(xorCheck).toBeDefined();

      // Partial unique index for active authenticated customer carts
      const customerActiveIndex = config.indexes.find(
        (i) => i.config.name === "carts_customer_id_active_unique"
      );
      expect(customerActiveIndex).toBeDefined();
      expect(customerActiveIndex?.config.unique).toBe(true);

      // Partial unique index for active anonymous session carts
      const sessionActiveIndex = config.indexes.find(
        (i) => i.config.name === "carts_session_token_active_unique"
      );
      expect(sessionActiveIndex).toBeDefined();
      expect(sessionActiveIndex?.config.unique).toBe(true);
    });
  });

  describe("CartItems Drizzle Schema Definition", () => {
    it("defines the canonical CartItems field inventory", () => {
      const columns = getTableColumns(cartItems);
      const columnNames = Object.keys(columns);

      expect(columnNames).toContain("id");
      expect(columnNames).toContain("cartId");
      expect(columnNames).toContain("variantId");
      expect(columnNames).toContain("quantity");
      expect(columnNames).toContain("createdAt");
      expect(columnNames).toContain("updatedAt");
      expect(columnNames).toHaveLength(6);
    });

    it("verifies CartItems nullability constraints", () => {
      const columns = getTableColumns(cartItems);

      expect(columns.id.notNull).toBe(true);
      expect(columns.cartId.notNull).toBe(true);
      expect(columns.variantId.notNull).toBe(true);
      expect(columns.quantity.notNull).toBe(true);
      expect(columns.createdAt.notNull).toBe(true);
      expect(columns.updatedAt.notNull).toBe(true);
    });

    it("enforces UNIQUE(cart_id, variant_id) on CartItems", () => {
      const config = getTableConfig(cartItems);
      const uniqueConstraint = config.uniqueConstraints.find(
        (u) => u.name === "cart_items_cart_id_variant_id_unique"
      );

      expect(uniqueConstraint).toBeDefined();
      expect(uniqueConstraint?.columns.map((c) => c.name)).toEqual(["cart_id", "variant_id"]);
    });

    it("configures cart_id FK with ON DELETE CASCADE and variant_id FK with ON DELETE RESTRICT", () => {
      const config = getTableConfig(cartItems);

      const cartFk = config.foreignKeys.find((fk) =>
        fk.reference().columns.some((c) => c.name === "cart_id")
      );
      expect(cartFk).toBeDefined();
      expect(cartFk?.onDelete).toBe("cascade");
      expect(cartFk?.reference().foreignTable).toBe(carts);
      expect(cartFk?.reference().foreignColumns.map((c) => c.name)).toEqual(["id"]);

      const variantFk = config.foreignKeys.find((fk) =>
        fk.reference().columns.some((c) => c.name === "variant_id")
      );
      expect(variantFk).toBeDefined();
      expect(variantFk?.onDelete).toBe("restrict");
      expect(variantFk?.reference().foreignTable).toBe(productVariants);
      expect(variantFk?.reference().foreignColumns.map((c) => c.name)).toEqual(["id"]);
    });

    it("enforces quantity lower and upper bounds check (1 <= quantity <= 10)", () => {
      const config = getTableConfig(cartItems);
      const quantityCheck = config.checks.find(
        (c) => c.name === "cart_items_quantity_bounds_check"
      );

      expect(quantityCheck).toBeDefined();
    });

    it("defines lookup indexes on cart_id and variant_id", () => {
      const config = getTableConfig(cartItems);

      const cartIdIdx = config.indexes.find((i) => i.config.name === "cart_items_cart_id_idx");
      expect(cartIdIdx).toBeDefined();

      const variantIdIdx = config.indexes.find(
        (i) => i.config.name === "cart_items_variant_id_idx"
      );
      expect(variantIdIdx).toBeDefined();
    });

    it("does not contain speculative price snapshot or discount fields", () => {
      const columns = getTableColumns(cartItems);
      const columnNames = Object.keys(columns);

      expect(columnNames).not.toContain("unitPriceCents");
      expect(columnNames).not.toContain("priceCents");
      expect(columnNames).not.toContain("discountCents");
      expect(columnNames).not.toContain("couponId");
    });
  });

  describe("Migration 0008 & Journal Integrity", () => {
    const journalPath = resolve(process.cwd(), "src/db/migrations/meta/_journal.json");
    const migration0008Path = resolve(process.cwd(), "src/db/migrations/0008_small_logan.sql");

    it("contains journal entry at index 8 with tag 0008_small_logan", () => {
      const journalContent = JSON.parse(readFileSync(journalPath, "utf-8"));
      expect(journalContent.entries).toHaveLength(9);

      const entry8 = journalContent.entries[8];
      expect(entry8.idx).toBe(8);
      expect(entry8.tag).toBe("0008_small_logan");
    });

    it("verifies migration 0008 SQL creates cart_status enum, carts, cart_items, and approved constraints", () => {
      const sql = readFileSync(migration0008Path, "utf-8");

      expect(sql).toContain(
        "CREATE TYPE \"public\".\"cart_status\" AS ENUM('ACTIVE', 'CONVERTED', 'ABANDONED');"
      );
      expect(sql).toContain('CREATE TABLE "carts"');
      expect(sql).toContain('CREATE TABLE "cart_items"');
      expect(sql).toContain(
        '"cart_items_cart_id_variant_id_unique" UNIQUE("cart_id","variant_id")'
      );
      expect(sql).toContain(
        '"cart_items_quantity_bounds_check" CHECK ("cart_items"."quantity" >= 1 AND "cart_items"."quantity" <= 10)'
      );
      expect(sql).toContain(
        '"carts_ownership_xor_check" CHECK (("carts"."customer_id" IS NOT NULL AND "carts"."session_token" IS NULL) OR ("carts"."customer_id" IS NULL AND "carts"."session_token" IS NOT NULL))'
      );
      expect(sql).toContain(
        'FOREIGN KEY ("customer_id") REFERENCES "public"."customer_profiles"("id") ON DELETE cascade'
      );
      expect(sql).toContain(
        'FOREIGN KEY ("cart_id") REFERENCES "public"."carts"("id") ON DELETE cascade'
      );
      expect(sql).toContain(
        'FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE restrict'
      );
      expect(sql).toContain(
        'CREATE UNIQUE INDEX "carts_customer_id_active_unique" ON "carts" USING btree ("customer_id") WHERE "carts"."status" = \'ACTIVE\' AND "carts"."customer_id" IS NOT NULL;'
      );
      expect(sql).toContain(
        'CREATE UNIQUE INDEX "carts_session_token_active_unique" ON "carts" USING btree ("session_token") WHERE "carts"."status" = \'ACTIVE\' AND "carts"."session_token" IS NOT NULL;'
      );
      expect(sql).toContain(
        'CREATE INDEX "cart_items_cart_id_idx" ON "cart_items" USING btree ("cart_id");'
      );
      expect(sql).toContain(
        'CREATE INDEX "cart_items_variant_id_idx" ON "cart_items" USING btree ("variant_id");'
      );
    });

    it("verifies migration 0008 contains zero future-GP tables, checkout snapshots, or inventory tables", () => {
      const sql = readFileSync(migration0008Path, "utf-8");

      expect(sql).not.toContain("orders");
      expect(sql).not.toContain("order_items");
      expect(sql).not.toContain("inventory_items");
      expect(sql).not.toContain("inventory_reservations");
      expect(sql).not.toContain("promotions");
      expect(sql).not.toContain("coupons");
      expect(sql).not.toContain("payment");
      expect(sql).not.toContain("shipment");
      expect(sql).not.toContain("wishlist_items");
      expect(sql).not.toContain("GRANT ALL");
      expect(sql).not.toContain("GRANT SELECT");
    });
  });
});
