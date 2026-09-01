import { describe, expect, it } from "vitest";
import * as inngestRoute from "@/app/api/inngest/route";
import { inventoryReservationExpirationJob } from "@/lib/inngest/functions/inventory-expiration";

describe("GP-021 / CHK2-BR1 — Inngest Endpoint Registration", () => {
  it("exports canonical HTTP handlers GET, POST, and PUT", () => {
    expect(typeof inngestRoute.GET).toBe("function");
    expect(typeof inngestRoute.POST).toBe("function");
    expect(typeof inngestRoute.PUT).toBe("function");
  });

  it("exports registered inventoryReservationExpirationJob with exact id", () => {
    expect(inventoryReservationExpirationJob).toBeDefined();
    expect(inventoryReservationExpirationJob.id("test-app")).toBe(
      "test-app-inventory-reservation-expiration"
    );
  });
});
