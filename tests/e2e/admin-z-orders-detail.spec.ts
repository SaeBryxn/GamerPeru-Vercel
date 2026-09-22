import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import postgres from "postgres";
import {
  ADMIN_E2E_ORDER_FIXTURES as orders,
  ADMIN_E2E_PASSWORD,
  ADMIN_E2E_USERS,
} from "./helpers/admin-fixtures";

test.describe.configure({ mode: "serial" });
test.setTimeout(60_000);

const databaseUrl =
  process.env.DATABASE_URL ?? "postgres://postgres:postgres@127.0.0.1:54322/postgres";
const sql = postgres(databaseUrl, { max: 1 });

async function login(page: Page, email: string, target: string) {
  await page.context().clearCookies();
  await page.goto(`/auth/login?redirect=${encodeURIComponent(target)}`);
  await page.getByLabel("Correo electrónico").fill(email);
  await page.getByLabel("Contraseña").fill(ADMIN_E2E_PASSWORD);
  await page.getByRole("button", { name: "Iniciar sesión" }).click();
  await page.waitForURL((url) => !url.pathname.includes("/auth/login"));
  await page.goto(target);
  await page.getByRole("heading", { level: 1 }).waitFor();
}

async function expectNoOverflow(page: Page) {
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
  ).toBeLessThanOrEqual(0);
}

async function expectAxeClean(page: Page) {
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(result.violations).toEqual([]);
}

async function readBrowserStorage(page: Page) {
  return page.evaluate(() => {
    const entries = (storage: Storage) =>
      Array.from({ length: storage.length }, (_, index) => {
        const key = storage.key(index)!;
        return [key, storage.getItem(key) ?? ""] as const;
      });
    return { local: entries(localStorage), session: entries(sessionStorage) };
  });
}

test.beforeAll(async ({}, testInfo) => {
  if (!testInfo.config.configFile?.endsWith("playwright.admin.config.ts")) return;
  const existing = await sql<{ order_number: string; status: string }[]>`
    SELECT order_number, status FROM orders
    WHERE order_number IN (${orders.orderNumber(1)}, ${orders.unpaidActionNumber}, ${orders.paidActionNumber})
  `;
  if (
    existing.length === 3 &&
    existing.some(
      (row) => row.order_number === orders.unpaidActionNumber && row.status === "PENDING"
    ) &&
    existing.some(
      (row) => row.order_number === orders.paidActionNumber && row.status === "CONFIRMED"
    )
  )
    return;
  const { cleanupAdminOrderFixtures } = await import("../../scripts/test/cleanup-admin-e2e.mjs");
  const { seedAdminUsers } = await import("../../scripts/test/seed-admin-e2e.mjs");
  await cleanupAdminOrderFixtures(sql);
  await seedAdminUsers();
});

test.afterAll(async ({}, testInfo) => {
  if (testInfo.config.configFile?.endsWith("playwright.admin.config.ts")) {
    const { cleanupAdminOrderFixtures } = await import("../../scripts/test/cleanup-admin-e2e.mjs");
    await cleanupAdminOrderFixtures(sql);
  }
  await sql.end();
});

