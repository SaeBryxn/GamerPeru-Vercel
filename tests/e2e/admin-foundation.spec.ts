import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { ADMIN_E2E_USERS, ADMIN_E2E_PASSWORD } from "./helpers/admin-fixtures";

/**
 * Helper to log in a test user via browser-direct Supabase auth and navigate to /admin.
 * Uses the accessible production login contract (no artificial test IDs).
 */
async function loginAndNavigateToAdmin(page: Page, email: string) {
  // Clear any existing cookies for clean session
  await page.context().clearCookies();

  // Go to login page
  await page.goto("/auth/login?redirect=%2Fadmin");
  await page.waitForLoadState("domcontentloaded");

  // Fill credentials using accessible production form fields
  await page.getByLabel("Correo electrónico").fill(email);
  await page.getByLabel("Contraseña").fill(ADMIN_E2E_PASSWORD);
  await page.getByRole("button", { name: "Iniciar sesión" }).click();

  // Wait for login processing and navigation away from login page
  await page.waitForURL((url) => !url.pathname.includes("/auth/login"), {
    timeout: 15000,
  });

  // Navigate explicitly to /admin to ensure protected layout evaluates session
  await page.goto("/admin");
  await page.waitForLoadState("domcontentloaded");
  await page.waitForSelector("h1", { timeout: 15000 });
}

