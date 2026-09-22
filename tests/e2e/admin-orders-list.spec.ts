import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import {
  ADMIN_E2E_ORDER_FIXTURES,
  ADMIN_E2E_PASSWORD,
  ADMIN_E2E_USERS,
} from "./helpers/admin-fixtures";

async function login(page: Page, email: string, target = "/admin/orders") {
  await page.context().clearCookies();
  await page.goto(`/auth/login?redirect=${encodeURIComponent(target)}`);
  await page.getByLabel("Correo electrónico").fill(email);
  await page.getByLabel("Contraseña").fill(ADMIN_E2E_PASSWORD);
  await page.getByRole("button", { name: "Iniciar sesión" }).click();
  await page.waitForURL((url) => !url.pathname.includes("/auth/login"));
  await page.goto(target);
  await page.getByRole("heading", { level: 1 }).waitFor();
}

async function submitFilters(page: Page) {
  await page.getByRole("button", { name: "Filtrar" }).click();
  await page.waitForLoadState("domcontentloaded");
}

function visibleRows(page: Page) {
  return page.locator('[data-testid="orders-desktop-list"] tbody tr');
}

async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
}

async function expectAxeClean(page: Page) {
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(result.violations).toEqual([]);
}

test.describe("GP-027 CHK2 — Admin Orders list", () => {
  test("orders staff and superadmin can access the guarded route and navigation", async ({
    page,
  }) => {
    await login(page, ADMIN_E2E_USERS.orders.email);
    await expect(page.getByRole("heading", { level: 1, name: "Pedidos" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Pedidos" }).first()).toHaveAttribute(
      "href",
      "/admin/orders"
    );

    await login(page, ADMIN_E2E_USERS.superadmin.email);
    await expect(page.getByRole("heading", { level: 1, name: "Pedidos" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Pedidos" }).first()).toBeVisible();
  });

  test("catalog staff and customer cannot access Orders data directly", async ({ page }) => {
    await login(page, ADMIN_E2E_USERS.catalog.email);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Acceso no autorizado");
    await expect(page.locator('[data-testid="orders-desktop-list"]')).toHaveCount(0);
    await expect(page.locator('[data-testid="orders-mobile-list"]')).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Pedidos" })).toHaveCount(0);

    await login(page, ADMIN_E2E_USERS.customer.email);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Acceso no autorizado");
    await expect(page.locator('[data-testid="orders-desktop-list"]')).toHaveCount(0);
    await expect(page.locator('[data-testid="orders-mobile-list"]')).toHaveCount(0);
  });

  test("desktop row shows only the guarded list DTO and a protected detail link", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await login(page, ADMIN_E2E_USERS.orders.email, "/admin/orders?q=GP-AD");

    const number = ADMIN_E2E_ORDER_FIXTURES.orderNumber(1);
    const row = page.getByTestId(`order-row-${number}`);
    await expect(page.getByTestId("orders-desktop-list")).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "Pedido" })).toBeVisible();
    await expect(row).toContainText(number);
    await expect(row).toContainText("M***@Example.com");
    await expect(row).toContainText("Pendiente");
    await expect(row).toContainText("Sin pagar");
    await expect(row).toContainText("Sin preparar");
    await expect(row).toContainText("S/ 159.90");
    await expect(row).toContainText("Yape E2E");
    await expect(row.locator("td").nth(6)).toHaveText("2");
    await expect(row.locator("td").nth(8)).toContainText("15:00");
    await expect(row.locator("td").nth(9)).toContainText("15:20");
    await expect(row.getByRole("link", { name: number })).toHaveAttribute(
      "href",
      `/admin/orders/${number}`
    );

    const listText = await page.getByTestId("orders-desktop-list").textContent();
    expect(listText).not.toContain(ADMIN_E2E_ORDER_FIXTURES.mixedCaseEmail);
    expect(listText).not.toContain(ADMIN_E2E_ORDER_FIXTURES.privatePhone);
    expect(listText).not.toContain(ADMIN_E2E_ORDER_FIXTURES.privateStreet);
    expect(listText).not.toContain(ADMIN_E2E_ORDER_FIXTURES.privateOperationCode);
    await expectNoHorizontalOverflow(page);
  });

  test("search uses anchored prefix, exact case-insensitive email, and safe empty/invalid states", async ({
    page,
  }) => {
    await login(page, ADMIN_E2E_USERS.orders.email);
    await page.getByRole("searchbox", { name: "Buscar pedido" }).fill("GP-AD000001");
    await submitFilters(page);
    await expect(page).toHaveURL(/q=GP-AD000001/);
    await expect(visibleRows(page)).toHaveCount(1);

    await page.getByRole("searchbox", { name: "Buscar pedido" }).fill("mixed.order@example.com");
    await submitFilters(page);
    await expect(visibleRows(page)).toHaveCount(1);
    await expect(page.getByTestId("order-row-GP-AD000001")).toContainText("M***@Example.com");

    await page.getByRole("searchbox", { name: "Buscar pedido" }).fill("GP-ZZZZ");
    await submitFilters(page);
    await expect(page.getByText("No encontramos pedidos con estos filtros.")).toBeVisible();
    await expect(page.getByRole("link", { name: "Limpiar filtros" }).first()).toBeVisible();

    await page.goto("/admin/orders?q=GP-%25");
    await expect(page.getByText("Los filtros o la paginación no son válidos.")).toBeVisible();
    await expect(page.getByRole("link", { name: "Restablecer filtros" })).toHaveAttribute(
      "href",
      "/admin/orders"
    );
    await expect(page.getByTestId("orders-desktop-list")).toHaveCount(0);
  });

  test("status, payment, shipment, and combined filters use physical server results", async ({
    page,
  }) => {
    await login(page, ADMIN_E2E_USERS.orders.email, "/admin/orders?q=GP-AD");
    await page.getByLabel("Estado del pedido").selectOption("CONFIRMED");
    await submitFilters(page);
    await expect(page).toHaveURL(/orderStatus=CONFIRMED/);
    await expect(visibleRows(page)).toHaveCount(1);
    await expect(page.getByTestId("order-row-GP-AD000002")).toBeAttached();

    await page.getByLabel("Estado del pago").selectOption("PAID");
    await submitFilters(page);
    await expect(page).toHaveURL(/paymentStatus=PAID/);
    await expect(visibleRows(page)).toHaveCount(1);

    await page.getByLabel("Estado del envío").selectOption("SHIPPED");
    await submitFilters(page);
    await expect(page).toHaveURL(/shipmentStatus=SHIPPED/);
    await expect(visibleRows(page)).toHaveCount(1);
    await expect(page.getByText("Filtros aplicados")).toBeVisible();
  });

  test("NOT_RECORDED and multiple-shipment states are explicit", async ({ page }) => {
    await login(page, ADMIN_E2E_USERS.orders.email, "/admin/orders?q=GP-AD");
    await page.getByLabel("Estado del pago").selectOption("NOT_RECORDED");
    await submitFilters(page);
    await expect(page).toHaveURL(/paymentStatus=NOT_RECORDED/);
    await expect(visibleRows(page)).toHaveCount(1);
    await expect(page.getByTestId("order-row-GP-AD000005")).toContainText("Sin registro de pago");

    await page.goto("/admin/orders?q=GP-AD");
    await page.getByLabel("Estado del envío").selectOption("NOT_RECORDED");
    await submitFilters(page);
    await expect(page).toHaveURL(/shipmentStatus=NOT_RECORDED/);
    await expect(visibleRows(page)).toHaveCount(2);
    await expect(page.getByTestId("order-row-GP-AD000006")).toContainText("Sin envío registrado");

    await page.goto("/admin/orders?q=GP-AD000007");
    await expect(page.getByTestId("order-row-GP-AD000007")).toContainText("Múltiples envíos");
  });

  test("Lima date range filters the seeded purchase dates", async ({ page }) => {
    await login(page, ADMIN_E2E_USERS.orders.email);
    await page.getByLabel("Desde").fill("2026-09-18");
    await page.getByLabel("Hasta").fill("2026-09-18");
    await submitFilters(page);
    await expect(page).toHaveURL(/from=2026-09-18/);
    await expect(page).toHaveURL(/to=2026-09-18/);
    await expect(visibleRows(page)).toHaveCount(3);
    await expect(page.getByTestId("order-row-GP-AD000028")).toBeAttached();

    await page.goto("/admin/orders?from=2026-09-18");
    await expect(page.getByText("Los filtros o la paginación no son válidos.")).toBeVisible();
  });

  test("keyset pagination preserves filters without duplicate or missing fixture rows", async ({
    page,
  }) => {
    await login(page, ADMIN_E2E_USERS.orders.email, "/admin/orders?q=GP-AD");
    await expect(visibleRows(page)).toHaveCount(25);
    const firstPage = await visibleRows(page).evaluateAll((rows) =>
      rows.map((row) => row.getAttribute("data-testid"))
    );
    await page.getByRole("link", { name: "Siguiente" }).click();
    await expect(page).toHaveURL(/q=GP-AD/);
    await expect(page).toHaveURL(/pageSize=25/);
    await expect(page).toHaveURL(/cursor=/);
    await expect(visibleRows(page)).toHaveCount(5);
    const secondPage = await visibleRows(page).evaluateAll((rows) =>
      rows.map((row) => row.getAttribute("data-testid"))
    );
    expect(new Set([...firstPage, ...secondPage]).size).toBe(ADMIN_E2E_ORDER_FIXTURES.count);
    await page.getByRole("link", { name: "Volver al inicio" }).click();
    await expect(page).not.toHaveURL(/cursor=/);
    await expect(page).toHaveURL(/q=GP-AD/);

    await page.getByRole("link", { name: "Siguiente" }).click();
    await page.getByLabel("Estado del pedido").selectOption("PENDING");
    await submitFilters(page);
    await expect(page).not.toHaveURL(/cursor=/);
    await expect(page).toHaveURL(/orderStatus=PENDING/);
    await expect(page.getByRole("link", { name: "Siguiente" })).toBeVisible();

    await page.goto("/admin/orders?q=GP-AD&cursor=malformed");
    await expect(page.getByText("Los filtros o la paginación no son válidos.")).toBeVisible();
  });

  test("mobile cards and tablet layout preserve key data without viewport overflow", async ({
    page,
  }) => {
    await login(page, ADMIN_E2E_USERS.orders.email, "/admin/orders?q=GP-AD000001");
    for (const width of [768, 390, 360]) {
      await page.setViewportSize({ width, height: 900 });
      await expect(page.getByTestId("orders-mobile-list")).toBeVisible();
      await expect(page.getByTestId("orders-desktop-list")).toBeHidden();
      const card = page.getByTestId("order-card-GP-AD000001");
      await expect(card).toContainText("M***@Example.com");
      await expect(card).toContainText("S/ 159.90");
      await expect(card).toContainText("Artículos");
      await expect(card).toContainText("Actividad");
      await expect(page.getByRole("button", { name: "Filtrar" })).toBeVisible();
      await expectNoHorizontalOverflow(page);
    }
  });

  test("axe reports no tested WCAG 2.1 A/AA violations on populated and empty states", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await login(page, ADMIN_E2E_USERS.orders.email, "/admin/orders?q=GP-AD000001");
    await expectAxeClean(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await expectAxeClean(page);
    await page.goto("/admin/orders?q=GP-ZZZZ");
    await expect(page.getByText("No encontramos pedidos con estos filtros.")).toBeVisible();
    await expectAxeClean(page);
  });

  test("search, filters, clear, and pagination remain keyboard-operable", async ({ page }) => {
    await login(page, ADMIN_E2E_USERS.orders.email, "/admin/orders?q=GP-AD");
    const search = page.getByRole("searchbox", { name: "Buscar pedido" });
    await search.focus();
    await expect(search).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(page.getByLabel("Estado del pedido")).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(page.getByLabel("Estado del pago")).toBeFocused();
    await page.getByRole("button", { name: "Filtrar" }).focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("heading", { level: 1, name: "Pedidos" })).toBeVisible();
    await page.getByRole("link", { name: "Siguiente" }).focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/cursor=/);
    await page.getByRole("link", { name: "Limpiar filtros" }).first().focus();
    await page.keyboard.press("Enter");
    await expect(page).not.toHaveURL(/q=/);
  });
});