test.describe("GP-027 CHK3 — protected order detail", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(
      !testInfo.config.configFile?.endsWith("playwright.admin.config.ts"),
      "Orders detail fixtures require the serial Admin E2E setup."
    );
  });

  test("orders staff and superadmin see detail; catalog, support and customer do not", async ({
    page,
  }) => {
    const path = `/admin/orders/${orders.orderNumber(1)}`;
    for (const user of [ADMIN_E2E_USERS.orders, ADMIN_E2E_USERS.superadmin]) {
      await login(page, user.email, path);
      await expect(
        page.getByRole("heading", { level: 1, name: `Pedido ${orders.orderNumber(1)}` })
      ).toBeVisible();
      await expect(page.getByText(orders.mixedCaseEmail)).toBeVisible();
    }
    for (const user of [
      ADMIN_E2E_USERS.catalog,
      ADMIN_E2E_USERS.support,
      ADMIN_E2E_USERS.customer,
    ]) {
      await login(page, user.email, path);
      await expect(page.getByRole("heading", { level: 1 })).toContainText("Acceso no autorizado");
      await expect(page.getByText(orders.mixedCaseEmail)).toHaveCount(0);
    }
  });

  test("invalid and nonexistent order numbers fail without leaking detail", async ({ page }) => {
    await login(page, ADMIN_E2E_USERS.orders.email, "/admin/orders/not-an-order");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Pedido no disponible");
    await page.goto("/admin/orders/GP-ZZ999999");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Pedido no disponible");
    await expect(page.getByText(orders.mixedCaseEmail)).toHaveCount(0);
  });

  test("list links to purchase snapshots and keeps private data out of the list", async ({
    page,
  }) => {
    await login(page, ADMIN_E2E_USERS.orders.email, `/admin/orders?q=${orders.orderNumber(1)}`);
    const listText = await page.locator("main").textContent();
    expect(listText).not.toContain(orders.mixedCaseEmail);
    expect(listText).not.toContain(orders.privatePhone);
    expect(listText).not.toContain(orders.privateStreet);
    await page
      .getByTestId(`order-row-${orders.orderNumber(1)}`)
      .getByRole("link", { name: orders.orderNumber(1) })
      .click();
    await expect(page.getByText(orders.mixedCaseEmail)).toBeVisible();
    await expect(page.getByText(orders.privateStreet)).toBeVisible();
    await expect(
      page.getByRole("table", { name: "Productos guardados en este pedido" })
    ).toContainText("E2E-PUB-SKU-001");
    await expect(page.getByRole("region", { name: "Importes" })).toContainText("S/ 159.90");
    const content = await page.content();
    expect(content).not.toContain(orders.privateOperationCode);
    expect(content).not.toContain("proof_image");
    expect(content).not.toContain("external_reference");
  });

  test("snapshots stay immutable when current catalog display name changes", async ({ page }) => {
    const productId = "018f0000-0000-7000-8000-000000001a01";
    const [original] = await sql<
      { name: string }[]
    >`SELECT name FROM products WHERE id = ${productId}`;
    if (!original) throw new Error("Missing deterministic product fixture");
    try {
      await sql`UPDATE products SET name = 'Current catalog mutation E2E' WHERE id = ${productId}`;
      await login(page, ADMIN_E2E_USERS.orders.email, `/admin/orders/${orders.orderNumber(1)}`);
      await expect(
        page.getByRole("table", { name: "Productos guardados en este pedido" })
      ).toContainText("Producto E2E Listo Publicar");
      await expect(page.getByText("Current catalog mutation E2E")).toHaveCount(0);
    } finally {
      await sql`UPDATE products SET name = ${original.name} WHERE id = ${productId}`;
    }
  });

  test("missing snapshots, multiple shipments and safe tracking are explicit", async ({ page }) => {
    await login(page, ADMIN_E2E_USERS.orders.email, `/admin/orders/${orders.orderNumber(5)}`);
    await expect(page.getByRole("alert", { name: "Advertencias del pedido" })).toContainText(
      "No existe un registro de pago"
    );
    await expect(page.getByRole("region", { name: "Pago" })).toContainText(
      "Datos de pedido no disponibles"
    );
    await page.goto(`/admin/orders/${orders.orderNumber(8)}`);
    await expect(page.getByRole("region", { name: "Entrega" })).toContainText(
      "Datos de pedido no disponibles"
    );
    await page.goto(`/admin/orders/${orders.orderNumber(9)}`);
    await expect(page.getByRole("region", { name: "Importes" })).toContainText(
      "Datos de pedido no disponibles"
    );
    await page.goto(`/admin/orders/${orders.orderNumber(7)}`);
    await expect(page.getByRole("alert", { name: "Advertencias del pedido" })).toContainText(
      "múltiples envíos"
    );
    await expect(page.getByRole("heading", { level: 3, name: /Envío/ })).toHaveCount(2);
    await page.goto(`/admin/orders/${orders.orderNumber(2)}`);
    await expect(page.getByRole("link", { name: "Abrir seguimiento del envío 1" })).toHaveAttribute(
      "href",
      "https://tracking.example.com/GP-AD000002"
    );
    await page.goto(`/admin/orders/${orders.orderNumber(3)}`);
    await expect(page.getByRole("link", { name: /Abrir seguimiento/ })).toHaveCount(0);
  });

  test("timeline uses recorded events only and both older cursors load safely", async ({
    page,
  }) => {
    await login(page, ADMIN_E2E_USERS.orders.email, `/admin/orders/${orders.orderNumber(2)}`);
    await expect(page.getByText("Pedido confirmado", { exact: true })).toHaveCount(0);
    await expect(page.getByText("Envío despachado", { exact: true })).toBeVisible();
    await page.goto(`/admin/orders/${orders.orderNumber(10)}`);
    await expect(page.getByRole("button", { name: "Cargar notas anteriores" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Cargar actividad anterior" })).toBeVisible();
    await page.getByRole("button", { name: "Cargar notas anteriores" }).click();
    await expect(page.getByRole("region", { name: "Notas internas" })).toContainText(
      "Nota histórica 1"
    );
    await page.getByRole("button", { name: "Cargar actividad anterior" }).click();
    await expect(page.getByRole("region", { name: "Actividad del pedido" })).toContainText(
      "Nota histórica 1"
    );
  });

  test("order details and an in-flight intent do not persist private data in browser storage", async ({
    page,
  }) => {
    await login(page, ADMIN_E2E_USERS.orders.email, `/admin/orders/${orders.orderNumber(10)}`);
    await expect(page.getByText("buyer10@example.com")).toBeVisible();
    await expect(page.getByText(orders.privatePhone).first()).toBeVisible();
    await expect(page.getByText(orders.privateStreet)).toBeVisible();
    await expect(page.getByRole("region", { name: "Notas internas" })).toContainText(
      "Nota histórica 55"
    );
    const before = await readBrowserStorage(page);
    const noteBody = "Nota privada temporal E2E";
    const reason = "Razón privada temporal E2E";
    await page.getByLabel("Nueva nota").fill(noteBody);
    await page.getByRole("button", { name: "Cancelar pedido sin pagar" }).click();
    await page.getByLabel("Razón operacional obligatoria").fill(reason);
    const after = await readBrowserStorage(page);
    const areas = ["local", "session"] as const;
    const changed = areas.flatMap((area) =>
      after[area].filter(([key, value]) =>
        before[area].every(([oldKey, oldValue]) => oldKey !== key || oldValue !== value)
      )
    );
    expect(
      areas.flatMap((area) => after[area]).filter(([key]) => key.startsWith("gp027:"))
    ).toEqual([]);
    const newStorage = JSON.stringify(changed);
    for (const privateValue of [
      orders.orderNumber(10),
      "buyer10@example.com",
      orders.privatePhone,
      orders.privateStreet,
      "Nota histórica 55",
      noteBody,
      reason,
    ]) {
      expect(newStorage).not.toContain(privateValue);
    }
  });

  test("notes reject invalid text, preserve plain text and reconcile a lost response", async ({
    page,
  }) => {
    await login(page, ADMIN_E2E_USERS.orders.email, `/admin/orders/${orders.orderNumber(1)}`);
    const textarea = page.getByLabel("Nueva nota");
    await textarea.fill("   ");
    await page.getByRole("button", { name: "Guardar nota" }).click();
    await expect(page.getByText("Escribe una nota de 1 a 2,000 caracteres válidos.")).toBeVisible();
    const body = "Nota de reconciliación <script>alert(1)</script>\nSegunda línea";
    await textarea.fill(body);
    let intercepted = false;
    await page.route(`**/admin/orders/${orders.orderNumber(1)}`, async (route) => {
      if (route.request().method() === "POST" && !intercepted) {
        intercepted = true;
        await route.fetch();
        await route.abort("failed");
      } else {
        await route.continue();
      }
    });
    await page.getByRole("button", { name: "Guardar nota" }).click();
    await expect(page.getByText("El resultado es incierto.", { exact: false })).toBeVisible();
    await expect(textarea).toHaveValue(body);
    await textarea.fill("Texto distinto");
    await page.getByRole("button", { name: "Guardar nota" }).click();
    await expect(page.getByText("Restaura exactamente el texto original")).toBeVisible();
    await textarea.fill(body);
    await page.getByRole("button", { name: "Guardar nota" }).click();
    await expect(page.getByText("La nota ya estaba guardada.", { exact: false })).toBeVisible();
    const [state] = await sql<{ note_count: string; audit_count: string }[]>`
      SELECT
        (SELECT count(*)::text FROM order_notes WHERE order_id = o.id AND body = ${body}) AS note_count,
        (SELECT count(*)::text FROM audit_events WHERE target_type = 'Order'
          AND target_id = o.id::text AND action = 'orders:note_added') AS audit_count
      FROM orders o WHERE o.order_number = ${orders.orderNumber(1)}`;
    expect(state).toEqual({ note_count: "1", audit_count: "1" });
    await expect(page.locator("script:visible")).toHaveCount(0);
  });

  test("unpaid cancellation requires a reason and rejects a stale payment", async ({ page }) => {
    await login(page, ADMIN_E2E_USERS.orders.email, `/admin/orders/${orders.unpaidActionNumber}`);
    await page.getByRole("button", { name: "Cancelar pedido sin pagar" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByRole("dialog")).toContainText("puede liberarse stock reservado");
    await expect(page.getByRole("dialog")).not.toContainText("devolución de dinero");
    await page.getByRole("button", { name: "Volver sin cambios" }).click();
    await page.getByRole("button", { name: "Cancelar pedido sin pagar" }).click();
    await page.getByRole("button", { name: "Confirmar cancelación" }).click();
    await expect(page.getByLabel("Razón operacional obligatoria")).toBeFocused();
    await page.getByLabel("Razón operacional obligatoria").fill("Razón stale E2E");
    try {
      await sql`UPDATE payments SET status = 'PAID' WHERE order_id = (SELECT id FROM orders WHERE order_number = ${orders.unpaidActionNumber})`;
      await page.getByRole("button", { name: "Confirmar cancelación" }).click();
      await expect(page.getByRole("dialog")).toContainText("El pedido cambió");
      const [state] = await sql<
        { status: string }[]
      >`SELECT status FROM orders WHERE order_number = ${orders.unpaidActionNumber}`;
      expect(state?.status).toBe("PENDING");
    } finally {
      await sql`UPDATE payments SET status = 'UNPAID' WHERE order_id = (SELECT id FROM orders WHERE order_number = ${orders.unpaidActionNumber})`;
    }
  });

  test("unpaid cancellation commits once and reconciles a lost response with the same attempt", async ({
    page,
  }) => {
    await login(page, ADMIN_E2E_USERS.orders.email, `/admin/orders/${orders.unpaidActionNumber}`);
    await page.getByRole("button", { name: "Cancelar pedido sin pagar" }).click();
    await page.getByLabel("Razón operacional obligatoria").fill("Cancelación unpaid E2E");
    let intercepted = false;
    await page.route(`**/admin/orders/${orders.unpaidActionNumber}`, async (route) => {
      if (route.request().method() === "POST" && !intercepted) {
        intercepted = true;
        await route.fetch();
        await route.abort("failed");
      } else await route.continue();
    });
    await page.getByRole("button", { name: "Confirmar cancelación" }).click();
    await expect(page.getByRole("dialog")).toContainText("El resultado es incierto");
    await page.getByLabel("Razón operacional obligatoria").fill("Razón distinta");
    await page.getByRole("button", { name: "Confirmar cancelación" }).click();
    await expect(page.getByRole("dialog")).toContainText("Restaura exactamente la razón original");
    await page.getByRole("button", { name: "Volver sin cambios" }).click();
    await page
      .getByRole("button", { name: /Resolver intento pendiente|Cancelar pedido sin pagar/ })
      .click();
    await page.getByLabel("Razón operacional obligatoria").fill("Cancelación unpaid E2E");
    await page.getByRole("button", { name: "Confirmar cancelación" }).click();
    await expect(
      page.getByText("La operación ya estaba registrada", { exact: false })
    ).toBeVisible();
    const [state] = await sql<
      { status: string; audit_count: string; outbox_count: string }[]
    >`SELECT o.status,
        (SELECT count(*)::text FROM audit_events WHERE target_type = 'Order' AND target_id = o.id::text AND action = 'orders:cancel') AS audit_count,
        (SELECT count(*)::text FROM outbox_events WHERE aggregate_type = 'Order' AND aggregate_id = o.id::text AND event_name = 'OrderCancelled') AS outbox_count
      FROM orders o WHERE o.order_number = ${orders.unpaidActionNumber}`;
    expect(state?.status).toBe("CANCELLED");
    expect(state?.audit_count).toBe("1");
    expect(state?.outbox_count).toBe("1");
  });

  test("paid cancellation requires explicit attestation and rejects a stale shipment", async ({
    page,
  }) => {
    await login(page, ADMIN_E2E_USERS.orders.email, `/admin/orders/${orders.paidActionNumber}`);
    await page.getByRole("button", { name: "Registrar cancelación y reembolso externo" }).click();
    await expect(page.getByRole("dialog")).toContainText(
      "NO está realizando una transferencia bancaria"
    );
    await page.getByLabel("Razón operacional obligatoria").fill("Razón paid E2E");
    await page.getByRole("button", { name: "Registrar reembolso completado" }).click();
    await expect(page.getByRole("dialog")).toContainText("Confirma que el reembolso externo");
    await page.getByRole("checkbox", { name: /reembolso externo ya fue completado/ }).check();
    try {
      await sql`UPDATE shipments SET status = 'SHIPPED' WHERE order_id = (SELECT id FROM orders WHERE order_number = ${orders.paidActionNumber})`;
      await page.getByRole("button", { name: "Registrar reembolso completado" }).click();
      await expect(page.getByRole("dialog")).toContainText("El pedido cambió");
      const [state] = await sql<
        { status: string }[]
      >`SELECT status FROM orders WHERE order_number = ${orders.paidActionNumber}`;
      expect(state?.status).toBe("CONFIRMED");
    } finally {
      await sql`UPDATE shipments SET status = 'UNFULFILLED' WHERE order_id = (SELECT id FROM orders WHERE order_number = ${orders.paidActionNumber})`;
    }
  });

  test("paid pre-shipment cancellation records a completed external refund without transfer UI", async ({
    page,
  }) => {
    await login(page, ADMIN_E2E_USERS.orders.email, `/admin/orders/${orders.paidActionNumber}`);
    await page.getByRole("button", { name: "Registrar cancelación y reembolso externo" }).click();
    await page.getByLabel("Razón operacional obligatoria").fill("Reembolso externo E2E confirmado");
    await page.getByRole("checkbox", { name: /reembolso externo ya fue completado/ }).check();
    await page.getByRole("button", { name: "Registrar reembolso completado" }).click();
    await expect(
      page.getByText("Cancelación y registro del reembolso externo confirmados.")
    ).toBeVisible();
    await page.reload();
    await expect(page.getByRole("region", { name: "Reembolsos" })).toContainText("S/ 159.90");
    const [state] = await sql<
      { order_status: string; payment_status: string; refund_count: string }[]
    >`
      SELECT o.status AS order_status, p.status AS payment_status,
        (SELECT count(*)::text FROM refunds WHERE order_id = o.id) AS refund_count
      FROM orders o JOIN payments p ON p.order_id = o.id
      WHERE o.order_number = ${orders.paidActionNumber}`;
    expect(state).toEqual({
      order_status: "REFUNDED",
      payment_status: "REFUNDED",
      refund_count: "1",
    });
    expect(await page.content()).not.toContain("external_reference");
  });

  test("detail and dialog remain keyboard-accessible, responsive and axe-clean", async ({
    page,
  }) => {
    await login(page, ADMIN_E2E_USERS.orders.email, `/admin/orders/${orders.orderNumber(1)}`);
    for (const width of [1440, 768, 390, 360]) {
      await page.setViewportSize({ width, height: 900 });
      await expectNoOverflow(page);
      if (process.env.GP027_VISUAL_CAPTURE === "1") {
        await page.screenshot({
          path: `test-results/gp027-chk3-detail-${width}.png`,
          fullPage: true,
        });
      }
      await expect(
        page.getByRole("heading", { level: 2, name: "Actividad del pedido" })
      ).toBeVisible();
      await expect(page.getByLabel("Nueva nota")).toBeVisible();
    }
    await page.getByLabel("Nueva nota").focus();
    await expect(page.getByLabel("Nueva nota")).toBeFocused();
    await expectAxeClean(page);
    await page.goto(`/admin/orders/${orders.orderNumber(10)}`);
    await page.getByRole("button", { name: "Cargar notas anteriores" }).focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("region", { name: "Notas internas" })).toContainText(
      "Nota histórica 1"
    );
    await expectAxeClean(page);
    const trigger = page.getByRole("button", { name: "Cancelar pedido sin pagar" });
    await trigger.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByLabel("Razón operacional obligatoria")).toBeFocused();
    await expectAxeClean(page);
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toBeHidden();
    await expect(trigger).toBeFocused();
  });
});
