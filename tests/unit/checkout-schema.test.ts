import { describe, expect, it } from "vitest";
import { getTableColumns } from "drizzle-orm";
import { getTableConfig } from "drizzle-orm/pg-core";
import {
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

describe("GP-018 CHK2 — Checkout Schema & Table Foundation", () => {
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

  describe("Order Aggregate Schema", () => {
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

  describe("Order Items & Snapshot Schemas", () => {
    it("verifies OrderItem fields and FK deletion rules", () => {
      const cols = getTableColumns(orderItems);
      expect(cols.id.notNull).toBe(true);
      expect(cols.orderId.notNull).toBe(true);
      expect(cols.variantId.notNull).toBe(true);
      expect(cols.skuSnapshot.notNull).toBe(true);
      expect(cols.productNameSnapshot.notNull).toBe(true);
      expect(cols.variantTitleSnapshot.notNull).toBe(true);
      expect(cols.unitPriceCentsSnapshot.notNull).toBe(true);
      expect(cols.quantity.notNull).toBe(true);
      expect(cols.lineTotalCents.notNull).toBe(true);

      const config = getTableConfig(orderItems);
      const orderFk = config.foreignKeys.find((fk) =>
        fk.reference().columns.some((c) => c.name === "order_id")
      );
      const variantFk = config.foreignKeys.find((fk) =>
        fk.reference().columns.some((c) => c.name === "variant_id")
      );
      expect(orderFk?.onDelete).toBe("cascade");
      expect(variantFk?.onDelete).toBe("restrict");
    });

    it("verifies OrderAddressSnapshot has UNIQUE(order_id)", () => {
      const cols = getTableColumns(orderAddressSnapshots);
      expect(cols.orderId.notNull).toBe(true);
      expect(cols.recipientName.notNull).toBe(true);
      expect(cols.phone.notNull).toBe(true);
      expect(cols.streetAddress.notNull).toBe(true);
      expect(cols.department.notNull).toBe(true);
      expect(cols.province.notNull).toBe(true);
      expect(cols.district.notNull).toBe(true);

      expect(cols.orderId.isUnique).toBe(true);
    });

    it("verifies OrderPricingSnapshot has UNIQUE(order_id) and currency default PEN", () => {
      const cols = getTableColumns(orderPricingSnapshots);
      expect(cols.orderId.notNull).toBe(true);
      expect(cols.subtotalCents.notNull).toBe(true);
      expect(cols.totalCents.notNull).toBe(true);
      expect(cols.currency.default).toBe("PEN");
      expect(cols.orderId.isUnique).toBe(true);
    });
  });

  describe("Payments & Shipping Foundation", () => {
    it("verifies Payment has UNIQUE(order_id) and default UNPAID status", () => {
      const cols = getTableColumns(payments);
      expect(cols.orderId.notNull).toBe(true);
      expect(cols.orderId.isUnique).toBe(true);
      expect(cols.status.default).toBe("UNPAID");
      expect(cols.currency.default).toBe("PEN");

      const config = getTableConfig(payments);
      const orderFk = config.foreignKeys.find((fk) =>
        fk.reference().columns.some((c) => c.name === "order_id")
      );
      const methodFk = config.foreignKeys.find((fk) =>
        fk.reference().columns.some((c) => c.name === "payment_method_code")
      );
      const instructionFk = config.foreignKeys.find((fk) =>
        fk.reference().columns.some((c) => c.name === "instruction_version_id")
      );
      expect(orderFk?.onDelete).toBe("cascade");
      expect(methodFk?.onDelete).toBe("restrict");
      expect(instructionFk?.onDelete).toBe("restrict");
    });

    it("verifies ShippingMethod code is unique and Shipment references Order with cascade", () => {
      const methodCols = getTableColumns(shippingMethods);
      expect(methodCols.code.isUnique).toBe(true);

      const shipmentCols = getTableColumns(shipments);
      expect(shipmentCols.status.default).toBe("UNFULFILLED");

      const shipmentConfig = getTableConfig(shipments);
      const orderFk = shipmentConfig.foreignKeys.find((fk) =>
        fk.reference().columns.some((c) => c.name === "order_id")
      );
      const methodFk = shipmentConfig.foreignKeys.find((fk) =>
        fk.reference().columns.some((c) => c.name === "shipping_method_id")
      );
      expect(orderFk?.onDelete).toBe("cascade");
      expect(methodFk?.onDelete).toBe("restrict");
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

  describe("Idempotency Security & Privacy", () => {
    it("verifies idempotency_keys schema does NOT contain raw session_token or raw PII address columns", () => {
      const cols = getTableColumns(idempotencyKeys);
      const columnNames = Object.keys(cols);

      expect(cols.idempotencyKey.isUnique).toBe(true);
      expect(cols.operationType.notNull).toBe(true);
      expect(cols.expiresAt.notNull).toBe(true);

      // Security & Privacy assertions: zero raw session tokens or raw address PII columns
      expect(columnNames).not.toContain("sessionToken");
      expect(columnNames).not.toContain("session_token");
      expect(columnNames).not.toContain("deliveryAddress");
      expect(columnNames).not.toContain("rawAddress");
      expect(columnNames).not.toContain("customerPii");
      expect(columnNames).toContain("requestFingerprint");
    });
  });
});
