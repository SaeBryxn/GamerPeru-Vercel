import { describe, expect, it } from "vitest";
import { getTableColumns } from "drizzle-orm";
import { getTableConfig } from "drizzle-orm/pg-core";
import {
  carts,
  idempotencyKeys,
  idempotencyOperationTypeEnum,
  inventoryItems,
  inventoryLedgerEntries,
  inventoryLocations,
  inventoryMovementTypeEnum,
  inventoryReferenceTypeEnum,
  inventoryReservations,
  inventoryReservationStatusEnum,
  orderAddressSnapshots,
  orderItems,
  orderPricingSnapshots,
  orders,
  orderStatusEnum,
  outboxEvents,
  outboxEventStatusEnum,
  paymentInstructionVersions,
  paymentMethodConfigurations,
  paymentMethodTypeEnum,
  payments,
  paymentStatusEnum,
  shipments,
  shipmentStatusEnum,
  shippingMethods,
} from "@/db/schema";

interface ColumnWithLength {
  length?: number;
}

describe("GP-018 CHK2-BR1 — Checkout Schema & Table Foundation", () => {
  describe("Approved 15-Table Set Existence", () => {
    it("exports all 15 approved physical tables", () => {
      const allTables = [
        orders,
        orderItems,
        orderAddressSnapshots,
        orderPricingSnapshots,
        shippingMethods,
        shipments,
        paymentMethodConfigurations,
        paymentInstructionVersions,
        payments,
        idempotencyKeys,
        inventoryLocations,
        inventoryItems,
        inventoryReservations,
        inventoryLedgerEntries,
        outboxEvents,
      ];

      expect(allTables).toHaveLength(15);
      for (const table of allTables) {
        expect(table).toBeDefined();
        const config = getTableConfig(table);
        expect(config.name).toBeTruthy();
      }
    });

    it("verifies all canonical PostgreSQL enums and their values", () => {
      expect(orderStatusEnum.enumValues).toEqual([
        "PENDING",
        "CONFIRMED",
        "PROCESSING",
        "FULFILLED",
        "CANCELLED",
        "EXPIRED",
        "REFUNDED",
      ]);
      expect(shipmentStatusEnum.enumValues).toEqual([
        "UNFULFILLED",
        "READY_TO_PACK",
        "PACKED",
        "SHIPPED",
        "DELIVERED",
        "RETURNED",
      ]);
      expect(paymentMethodTypeEnum.enumValues).toEqual(["MANUAL", "GATEWAY"]);
      expect(paymentStatusEnum.enumValues).toEqual([
        "UNPAID",
        "SUBMITTED",
        "VERIFYING",
        "PAID",
        "REJECTED",
        "REFUNDED",
      ]);
      expect(idempotencyOperationTypeEnum.enumValues).toContain("ORDER_CREATION");
      expect(inventoryMovementTypeEnum.enumValues).toContain("RESERVATION_CREATED");
      expect(inventoryReferenceTypeEnum.enumValues).toEqual([
        "ORDER",
        "PURCHASE_ORDER",
        "RMA",
        "MANUAL_AUDIT",
      ]);
      expect(inventoryReservationStatusEnum.enumValues).toEqual([
        "ACTIVE",
        "VERIFICATION_HOLD",
        "ALLOCATED",
        "CONSUMED",
        "RELEASED",
      ]);
      expect(outboxEventStatusEnum.enumValues).toEqual(["PENDING", "DELIVERED", "FAILED"]);
    });
  });

  describe("Order Aggregate Schema & Historical Preservation", () => {
    it("defines canonical Order fields and nullability", () => {
      const cols = getTableColumns(orders);

      expect(cols.id.notNull).toBe(true);
      expect(cols.orderNumber.notNull).toBe(true);
      expect(cols.customerId.notNull).toBe(false); // Nullable for guest checkout
      expect(cols.customerEmail.notNull).toBe(true);
      expect(cols.customerPhone.notNull).toBe(true);
      expect(cols.status.notNull).toBe(true);
      expect(cols.subtotalCents.notNull).toBe(true);
      expect(cols.discountCents.notNull).toBe(true);
      expect(cols.shippingCents.notNull).toBe(true);
      expect(cols.totalCents.notNull).toBe(true);
      expect(cols.currency.notNull).toBe(true);
      expect(cols.createdAt.notNull).toBe(true);
      expect(cols.updatedAt.notNull).toBe(true);
    });

    it("verifies customer_id FK has ON DELETE SET NULL to preserve financial history", () => {
      const config = getTableConfig(orders);
      const customerFk = config.foreignKeys.find((fk) =>
        fk.reference().columns.some((c) => c.name === "customer_id")
      );
      expect(customerFk).toBeDefined();
      expect(customerFk?.onDelete).toBe("set null");
    });
  });

  describe("Order Children FK Deletion Safety (Blocker C)", () => {
    it("verifies order_items FK to orders has ON DELETE RESTRICT", () => {
      const config = getTableConfig(orderItems);
      const orderFk = config.foreignKeys.find((fk) =>
        fk.reference().columns.some((c) => c.name === "order_id")
      );
      const variantFk = config.foreignKeys.find((fk) =>
        fk.reference().columns.some((c) => c.name === "variant_id")
      );
      expect(orderFk?.onDelete).toBe("restrict");
      expect(variantFk?.onDelete).toBe("restrict");
    });

    it("verifies order_address_snapshots FK to orders has ON DELETE RESTRICT and UNIQUE(order_id)", () => {
      const cols = getTableColumns(orderAddressSnapshots);
      expect(cols.orderId.isUnique).toBe(true);

      const config = getTableConfig(orderAddressSnapshots);
      const orderFk = config.foreignKeys.find((fk) =>
        fk.reference().columns.some((c) => c.name === "order_id")
      );
      expect(orderFk?.onDelete).toBe("restrict");
    });

    it("verifies order_pricing_snapshots FK to orders has ON DELETE RESTRICT and UNIQUE(order_id)", () => {
      const cols = getTableColumns(orderPricingSnapshots);
      expect(cols.orderId.isUnique).toBe(true);

      const config = getTableConfig(orderPricingSnapshots);
      const orderFk = config.foreignKeys.find((fk) =>
        fk.reference().columns.some((c) => c.name === "order_id")
      );
      expect(orderFk?.onDelete).toBe("restrict");
    });

    it("verifies shipments FK to orders has ON DELETE RESTRICT", () => {
      const config = getTableConfig(shipments);
      const orderFk = config.foreignKeys.find((fk) =>
        fk.reference().columns.some((c) => c.name === "order_id")
      );
      const methodFk = config.foreignKeys.find((fk) =>
        fk.reference().columns.some((c) => c.name === "shipping_method_id")
      );
      expect(orderFk?.onDelete).toBe("restrict");
      expect(methodFk?.onDelete).toBe("restrict");
    });

    it("verifies payments FK to orders has ON DELETE RESTRICT and UNIQUE(order_id)", () => {
      const cols = getTableColumns(payments);
      expect(cols.orderId.isUnique).toBe(true);

      const config = getTableConfig(payments);
      const orderFk = config.foreignKeys.find((fk) =>
        fk.reference().columns.some((c) => c.name === "order_id")
      );
      expect(orderFk?.onDelete).toBe("restrict");
    });

    it("verifies inventory_reservations FKs to orders and order_items have ON DELETE RESTRICT", () => {
      const config = getTableConfig(inventoryReservations);
      const orderFk = config.foreignKeys.find((fk) =>
        fk.reference().columns.some((c) => c.name === "order_id")
      );
      const orderItemFk = config.foreignKeys.find((fk) =>
        fk.reference().columns.some((c) => c.name === "order_item_id")
      );
      const itemFk = config.foreignKeys.find((fk) =>
        fk.reference().columns.some((c) => c.name === "inventory_item_id")
      );
      expect(orderFk?.onDelete).toBe("restrict");
      expect(orderItemFk?.onDelete).toBe("restrict");
      expect(itemFk?.onDelete).toBe("restrict");
    });
  });

  describe("Payment Method / Instruction Consistency (Blocker B)", () => {
    it("verifies payment_instruction_versions has composite unique on (id, payment_method_code)", () => {
      const config = getTableConfig(paymentInstructionVersions);
      const compositeUnique = config.uniqueConstraints.find(
        (u) =>
          u.columns.some((c) => c.name === "id") &&
          u.columns.some((c) => c.name === "payment_method_code")
      );
      expect(compositeUnique).toBeDefined();
    });

    it("verifies payment_method_configurations has composite FK on (current_instruction_version_id, code)", () => {
      const config = getTableConfig(paymentMethodConfigurations);
      const compositeFk = config.foreignKeys.find(
        (fk) =>
          fk.reference().columns.some((c) => c.name === "current_instruction_version_id") &&
          fk.reference().columns.some((c) => c.name === "code")
      );
      expect(compositeFk).toBeDefined();
      expect(compositeFk?.onDelete).toBe("restrict");
      expect(compositeFk?.reference().foreignColumns.map((c) => c.name)).toEqual([
        "id",
        "payment_method_code",
      ]);
    });

    it("verifies payments has composite FK on (instruction_version_id, payment_method_code)", () => {
      const config = getTableConfig(payments);
      const compositeFk = config.foreignKeys.find(
        (fk) =>
          fk.reference().columns.some((c) => c.name === "instruction_version_id") &&
          fk.reference().columns.some((c) => c.name === "payment_method_code")
      );
      expect(compositeFk).toBeDefined();
      expect(compositeFk?.onDelete).toBe("restrict");
      expect(compositeFk?.reference().foreignColumns.map((c) => c.name)).toEqual([
        "id",
        "payment_method_code",
      ]);
    });
  });

  describe("Idempotency Authority & Privacy (Blocker A)", () => {
    it("defines authority_binding_digest and mandatory request_fingerprint", () => {
      const cols = getTableColumns(idempotencyKeys);
      expect(cols.idempotencyKey.isUnique).toBe(true);
      expect(cols.operationType.notNull).toBe(true);
      expect(cols.authorityBindingDigest.notNull).toBe(true);
      expect((cols.authorityBindingDigest as unknown as ColumnWithLength).length).toBe(64);
      expect(cols.sourceCartId.notNull).toBe(true);
      expect(cols.requestFingerprint.notNull).toBe(true);
      expect((cols.requestFingerprint as unknown as ColumnWithLength).length).toBe(64);
      expect(cols.expiresAt.notNull).toBe(true);
    });

    it("verifies source_cart_id has FK to carts.id with ON DELETE RESTRICT", () => {
      const config = getTableConfig(idempotencyKeys);
      const cartFk = config.foreignKeys.find((fk) =>
        fk.reference().columns.some((c) => c.name === "source_cart_id")
      );
      expect(cartFk).toBeDefined();
      expect(cartFk?.onDelete).toBe("restrict");
      expect(cartFk?.reference().foreignTable).toBe(carts);
    });

    it("verifies zero raw session_token or raw PII address columns exist in idempotency_keys", () => {
      const cols = getTableColumns(idempotencyKeys);
      const columnNames = Object.keys(cols);

      expect(columnNames).not.toContain("sessionToken");
      expect(columnNames).not.toContain("session_token");
      expect(columnNames).not.toContain("deliveryAddress");
      expect(columnNames).not.toContain("rawAddress");
      expect(columnNames).not.toContain("customerPii");
      expect(columnNames).toContain("authorityBindingDigest");
      expect(columnNames).toContain("requestFingerprint");
    });
  });

  describe("Inventory & Outbox Foundations", () => {
    it("verifies InventoryItem has variant + location unique constraint", () => {
      const config = getTableConfig(inventoryItems);
      const uniqueConstraint = config.uniqueConstraints.find(
        (u) =>
          u.columns.some((c) => c.name === "variant_id") &&
          u.columns.some((c) => c.name === "location_id")
      );
      expect(uniqueConstraint).toBeDefined();
    });

    it("verifies InventoryReservation has partial unique index on non-terminal status", () => {
      const config = getTableConfig(inventoryReservations);
      const nonTerminalIndex = config.indexes.find(
        (idx) => idx.config.name === "inventory_reservations_order_item_non_terminal_unique"
      );
      expect(nonTerminalIndex).toBeDefined();
      expect(nonTerminalIndex?.config.unique).toBe(true);
    });

    it("verifies OutboxEvent supports status and next_attempt_at index", () => {
      const cols = getTableColumns(outboxEvents);
      expect(cols.eventName.notNull).toBe(true);
      expect(cols.payload.notNull).toBe(true);
      expect(cols.status.default).toBe("PENDING");
      expect(cols.eventVersion.default).toBe(1);

      const config = getTableConfig(outboxEvents);
      const statusIdx = config.indexes.find(
        (idx) => idx.config.name === "outbox_events_status_next_attempt_idx"
      );
      expect(statusIdx).toBeDefined();
    });
  });
});
