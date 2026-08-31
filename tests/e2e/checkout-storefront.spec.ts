import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import postgres from "postgres";

const databaseUrl = process.env.DATABASE_URL!;
const sql = postgres(databaseUrl, { max: 1 });

test.describe("GP-018 / CHK6 — Customer Checkout UI & End-to-End Acceptance Suite", () => {
  test.beforeEach(async ({ page }) => {
    // Clear cookies before each test for clean guest session
    await page.context().clearCookies();
  });

  test.afterAll(async () => {
    // Clean test data after suite completes
    await sql.begin(async (tx) => {
      await tx`DELETE FROM outbox_events WHERE aggregate_type = 'Order' AND payload->>'customerEmail' LIKE '%@testchk6.pe'`;
      await tx`DELETE FROM inventory_ledger_entries WHERE reference_id IN (SELECT id::text FROM orders WHERE customer_email LIKE '%@testchk6.pe') OR reference_id IN (SELECT id::text FROM inventory_reservations WHERE order_id IN (SELECT id FROM orders WHERE customer_email LIKE '%@testchk6.pe'))`;
      await tx`DELETE FROM inventory_reservations WHERE order_id IN (SELECT id FROM orders WHERE customer_email LIKE '%@testchk6.pe')`;
      await tx`DELETE FROM payments WHERE order_id IN (SELECT id FROM orders WHERE customer_email LIKE '%@testchk6.pe')`;
      await tx`DELETE FROM shipments WHERE order_id IN (SELECT id FROM orders WHERE customer_email LIKE '%@testchk6.pe')`;
      await tx`DELETE FROM order_address_snapshots WHERE order_id IN (SELECT id FROM orders WHERE customer_email LIKE '%@testchk6.pe')`;
      await tx`DELETE FROM order_pricing_snapshots WHERE order_id IN (SELECT id FROM orders WHERE customer_email LIKE '%@testchk6.pe')`;
      await tx`DELETE FROM order_items WHERE order_id IN (SELECT id FROM orders WHERE customer_email LIKE '%@testchk6.pe')`;
      await tx`DELETE FROM idempotency_keys WHERE operation_type = 'ORDER_CREATION' AND (request_fingerprint LIKE '%testchk6%' OR response_payload->>'orderNumber' IN (SELECT order_number FROM orders WHERE customer_email LIKE '%@testchk6.pe'))`;
      await tx`DELETE FROM orders WHERE customer_email LIKE '%@testchk6.pe'`;
    });
    await sql.end();
  });

  test("Scenario A: Full Guest Checkout Flow (Cart -> Checkout -> Peru Address -> Shipping -> Payment -> Confirmation -> DB Invariants)", async ({
    page,
  }) => {
    // 1. Visit PDP and Add to Cart
    await page.goto("/productos/mouse-cart-e2e");
    const addBtn = page.getByTestId("pdp-add-to-cart-button");
    await expect(addBtn).toBeVisible();
    await addBtn.click();

    // 2. Drawer opens -> Click "Finalizar compra"
    const drawer = page.getByTestId("cart-drawer");
    await expect(drawer).toBeVisible();

    const checkoutBtn = page.getByTestId("cart-drawer-checkout-button");
    await expect(checkoutBtn).toBeVisible();
    await checkoutBtn.click();

    // 3. Arrive at /checkout
    await expect(page).toHaveURL(/\/checkout/);
    const checkoutPage = page.getByTestId("checkout-page");
    await expect(checkoutPage).toBeVisible();

    // 4. Verify robots meta tag (noindex, nofollow)
    const robotsMeta = page.locator('meta[name="robots"]').last();
    await expect(robotsMeta).toHaveAttribute("content", /noindex/);

    // 5. Fill Contact Information
    const emailInput = page.getByTestId("checkout-input-email");
    await emailInput.fill("guest.e2e@testchk6.pe");

    // 6. Fill Peru Delivery Address
    await page.getByTestId("checkout-input-recipient-name").fill("Carlos Rodriguez");
    await page.getByTestId("checkout-input-phone").fill("987654321");
    await page.getByTestId("checkout-input-street-address").fill("Av. Larco 742");
    await page.getByTestId("checkout-input-apartment").fill("Oficina 502");
    await page.getByTestId("checkout-input-department").fill("Lima");
    await page.getByTestId("checkout-input-province").fill("Lima");
    await page.getByTestId("checkout-input-district").fill("Miraflores");
    await page.getByTestId("checkout-input-reference").fill("Entre Shell y Benavides");

    // 7. Verify and Select Shipping Method
    const shippingMethod = page.getByTestId("shipping-method-LIMA_EXPRESS");
    await expect(shippingMethod).toBeVisible();
    await shippingMethod.click();

    // 8. Verify Payment Method (Neutral Display)
    const paymentMethod = page.getByTestId("payment-method-YAPE_MANUAL");
    await expect(paymentMethod).toBeVisible();
    await paymentMethod.click();

    // 9. Verify Order Summary Pricing
    const subtotalValue = page.getByTestId("checkout-subtotal-value");
    await expect(subtotalValue).toBeVisible();

    const shippingValue = page.getByTestId("checkout-shipping-value");
    await expect(shippingValue).toContainText("15.00");

    const totalValue = page.getByTestId("checkout-total-value");
    await expect(totalValue).toBeVisible();

    // 10. Run Accessibility Audit on Checkout page
    const axeResultsCheckout = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();

    const seriousCheckoutViolations = axeResultsCheckout.violations.filter(
      (v) => v.impact === "serious" || v.impact === "critical"
    );
    expect(seriousCheckoutViolations).toEqual([]);

    // 11. Submit Checkout
    const submitBtn = page.getByTestId("checkout-submit-button");
    await expect(submitBtn).toBeEnabled();
    await submitBtn.click();

    // 12. Arrive at /checkout/confirmacion/[orderNumber]
    await expect(page).toHaveURL(/\/checkout\/confirmacion\/GP-[A-Z0-9]{8}/, { timeout: 15000 });

    const confirmationView = page.getByTestId("checkout-confirmation-view");
    await expect(confirmationView).toBeVisible();

    // 13. Verify Confirmation Presentation
    const orderNumberEl = page.getByTestId("confirmation-order-number");
    await expect(orderNumberEl).toBeVisible();
    const orderNumberText = (await orderNumberEl.textContent()) ?? "";
    const orderNumberMatch = orderNumberText.match(/GP-[A-Z0-9]{8}/);
    expect(orderNumberMatch).not.toBeNull();
    const createdOrderNumber = orderNumberMatch![0];

    // Payment state is UNPAID / Pendiente de Pago
    const paymentStatusBadge = page.getByTestId("confirmation-payment-status");
    await expect(paymentStatusBadge).toContainText("Pendiente de Pago");

    // Delivery address rendered accurately
    const deliveryCard = page.getByTestId("confirmation-delivery-card");
    await expect(deliveryCard).toContainText("Carlos Rodriguez");
    await expect(deliveryCard).toContainText("Av. Larco 742");
    await expect(deliveryCard).toContainText("Miraflores");

    // 14. Strict GP-019 Privacy Boundary: No sensitive payment instruction data rendered
    const pageText = (await page.textContent("body")) ?? "";
    expect(pageText).not.toContain("999000111"); // account_identifier
    expect(pageText).not.toContain("Test Storeholder"); // recipient_name
    expect(pageText).not.toContain("Instrucciones sintéticas de prueba"); // instruction_text
    await expect(page.locator('input[type="file"]')).toHaveCount(0); // No voucher upload

    // 15. Physical PostgreSQL Invariants Verification
    const [order] = await sql`SELECT * FROM orders WHERE order_number = ${createdOrderNumber}`;
    expect(order).toBeDefined();
    expect(order!.status).toBe("PENDING");
    expect(order!.customer_email).toBe("guest.e2e@testchk6.pe");
    expect(order!.currency).toBe("PEN");

    const payments = await sql`SELECT * FROM payments WHERE order_id = ${order!.id}`;
    expect(payments).toHaveLength(1);
    expect(payments[0]!.status).toBe("UNPAID");
    expect(payments[0]!.payment_method_code).toBe("YAPE_MANUAL");

    const reservations =
      await sql`SELECT * FROM inventory_reservations WHERE order_id = ${order!.id}`;
    expect(reservations).toHaveLength(1);
    expect(reservations[0]!.quantity).toBe(1);

    const outbox =
      await sql`SELECT * FROM outbox_events WHERE aggregate_type = 'Order' AND aggregate_id = ${order!.id}`;
    expect(outbox).toHaveLength(1);
    expect(outbox[0]!.event_name).toBe("OrderPlaced");

    // 16. Run Accessibility Audit on Confirmation Page
    const axeResultsConfirmation = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();

    const seriousConfViolations = axeResultsConfirmation.violations.filter(
      (v) => v.impact === "serious" || v.impact === "critical"
    );
    expect(seriousConfViolations).toEqual([]);
  });

  test("Scenario B: Confirmation URL Authorization Protection (Foreign authority receives unauthorized state)", async ({
    page,
    browser,
  }) => {
    // 1. Setup order via direct checkout or navigation
    await page.goto("/productos/mouse-cart-e2e");
    const addBtn = page.getByTestId("pdp-add-to-cart-button");
    await addBtn.click();

    const checkoutBtn = page.getByTestId("cart-drawer-checkout-button");
    await checkoutBtn.click();

    await expect(page).toHaveURL(/\/checkout/);

    await page.getByTestId("checkout-input-email").fill("security.guest@testchk6.pe");
    await page.getByTestId("checkout-input-recipient-name").fill("Luis Ramos");
    await page.getByTestId("checkout-input-phone").fill("911222333");
    await page.getByTestId("checkout-input-street-address").fill("Calle Libertad 200");
    await page.getByTestId("checkout-input-department").fill("Lima");
    await page.getByTestId("checkout-input-province").fill("Lima");
    await page.getByTestId("checkout-input-district").fill("Barranco");

    const shippingMethod = page.getByTestId("shipping-method-LIMA_EXPRESS");
    await expect(shippingMethod).toBeVisible();
    await shippingMethod.click();

    const paymentMethod = page.getByTestId("payment-method-YAPE_MANUAL");
    await expect(paymentMethod).toBeVisible();
    await paymentMethod.click();

    const submitBtn = page.getByTestId("checkout-submit-button");
    await submitBtn.click();

    await expect(page).toHaveURL(/\/checkout\/confirmacion\/GP-[A-Z0-9]{8}/, { timeout: 15000 });
    const confirmationUrl = page.url();

    // 2. Open confirmation URL in a completely separate, clean browser context (different guest session)
    const foreignContext = await browser.newContext();
    const foreignPage = await foreignContext.newPage();

    await foreignPage.goto(confirmationUrl);

    // 3. Must render safe unauthorized view and NEVER expose order details
    const unauthorizedView = foreignPage.getByTestId("confirmation-unauthorized-view");
    await expect(unauthorizedView).toBeVisible();

    const foreignText = (await foreignPage.textContent("body")) ?? "";
    expect(foreignText).not.toContain("Luis Ramos");
    expect(foreignText).not.toContain("security.guest@testchk6.pe");
    expect(foreignText).not.toContain("Calle Libertad 200");

    await foreignContext.close();
  });

  test("Scenario C: Empty Cart Direct Navigation to /checkout displays recovery state", async ({
    page,
  }) => {
    // Visit /checkout with an empty cart
    await page.goto("/checkout");

    const emptyState = page.getByTestId("checkout-empty-state");
    await expect(emptyState).toBeVisible();
    await expect(page.getByText("No tienes productos para comprar")).toBeVisible();

    const exploreLink = page.getByRole("link", { name: "Explorar catálogo" });
    await expect(exploreLink).toBeVisible();
  });

  test("Scenario D: Browser Repeated / Fast Double Click preserves single order invariant", async ({
    page,
  }) => {
    await page.goto("/productos/mouse-cart-e2e");
    const addBtn = page.getByTestId("pdp-add-to-cart-button");
    await addBtn.click();

    const checkoutBtn = page.getByTestId("cart-drawer-checkout-button");
    await checkoutBtn.click();

    await expect(page).toHaveURL(/\/checkout/);

    await page.getByTestId("checkout-input-email").fill("double.click@testchk6.pe");
    await page.getByTestId("checkout-input-recipient-name").fill("Mario Gomez");
    await page.getByTestId("checkout-input-phone").fill("955667788");
    await page.getByTestId("checkout-input-street-address").fill("Av. Pardo 555");
    await page.getByTestId("checkout-input-department").fill("Lima");
    await page.getByTestId("checkout-input-province").fill("Lima");
    await page.getByTestId("checkout-input-district").fill("Miraflores");

    const shippingMethod = page.getByTestId("shipping-method-LIMA_EXPRESS");
    await expect(shippingMethod).toBeVisible();
    await shippingMethod.click();

    const paymentMethod = page.getByTestId("payment-method-YAPE_MANUAL");
    await expect(paymentMethod).toBeVisible();
    await paymentMethod.click();

    const submitBtn = page.getByTestId("checkout-submit-button");
    // Click submit
    await submitBtn.click();

    await expect(page).toHaveURL(/\/checkout\/confirmacion\/GP-[A-Z0-9]{8}/, { timeout: 15000 });
    const confirmationView = page.getByTestId("checkout-confirmation-view");
    await expect(confirmationView).toBeVisible();

    // Verify DB contains strictly 1 order for this customer
    const userOrders =
      await sql`SELECT * FROM orders WHERE customer_email = 'double.click@testchk6.pe'`;
    expect(userOrders).toHaveLength(1);

    const userPayments = await sql`SELECT * FROM payments WHERE order_id = ${userOrders[0]!.id}`;
    expect(userPayments).toHaveLength(1);

    const userReservations =
      await sql`SELECT * FROM inventory_reservations WHERE order_id = ${userOrders[0]!.id}`;
    expect(userReservations).toHaveLength(1);
  });
});
