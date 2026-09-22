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
  safeTrackingUrl,
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

  it("accepts native GET forms with exact-empty optional fields", () => {
    const populated = parseAdminOrderListQuery(
      new URLSearchParams(
        "q=GP-AD&orderStatus=&paymentStatus=&shipmentStatus=&from=&to=&pageSize=25"
      )
    );
    expect(populated.valid).toBe(true);
    if (populated.valid) {
      expect(populated.query).toMatchObject({
        search: { kind: "ORDER_PREFIX", value: "GP-AD" },
        orderStatus: null,
        paymentStatus: null,
        shipmentStatus: null,
        from: null,
        to: null,
        fromUtc: null,
        toUtcExclusive: null,
        pageSize: 25,
        cursor: null,
      });
    }

    const empty = parseAdminOrderListQuery(
      new URLSearchParams("q=&orderStatus=&paymentStatus=&shipmentStatus=&from=&to=&pageSize=25")
    );
    expect(empty.valid).toBe(true);
    if (empty.valid) {
      expect(empty.query).toEqual({
        search: null,
        orderStatus: null,
        paymentStatus: null,
        shipmentStatus: null,
        from: null,
        to: null,
        fromUtc: null,
        toUtcExclusive: null,
        pageSize: 25,
        cursor: null,
      });
    }
  });

  it("keeps partial dates, duplicate keys, whitespace search, and empty operational controls invalid", () => {
    for (const params of [
      "from=2026-09-18&to=",
      "from=&to=2026-09-18",
      "q=&q=GP-AD",
      "orderStatus=&orderStatus=PENDING",
      "q=+++",
      "cursor=",
      "pageSize=",
    ]) {
      expect(parseAdminOrderListQuery(new URLSearchParams(params)).valid, params).toBe(false);
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

  it("hardens safeTrackingUrl against unsafe schemes, credentials, IPs, internal hosts, and custom ports", () => {
    // Null / empty / falsy
    expect(safeTrackingUrl(null)).toBeNull();
    expect(safeTrackingUrl("")).toBeNull();

    // Disallowed protocols
    expect(safeTrackingUrl("http://courier.example.pe/track")).toBeNull();
    expect(safeTrackingUrl("javascript:alert(1)")).toBeNull();
    expect(safeTrackingUrl("data:text/html,<script>alert(1)</script>")).toBeNull();
    expect(safeTrackingUrl("file:///etc/passwd")).toBeNull();
    expect(safeTrackingUrl("ftp://courier.example.pe/track")).toBeNull();

    // Embedded credentials
    expect(safeTrackingUrl("https://user:pass@courier.example.pe/track")).toBeNull();
    expect(safeTrackingUrl("https://user@courier.example.pe/track")).toBeNull();

    // Raw IPs (IPv4 and IPv6)
    expect(safeTrackingUrl("https://127.0.0.1/track")).toBeNull();
    expect(safeTrackingUrl("https://192.168.1.10/track")).toBeNull();
    expect(safeTrackingUrl("https://10.0.0.1/track")).toBeNull();
    expect(safeTrackingUrl("https://[::1]/track")).toBeNull();
    expect(safeTrackingUrl("https://[2001:db8::1]/track")).toBeNull();

    // Localhost, internal, and single-label hostnames
    expect(safeTrackingUrl("https://localhost/track")).toBeNull();
    expect(safeTrackingUrl("https://myserver/track")).toBeNull();
    expect(safeTrackingUrl("https://app.local/track")).toBeNull();
    expect(safeTrackingUrl("https://service.internal/track")).toBeNull();
    expect(safeTrackingUrl("https://sub.cluster.local/track")).toBeNull();
    expect(safeTrackingUrl("https://deep.env.internal/track")).toBeNull();

    // Non-standard ports
    expect(safeTrackingUrl("https://courier.example.pe:8080/track")).toBeNull();
    expect(safeTrackingUrl("https://courier.example.pe:8443/track")).toBeNull();
    expect(safeTrackingUrl("https://courier.example.pe:80/track")).toBeNull();

    // Malformed URLs
    expect(safeTrackingUrl("not-a-url")).toBeNull();
    expect(safeTrackingUrl("https://")).toBeNull();
    expect(safeTrackingUrl("https://.")).toBeNull();
    expect(safeTrackingUrl("https:///path")).toBeNull();

    // Eligible HTTPS destinations
    expect(safeTrackingUrl("https://tracking.olva.pe/envio/12345")).toBe(
      "https://tracking.olva.pe/envio/12345"
    );
    expect(safeTrackingUrl("https://www.chazki.com/track?order=GP-1234&sig=abc")).toBe(
      "https://www.chazki.com/track?order=GP-1234&sig=abc"
    );
    expect(safeTrackingUrl("https://courier.example.pe:443/track")).toBe(
      "https://courier.example.pe/track"
    );
  });
});
