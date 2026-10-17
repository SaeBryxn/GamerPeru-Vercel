import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import postgres from "postgres";
import {
  assertLocalDatabaseTarget,
  assertLocalSupabaseApiTarget,
} from "../../src/lib/admin/test-target-guard";
import { ADMIN_E2E_PASSWORD, ADMIN_E2E_USERS } from "./helpers/admin-fixtures";

const databaseUrl = assertLocalDatabaseTarget(process.env.DATABASE_URL);
assertLocalSupabaseApiTarget(process.env.NEXT_PUBLIC_SUPABASE_URL);

const sql = postgres(databaseUrl, { max: 1 });
const fixture = {
  orderId: "0193a028-eeee-7000-8000-000000000101",
  paymentId: "0193a028-eeee-7000-8000-000000000102",
  submissionId: "0193a028-eeee-7000-8000-000000000103",
  orderItemId: "0193a028-eeee-7000-8000-000000000104",
  locationId: "0193a028-eeee-7000-8000-000000000105",
  inventoryItemId: "0193a028-eeee-7000-8000-000000000106",
  reservationId: "0193a028-eeee-7000-8000-000000000107",
  orderNumber: "GP-E2E28-REFUND",
  externalReference: "GP028-EXTERNAL-REF-001",
} as const;

async function cleanupFixture() {
  await sql.begin(async (tx) => {
    await tx`
      DELETE FROM notification_deliveries
      WHERE outbox_event_id IN (
        SELECT id FROM outbox_events WHERE aggregate_id = ${fixture.paymentId}
      )
    `;
    await tx`
      DELETE FROM idempotency_keys
      WHERE target_aggregate_id = ${fixture.paymentId} AND operation_type = 'REFUND_RECORDING'
    `;
    await tx`
      DELETE FROM audit_events
      WHERE target_id = ${fixture.paymentId}
         OR (action = 'orders:late_refund' AND metadata->>'paymentId' = ${fixture.paymentId})
    `;
    await tx`DELETE FROM outbox_events WHERE aggregate_id = ${fixture.paymentId}`;
    await tx`DELETE FROM payment_verifications WHERE payment_id = ${fixture.paymentId}`;
    await tx`DELETE FROM refunds WHERE payment_id = ${fixture.paymentId}`;
    await tx`DELETE FROM payment_submissions WHERE payment_id = ${fixture.paymentId}`;
    await tx`DELETE FROM inventory_reservations WHERE order_id = ${fixture.orderId}`;
    await tx`DELETE FROM order_items WHERE order_id = ${fixture.orderId}`;
    await tx`DELETE FROM payments WHERE id = ${fixture.paymentId}`;
    await tx`DELETE FROM orders WHERE id = ${fixture.orderId}`;
    await tx`DELETE FROM inventory_items WHERE id = ${fixture.inventoryItemId}`;
    await tx`DELETE FROM inventory_locations WHERE id = ${fixture.locationId}`;
  });
}

async function seedFixture() {
  await sql.begin(async (tx) => {
    await tx`
      INSERT INTO inventory_locations (id, code, name, is_active)
      VALUES (${fixture.locationId}, 'GP028_E2E_REFUND', 'GP-028 E2E', true)
    `;
    await tx`
      INSERT INTO inventory_items
        (id, variant_id, location_id, quantity_on_hand, quantity_reserved, quantity_allocated)
      VALUES
        (${fixture.inventoryItemId}, '018f0000-0000-7000-8000-000000007a03',
         ${fixture.locationId}, 0, 0, 0)
    `;
    await tx`
      INSERT INTO orders
        (id, order_number, customer_email, customer_phone, status, subtotal_cents,
         discount_cents, shipping_cents, total_cents, currency)
      VALUES
        (${fixture.orderId}, ${fixture.orderNumber}, 'gp028.refund.e2e@example.invalid',
         '999888777', 'PENDING', 12000, 0, 0, 12000, 'PEN')
    `;
    await tx`
      INSERT INTO order_items
        (id, order_id, variant_id, sku_snapshot, product_name_snapshot,
         variant_title_snapshot, unit_price_cents_snapshot, quantity, line_total_cents)
      VALUES
        (${fixture.orderItemId}, ${fixture.orderId}, '018f0000-0000-7000-8000-000000007a03',
         'E2E-IMMUTABLE-SKU-003', 'Producto E2E SKU Inmutable', 'Variante con Stock',
         12000, 1, 12000)
    `;
    await tx`
      INSERT INTO payments
        (id, order_id, payment_method_code, instruction_version_id, amount_cents,
         refunded_amount_cents, currency, status)
      VALUES
        (${fixture.paymentId}, ${fixture.orderId}, 'ADMIN_E2E_YAPE',
         '018f0000-0000-7000-8000-00000000e102', 12000, 0, 'PEN', 'SUBMITTED')
    `;
    await tx`
      INSERT INTO payment_submissions
        (id, payment_id, attempt_number, operation_code, is_late, submitted_at)
      VALUES
        (${fixture.submissionId}, ${fixture.paymentId}, 1, 'GP028-E2E-PAID', true,
         NOW() - INTERVAL '1 hour')
    `;
    await tx`
      INSERT INTO inventory_reservations
        (id, inventory_item_id, order_id, order_item_id, quantity, status, expires_at)
      VALUES
        (${fixture.reservationId}, ${fixture.inventoryItemId}, ${fixture.orderId},
         ${fixture.orderItemId}, 1, 'RELEASED', NOW() - INTERVAL '2 hours')
    `;
  });
}

