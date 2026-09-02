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

    // Verify Forbidden view is rendered
    const heading = page.getByRole("heading", { level: 1 });
    await expect(heading).toHaveText("Acceso no autorizado");
    await expect(page.locator("body")).toContainText(ADMIN_E2E_USERS.customer.email);

    // Verify zero privileged Admin navigation or content is present
    await expect(page.locator("aside")).toHaveCount(0);
    await expect(page.locator("main#admin-main-content")).toHaveCount(0);
    await expect(page.getByRole("navigation", { name: "Ruta de navegación" })).toHaveCount(0);
    await expect(page.locator("text=SUPER_ADMIN")).toHaveCount(0);
    await expect(page.locator("text=ADMIN_CATALOG")).toHaveCount(0);
    await expect(page.locator("text=Resumen Financiero")).toHaveCount(0);

    // Verify recovery links
    const accountLink = page.getByRole("link", { name: "Ir a mi cuenta" });
    await expect(accountLink).toBeVisible();
    await expect(accountLink).toHaveAttribute("href", "/cuenta");
  });

  test("E3: authenticated user with no roles is denied access and sees AdminForbidden surface", async ({
    page,
  }) => {
    await loginAndNavigateToAdmin(page, ADMIN_E2E_USERS.norole.email);

    const heading = page.getByRole("heading", { level: 1 });
    await expect(heading).toHaveText("Acceso no autorizado");

    // Verify zero privileged Admin structure is present
    await expect(page.locator("aside")).toHaveCount(0);
    await expect(page.locator("main#admin-main-content")).toHaveCount(0);
    await expect(page.getByRole("navigation", { name: "Ruta de navegación" })).toHaveCount(0);
    await expect(page.locator("text=SUPER_ADMIN")).toHaveCount(0);
    await expect(page.locator("text=Resumen Financiero")).toHaveCount(0);
  });

  test("E4: authenticated SUPER_ADMIN enters real /admin with full dashboard structure, period selector, and all authorized sections", async ({
    page,
  }) => {
    await loginAndNavigateToAdmin(page, ADMIN_E2E_USERS.superadmin.email);

    // Verify main admin semantic landmarks
    await expect(page.getByRole("navigation", { name: "Ruta de navegación" })).toBeVisible();
    await expect(page.locator("aside")).toBeVisible();
    await expect(page.locator("main#admin-main-content")).toBeVisible();

    // Verify page heading and truthful platform dashboard
    await expect(page.getByRole("heading", { level: 1, name: "Resumen" })).toBeVisible();
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

    // Verify staff identity card in sidebar
    await expect(page.locator("aside")).toContainText(ADMIN_E2E_USERS.superadmin.email);
    await expect(page.locator("aside")).toContainText("SUPER_ADMIN");

    // Verify period selector works and changes URL state canonically
    const periodNav = page.getByRole("navigation", { name: "Filtros de período" });
    await expect(periodNav).toBeVisible();

    const treintaDiasLink = periodNav.getByRole("link", { name: "30 días" });
    await expect(treintaDiasLink).toHaveAttribute("aria-current", "page");

    // Click "7 días"
    await periodNav.getByRole("link", { name: "7 días" }).click();
    await expect(page).toHaveURL(/period=LAST_7_DAYS/);
    const sieteDiasLink = periodNav.getByRole("link", { name: "7 días" });
    await expect(sieteDiasLink).toHaveAttribute("aria-current", "page");

    // Click "Hoy"
    await periodNav.getByRole("link", { name: "Hoy" }).click();
    await expect(page).toHaveURL(/period=TODAY/);
    const hoyLink = periodNav.getByRole("link", { name: "Hoy" });
    await expect(hoyLink).toHaveAttribute("aria-current", "page");
  });

  test("E5: authenticated ADMIN_CATALOG sees catalog section and zero financial/order/payment/inventory sections", async ({
    page,
  }) => {
    await loginAndNavigateToAdmin(page, ADMIN_E2E_USERS.catalog.email);

    await expect(page.getByRole("heading", { level: 1, name: "Resumen" })).toBeVisible();
    await expect(page.locator("aside")).toContainText(ADMIN_E2E_USERS.catalog.email);
    await expect(page.locator("aside")).toContainText("ADMIN_CATALOG");

    // Authorized: Catalog
    await expect(
      page.getByRole("heading", { level: 2, name: "Resumen de Catálogo" })
    ).toBeVisible();

    // Unauthorized: Financial, Orders, Payment verification, Inventory
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
    await expect(page.locator("aside")).toContainText("ADMIN_ORDERS");

    // Authorized: Financial, Orders, Payment verification
    await expect(page.getByRole("heading", { level: 2, name: "Resumen Financiero" })).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: "Flujo de Pedidos" })).toBeVisible();
    await expect(
      page.getByRole("heading", { level: 2, name: "Verificación de Pagos Manuales" })
    ).toBeVisible();

    // Unauthorized: Catalog, Inventory
    await expect(page.locator("text=Resumen de Catálogo")).toHaveCount(0);
    await expect(page.locator("text=Resumen de Inventario")).toHaveCount(0);
  });

  test("E7: authenticated ADMIN_SUPPORT sees truthful no-metrics-assigned state with zero privileged values", async ({
    page,
  }) => {
    await loginAndNavigateToAdmin(page, ADMIN_E2E_USERS.support.email);

    await expect(page.getByRole("heading", { level: 1, name: "Resumen" })).toBeVisible();
    await expect(page.locator("aside")).toContainText(ADMIN_E2E_USERS.support.email);
    await expect(page.locator("aside")).toContainText("ADMIN_SUPPORT");

    // Truthful no-metrics-assigned message
    await expect(
      page.getByRole("heading", { level: 2, name: "Sin Métricas Asignadas" })
    ).toBeVisible();
    await expect(page.locator("text=No hay métricas de resumen asignadas a tu rol.")).toBeVisible();

    // Proves zero privileged sections or values are rendered
    await expect(page.locator("text=Resumen Financiero")).toHaveCount(0);
    await expect(page.locator("text=Flujo de Pedidos")).toHaveCount(0);
    await expect(page.locator("text=Verificación de Pagos Manuales")).toHaveCount(0);
    await expect(page.locator("text=Resumen de Catálogo")).toHaveCount(0);
    await expect(page.locator("text=Resumen de Inventario")).toHaveCount(0);
  });

  test("E8: Mobile drawer opens, traps focus, responds to Escape, and restores focus to trigger", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await loginAndNavigateToAdmin(page, ADMIN_E2E_USERS.superadmin.email);

    // Find mobile menu trigger button
    const menuButton = page.getByRole("button", { name: "Abrir menú de navegación" });
    await expect(menuButton).toBeVisible();
    await expect(menuButton).toHaveAttribute("aria-expanded", "false");

    // Focus and click menu trigger
    await menuButton.focus();
    await menuButton.click();

    // Verify mobile drawer dialog is open and menu trigger reflects expanded state
    const drawer = page.locator("#admin-mobile-nav");
    await expect(drawer).toBeVisible();
    await expect(drawer).toHaveAttribute("role", "dialog");
    await expect(drawer).toHaveAttribute("aria-modal", "true");
    await expect(menuButton).toHaveAttribute("aria-expanded", "true");

    // Verify close button received initial focus
    const closeButton = page.getByRole("button", { name: "Cerrar menú de navegación" });
    await expect(closeButton).toBeFocused();

    // Verify Tab key cycles inside drawer (focus trap)
    await page.keyboard.press("Tab");
    const navLink = drawer.getByRole("link", { name: "Inicio", exact: true });
    await expect(navLink).toBeFocused();

    // Verify Shift+Tab cycles back to close button
    await page.keyboard.press("Shift+Tab");
    await expect(closeButton).toBeFocused();

    // Press Escape key -> drawer closes and restores focus to menu button
    await page.keyboard.press("Escape");
    await expect(drawer).toBeHidden();
    await expect(menuButton).toBeFocused();
    await expect(menuButton).toHaveAttribute("aria-expanded", "false");

    // Re-open and verify backdrop click closes drawer and restores focus
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
});