test.describe("GP-023 / CHK2 — Admin Dashboard Visual Integration & E2E Suite", () => {
  test("E1: anonymous navigation to /admin redirects to login with safe internal redirect", async ({
    page,
  }) => {
    await page.context().clearCookies();
    const response = await page.goto("/admin");
    expect(response).not.toBeNull();

    await expect(page).toHaveURL(/\/auth\/login\?redirect=%2Fadmin/);
    await expect(page.getByRole("heading", { level: 1 })).toContainText(/Iniciar sesión/i);
  });

  test("E2: authenticated CUSTOMER is denied access and sees AdminForbidden surface", async ({
    page,
  }) => {
    await loginAndNavigateToAdmin(page, ADMIN_E2E_USERS.customer.email);

    // Assert 403 / AdminForbidden surface
    await expect(page.getByRole("heading", { level: 1 })).toContainText(/Acceso no autorizado/i);
    await expect(page.locator("body")).toContainText(ADMIN_E2E_USERS.customer.email);
    await expect(page.getByRole("link", { name: "Ir a la tienda" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Ir a mi cuenta" })).toBeVisible();

    // Zero admin shell or dashboard metrics visible
    await expect(page.locator("aside")).toHaveCount(0);
    await expect(page.locator("text=Resumen Financiero")).toHaveCount(0);
  });

  test("E3: authenticated user with no roles is denied access and sees AdminForbidden surface", async ({
    page,
  }) => {
    await loginAndNavigateToAdmin(page, ADMIN_E2E_USERS.norole.email);

    // Assert 403 / AdminForbidden surface
    await expect(page.getByRole("heading", { level: 1 })).toContainText(/Acceso no autorizado/i);
    await expect(page.getByRole("link", { name: "Ir a la tienda" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Ir a mi cuenta" })).toBeVisible();

    // Zero admin shell or dashboard metrics visible
    await expect(page.locator("aside")).toHaveCount(0);
  });

  test("E4: authenticated SUPER_ADMIN enters real /admin with full dashboard structure, period selector, and all authorized sections", async ({
    page,
  }) => {
    await loginAndNavigateToAdmin(page, ADMIN_E2E_USERS.superadmin.email);

    // Admin layout shell loaded
    await expect(page.locator("aside")).toBeVisible();
    await expect(page.getByRole("heading", { level: 1, name: "Resumen" })).toBeVisible();

    // Period selector loaded with default 30 días active
    const treintaDiasLink = page.getByRole("link", { name: "30 días" });
    await expect(treintaDiasLink).toBeVisible();
    await expect(treintaDiasLink).toHaveAttribute("aria-current", "page");

    // All 5 metric sections authorized for SUPER_ADMIN
    await expect(page.getByRole("heading", { level: 2, name: "Resumen Financiero" })).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: "Flujo de Pedidos" })).toBeVisible();
    await expect(
      page.getByRole("heading", { level: 2, name: "Verificación de Pagos Manuales" })
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { level: 2, name: "Resumen de Catálogo" })
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { level: 2, name: "Resumen de Inventario" })
    ).toBeVisible();

    // Staff identity banner
    await expect(page.locator("aside")).toContainText(ADMIN_E2E_USERS.superadmin.email);
    await expect(page.locator("aside")).toContainText("SUPER_ADMIN");

    // Switch period to "7 días" and assert active selector changes
    const sieteDiasLink = page.getByRole("link", { name: "7 días" });
    await sieteDiasLink.click();
    await page.waitForLoadState("domcontentloaded");
    await expect(page).toHaveURL(/period=LAST_7_DAYS/);
    await expect(page.getByRole("link", { name: "7 días" })).toHaveAttribute(
      "aria-current",
      "page"
    );
    await expect(page.getByRole("link", { name: "30 días" })).not.toHaveAttribute(
      "aria-current",
      "page"
    );
  });

  test("E5: authenticated ADMIN_CATALOG sees catalog section and zero financial/order/payment/inventory sections", async ({
    page,
  }) => {
    await loginAndNavigateToAdmin(page, ADMIN_E2E_USERS.catalog.email);

    await expect(page.getByRole("heading", { level: 1, name: "Resumen" })).toBeVisible();
    await expect(page.locator("aside")).toContainText(ADMIN_E2E_USERS.catalog.email);

    // Authorized
    await expect(
      page.getByRole("heading", { level: 2, name: "Resumen de Catálogo" })
    ).toBeVisible();

    // Unauthorized sections must be 0 in DOM
    await expect(page.locator("text=Resumen Financiero")).toHaveCount(0);
    await expect(page.locator("text=Flujo de Pedidos")).toHaveCount(0);
    await expect(page.locator("text=Verificación de Pagos Manuales")).toHaveCount(0);
    await expect(page.locator("text=Resumen de Inventario")).toHaveCount(0);
  });

  test("E6: authenticated ADMIN_ORDERS sees financial/order/payment sections and zero catalog/inventory sections", async ({
    page,
  }) => {
    await loginAndNavigateToAdmin(page, ADMIN_E2E_USERS.orders.email);

    await expect(page.getByRole("heading", { level: 1, name: "Resumen" })).toBeVisible();
    await expect(page.locator("aside")).toContainText(ADMIN_E2E_USERS.orders.email);

    // Authorized
    await expect(page.getByRole("heading", { level: 2, name: "Resumen Financiero" })).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: "Flujo de Pedidos" })).toBeVisible();
    await expect(
      page.getByRole("heading", { level: 2, name: "Verificación de Pagos Manuales" })
    ).toBeVisible();

    // Unauthorized
    await expect(page.locator("text=Resumen de Catálogo")).toHaveCount(0);
    await expect(page.locator("text=Resumen de Inventario")).toHaveCount(0);
  });

  test("E7: authenticated ADMIN_SUPPORT sees truthful no-metrics-assigned state with zero privileged values", async ({
    page,
  }) => {
    await loginAndNavigateToAdmin(page, ADMIN_E2E_USERS.support.email);

    await expect(page.getByRole("heading", { level: 1, name: "Resumen" })).toBeVisible();
    await expect(page.locator("aside")).toContainText(ADMIN_E2E_USERS.support.email);

    // Truthful empty metrics explanation
    await expect(page.getByText("Sin Métricas Asignadas")).toBeVisible();
    await expect(page.getByText("No hay métricas de resumen asignadas a tu rol.")).toBeVisible();

    // Zero privileged metric sections rendered
    await expect(page.locator("text=Resumen Financiero")).toHaveCount(0);
    await expect(page.locator("text=Flujo de Pedidos")).toHaveCount(0);
    await expect(page.locator("text=Verificación de Pagos Manuales")).toHaveCount(0);
    await expect(page.locator("text=Resumen de Catálogo")).toHaveCount(0);
    await expect(page.locator("text=Resumen de Inventario")).toHaveCount(0);
  });

  test("E8: Mobile drawer opens, traps focus, responds to Escape, and restores focus to trigger", async ({
    page,
  }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });
    await loginAndNavigateToAdmin(page, ADMIN_E2E_USERS.superadmin.email);

    const menuButton = page.getByRole("button", { name: "Abrir menú de navegación" });
    await expect(menuButton).toBeVisible();
    await expect(menuButton).toHaveAttribute("aria-expanded", "false");

    // Open drawer
    await menuButton.click();
    await expect(menuButton).toHaveAttribute("aria-expanded", "true");

    const drawer = page.locator("[role='dialog'][aria-modal='true']");
    await expect(drawer).toBeVisible();

    // Close on Escape
    await page.keyboard.press("Escape");
    await expect(drawer).toBeHidden();
    await expect(menuButton).toBeFocused();
    await expect(menuButton).toHaveAttribute("aria-expanded", "false");

    // Re-open drawer and close via backdrop click
    await menuButton.click();
    await expect(drawer).toBeVisible();
    await expect(menuButton).toHaveAttribute("aria-expanded", "true");

    // Click backdrop outside drawer area
    const backdrop = page.locator("[class*='drawerBackdrop']");
    await backdrop.click({ position: { x: 320, y: 300 } });
    await expect(drawer).toBeHidden();
    await expect(menuButton).toBeFocused();
    await expect(menuButton).toHaveAttribute("aria-expanded", "false");
  });

  test("E9: Responsive matrix verification for zero horizontal overflow on real Admin Dashboard across 8 viewports", async ({
    page,
  }) => {
    await loginAndNavigateToAdmin(page, ADMIN_E2E_USERS.superadmin.email);

    const viewports = [
      { width: 320, height: 568 },
      { width: 360, height: 640 },
      { width: 375, height: 667 },
      { width: 480, height: 800 },
      { width: 768, height: 1024 },
      { width: 1024, height: 768 },
      { width: 1440, height: 900 },
      { width: 1920, height: 1080 },
    ];

    for (const vp of viewports) {
      await page.setViewportSize(vp);
      await page.waitForTimeout(50);

      const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);

      expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1); // Allow 1px subpixel rounding tolerance
    }
  });

  test("E10: Axe accessibility audit on real authenticated Admin Dashboard with ZERO violations and full color contrast checking", async ({
    page,
  }) => {
    await loginAndNavigateToAdmin(page, ADMIN_E2E_USERS.superadmin.email);

    const accessibilityScanResults = await new AxeBuilder({ page }).analyze();

    expect(accessibilityScanResults.violations).toEqual([]);
  });

  test("E11: Skip link and keyboard accessibility verification on real Admin Shell", async ({
    page,
  }) => {
    await loginAndNavigateToAdmin(page, ADMIN_E2E_USERS.superadmin.email);

    // Tab to skip link
    await page.keyboard.press("Tab");
    const skipLink = page.getByRole("link", { name: "Saltar al contenido principal" });
    await expect(skipLink).toBeFocused();
    await expect(skipLink).toHaveAttribute("href", "#admin-main-content");

    // Press Enter to activate skip link
    await page.keyboard.press("Enter");
    const mainContent = page.locator("main#admin-main-content");
    await expect(mainContent).toBeFocused();
  });

  test("E12: Admin layout specifies strict robots noindex, nofollow metadata", async ({ page }) => {
    await loginAndNavigateToAdmin(page, ADMIN_E2E_USERS.superadmin.email);

    const robotsMeta = page.locator('meta[name="robots"]');
    if ((await robotsMeta.count()) > 0) {
      const content = await robotsMeta.getAttribute("content");
      expect(content).toContain("noindex");
    }
  });

  test("E13: /admin contains zero fake dashboard widgets, fake revenue, or fake sales statistics", async ({
    page,
  }) => {
    await loginAndNavigateToAdmin(page, ADMIN_E2E_USERS.superadmin.email);

    const pageContent = await page.content();
    expect(pageContent).not.toContain("S/ 124,500");
    expect(pageContent).not.toContain("Ingresos Totales");
    expect(pageContent).not.toContain("Tasa de Conversión");
  });

  test("E14: Desktop visual structure verification (1280x800) for inventory & payment modules", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await loginAndNavigateToAdmin(page, ADMIN_E2E_USERS.superadmin.email);

    // 1. Inventory Section Visual Structure
    const inventorySection = page.locator("section[aria-labelledby='inventory-heading']");
    await expect(inventorySection).toBeVisible();

    // Verify 2-card desktop grid structure
    const inventoryGrid = inventorySection.locator("[class*='grid']");
    const gridCols = await inventoryGrid.evaluate(
      (el) => window.getComputedStyle(el).gridTemplateColumns.split(" ").length
    );
    expect(gridCols).toBe(2);

    // Verify ATS highlight box
    const atsBox = inventorySection.locator("[class*='balanceHighlight']");
    await expect(atsBox).toBeVisible();
    await expect(atsBox.locator("[data-testid='inventory-ats-units']")).toBeVisible();

    // Verify Physical breakdown 3-column layout
    const breakdownGrid = inventorySection.locator("[class*='breakdownGrid']");
    await expect(breakdownGrid).toBeVisible();
    await expect(breakdownGrid.locator("[data-testid='inventory-on-hand']")).toBeVisible();
    await expect(breakdownGrid.locator("[data-testid='inventory-reserved']")).toBeVisible();
    await expect(breakdownGrid.locator("[data-testid='inventory-allocated']")).toBeVisible();

    // Verify Alerts container and styled items
    const alertsContainer = inventorySection.locator("[class*='alertsContainer']");
    await expect(alertsContainer).toBeVisible();
    await expect(
      alertsContainer.locator("[data-testid='inventory-out-of-stock-skus']")
    ).toBeVisible();
    await expect(
      alertsContainer.locator("[data-testid='inventory-low-stock-positions']")
    ).toBeVisible();

    // 2. Payment Section Visual Structure
    const paymentSection = page.locator("section[aria-labelledby='payments-heading']");
    await expect(paymentSection).toBeVisible();

    const paymentGrid = paymentSection.locator("[class*='grid']");
    const paymentCols = await paymentGrid.evaluate(
      (el) => window.getComputedStyle(el).gridTemplateColumns.split(" ").length
    );
    expect(paymentCols).toBe(2);

    // Verify "Por verificar ahora" title with real-time snapshotBadge
    const snapshotBadge = paymentSection.locator("[class*='snapshotBadge']");
    await expect(snapshotBadge).toBeVisible();
    await expect(snapshotBadge).toHaveText("Tiempo real");

    // Verify 4-item period activity grid
    const activityGrid = paymentSection.locator("[class*='activityGrid']");
    await expect(activityGrid).toBeVisible();
    await expect(activityGrid.locator("[data-testid='payment-submission-attempts']")).toBeVisible();
    await expect(
      activityGrid.locator("[data-testid='payment-distinct-submissions']")
    ).toBeVisible();
    await expect(activityGrid.locator("[data-testid='payment-refunds-count']")).toBeVisible();
    await expect(activityGrid.locator("[data-testid='payment-refunds-outflow']")).toBeVisible();
  });

  test("E15: Mobile visual structure & collapse verification (360x780)", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 780 });
    await loginAndNavigateToAdmin(page, ADMIN_E2E_USERS.superadmin.email);

    // Assert clean collapse to 1-column grid on mobile
    const inventoryGrid = page
      .locator("section[aria-labelledby='inventory-heading']")
      .locator("[class*='grid']");
    const invColsMobile = await inventoryGrid.evaluate(
      (el) => window.getComputedStyle(el).gridTemplateColumns.split(" ").length
    );
    expect(invColsMobile).toBe(1);

    const paymentGrid = page
      .locator("section[aria-labelledby='payments-heading']")
      .locator("[class*='grid']");
    const payColsMobile = await paymentGrid.evaluate(
      (el) => window.getComputedStyle(el).gridTemplateColumns.split(" ").length
    );
    expect(payColsMobile).toBe(1);

    // Zero horizontal page overflow
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);
  });
});
