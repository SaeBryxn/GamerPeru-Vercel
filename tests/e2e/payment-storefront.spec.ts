import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import postgres from "postgres";

const databaseUrl = process.env.DATABASE_URL!;
const sql = postgres(databaseUrl, { max: 1 });

test.describe("GP-019 / CHK2 — Storefront Manual Payment Submission E2E Suite", () => {
  test.beforeEach(async ({ page }) => {
    await page.context().clearCookies();
  });

  test.afterAll(async () => {
    // Clean all test data created during payment E2E suite
    await sql.begin(async (tx) => {
      await tx`DELETE FROM payment_submissions WHERE payment_id IN (SELECT id FROM payments WHERE order_id IN (SELECT id FROM orders WHERE customer_email LIKE '%@testpaye2e.pe'))`;
      await tx`DELETE FROM payment_proof_upload_intents WHERE payment_id IN (SELECT id FROM payments WHERE order_id IN (SELECT id FROM orders WHERE customer_email LIKE '%@testpaye2e.pe'))`;
      await tx`DELETE FROM guest_payment_access_grants WHERE payment_id IN (SELECT id FROM payments WHERE order_id IN (SELECT id FROM orders WHERE customer_email LIKE '%@testpaye2e.pe'))`;
      await tx`DELETE FROM outbox_events WHERE aggregate_type IN ('Order', 'Payment') AND (payload->>'customerEmail' LIKE '%@testpaye2e.pe' OR aggregate_id IN (SELECT id::text FROM orders WHERE customer_email LIKE '%@testpaye2e.pe'))`;
      await tx`DELETE FROM inventory_ledger_entries WHERE reference_id IN (SELECT id::text FROM orders WHERE customer_email LIKE '%@testpaye2e.pe') OR reference_id IN (SELECT id::text FROM inventory_reservations WHERE order_id IN (SELECT id FROM orders WHERE customer_email LIKE '%@testpaye2e.pe'))`;
      await tx`DELETE FROM inventory_reservations WHERE order_id IN (SELECT id FROM orders WHERE customer_email LIKE '%@testpaye2e.pe')`;
      await tx`DELETE FROM payments WHERE order_id IN (SELECT id FROM orders WHERE customer_email LIKE '%@testpaye2e.pe')`;
      await tx`DELETE FROM shipments WHERE order_id IN (SELECT id FROM orders WHERE customer_email LIKE '%@testpaye2e.pe')`;
      await tx`DELETE FROM order_address_snapshots WHERE order_id IN (SELECT id FROM orders WHERE customer_email LIKE '%@testpaye2e.pe')`;
      await tx`DELETE FROM order_pricing_snapshots WHERE order_id IN (SELECT id FROM orders WHERE customer_email LIKE '%@testpaye2e.pe')`;
      await tx`DELETE FROM order_items WHERE order_id IN (SELECT id FROM orders WHERE customer_email LIKE '%@testpaye2e.pe')`;
      await tx`DELETE FROM idempotency_keys WHERE (operation_type IN ('ORDER_CREATION', 'PAYMENT_SUBMISSION')) AND (request_fingerprint LIKE '%testpaye2e%' OR response_payload->>'orderNumber' IN (SELECT order_number FROM orders WHERE customer_email LIKE '%@testpaye2e.pe'))`;
      await tx`DELETE FROM orders WHERE customer_email LIKE '%@testpaye2e.pe'`;
    });
    await sql.end();
  });

  test("Scenario 1: Guest Checkout -> View Instructions -> Submit Operation Code -> Pending Review Transition & DB Invariants", async ({
    page,
  }) => {
    // 1. Add product to cart
    await page.goto("/productos/mouse-cart-e2e");
    const addBtn = page.getByTestId("pdp-add-to-cart-button");
    await expect(addBtn).toBeVisible();
    await addBtn.click();

    // 2. Open drawer and proceed to checkout
    const drawer = page.getByTestId("cart-drawer");
    await expect(drawer).toBeVisible();
    const checkoutBtn = page.getByTestId("cart-drawer-checkout-button");
    await expect(checkoutBtn).toBeVisible();
    await checkoutBtn.click();

    // 3. Arrive at /checkout
    await expect(page).toHaveURL(/\/checkout/);

    // 4. Fill checkout inputs
    await page.getByTestId("checkout-input-email").fill("guest.pay1@testpaye2e.pe");
    await page.getByTestId("checkout-input-recipient-name").fill("Mario Rossi");
    await page.getByTestId("checkout-input-phone").fill("987654321");
    await page.getByTestId("checkout-input-street-address").fill("Av. Larco 100");
    await page.getByTestId("checkout-input-department").selectOption("Lima");
    await page.getByTestId("checkout-input-province").fill("Lima");
    await page.getByTestId("checkout-input-district").fill("Miraflores");

    // 5. Select Shipping and Payment
    const shippingMethod = page.getByTestId("shipping-method-LIMA_EXPRESS");
    await expect(shippingMethod).toBeVisible();
    await shippingMethod.click();

    const paymentMethod = page.getByTestId("payment-method-YAPE_MANUAL");
    await expect(paymentMethod).toBeVisible();
    await paymentMethod.click();

    // 6. Submit Checkout
    const submitBtn = page.getByTestId("checkout-submit-button");
    await expect(submitBtn).toBeEnabled();
    await submitBtn.click();

    // 7. Arrive at confirmation page
    await expect(page).toHaveURL(/\/checkout\/confirmacion\/GP-[A-Z0-9]{8}/, { timeout: 20000 });
    const orderNumberEl = page.getByTestId("confirmation-order-number");
    await expect(orderNumberEl).toBeVisible();
    const orderNumberText = (await orderNumberEl.textContent()) ?? "";
    const match = orderNumberText.match(/GP-[A-Z0-9]{8}/);
    expect(match).not.toBeNull();
    const orderNumber = match![0];

    // 8. Verify Manual Payment Card is rendered with frozen instructions
    const manualPaymentCard = page.getByTestId("manual-payment-card");
    await expect(manualPaymentCard).toBeVisible();

    const recipientName = page.getByTestId("manual-payment-recipient-name");
    await expect(recipientName).toBeVisible();

    const accountIdentifier = page.getByTestId("manual-payment-account-number");
    await expect(accountIdentifier).toBeVisible();

    // 9. Accessibility Audit on Payment Card
    const axeResults = await new AxeBuilder({ page })
      .include('[data-testid="manual-payment-card"]')
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();

    const seriousViolations = axeResults.violations.filter(
      (v) => v.impact === "serious" || v.impact === "critical"
    );
    expect(seriousViolations).toEqual([]);

    // 10. Enter operation code
    const opCodeInput = page.getByTestId("manual-payment-operation-code-input");
    await expect(opCodeInput).toBeVisible();
    await opCodeInput.fill("00482910");

    // 11. Submit Payment Proof
    const submitProofBtn = page.getByTestId("manual-payment-submit-button");
    await expect(submitProofBtn).toBeEnabled();
    await submitProofBtn.click();

    // 12. Verify status badge updates to Pending Review
    const statusBadge = page.getByTestId("manual-payment-status-badge");
    await expect(statusBadge).toContainText("En Revisión", { timeout: 15000 });

    // Verify submission notice is rendered
    const submittedNotice = page.getByTestId("manual-payment-submitted-notice");
    await expect(submittedNotice).toBeVisible();
    await expect(submittedNotice).toContainText("Comprobante enviado");

    // 13. Verify Database Invariants
    const [orderRow] = await sql`SELECT id, status FROM orders WHERE order_number = ${orderNumber}`;
    expect(orderRow).toBeDefined();

    const [paymentRow] =
      await sql`SELECT id, status FROM payments WHERE order_id = ${orderRow!.id}`;
    expect(paymentRow).toBeDefined();
    expect(paymentRow!.status).toBe("SUBMITTED");

    const [submissionRow] = await sql`
      SELECT id, operation_code, attempt_number 
      FROM payment_submissions 
      WHERE payment_id = ${paymentRow!.id}
    `;
    expect(submissionRow).toBeDefined();
    expect(submissionRow!.operation_code).toBe("00482910");
    expect(submissionRow!.attempt_number).toBe(1);

    const [resRow] = await sql`
      SELECT status FROM inventory_reservations WHERE order_id = ${orderRow!.id}
    `;
    expect(resRow).toBeDefined();
    expect(resRow!.status).toBe("VERIFICATION_HOLD");

    const outboxEvents = await sql`
      SELECT event_name FROM outbox_events WHERE aggregate_id = ${paymentRow!.id}
    `;
    expect(outboxEvents.length).toBeGreaterThanOrEqual(1);
    expect(outboxEvents.some((e) => e.event_name === "PaymentSubmitted")).toBe(true);
  });

  test("Scenario 2: Foreign Visitor Denial (Opening confirmation without payment session cookie is denied)", async ({
    browser,
    page,
  }) => {
    // 1. Create a guest order in main context
    await page.goto("/productos/mouse-cart-e2e");
    await page.getByTestId("pdp-add-to-cart-button").click();
    await page.getByTestId("cart-drawer-checkout-button").click();

    await page.getByTestId("checkout-input-email").fill("guest.pay2@testpaye2e.pe");
    await page.getByTestId("checkout-input-recipient-name").fill("Mario Rossi");
    await page.getByTestId("checkout-input-phone").fill("987654321");
    await page
      .getByTestId("checkout-input-streetAddress")
      .or(page.getByTestId("checkout-input-street-address"))
      .fill("Av. Larco 100");
    await page.getByTestId("checkout-input-department").selectOption("Lima");
    await page.getByTestId("checkout-input-province").fill("Lima");
    await page.getByTestId("checkout-input-district").fill("Miraflores");

    await page.getByTestId("shipping-method-LIMA_EXPRESS").click();
    await page.getByTestId("payment-method-YAPE_MANUAL").click();
    await page.getByTestId("checkout-submit-button").click();

    await expect(page).toHaveURL(/\/checkout\/confirmacion\/GP-[A-Z0-9]{8}/, { timeout: 20000 });
    const orderNumberEl = page.getByTestId("confirmation-order-number");
    const orderNumberText = (await orderNumberEl.textContent()) ?? "";
    const orderNumber = orderNumberText.match(/GP-[A-Z0-9]{8}/)![0];

    // 2. Open brand new context (no cookies) and attempt to navigate to same order
    const foreignContext = await browser.newContext();
    const foreignPage = await foreignContext.newPage();

    await foreignPage.goto(`/checkout/confirmacion/${orderNumber}`);

    // Verify unauthenticated / unauthorized visitor receives denied presentation
    const deniedEl = foreignPage.getByTestId("confirmation-unauthorized-view");
    await expect(deniedEl).toBeVisible();
    await expect(deniedEl).toContainText("Pedido no disponible");

    // Verify zero sensitive instruction information or payment card is exposed
    await expect(foreignPage.getByTestId("manual-payment-card")).toHaveCount(0);
    const bodyText = (await foreignPage.textContent("body")) ?? "";
    expect(bodyText).not.toContain("00482910");

    await foreignContext.close();
  });
});
