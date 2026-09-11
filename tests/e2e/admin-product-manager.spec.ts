import { test, expect, type Page } from "@playwright/test";
import { ADMIN_E2E_USERS, ADMIN_E2E_PASSWORD } from "./helpers/admin-fixtures";

async function loginAndNavigateTo(page: Page, email: string, targetPath: string) {
  await page.context().clearCookies();
  await page.goto(`/auth/login?redirect=${encodeURIComponent(targetPath)}`);
  await page.waitForLoadState("domcontentloaded");

  await page.getByLabel("Correo electrónico").fill(email);
  await page.getByLabel("Contraseña").fill(ADMIN_E2E_PASSWORD);
  await page.getByRole("button", { name: "Iniciar sesión" }).click();

  await page.waitForURL((url) => !url.pathname.includes("/auth/login"), {
    timeout: 15000,
  });

  await page.goto(targetPath);
  await page.waitForLoadState("domcontentloaded");
  await page.waitForSelector("h1", { timeout: 15000 });
}

test.describe("GP-024 / CHK2 — Admin Product Manager UI E2E Suite", () => {
  test("A1: customer is denied access to /admin/products and sees AdminForbidden", async ({
    page,
  }) => {
    await loginAndNavigateTo(page, ADMIN_E2E_USERS.customer.email, "/admin/products");

    await expect(page.getByRole("heading", { level: 1 })).toContainText(/Acceso no autorizado/i);
    await expect(page.locator('[data-testid="product-table"]')).toHaveCount(0);
    await expect(page.locator('[data-testid="btn-new-product"]')).toHaveCount(0);
  });

  test("A2: customer is denied access to /admin/products/new and sees AdminForbidden", async ({
    page,
  }) => {
    await loginAndNavigateTo(page, ADMIN_E2E_USERS.customer.email, "/admin/products/new");

    await expect(page.getByRole("heading", { level: 1 })).toContainText(/Acceso no autorizado/i);
    await expect(page.locator('[data-testid="form-create-product"]')).toHaveCount(0);
  });

  test("B1: authorized catalog staff views /admin/products with required columns and controls", async ({
    page,
  }) => {
    await loginAndNavigateTo(page, ADMIN_E2E_USERS.catalog.email, "/admin/products");

    await expect(page.getByRole("heading", { level: 1 })).toContainText("Productos");
    await expect(page.locator('[data-testid="btn-new-product"]')).toBeVisible();
    await expect(page.locator('[data-testid="filter-search"]')).toBeVisible();
    await expect(page.locator('[data-testid="filter-status"]')).toBeVisible();

    // Verify presence of table or empty state
    const hasTable = (await page.locator('[data-testid="product-table"]').count()) > 0;
    if (hasTable) {
      // Must include exact domain wording "ATS Variantes Activas"
      await expect(
        page.getByRole("columnheader", { name: "ATS Variantes Activas", exact: true })
      ).toBeVisible();
      await expect(
        page.getByRole("columnheader", { name: "Variantes", exact: true })
      ).toBeVisible();
      await expect(page.getByRole("columnheader", { name: "Precio", exact: true })).toBeVisible();
    } else {
      await expect(page.locator('[data-testid="empty-catalog"]')).toBeVisible();
    }
  });

  test("C1 to K1: end-to-end product lifecycle — create, edit, add variant, duplicate, archive, restore, and verify zero hard delete", async ({
    page,
  }) => {
    // 1. Enter as SUPER_ADMIN
    await loginAndNavigateTo(page, ADMIN_E2E_USERS.superadmin.email, "/admin/products");

    // 2. Click "Nuevo Producto"
    await page.locator('[data-testid="btn-new-product"]').click();
    await page.waitForURL("/admin/products/new");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Nuevo Producto");

    // 3. Fill creation form with raw PEN strings
    const uniqueSuffix = Date.now().toString().slice(-6);
    const testProductName = `Mouse Gamer E2E ${uniqueSuffix}`;
    const testProductSlug = `mouse-gamer-e2e-${uniqueSuffix}`;
    const initialSku = `E2E-MOU-${uniqueSuffix}`;

    await page.locator('[data-testid="input-name"]').fill(testProductName);
    // Slug auto-populates
    await expect(page.locator('[data-testid="input-slug"]')).toHaveValue(testProductSlug);

    await page.locator('[data-testid="input-subtitle"]').fill("Subtítulo de prueba E2E");
    await page
      .locator('[data-testid="input-description"]')
      .fill("Descripción técnica para pruebas E2E.");

    // Initial Variant fields with raw PEN
    await page.locator('[data-testid="input-variant-sku"]').fill(initialSku);
    await page.locator('[data-testid="input-variant-title"]').fill("Negro Medianoche");
    await page.locator('[data-testid="input-variant-price"]').fill("189.90");
    await page.locator('[data-testid="input-variant-compare-at"]').fill("229.90");
    await page.locator('[data-testid="input-variant-cost"]').fill("95.00");
    await page.locator('[data-testid="input-variant-weight"]').fill("42");

    // Submit
    await page.locator('[data-testid="btn-submit-product"]').click();

    // 4. Expect redirection to product editor
    await page.waitForURL(/\/admin\/products\/[a-f0-9-]+/, { timeout: 15000 });
    await expect(page.locator('[data-testid="product-editor-title"]')).toContainText(
      testProductName
    );
    await expect(page.locator('[data-testid="badge-product-status"]')).toContainText("Borrador");

    // 5. Verify Publish Readiness Section
    await expect(page.locator('[data-testid="section-publish-readiness"]')).toBeVisible();
    await expect(page.locator('[data-testid="readiness-badge"]')).toBeVisible();

    // 6. Verify Read-Only Media Notice (Amendment 5)
    await expect(page.locator('[data-testid="media-readonly-notice"]')).toBeVisible();
    // Zero file inputs or upload buttons
    await expect(page.locator('input[type="file"]')).toHaveCount(0);

    // 7. Verify Initial Variant rendered in variants table
    await expect(page.locator('[data-testid="table-variants"]')).toBeVisible();
    await expect(page.locator(`text=${initialSku}`)).toBeVisible();
    await expect(page.locator("text=S/ 189.90")).toBeVisible();

    // 8. Update Details Form
    await page.locator('[data-testid="input-subtitle"]').fill("Subtítulo Actualizado E2E");
    await page.locator('[data-testid="btn-save-details"]').click();
    await expect(page.locator('[data-testid="alert-general-success"]')).toContainText(
      "actualizada exitosamente"
    );

    // 9. Add a Second Variant via Modal
    const secondSku = `E2E-MOU-WHT-${uniqueSuffix}`;
    await page.locator('[data-testid="btn-add-variant"]').click();
    await expect(page.locator('[data-testid="modal-create-variant"]')).toBeVisible();

    await page.locator('[data-testid="input-new-sku"]').fill(secondSku);
    await page.locator('[data-testid="input-new-title"]').fill("Blanco Nieve");
    await page.locator('[data-testid="input-new-price"]').fill("199.90");
    await page.locator('[data-testid="input-new-cost"]').fill("98.00");
    await page.locator('[data-testid="btn-save-new-variant"]').click();

    // Verify modal closes and second variant appears
    await expect(page.locator('[data-testid="modal-create-variant"]')).toHaveCount(0);
    await expect(page.locator(`text=${secondSku}`)).toBeVisible();

    // 10. Specifications Partial Save (if schema present)
    const hasSpecInputs = (await page.locator('[data-testid^="spec-input-"]').count()) > 0;
    if (hasSpecInputs) {
      // Click save specs without filling everything
      await page.locator('[data-testid="btn-save-specs"]').click();
      await expect(page.locator('[data-testid="alert-general-success"]')).toContainText(
        "Especificaciones técnicas guardadas"
      );
    }

    // 11. Duplicate Product Flow
    await page.locator('[data-testid="btn-duplicate-product"]').click();
    await expect(page.locator('[data-testid="modal-duplicate-product"]')).toBeVisible();
    await page.locator('[data-testid="btn-confirm-duplicate"]').click();

    // Wait for redirection to new duplicate product
    await page.waitForURL(/\/admin\/products\/[a-f0-9-]+/, { timeout: 15000 });
    await expect(page.locator('[data-testid="product-editor-title"]')).toContainText("(Copia)");
    await expect(page.locator('[data-testid="badge-product-status"]')).toContainText("Borrador");

    // 12. Lifecycle Transitions: Archive & Restore
    await page.locator('[data-testid="btn-transition-archive"]').click();
    await expect(page.locator('[data-testid="badge-product-status"]')).toContainText("Archivado");

    await page.locator('[data-testid="btn-transition-restore"]').click();
    await expect(page.locator('[data-testid="badge-product-status"]')).toContainText("Borrador");

    // 13. Hard delete safety: Zero hard delete buttons
    await expect(page.locator('button:has-text("Eliminar")')).toHaveCount(0);
    await expect(page.locator('button:has-text("Borrar")')).toHaveCount(0);
  });
});
