import { randomUUID } from "node:crypto";
import { SQL } from "drizzle-orm";
import postgres from "postgres";
import { PgDialect } from "drizzle-orm/pg-core";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { assertLocalDatabaseTarget } from "@/lib/admin/test-target-guard";
import type * as RbacModule from "@/lib/auth/rbac";

vi.mock("@/lib/auth/rbac", async () => {
  const actual = await vi.importActual<typeof RbacModule>("@/lib/auth/rbac");
  return { ...actual, requirePermission: vi.fn() };
});

import { requirePermission, ForbiddenError } from "@/lib/auth/rbac";
import { createAdminOrderNote } from "@/lib/admin/orders/note-service";
import { loadAdminTimelinePage } from "@/lib/admin/orders/timeline";
import {
  getAdminOrderDetail,
  getAdminOrderList,
  getAdminOrderNotesPage,
  getAdminOrderTimelinePage,
} from "@/lib/admin/orders/reader";

describe("GP-027 CHK1 Orders Admin local PostgreSQL", () => {
  const databaseUrl = assertLocalDatabaseTarget(
    process.env.DATABASE_URL ??
      process.env.DATABASE_MIGRATION_URL ??
      "postgres://postgres:postgres@127.0.0.1:54322/postgres"
  );
  const id = {
    actor: randomUUID(),
    otherActor: randomUUID(),
    brand: randomUUID(),
    category: randomUUID(),
    product: randomUUID(),
    variant: randomUUID(),
    method: randomUUID(),
    instruction: randomUUID(),
    shipping: randomUUID(),
    a: randomUUID(),
    b: randomUUID(),
    c: randomUUID(),
    d: randomUUID(),
    paymentD: randomUUID(),
  };
  const code = `GP027${randomUUID().slice(0, 8).toUpperCase()}`;
  const orderNumber = `${code}-A`;
  const tieOrderNumber = `TIE${randomUUID().slice(0, 8).toUpperCase()}-D`;
  const auth = (authUserId: string) => ({
    status: "READY" as const,
    authUserId,
    email: "gp027-admin@example.com",
    roles: ["ADMIN_ORDERS" as const],
    permissions: new Set(["orders:manage" as const]),
  });
  let pg: postgres.Sql;

  beforeAll(async () => {
    pg = postgres(databaseUrl, { max: 12, prepare: false });
    vi.mocked(requirePermission).mockResolvedValue(auth(id.actor));
    await pg`
      INSERT INTO auth.users (id, email, raw_app_meta_data, raw_user_meta_data, is_super_admin, created_at, updated_at)
      VALUES (${id.actor}, ${`${code.toLowerCase()}@example.com`}, '{}', '{}', false, now(), now()),
             (${id.otherActor}, ${`${code.toLowerCase()}-other@example.com`}, '{}', '{}', false, now(), now())
    `;
    await pg`INSERT INTO brands (id, name, slug, status) VALUES (${id.brand}, 'GP027', ${code.toLowerCase()}, 'PUBLISHED')`;
    await pg`INSERT INTO categories (id, name, slug, status, display_order) VALUES (${id.category}, 'GP027', ${code.toLowerCase()}, 'PUBLISHED', 1)`;
    await pg`INSERT INTO products (id, brand_id, category_id, name, slug, status) VALUES (${id.product}, ${id.brand}, ${id.category}, 'Changed catalog name', ${code.toLowerCase()}, 'PUBLISHED')`;
    await pg`INSERT INTO product_variants (id, product_id, sku, title, price_cents, status) VALUES (${id.variant}, ${id.product}, ${code}, 'Current variant', 99900, 'ACTIVE')`;
    await pg`INSERT INTO payment_method_configurations (id, code, name, is_active) VALUES (${id.method}, ${code}, 'Manual GP027', true)`;
    await pg`INSERT INTO payment_instruction_versions (id, payment_method_code, version_number, recipient_name, account_identifier, instruction_text, is_active) VALUES (${id.instruction}, ${code}, 1, 'GP027', '123', 'Instructions', true)`;
    await pg`INSERT INTO shipping_methods (id, name, code, base_price_cents) VALUES (${id.shipping}, 'GP027', ${code}, 0)`;
    for (const [orderId, suffix, createdAt, email] of [
      [id.a, "A", "2026-09-20T05:00:00.000Z", "Max.LoPeZ@example.com"],
      [id.b, "B", "2026-09-20T05:00:00.000Z", "b@example.com"],
      [id.c, "C", "2026-09-22T04:59:59.000Z", "c@example.com"],
    ] as const) {
      await pg`
        INSERT INTO orders (id, order_number, customer_email, customer_phone, status,
          subtotal_cents, discount_cents, shipping_cents, total_cents, currency, created_at, updated_at)
        VALUES (${orderId}, ${`${code}-${suffix}`}, ${email}, '999999999', ${suffix === "A" ? "PENDING" : suffix === "B" ? "CONFIRMED" : "CANCELLED"},
          10000, 0, 0, 10000, 'PEN', ${createdAt}, ${createdAt})
      `;
    }
    await pg`INSERT INTO order_items (id, order_id, variant_id, sku_snapshot, product_name_snapshot, variant_title_snapshot, unit_price_cents_snapshot, quantity, line_total_cents) VALUES (${randomUUID()}, ${id.a}, ${id.variant}, 'HISTORIC-SKU', 'Historic product', 'Historic variant', 5000, 2, 10000)`;
    await pg`INSERT INTO order_address_snapshots (id, order_id, recipient_name, phone, street_address, department, province, district) VALUES (${randomUUID()}, ${id.a}, 'Historic recipient', '999999999', 'Historic address', 'Lima', 'Lima', 'Lima')`;
    await pg`INSERT INTO order_pricing_snapshots (id, order_id, subtotal_cents, discount_cents, shipping_cents, total_cents, currency) VALUES (${randomUUID()}, ${id.a}, 10000, 0, 0, 10000, 'PEN')`;
    await pg`INSERT INTO payments (id, order_id, payment_method_code, instruction_version_id, amount_cents, currency, status) VALUES (${randomUUID()}, ${id.a}, ${code}, ${id.instruction}, 10000, 'PEN', 'UNPAID')`;
    await pg`INSERT INTO shipments (id, order_id, shipping_method_id, status, tracking_url) VALUES (${randomUUID()}, ${id.a}, ${id.shipping}, 'UNFULFILLED', 'https://courier.example/track'), (${randomUUID()}, ${id.a}, ${id.shipping}, 'UNFULFILLED', 'https://user:pass@courier.example/track')`;
  });

  afterAll(async () => {
    if (!pg) return;
    await pg`DELETE FROM audit_events WHERE target_type = 'Order' AND target_id IN (${id.a}, ${id.b}, ${id.c}, ${id.d})`;
    await pg`DELETE FROM outbox_events WHERE aggregate_type = 'Order' AND aggregate_id = ${id.b}`;
    await pg`DELETE FROM order_notes WHERE order_id IN (${id.a}, ${id.b}, ${id.c}, ${id.d})`;
    await pg`DELETE FROM refunds WHERE order_id = ${id.d}`;
    await pg`DELETE FROM payment_submissions WHERE payment_id = ${id.paymentD}`;
    await pg`DELETE FROM shipments WHERE order_id IN (${id.a}, ${id.d})`;
    await pg`DELETE FROM payments WHERE order_id IN (${id.a}, ${id.d})`;
    await pg`DELETE FROM order_items WHERE order_id = ${id.a}`;
    await pg`DELETE FROM order_address_snapshots WHERE order_id = ${id.a}`;
    await pg`DELETE FROM order_pricing_snapshots WHERE order_id = ${id.a}`;
    await pg`DELETE FROM orders WHERE id IN (${id.a}, ${id.b}, ${id.c}, ${id.d})`;
    await pg`DELETE FROM shipping_methods WHERE id = ${id.shipping}`;
    await pg`DELETE FROM payment_instruction_versions WHERE id = ${id.instruction}`;
    await pg`DELETE FROM payment_method_configurations WHERE id = ${id.method}`;
    await pg`DELETE FROM product_variants WHERE id = ${id.variant}`;
    await pg`DELETE FROM products WHERE id = ${id.product}`;
    await pg`DELETE FROM categories WHERE id = ${id.category}`;
    await pg`DELETE FROM brands WHERE id = ${id.brand}`;
    await pg`DELETE FROM auth.users WHERE id IN (${id.actor}, ${id.otherActor})`;
    await pg.end();
  });

  it("fails closed before any reader returns order data", async () => {
    vi.mocked(requirePermission).mockRejectedValueOnce(new ForbiddenError());
    expect(await getAdminOrderList({ q: code })).toEqual({ status: "NOT_AVAILABLE" });
    vi.mocked(requirePermission).mockRejectedValueOnce(new ForbiddenError());
    expect(await getAdminOrderDetail(orderNumber)).toEqual({ status: "NOT_AVAILABLE" });
  });

  it("paginates tied timestamps deterministically and rejects invalid or cross-filter cursors", async () => {
    const first = await getAdminOrderList({ q: code, pageSize: "1" });
    expect(first.status).toBe("READY");
    if (first.status !== "READY") return;
    expect(first.rows).toHaveLength(1);
    expect(first.nextCursor).not.toBeNull();
    const second = await getAdminOrderList({ q: code, pageSize: "1", cursor: first.nextCursor! });
    expect(second.status).toBe("READY");
    if (second.status !== "READY") return;
    const third = await getAdminOrderList({ q: code, pageSize: "1", cursor: second.nextCursor! });
    expect(third.status).toBe("READY");
    if (third.status !== "READY") return;
    expect(
      new Set([...first.rows, ...second.rows, ...third.rows].map((row) => row.orderNumber)).size
    ).toBe(3);
    expect(second.nextCursor).not.toBeNull();
    expect(third.nextCursor).toBeNull();
    expect(await getAdminOrderList({ q: code, cursor: "bad!" })).toEqual({
      status: "INVALID_INPUT",
    });
    expect(
      await getAdminOrderList({ q: "OTHER", pageSize: "1", cursor: first.nextCursor! })
    ).toEqual({ status: "INVALID_INPUT" });
  });

  it("applies exact email, anchored prefix, masking, Lima dates, and safe integrity states", async () => {
    const email = await getAdminOrderList({ q: "max.lopez@EXAMPLE.COM" });
    expect(email.status).toBe("READY");
    if (email.status !== "READY") return;
    expect(email.rows.map((row) => row.orderNumber)).toEqual([orderNumber]);
    expect(email.rows[0]).toMatchObject({
      customerEmailMasked: "M***@example.com",
      unitCount: 2,
      shipmentStatus: "MULTIPLE",
    });
    expect(email.rows[0]?.integrityIssues).toContain("MULTIPLE_SHIPMENTS");
    const dated = await getAdminOrderList({ q: code, from: "2026-09-21", to: "2026-09-21" });
    expect(dated.status).toBe("READY");
    if (dated.status !== "READY") return;
    expect(dated.rows.map((row) => row.orderNumber)).toEqual([`${code}-C`]);
    expect(await getAdminOrderList({ q: `${code}%` })).toEqual({ status: "INVALID_INPUT" });
    const missing = await getAdminOrderList({ q: `${code}-B` });
    expect(missing.status).toBe("READY");
    if (missing.status === "READY") {
      expect(missing.rows[0]?.paymentStatus).toBe("NOT_RECORDED");
      expect(missing.rows[0]?.integrityIssues).toContain("MISSING_PAYMENT");
    }
  });

  it("physically filters order, payment, and shipment states without duplicate or leaked orders", async () => {
    const cases: [Record<string, string>, string[]][] = [
      [{ orderStatus: "PENDING" }, [`${code}-A`]],
      [{ orderStatus: "CONFIRMED" }, [`${code}-B`]],
      [{ paymentStatus: "UNPAID" }, [`${code}-A`]],
      [{ paymentStatus: "NOT_RECORDED" }, [`${code}-C`, `${code}-B`]],
      [{ shipmentStatus: "UNFULFILLED" }, [`${code}-A`]],
      [{ shipmentStatus: "NOT_RECORDED" }, [`${code}-C`, `${code}-B`]],
      [{ orderStatus: "CONFIRMED", from: "2026-09-20", to: "2026-09-20" }, [`${code}-B`]],
      [{ paymentStatus: "UNPAID", shipmentStatus: "UNFULFILLED" }, [`${code}-A`]],
    ];
    for (const [filters, expected] of cases) {
      const result = await getAdminOrderList({ q: code, ...filters });
      expect(result.status, JSON.stringify(filters)).toBe("READY");
      if (result.status !== "READY") continue;
      const numbers = result.rows.map((row) => row.orderNumber);
      expect(numbers).toEqual(expected);
      expect(new Set(numbers).size).toBe(numbers.length);
    }
    for (const key of ["paymentStatus", "shipmentStatus"] as const) {
      const first = await getAdminOrderList({ q: code, [key]: "NOT_RECORDED", pageSize: "1" });
      expect(first.status).toBe("READY");
      if (first.status !== "READY") continue;
      expect(first.rows.map((row) => row.orderNumber)).toEqual([`${code}-C`]);
      expect(first.nextCursor).not.toBeNull();
      const second = await getAdminOrderList({
        q: code,
        [key]: "NOT_RECORDED",
        pageSize: "1",
        cursor: first.nextCursor!,
      });
      expect(second.status).toBe("READY");
      if (second.status === "READY") {
        expect(second.rows.map((row) => row.orderNumber)).toEqual([`${code}-B`]);
        expect(second.nextCursor).toBeNull();
      }
    }
  });

  it("uses immutable detail snapshots and never fabricates confirmation", async () => {
    const result = await getAdminOrderDetail(orderNumber);
    expect(result.status).toBe("READY");
    if (result.status !== "READY") return;
    expect(result.detail.contact.customerEmail).toBe("Max.LoPeZ@example.com");
    expect(result.detail.items[0]).toMatchObject({
      productName: "Historic product",
      sku: "HISTORIC-SKU",
      quantity: 2,
    });
    expect(result.detail.address?.streetAddress).toBe("Historic address");
    expect(result.detail.shipments).toHaveLength(2);
    expect(result.detail.shipments.map((shipment) => shipment.trackingUrl)).toEqual(
      expect.arrayContaining(["https://courier.example/track", null])
    );
    expect(result.detail.timeline.entries.map((entry) => entry.type)).toEqual(["ORDER_PLACED"]);
  });

  it("projects one durable confirmation and none from current CONFIRMED status alone", async () => {
    const timestamp = "2026-09-20T05:00:00.000Z";
    await pg`
      INSERT INTO audit_events (id, actor_type, actor_id, action, target_type, target_id, timestamp)
      VALUES (${randomUUID()}, 'ADMIN', ${id.actor}, 'orders:approve_payment', 'Order', ${id.b}, ${timestamp})
    `;
    await pg`
      INSERT INTO outbox_events (id, event_name, aggregate_type, aggregate_id, payload, created_at)
      VALUES (${randomUUID()}, 'OrderConfirmed', 'Order', ${id.b}, '{}'::jsonb, ${timestamp})
    `;
    try {
      const evidenced = await getAdminOrderDetail(`${code}-B`);
      expect(evidenced.status).toBe("READY");
      if (evidenced.status === "READY") {
        expect(evidenced.detail.order.status).toBe("CONFIRMED");
        expect(
          evidenced.detail.timeline.entries.filter((entry) => entry.type === "ORDER_CONFIRMED")
        ).toHaveLength(1);
      }
    } finally {
      await pg`DELETE FROM audit_events WHERE target_type = 'Order' AND target_id = ${id.b} AND action = 'orders:approve_payment'`;
      await pg`DELETE FROM outbox_events WHERE aggregate_type = 'Order' AND aggregate_id = ${id.b} AND event_name = 'OrderConfirmed'`;
    }
    const unsupported = await getAdminOrderDetail(`${code}-B`);
    expect(unsupported.status).toBe("READY");
    if (unsupported.status === "READY") {
      expect(unsupported.detail.order.status).toBe("CONFIRMED");
      expect(
        unsupported.detail.timeline.entries.some((entry) => entry.type === "ORDER_CONFIRMED")
      ).toBe(false);
    }
  });

  it("deduplicates canonical cancellation audits and uses cancelled_at only as fallback", async () => {
    const timestamp = "2026-09-20T05:00:00.000Z";
    await pg`UPDATE orders SET cancelled_at = ${timestamp} WHERE id IN (${id.b}, ${id.c})`;
    await pg`
      INSERT INTO audit_events (id, actor_type, actor_id, action, target_type, target_id, timestamp)
      VALUES (${randomUUID()}, 'ADMIN', ${id.actor}, 'orders:cancel', 'Order', ${id.b}, ${timestamp}),
             (${randomUUID()}, 'ADMIN', ${id.actor}, 'orders:refund_and_cancel', 'Order', ${id.c}, ${timestamp})
    `;
    for (const [orderId, number] of [
      [id.b, `${code}-B`],
      [id.c, `${code}-C`],
    ] as const) {
      const result = await getAdminOrderDetail(number);
      expect(result.status).toBe("READY");
      if (result.status === "READY") {
        expect(
          result.detail.timeline.entries.filter((entry) => entry.type === "ORDER_CANCELLED")
        ).toHaveLength(1);
        expect(
          result.detail.timeline.entries.find((entry) => entry.type === "ORDER_CANCELLED")?.id
        ).not.toBe(`order_cancelled-${orderId}`);
      }
    }
    await pg`DELETE FROM audit_events WHERE target_type = 'Order' AND target_id = ${id.b} AND action = 'orders:cancel'`;
    const fallback = await getAdminOrderDetail(`${code}-B`);
    expect(fallback.status).toBe("READY");
    if (fallback.status === "READY") {
      expect(
        fallback.detail.timeline.entries.filter((entry) => entry.type === "ORDER_CANCELLED")
      ).toHaveLength(1);
      expect(
        fallback.detail.timeline.entries.find((entry) => entry.type === "ORDER_CANCELLED")?.id
      ).toBe(`order_cancelled-${id.b}`);
    }
  });

  it("orders all eight event types at one timestamp and retains each shipment event", async () => {
    const timestamp = "2026-09-19T10:00:00.000Z";
    await pg`
      INSERT INTO orders (id, order_number, customer_email, customer_phone, status,
        subtotal_cents, discount_cents, shipping_cents, total_cents, currency,
        cancelled_at, created_at, updated_at)
      VALUES (${id.d}, ${tieOrderNumber}, 'tie@example.com', '999999999', 'REFUNDED',
        10000, 0, 0, 10000, 'PEN', ${timestamp}, ${timestamp}, ${timestamp})
    `;
    await pg`
      INSERT INTO payments (id, order_id, payment_method_code, instruction_version_id,
        amount_cents, refunded_amount_cents, currency, status)
      VALUES (${id.paymentD}, ${id.d}, ${code}, ${id.instruction}, 10000, 100, 'PEN', 'REFUNDED')
    `;
    await pg`
      INSERT INTO payment_submissions (id, payment_id, attempt_number, operation_code, submitted_at)
      VALUES (${randomUUID()}, ${id.paymentD}, 1, 'GP027-TIE', ${timestamp})
    `;
    await pg`
      INSERT INTO refunds (id, order_id, payment_id, amount_cents, reason, created_at)
      VALUES (${randomUUID()}, ${id.d}, ${id.paymentD}, 100, 'Test refund', ${timestamp})
    `;
    await pg`
      INSERT INTO shipments (id, order_id, shipping_method_id, status, shipped_at, delivered_at)
      VALUES (${randomUUID()}, ${id.d}, ${id.shipping}, 'DELIVERED', ${timestamp}, ${timestamp}),
             (${randomUUID()}, ${id.d}, ${id.shipping}, 'DELIVERED', ${timestamp}, ${timestamp})
    `;
    await pg`
      INSERT INTO order_notes (id, order_id, author_auth_user_id, body, created_at,
        mutation_request_id, intent_fingerprint, actor_binding_digest)
      VALUES (${randomUUID()}, ${id.d}, ${id.actor}, 'Tie note', ${timestamp},
        ${randomUUID()}, ${"a".repeat(64)}, ${"b".repeat(64)})
    `;
    await pg`
      INSERT INTO audit_events (id, actor_type, actor_id, action, target_type, target_id, timestamp)
      VALUES (${randomUUID()}, 'ADMIN', ${id.actor}, 'orders:approve_payment', 'Order', ${id.d}, ${timestamp}),
             (${randomUUID()}, 'ADMIN', ${id.actor}, 'orders:refund_and_cancel', 'Order', ${id.d}, ${timestamp})
    `;
    const result = await getAdminOrderDetail(tieOrderNumber);
    expect(result.status).toBe("READY");
    if (result.status !== "READY") return;
    const types = result.detail.timeline.entries.map((entry) => entry.type);
    expect(types).toEqual([
      "ORDER_PLACED",
      "PAYMENT_SUBMITTED",
      "ORDER_CONFIRMED",
      "ORDER_CANCELLED",
      "REFUND_ISSUED",
      "SHIPMENT_DISPATCHED",
      "SHIPMENT_DISPATCHED",
      "ORDER_DELIVERED",
      "ORDER_DELIVERED",
      "INTERNAL_NOTE",
    ]);
    expect(result.detail.timeline.entries.map((entry) => entry.timestamp)).toEqual(
      Array.from({ length: 10 }, () => timestamp)
    );
    for (const type of ["SHIPMENT_DISPATCHED", "ORDER_DELIVERED"] as const) {
      const ids = result.detail.timeline.entries
        .filter((entry) => entry.type === type)
        .map((entry) => entry.id);
      expect(ids).toEqual([...ids].sort());
    }
  });

  it("fails closed on currency mismatch and does not invent missing snapshots", async () => {
    await pg`UPDATE payments SET currency = 'USD' WHERE order_id = ${id.a}`;
    try {
      const mismatch = await getAdminOrderDetail(orderNumber);
      expect(mismatch.status).toBe("READY");
      if (mismatch.status === "READY") {
        expect(mismatch.detail.integrityIssues).toEqual(
          expect.arrayContaining(["CURRENCY_MISMATCH", "UNSUPPORTED_CURRENCY"])
        );
        expect(mismatch.detail.moneyActionsAllowed).toBe(false);
      }
    } finally {
      await pg`UPDATE payments SET currency = 'PEN' WHERE order_id = ${id.a}`;
    }
    const absent = await getAdminOrderDetail(`${code}-B`);
    expect(absent.status).toBe("READY");
    if (absent.status === "READY") {
      expect(absent.detail.payment).toBeNull();
      expect(absent.detail.pricing).toBeNull();
      expect(absent.detail.address).toBeNull();
      expect(absent.detail.integrityIssues).toEqual(
        expect.arrayContaining([
          "MISSING_PAYMENT",
          "MISSING_PRICING_SNAPSHOT",
          "MISSING_ADDRESS_SNAPSHOT",
        ])
      );
      expect(absent.detail.moneyActionsAllowed).toBe(false);
    }
  });

  it("commits one note and audit, replays exactly, and rejects changed or foreign intent", async () => {
    const mutationRequestId = randomUUID();
    const input = { orderNumber, body: "  Línea 1\r\nLínea 2  ", mutationRequestId };
    const first = await createAdminOrderNote(input);
    expect(first).toMatchObject({ success: true, replayed: false });
    const replay = await createAdminOrderNote(input);
    expect(replay).toMatchObject({ success: true, replayed: true });
    expect(await createAdminOrderNote({ ...input, body: "Changed" })).toEqual({
      success: false,
      code: "IDEMPOTENCY_CONFLICT",
    });
    vi.mocked(requirePermission).mockResolvedValueOnce(auth(id.otherActor));
    expect(await createAdminOrderNote(input)).toEqual({ success: false, code: "NOT_AVAILABLE" });
    const notes =
      await pg`SELECT id, body FROM order_notes WHERE mutation_request_id = ${mutationRequestId}`;
    expect(notes).toHaveLength(1);
    expect(notes[0]?.body).toBe("Línea 1\nLínea 2");
    const audit =
      await pg`SELECT metadata FROM audit_events WHERE action = 'orders:note_added' AND target_id = ${id.a}`;
    expect(audit).toHaveLength(1);
    expect(audit[0]?.metadata).toEqual({ noteId: notes[0]?.id });
    const detail = await getAdminOrderDetail(orderNumber);
    expect(detail.status).toBe("READY");
    if (detail.status === "READY") {
      expect(detail.detail.notes.notes[0]?.body).toBe("Línea 1\nLínea 2");
      expect(detail.detail.timeline.entries.map((entry) => entry.type)).toContain("INTERNAL_NOTE");
    }
  });

  it("converges concurrent identical notes and preserves them after actor deletion", async () => {
    const requestId = randomUUID();
    const input = { orderNumber, body: "Concurrent note", mutationRequestId: requestId };
    const results = await Promise.all(Array.from({ length: 5 }, () => createAdminOrderNote(input)));
    expect(results.every((result) => result.success)).toBe(true);
    expect(results.filter((result) => result.success && !result.replayed)).toHaveLength(1);
    const notes = await pg`SELECT id FROM order_notes WHERE mutation_request_id = ${requestId}`;
    expect(notes).toHaveLength(1);
    const audits =
      await pg`SELECT id FROM audit_events WHERE action = 'orders:note_added' AND metadata->>'noteId' = ${notes[0]?.id}`;
    expect(audits).toHaveLength(1);
    vi.mocked(requirePermission).mockResolvedValueOnce(auth(id.otherActor));
    const actorNote = await createAdminOrderNote({
      orderNumber,
      body: "Deleted actor",
      mutationRequestId: randomUUID(),
    });
    expect(actorNote.success).toBe(true);
    await pg`DELETE FROM auth.users WHERE id = ${id.otherActor}`;
    if (actorNote.success) {
      const retained =
        await pg`SELECT body, author_auth_user_id, actor_binding_digest FROM order_notes WHERE id = ${actorNote.note.id}`;
      expect(retained[0]).toMatchObject({ body: "Deleted actor", author_auth_user_id: null });
      expect(retained[0]?.actor_binding_digest).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  it("enforces note boundary, physical checks, order FK, and atomic audit rollback", async () => {
    expect(
      await createAdminOrderNote({
        orderNumber,
        body: "😊".repeat(2001),
        mutationRequestId: randomUUID(),
      })
    ).toEqual({ success: false, code: "INVALID_INPUT" });
    expect(
      await createAdminOrderNote({
        orderNumber,
        body: "bad\u202Etext",
        mutationRequestId: randomUUID(),
      })
    ).toEqual({ success: false, code: "INVALID_INPUT" });
    const boundary = await createAdminOrderNote({
      orderNumber,
      body: "😊".repeat(2000),
      mutationRequestId: randomUUID(),
    });
    expect(boundary.success).toBe(true);
    const values = [id.a, id.actor, " ", randomUUID(), "a".repeat(64), "b".repeat(64)];
    await expect(
      pg.unsafe(
        "INSERT INTO order_notes (id, order_id, author_auth_user_id, body, mutation_request_id, intent_fingerprint, actor_binding_digest) VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6)",
        values
      )
    ).rejects.toMatchObject({ code: "23514" });
    await expect(
      pg.unsafe(
        "INSERT INTO order_notes (id, order_id, author_auth_user_id, body, mutation_request_id, intent_fingerprint, actor_binding_digest) VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6)",
        [randomUUID(), id.actor, "orphan", randomUUID(), "a".repeat(64), "b".repeat(64)]
      )
    ).rejects.toMatchObject({ code: "23503" });
    await expect(pg`DELETE FROM orders WHERE id = ${id.a}`).rejects.toMatchObject({
      code: "23503",
    });

    const suffix = randomUUID().replaceAll("-", "");
    const functionName = `gp027_note_fail_${suffix}`;
    const triggerName = `gp027_note_fail_${suffix}`;
    await pg.unsafe(`CREATE FUNCTION ${functionName}() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW.action = 'orders:note_added' AND NEW.target_id = '${id.a}' THEN
          RAISE EXCEPTION 'local GP027 atomicity probe';
        END IF;
        RETURN NEW;
      END $$`);
    await pg.unsafe(`CREATE TRIGGER ${triggerName} BEFORE INSERT ON audit_events
      FOR EACH ROW EXECUTE FUNCTION ${functionName}()`);
    try {
      const mutationRequestId = randomUUID();
      expect(
        await createAdminOrderNote({ orderNumber, body: "Must roll back", mutationRequestId })
      ).toEqual({
        success: false,
        code: "SYSTEM_ERROR",
      });
      expect(
        await pg`SELECT id FROM order_notes WHERE mutation_request_id = ${mutationRequestId}`
      ).toHaveLength(0);
    } finally {
      await pg.unsafe(`DROP TRIGGER ${triggerName} ON audit_events`);
      await pg.unsafe(`DROP FUNCTION ${functionName}()`);
    }
  });

  it("bounds every source read and paginates 220 tied notes without omission", async () => {
    const timestamp = "2026-09-20T05:00:00.000Z";
    const noteIds = Array.from({ length: 220 }, () => randomUUID());
    await pg`
      INSERT INTO order_notes (id, order_id, author_auth_user_id, body, created_at,
        mutation_request_id, intent_fingerprint, actor_binding_digest)
      SELECT x.id::uuid, ${id.a}::uuid, ${id.actor}::uuid, 'pagination note', ${timestamp}::timestamptz,
        gen_random_uuid(), repeat('a', 64), repeat('b', 64)
      FROM unnest(${noteIds}::uuid[]) AS x(id)
    `;
    const detail = await getAdminOrderDetail(orderNumber);
    expect(detail.status).toBe("READY");
    if (detail.status !== "READY") return;
    expect(detail.detail.notes.notes).toHaveLength(50);
    expect(detail.detail.notes.olderCursor).not.toBeNull();
    const olderNotes = await getAdminOrderNotesPage(orderNumber, detail.detail.notes.olderCursor!);
    expect(olderNotes.status).toBe("READY");
    if (olderNotes.status === "READY") expect(olderNotes.page.notes).toHaveLength(50);

    const spy = vi.spyOn(db, "execute");
    let firstCursor: string | null = null;
    try {
      const firstPage = await loadAdminTimelinePage(id.a, null);
      firstCursor = firstPage?.olderCursor ?? null;
      expect(firstCursor).not.toBeNull();
      if (!firstCursor) throw new Error("Expected older timeline page");
      await loadAdminTimelinePage(id.a, null, firstCursor);
      const queries = spy.mock.calls.map(([statement]) => {
        if (!(statement instanceof SQL)) throw new Error("Expected SQL timeline source query");
        return new PgDialect().sqlToQuery(statement);
      });
      expect(queries).toHaveLength(16);
      for (const pageQueries of [queries.slice(0, 8), queries.slice(8)]) {
        expect(pageQueries.map((query) => query.params.at(-1))).toEqual([
          1, 51, 1, 1, 51, 51, 51, 51,
        ]);
        expect(pageQueries.every((query) => /LIMIT \$\d+/.test(query.sql))).toBe(true);
      }
      expect(queries.slice(8).every((query) => query.sql.includes("WHERE (e.event_at,"))).toBe(
        true
      );
      const returned = await Promise.all(
        spy.mock.results.map(async (result) => ((await result.value) as unknown[]).length)
      );
      expect(
        returned.slice(0, 8).every((count, index) => count <= [1, 51, 1, 1, 51, 51, 51, 51][index]!)
      ).toBe(true);
      expect(returned[7]).toBe(51);
    } finally {
      spy.mockRestore();
    }

    const expected = await pg`
      SELECT event_type, source_id FROM (
        SELECT 'ORDER_PLACED'::text AS event_type, o.id AS source_id,
               o.created_at AS event_at, 1 AS precedence
        FROM orders o WHERE o.id = ${id.a}
        UNION ALL
        SELECT 'INTERNAL_NOTE', n.id, n.created_at, 8
        FROM order_notes n WHERE n.order_id = ${id.a}
      ) e ORDER BY event_at DESC, precedence DESC, source_id DESC
    `;
    const expectedIds = expected.map(
      (row) => `${String(row.event_type).toLowerCase()}-${row.source_id}`
    );
    expect(expectedIds.length).toBeGreaterThan(220);
    const pages = [];
    let cursor: string | null = null;
    for (let index = 0; index < 20; index++) {
      const page = await loadAdminTimelinePage(id.a, null, cursor);
      expect(page).not.toBeNull();
      if (!page) break;
      expect(page.entries.length).toBeLessThanOrEqual(50);
      expect(page.entries.map((entry) => entry.id)).toEqual(
        expectedIds.slice(index * 50, (index + 1) * 50).reverse()
      );
      pages.push(page);
      cursor = page.olderCursor;
      if (!cursor) break;
    }
    expect(cursor).toBeNull();
    const allIds = pages.flatMap((page) => [...page.entries].reverse().map((entry) => entry.id));
    expect(allIds).toEqual(expectedIds);
    expect(new Set(allIds).size).toBe(allIds.length);
    expect(allIds.at(-1)).toBe(`order_placed-${id.a}`);
    if (!firstCursor) throw new Error("Expected older timeline cursor");
    expect(await getAdminOrderTimelinePage(`${code}-B`, firstCursor)).toEqual({
      status: "INVALID_INPUT",
    });
  });
});
