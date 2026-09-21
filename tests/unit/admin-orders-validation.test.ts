import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  noteActorDigest,
  noteAuditRequestId,
  noteIntentFingerprint,
} from "@/lib/admin/orders/crypto";
import {
  encodeOrderCursor,
  maskOrderEmail,
  normalizeAdminCancellationReason,
  normalizeOrderNoteBody,
  parseAdminOrderListQuery,
} from "@/lib/admin/orders/validation";

describe("GP-027 CHK1 Admin order validation", () => {
  it("defaults to a bounded unfiltered page", () => {
    const result = parseAdminOrderListQuery(new URLSearchParams());
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.query.pageSize).toBe(25);
      expect(result.query.search).toBeNull();
    }
  });

  it("rejects unknown, duplicate, oversized, wildcard, and invalid filters", () => {
    for (const params of [
      "foo=bar",
      "q=GP-1&q=GP-2",
      `q=${"x".repeat(256)}`,
      "q=GP-%",
      "q=GP-_",
      "q=GP-%5C",
      "orderStatus=PAID",
      "paymentStatus=CONFIRMED",
      "shipmentStatus=PROCESSING",
      "pageSize=51",
      "pageSize=0",
      "pageSize=2.5",
      "from=2026-09-21",
      "to=2026-09-21",
      "from=2026-02-30&to=2026-03-01",
      "from=2026-09-22&to=2026-09-21",
      "from=2025-01-01&to=2026-12-31",
    ]) {
      expect(parseAdminOrderListQuery(new URLSearchParams(params)).valid, params).toBe(false);
    }
    expect(parseAdminOrderListQuery({ q: ["GP-1"] }).valid).toBe(false);
  });

  it("normalizes exact email and anchored order prefix only", () => {
    const email = parseAdminOrderListQuery({ q: " Max.LoPeZ@Example.com " });
    expect(email.valid && email.query.search).toEqual({
      kind: "EMAIL",
      value: "max.lopez@example.com",
    });
    const prefix = parseAdminOrderListQuery({ q: " gp-abc " });
    expect(prefix.valid && prefix.query.search).toEqual({ kind: "ORDER_PREFIX", value: "GP-ABC" });
    expect(parseAdminOrderListQuery({ q: "max@bad" }).valid).toBe(false);
    expect(parseAdminOrderListQuery({ q: "GP-" }).valid).toBe(false);
  });

  it("maps inclusive Lima dates to UTC half-open boundaries", () => {
    const result = parseAdminOrderListQuery({ from: "2026-09-20", to: "2026-09-21" });
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.query.fromUtc?.toISOString()).toBe("2026-09-20T05:00:00.000Z");
      expect(result.query.toUtcExclusive?.toISOString()).toBe("2026-09-22T05:00:00.000Z");
    }
  });

  it("binds a versioned keyset cursor to normalized filters and page size", () => {
    const query = parseAdminOrderListQuery({ q: "GP-ABC", pageSize: "1" });
    expect(query.valid).toBe(true);
    if (!query.valid) return;
    const cursor = encodeOrderCursor(
      new Date("2026-09-20T15:00:00.000Z"),
      randomUUID(),
      query.query
    );
    const replay = parseAdminOrderListQuery({ q: "gp-abc", pageSize: "1", cursor });
    expect(replay.valid).toBe(true);
    expect(parseAdminOrderListQuery({ q: "GP-ABD", pageSize: "1", cursor }).valid).toBe(false);
    expect(parseAdminOrderListQuery({ q: "GP-ABC", pageSize: "2", cursor }).valid).toBe(false);
    expect(parseAdminOrderListQuery({ cursor: "!!!" }).valid).toBe(false);
  });

  it("masks exactly one Unicode local-part code point and falls back for unsafe input", () => {
    expect(maskOrderEmail("max.lopez@example.com")).toBe("m***@example.com");
    expect(maskOrderEmail("a@example.com")).toBe("a***@example.com");
    expect(maskOrderEmail("😊user@example.com")).toBe("😊***@example.com");
    expect(maskOrderEmail("not-an-email")).toBe("Correo no disponible");
    expect(maskOrderEmail("evil\u202E@example.com")).toBe("Correo no disponible");
  });

  it("requires an explicit Admin cancellation reason without the customer default", () => {
    expect(normalizeAdminCancellationReason(undefined)).toBeNull();
    expect(normalizeAdminCancellationReason(null)).toBeNull();
    expect(normalizeAdminCancellationReason("   ")).toBeNull();
    expect(normalizeAdminCancellationReason("x".repeat(256))).toBeNull();
    expect(normalizeAdminCancellationReason("bad\u200Breason")).toBeNull();
    expect(normalizeAdminCancellationReason("  Revisión del pedido  ")).toBe("Revisión del pedido");
  });

  it("normalizes note line breaks and enforces 2000 code points", () => {
    expect(normalizeOrderNoteBody("  línea 1\r\nlínea 2\r  ")).toBe("línea 1\nlínea 2");
    expect(normalizeOrderNoteBody("  ")).toBeNull();
    expect(normalizeOrderNoteBody("bad\u202Etext")).toBeNull();
    expect(normalizeOrderNoteBody("a\tb")).toBeNull();
    expect(normalizeOrderNoteBody("😊".repeat(2000))).toBe("😊".repeat(2000));
    expect(normalizeOrderNoteBody("😊".repeat(2001))).toBeNull();
  });

  it("uses deterministic domain-separated note digests", () => {
    const actor = noteActorDigest(randomUUID());
    const order = randomUUID();
    expect(actor).toMatch(/^[0-9a-f]{64}$/);
    expect(noteIntentFingerprint(order, actor, "a:b")).not.toBe(
      noteIntentFingerprint(order, actor, "ab")
    );
    expect(noteAuditRequestId(randomUUID())).toMatch(/^[0-9a-f]{64}$/);
  });
});
