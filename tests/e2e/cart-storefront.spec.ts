import { test, expect } from "@playwright/test";

test.describe("GP-017 / CART5 — Storefront Cart UI Real E2E Suite", () => {
  test.beforeEach(async ({ page }) => {
    // Clear cookies before each test for clean anonymous state
    await page.context().clearCookies();
  });

  test("Scenario A: Anonymous Cart Bootstrap (0 items, launcher badge absent, empty drawer)", async ({
    page,
  }) => {
    await page.goto("/");

    // 1. Header launcher present
    const launcher = page.getByTestId("desktop-cart-launcher");
    await expect(launcher).toBeVisible();

    // 2. Badge is absent when 0 items
    const badge = page.getByTestId("cart-badge-count");
    await expect(badge).toHaveCount(0);

    // 3. Open Cart Drawer
    await launcher.click();
    const drawer = page.getByTestId("cart-drawer");
    await expect(drawer).toBeVisible();

    // 4. Empty State is rendered
    const emptyState = page.getByTestId("cart-empty-state");
    await expect(emptyState).toBeVisible();
    await expect(page.getByRole("heading", { name: "Tu carrito está vacío" })).toBeVisible();

    // 5. Close drawer
    const closeBtn = page.getByTestId("cart-drawer-close");
    await closeBtn.click();
    await expect(drawer).not.toBeVisible();
  });

  test("Scenario B: PDP Add to Cart (slide-out drawer, badge update, subtotal)", async ({
    page,
  }) => {
    await page.goto("/productos/mouse-cart-e2e");

    // 1. Verify PDP Commerce Panel is loaded
    const commercePanel = page.getByTestId("product-commerce-panel");
    await expect(commercePanel).toBeVisible();

    const addBtn = page.getByTestId("pdp-add-to-cart-button");
    await expect(addBtn).toBeVisible();
    await expect(addBtn).toBeEnabled();

    // 2. Click Add to Cart
    await addBtn.click();

    // 3. Drawer opens automatically
    const drawer = page.getByTestId("cart-drawer");
    await expect(drawer).toBeVisible();

    // 4. Verify item in drawer
    const lineItem = page.getByTestId("cart-line-item");
    await expect(lineItem).toHaveCount(1);
    await expect(page.getByTestId("cart-subtotal-value")).toHaveText("S/ 129.90");

    // 5. Header launcher badge is updated to 1
    const badge = page.getByTestId("cart-badge-count");
    await expect(badge).toHaveText("1");
  });

  test("Scenario C: In-Drawer Quantity Stepper and Removal", async ({ page }) => {
    await page.goto("/productos/mouse-cart-e2e");

    // 1. Add item
    const addBtn = page.getByTestId("pdp-add-to-cart-button");
    await addBtn.click();

    const drawer = page.getByTestId("cart-drawer");
    await expect(drawer).toBeVisible();

    // 2. Quantity stepper: Increment to 2
    const incBtn = page.getByTestId("cart-qty-increment");
    await incBtn.click();

    // Wait for mutation response
    await expect(page.getByTestId("cart-qty-value")).toHaveText("2");
    await expect(page.getByTestId("cart-subtotal-value")).toHaveText("S/ 259.80");
    await expect(page.getByTestId("cart-badge-count")).toHaveText("2");

    // 3. Quantity stepper: Decrement back to 1
    const decBtn = page.getByTestId("cart-qty-decrement");
    await decBtn.click();

    await expect(page.getByTestId("cart-qty-value")).toHaveText("1");
    await expect(page.getByTestId("cart-subtotal-value")).toHaveText("S/ 129.90");
    await expect(page.getByTestId("cart-badge-count")).toHaveText("1");

    // 4. Remove item
    const removeBtn = page.getByTestId("cart-line-remove");
    await removeBtn.click();

    // Transitions to empty state
    await expect(page.getByTestId("cart-empty-state")).toBeVisible();
    await expect(page.getByTestId("cart-badge-count")).toHaveCount(0);
  });

  test("Scenario D: Multi-Variant Addition & Full /carrito Page Navigation", async ({ page }) => {
    await page.goto("/productos/mouse-cart-e2e");

    // 1. Add Black variant (default)
    const addBtn = page.getByTestId("pdp-add-to-cart-button");
    await addBtn.click();

    const drawer = page.getByTestId("cart-drawer");
    await expect(drawer).toBeVisible();

    // Close drawer
    await page.getByTestId("cart-drawer-close").click();
    await expect(drawer).not.toBeVisible();

    // 2. Select White variant
    const whiteOption = page.getByRole("button", { name: /Blanco/i });
    if ((await whiteOption.count()) > 0) {
      await whiteOption.click();
    }

    // Add White variant
    await addBtn.click();
    await expect(drawer).toBeVisible();

    // 3. Verify 2 lines in drawer
    await expect(page.getByTestId("cart-badge-count")).toHaveText("2");

    // 4. Navigate to full /carrito page via drawer primary CTA
    const viewFullPageBtn = page.getByTestId("cart-view-full-page");
    await viewFullPageBtn.click();

    // Verify URL is /carrito
    await page.waitForURL("/carrito");
    const fullPage = page.getByTestId("cart-full-page");
    await expect(fullPage).toBeVisible();

    // Heading and subtotal
    await expect(page.getByRole("heading", { name: "Tu Carrito de Compras" })).toBeVisible();
    await expect(page.getByTestId("cart-subtotal-value")).toHaveText("S/ 269.80");
  });

  test("Scenario E: Cookie Session Persistence across Page Reloads", async ({ page }) => {
    await page.goto("/productos/mouse-cart-e2e");

    // Add item
    await page.getByTestId("pdp-add-to-cart-button").click();
    await expect(page.getByTestId("cart-drawer")).toBeVisible();

    // Reload page
    await page.reload();

    // Badge should still be 1 post-hydration
    const badge = page.getByTestId("cart-badge-count");
    await expect(badge).toHaveText("1");

    // Open drawer and verify line persists
    await page.getByTestId("desktop-cart-launcher").click();
    await expect(page.getByTestId("cart-drawer")).toBeVisible();
    await expect(page.getByTestId("cart-line-item")).toHaveCount(1);
    await expect(page.getByTestId("cart-subtotal-value")).toHaveText("S/ 129.90");
  });
});
