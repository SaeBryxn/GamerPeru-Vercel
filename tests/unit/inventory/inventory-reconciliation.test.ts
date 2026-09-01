import { describe, expect, it } from "vitest";

describe("GP-021 — Inventory Reconciliation Logic", () => {
  interface ItemSnapshot {
    quantityOnHand: number;
    quantityReserved: number;
    quantityAllocated: number;
  }

  interface ReservationSnapshot {
    quantity: number;
    status: "ACTIVE" | "VERIFICATION_HOLD" | "ALLOCATED" | "RELEASED" | "CONSUMED";
  }

  const evaluateDiscrepancy = (
    item: ItemSnapshot,
    reservations: ReservationSnapshot[],
    latestLedgerAfter?: ItemSnapshot
  ) => {
    const expectedReserved = reservations
      .filter((r) => r.status === "ACTIVE" || r.status === "VERIFICATION_HOLD")
      .reduce((sum, r) => sum + r.quantity, 0);

    const expectedAllocated = reservations
      .filter((r) => r.status === "ALLOCATED")
      .reduce((sum, r) => sum + r.quantity, 0);

    const reservedDrift = item.quantityReserved - expectedReserved;
    const allocatedDrift = item.quantityAllocated - expectedAllocated;
    const hasCapacityViolation =
      item.quantityOnHand < item.quantityReserved + item.quantityAllocated;

    const latestLedgerMatches = latestLedgerAfter
      ? latestLedgerAfter.quantityOnHand === item.quantityOnHand &&
        latestLedgerAfter.quantityReserved === item.quantityReserved &&
        latestLedgerAfter.quantityAllocated === item.quantityAllocated
      : true;

    const hasDiscrepancy =
      reservedDrift !== 0 || allocatedDrift !== 0 || hasCapacityViolation || !latestLedgerMatches;

    return {
      expectedReserved,
      expectedAllocated,
      reservedDrift,
      allocatedDrift,
      hasCapacityViolation,
      latestLedgerMatches,
      hasDiscrepancy,
    };
  };

  it("detects zero discrepancy on fully aligned items", () => {
    const item: ItemSnapshot = { quantityOnHand: 100, quantityReserved: 15, quantityAllocated: 20 };
    const reservations: ReservationSnapshot[] = [
      { quantity: 10, status: "ACTIVE" },
      { quantity: 5, status: "VERIFICATION_HOLD" },
      { quantity: 20, status: "ALLOCATED" },
      { quantity: 30, status: "RELEASED" }, // Terminal, ignored
      { quantity: 10, status: "CONSUMED" }, // Terminal, ignored
    ];
    const latestLedger: ItemSnapshot = {
      quantityOnHand: 100,
      quantityReserved: 15,
      quantityAllocated: 20,
    };

    const result = evaluateDiscrepancy(item, reservations, latestLedger);
    expect(result.hasDiscrepancy).toBe(false);
    expect(result.reservedDrift).toBe(0);
    expect(result.allocatedDrift).toBe(0);
    expect(result.hasCapacityViolation).toBe(false);
  });

  it("detects reserved drift when active reservations sum differs from item balance", () => {
    const item: ItemSnapshot = { quantityOnHand: 100, quantityReserved: 25, quantityAllocated: 0 };
    const reservations: ReservationSnapshot[] = [
      { quantity: 10, status: "ACTIVE" }, // Sum is 10, but item has 25
    ];

    const result = evaluateDiscrepancy(item, reservations);
    expect(result.hasDiscrepancy).toBe(true);
    expect(result.reservedDrift).toBe(15);
    expect(result.expectedReserved).toBe(10);
  });

  it("detects allocated drift when allocated reservations sum differs", () => {
    const item: ItemSnapshot = { quantityOnHand: 100, quantityReserved: 0, quantityAllocated: 50 };
    const reservations: ReservationSnapshot[] = [
      { quantity: 30, status: "ALLOCATED" }, // Sum is 30, but item has 50
    ];

    const result = evaluateDiscrepancy(item, reservations);
    expect(result.hasDiscrepancy).toBe(true);
    expect(result.allocatedDrift).toBe(20);
    expect(result.expectedAllocated).toBe(30);
  });

  it("detects capacity violation when on_hand is less than reserved + allocated", () => {
    const item: ItemSnapshot = { quantityOnHand: 20, quantityReserved: 15, quantityAllocated: 10 }; // 25 > 20
    const reservations: ReservationSnapshot[] = [
      { quantity: 15, status: "ACTIVE" },
      { quantity: 10, status: "ALLOCATED" },
    ];

    const result = evaluateDiscrepancy(item, reservations);
    expect(result.hasDiscrepancy).toBe(true);
    expect(result.hasCapacityViolation).toBe(true);
  });

  it("detects ledger mismatch when item balance does not match latest ledger entry snapshot", () => {
    const item: ItemSnapshot = { quantityOnHand: 100, quantityReserved: 10, quantityAllocated: 0 };
    const reservations: ReservationSnapshot[] = [{ quantity: 10, status: "ACTIVE" }];
    const staleLedger: ItemSnapshot = {
      quantityOnHand: 90,
      quantityReserved: 10,
      quantityAllocated: 0,
    };

    const result = evaluateDiscrepancy(item, reservations, staleLedger);
    expect(result.hasDiscrepancy).toBe(true);
    expect(result.latestLedgerMatches).toBe(false);
  });
});