test.describe.configure({ mode: "serial" });
test.setTimeout(120_000);

test.beforeAll(async ({}, testInfo) => {
  if (!testInfo.config.configFile?.endsWith("playwright.admin.config.ts")) {
    throw new Error("GP-028 browser verification requires the local admin Playwright config.");
  }

  const [dependencies] = await sql<
    { user_ready: boolean; variant_ready: boolean; payment_method_ready: boolean }[]
  >`
    SELECT
      EXISTS (SELECT 1 FROM auth.users WHERE id = ${ADMIN_E2E_USERS.orders.id}) AS user_ready,
      EXISTS (SELECT 1 FROM product_variants WHERE id = '018f0000-0000-7000-8000-000000007a03') AS variant_ready,
      EXISTS (SELECT 1 FROM payment_method_configurations WHERE code = 'ADMIN_E2E_YAPE') AS payment_method_ready
  `;
  if (
    !dependencies?.user_ready ||
    !dependencies.variant_ready ||
    !dependencies.payment_method_ready
  ) {
    const { seedAdminUsers } = await import("../../scripts/test/seed-admin-e2e.mjs");
    await seedAdminUsers();
  }

  await cleanupFixture();
  await seedFixture();
});

test.afterAll(async () => {
  try {
    await cleanupFixture();
  } finally {
    await sql.end();
  }
});

test("an orders operator records an externally completed late refund without stock allocation", async ({
  page,
}) => {
  await page.goto("/auth/login?redirect=%2Fadmin%2Fpagos");
  await page.getByLabel("Correo electrónico").fill(ADMIN_E2E_USERS.orders.email);
  await page.getByLabel("Contraseña").fill(ADMIN_E2E_PASSWORD);
  await page.getByRole("button", { name: "Iniciar sesión" }).click();
  await page.waitForURL((url) => !url.pathname.includes("/auth/login"));
  await page.goto("/admin/pagos");

  await expect(page.getByRole("heading", { name: "Verificación de pagos" })).toBeVisible();
  const row = page.locator(`[data-payment-row="${fixture.paymentId}"]`);
  await expect(row).toContainText(fixture.orderNumber);
  await row
    .getByRole("button", { name: `Revisar el pago del pedido ${fixture.orderNumber}` })
    .click();

  const drawer = page.getByTestId("review-drawer");
  await expect(drawer.getByText("Sin stock disponible para este pago tardío")).toBeVisible();
  await expect(drawer.getByRole("button", { name: "Aprobar", exact: true })).toBeDisabled();
  await drawer.getByRole("button", { name: "Pago recibido · reembolso completado" }).click();
  await expect(drawer.locator("[class*='decisionForm']")).toHaveCSS("opacity", "1");

  const accessibilityScan = await new AxeBuilder({ page }).analyze();
  expect(
    accessibilityScan.violations.map((violation) => ({
      id: violation.id,
      targets: violation.nodes.map((node) => node.target),
    }))
  ).toEqual([]);

  await page.setViewportSize({ width: 360, height: 800 });
  await expect(drawer).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  ).toBeLessThanOrEqual(1);

  const confirm = drawer.getByRole("button", { name: "Registrar pago y reembolso" });
  await expect(confirm).toBeDisabled();
  await drawer.getByLabel("Referencia de la devolución externa").fill(fixture.externalReference);
  await expect(confirm).toBeDisabled();
  await drawer.getByLabel(/Declaro que verifiqué la recepción del pago/).check();
  await expect(confirm).toBeEnabled();
  await confirm.click();

  await expect(
    page.getByText(`Pago recibido y reembolso registrado · pedido ${fixture.orderNumber}`)
  ).toBeVisible();
  const [record] = await sql<
    {
      payment_status: string;
      order_status: string;
      refunded_amount_cents: number;
      external_reference: string;
      reservation_status: string;
      quantity_on_hand: number;
      quantity_reserved: number;
      quantity_allocated: number;
    }[]
  >`
    SELECT p.status AS payment_status, o.status AS order_status,
           p.refunded_amount_cents, r.external_reference,
           ir.status AS reservation_status, ii.quantity_on_hand,
           ii.quantity_reserved, ii.quantity_allocated
    FROM payments p
    JOIN orders o ON o.id = p.order_id
    JOIN refunds r ON r.payment_id = p.id
    JOIN inventory_reservations ir ON ir.order_id = o.id
    JOIN inventory_items ii ON ii.id = ir.inventory_item_id
    WHERE p.id = ${fixture.paymentId}
  `;
  expect(record).toMatchObject({
    payment_status: "REFUNDED",
    order_status: "REFUNDED",
    refunded_amount_cents: 12000,
    external_reference: fixture.externalReference,
    reservation_status: "RELEASED",
    quantity_on_hand: 0,
    quantity_reserved: 0,
    quantity_allocated: 0,
  });

  await page.reload();
  await expect(page.getByText(fixture.orderNumber)).toHaveCount(0);
});
