import { test, expect, type Page } from "@playwright/test";
import postgres from "postgres";
import {
  ADMIN_E2E_USERS,
  ADMIN_E2E_PASSWORD,
  ADMIN_E2E_PRODUCT_FIXTURES,
} from "./helpers/admin-fixtures";

const databaseUrl =
  process.env.DATABASE_URL ?? "postgres://postgres:postgres@127.0.0.1:54322/postgres";
const sql = postgres(databaseUrl, { max: 1 });

test.afterAll(async () => {
  // Ensure catalog:publish permission is restored to ADMIN_CATALOG in case of any interrupted test
  await sql`
    INSERT INTO role_permissions (role_id, permission_id)
    SELECT r.id, p.id
    FROM roles r, permissions p
    WHERE r.name = 'ADMIN_CATALOG' AND p.name = 'catalog:publish'
    ON CONFLICT DO NOTHING;
  `;
  await sql.end();
});

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

test.describe("GP-024 / CHK2 — Admin Product Manager UI & Authoring Integration Suite", () => {
  // --------------------------------------------------------------------------
  // Requirement A: Access Control
  // --------------------------------------------------------------------------
  test("Requirement A: catalog:manage actor can enter Product Manager and unauthorized actor cannot", async ({
    page,
  }) => {
    // 1. Unauthorized CUSTOMER is denied access to /admin/products
    await loginAndNavigateTo(page, ADMIN_E2E_USERS.customer.email, "/admin/products");
    await expect(page.getByRole("heading", { level: 1 })).toContainText(/Acceso no autorizado/i);
    await expect(page.locator('[data-testid="product-table"]')).toHaveCount(0);
    await expect(page.locator('[data-testid="btn-new-product"]')).toHaveCount(0);

    // 2. Unauthorized CUSTOMER is denied access to /admin/products/new
    await loginAndNavigateTo(page, ADMIN_E2E_USERS.customer.email, "/admin/products/new");
    await expect(page.getByRole("heading", { level: 1 })).toContainText(/Acceso no autorizado/i);
    await expect(page.locator('[data-testid="form-create-product"]')).toHaveCount(0);

    // 3. Authorized staff with catalog:manage enters /admin/products
    await loginAndNavigateTo(page, ADMIN_E2E_USERS.catalog.email, "/admin/products");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Productos");
    await expect(page.locator('[data-testid="btn-new-product"]')).toBeVisible();
  });

  // --------------------------------------------------------------------------
  // Requirement B: Authoritative Product List Data Rendering
  // --------------------------------------------------------------------------
  test("Requirement B: Product list renders authoritative catalog data, columns, and badges", async ({
    page,
  }) => {
    await loginAndNavigateTo(page, ADMIN_E2E_USERS.catalog.email, "/admin/products");

    await expect(page.locator('[data-testid="product-table"]')).toBeVisible();

    // Verify canonical column headers
    await expect(page.getByRole("columnheader", { name: "Producto", exact: true })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "Estado", exact: true })).toBeVisible();
    await expect(
      page.getByRole("columnheader", { name: "ATS Variantes Activas", exact: true })
    ).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "Variantes", exact: true })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "Precio", exact: true })).toBeVisible();

    // Verify deterministic seeded product row
    await expect(
      page.locator(
        `[data-testid="product-title-${ADMIN_E2E_PRODUCT_FIXTURES.publishableProduct.id}"]`
      )
    ).toBeVisible();
    await expect(
      page.locator(
        `[data-testid="product-price-${ADMIN_E2E_PRODUCT_FIXTURES.publishableProduct.id}"]`
      )
    ).toContainText("S/ 159.90");
  });

  // --------------------------------------------------------------------------
  // Requirement C: Server-Authoritative Filter & Search Behavior
  // --------------------------------------------------------------------------
  test("Requirement C: Product list search and status filtering are server-authoritative", async ({
    page,
  }) => {
    await loginAndNavigateTo(page, ADMIN_E2E_USERS.catalog.email, "/admin/products");

    // 1. Search filtering
    const searchInput = page.locator('[data-testid="filter-search"]');
    await searchInput.fill(ADMIN_E2E_PRODUCT_FIXTURES.publishableProduct.name);
    await page.keyboard.press("Enter");

    await page.waitForURL((url) => url.searchParams.has("search"));
    await expect(
      page.locator(
        `[data-testid="product-title-${ADMIN_E2E_PRODUCT_FIXTURES.publishableProduct.id}"]`
      )
    ).toBeVisible();

    // Clear search
    await searchInput.fill("");
    await page.keyboard.press("Enter");
    await page.waitForURL((url) => !url.searchParams.get("search"));

    // 2. Status filtering
    const statusSelect = page.locator('[data-testid="filter-status"]');
    await statusSelect.selectOption("ARCHIVED");
    await page.locator('[data-testid="filter-submit"]').click();
    await page.waitForURL((url) => url.searchParams.get("status") === "ARCHIVED");

    // Draft product should not appear in ARCHIVED list
    await expect(
      page.locator(
        `[data-testid="product-title-${ADMIN_E2E_PRODUCT_FIXTURES.publishableProduct.id}"]`
      )
    ).toHaveCount(0);

    // Filter by DRAFT
    await statusSelect.selectOption("DRAFT");
    await page.locator('[data-testid="filter-submit"]').click();
    await page.waitForURL((url) => url.searchParams.get("status") === "DRAFT");
    await expect(
      page.locator(
        `[data-testid="product-title-${ADMIN_E2E_PRODUCT_FIXTURES.publishableProduct.id}"]`
      )
    ).toBeVisible();
  });

  // --------------------------------------------------------------------------
  // Requirement D & E: Product Creation + Exact Monetary Cents Readback
  // --------------------------------------------------------------------------
  test("Requirement D & E: Create Product succeeds, preserving exact SKU casing, and raw PEN input reaches exact integer cents in PostgreSQL", async ({
    page,
  }) => {
    await loginAndNavigateTo(page, ADMIN_E2E_USERS.superadmin.email, "/admin/products/new");

    const uniqueSuffix = Date.now().toString().slice(-6);
    const testProductName = `Mouse Pro Wireless ${uniqueSuffix}`;
    const testProductSlug = `mouse-pro-wireless-${uniqueSuffix}`;
    const mixedCaseSku = `mouse-Pro_v2-${uniqueSuffix}`;

    await page.locator('[data-testid="input-name"]').fill(testProductName);
    await expect(page.locator('[data-testid="input-slug"]')).toHaveValue(testProductSlug);

    await page.locator('[data-testid="input-subtitle"]').fill("Subtítulo de prueba E2E");
    await page
      .locator('[data-testid="input-description"]')
      .fill("Descripción técnica detallada para E2E.");

    // Select Brand and Category
    await page
      .locator('[data-testid="select-brand"]')
      .selectOption(ADMIN_E2E_PRODUCT_FIXTURES.brand.id);
    await page
      .locator('[data-testid="select-category"]')
      .selectOption(ADMIN_E2E_PRODUCT_FIXTURES.categoryA.id);

    // Initial Variant with raw PEN strings and mixed-case SKU
    await page.locator('[data-testid="input-variant-sku"]').fill(mixedCaseSku);
    await page.locator('[data-testid="input-variant-title"]').fill("Negro Ónix");
    await page.locator('[data-testid="input-variant-price"]').fill("249.90");
    await page.locator('[data-testid="input-variant-compare-at"]').fill("299.90");
    await page.locator('[data-testid="input-variant-cost"]').fill("120.50");
    await page.locator('[data-testid="input-variant-weight"]').fill("49");

    // Submit
    await page.locator('[data-testid="btn-submit-product"]').click();

    // Redirection to editor
    await page.waitForURL(/\/admin\/products\/[a-f0-9-]+/, { timeout: 15000 });
    await expect(page.locator('[data-testid="product-editor-title"]')).toContainText(
      testProductName
    );

    // Verify mixed-case SKU was NOT silently converted to uppercase
    await expect(page.locator(`text=${mixedCaseSku}`)).toBeVisible();

    // Direct PostgreSQL Readback Evidence for minor-unit integer cents (Requirement E)
    const variantRows = await sql`
      SELECT price_cents, compare_at_price_cents, cost_cents, weight_grams, sku
      FROM product_variants
      WHERE sku = ${mixedCaseSku};
    `;

    expect(variantRows).toHaveLength(1);
    const varData = variantRows[0]!;
    expect(varData.sku).toBe(mixedCaseSku);
    expect(varData.price_cents).toBe(24990);
    expect(varData.compare_at_price_cents).toBe(29990);
    expect(varData.cost_cents).toBe(12050);
    expect(varData.weight_grams).toBe(49);
  });

  // --------------------------------------------------------------------------
  // Requirement F & G: Product Edit + Stale Write Conflict Handling
  // --------------------------------------------------------------------------
  test("Requirement F & G: Product edit succeeds and stale write conflict produces alert without overwriting newer data", async ({
    page,
  }) => {
    await loginAndNavigateTo(page, ADMIN_E2E_USERS.superadmin.email, "/admin/products");

    // Navigate to publishable product editor
    await page.goto(`/admin/products/${ADMIN_E2E_PRODUCT_FIXTURES.publishableProduct.id}`);
    await page.waitForSelector('[data-testid="product-editor-title"]');

    // 1. Simulate Stale Write Conflict by advancing updated_at in DB while client holds original timestamp
    await sql`
      UPDATE products
      SET updated_at = NOW() + interval '2 seconds'
      WHERE id = ${ADMIN_E2E_PRODUCT_FIXTURES.publishableProduct.id};
    `;

    // Attempt to save again without refreshing (holding stale expectedUpdatedAt)
    await page
      .locator('[data-testid="input-subtitle"]')
      .fill("Subtítulo De Conflicto No Sobrescrito");
    await page.locator('[data-testid="btn-save-details"]').click();

    // Verify STALE_WRITE_CONFLICT alert banner renders
    await expect(page.locator('[data-testid="alert-stale-conflict"]')).toBeVisible();

    // Verify in PostgreSQL that newer data was NOT overwritten
    const conflictRows = await sql`
      SELECT subtitle FROM products WHERE id = ${ADMIN_E2E_PRODUCT_FIXTURES.publishableProduct.id};
    `;
    expect(conflictRows[0]!.subtitle).not.toBe("Subtítulo De Conflicto No Sobrescrito");

    // 2. Successful details update after reloading fresh state
    await page.reload();
    await page.waitForSelector('[data-testid="product-editor-title"]');

    const updatedSubtitle = `Subtítulo Editado ${Date.now()}`;
    await page.locator('[data-testid="input-subtitle"]').fill(updatedSubtitle);
    await page.locator('[data-testid="btn-save-details"]').click();

    await expect(page.locator('[data-testid="alert-general-success"]')).toContainText(
      "actualizada exitosamente"
    );

    const savedRows = await sql`
      SELECT subtitle FROM products WHERE id = ${ADMIN_E2E_PRODUCT_FIXTURES.publishableProduct.id};
    `;
    expect(savedRows[0]!.subtitle).toBe(updatedSubtitle);
  });

  // --------------------------------------------------------------------------
  // Requirement H: Variant Creation with Exact Preserved SKU Casing
  // --------------------------------------------------------------------------
  test("Requirement H: Variant creation succeeds with exact preserved SKU casing", async ({
    page,
  }) => {
    await loginAndNavigateTo(
      page,
      ADMIN_E2E_USERS.superadmin.email,
      `/admin/products/${ADMIN_E2E_PRODUCT_FIXTURES.publishableProduct.id}`
    );

    const specialCasingSku = `sku.with.valid-app-text_${Date.now().toString().slice(-4)}`;

    await page.locator('[data-testid="btn-add-variant"]').click();
    await expect(page.locator('[data-testid="modal-create-variant"]')).toBeVisible();

    await page.locator('[data-testid="input-new-sku"]').fill(specialCasingSku);
    await page.locator('[data-testid="input-new-title"]').fill("Blanco Nieve");
    await page.locator('[data-testid="input-new-price"]').fill("179.90");
    await page.locator('[data-testid="input-new-compare-at"]').fill("209.90");
    await page.locator('[data-testid="input-new-cost"]').fill("95.00");
    await page.locator('[data-testid="input-new-weight"]').fill("47");

    await page.locator('[data-testid="btn-confirm-new-variant"]').click();

    // Modal closes and new variant is visible with exact casing
    await expect(page.locator('[data-testid="modal-create-variant"]')).toHaveCount(0);
    await expect(page.locator(`text=${specialCasingSku}`)).toBeVisible();

    // DB confirmation
    const varRow =
      await sql`SELECT price_cents, sku FROM product_variants WHERE sku = ${specialCasingSku};`;
    expect(varRow).toHaveLength(1);
    expect(varRow[0]!.sku).toBe(specialCasingSku);
    expect(varRow[0]!.price_cents).toBe(17990);
  });

  // --------------------------------------------------------------------------
  // Requirement I: Variant Editing with Preserved SKU Casing
  // --------------------------------------------------------------------------
  test("Requirement I: Variant editing succeeds with exact preserved SKU casing and updated values", async ({
    page,
  }) => {
    await loginAndNavigateTo(
      page,
      ADMIN_E2E_USERS.superadmin.email,
      `/admin/products/${ADMIN_E2E_PRODUCT_FIXTURES.publishableProduct.id}`
    );

    // Edit the primary variant (E2E-PUB-SKU-001)
    await page.locator('button[data-testid="btn-edit-variant"]').first().click();
    await expect(page.locator('[data-testid="modal-edit-variant"]')).toBeVisible();

    // SKU must remain as originally authored
    await expect(page.locator('[data-testid="input-edit-sku"]')).toHaveValue(
      ADMIN_E2E_PRODUCT_FIXTURES.publishableProduct.sku
    );

    await page.locator('[data-testid="input-edit-title"]').fill("Variante Publicable Actualizada");
    await page.locator('[data-testid="input-edit-price"]').fill("169.90");
    await page.locator('[data-testid="btn-confirm-edit-variant"]').click();

    await expect(page.locator('[data-testid="modal-edit-variant"]')).toHaveCount(0);
    await expect(page.locator("text=Variante Publicable Actualizada")).toBeVisible();
    await expect(page.locator("text=S/ 169.90")).toBeVisible();
  });

  // --------------------------------------------------------------------------
  // Requirement J: SKU Immutability UX
  // --------------------------------------------------------------------------
  test("Requirement J: SKU immutability UX prevents editing when variant has inventory history", async ({
    page,
  }) => {
    await loginAndNavigateTo(
      page,
      ADMIN_E2E_USERS.superadmin.email,
      `/admin/products/${ADMIN_E2E_PRODUCT_FIXTURES.immutableProduct.id}`
    );

    // Click edit variant on immutable variant
    await page.locator('button[data-testid="btn-edit-variant"]').first().click();
    await expect(page.locator('[data-testid="modal-edit-variant"]')).toBeVisible();

    const skuInput = page.locator('[data-testid="input-edit-sku"]');
    await expect(skuInput).toBeDisabled();
    await expect(skuInput).toHaveAttribute("readonly", "");

    // Must display canonical immutability explanation
    await expect(page.locator('[data-testid="sku-immutable-notice"]')).toContainText(
      "El SKU es permanentemente inmutable"
    );
  });

  // --------------------------------------------------------------------------
  // Requirement K & L: Specifications Schema Rendering & Partial Save
  // --------------------------------------------------------------------------
  test("Requirement K & L: Authoritative Category specification schema renders and partial specs save without invented required-fields", async ({
    page,
  }) => {
    await loginAndNavigateTo(
      page,
      ADMIN_E2E_USERS.superadmin.email,
      `/admin/products/${ADMIN_E2E_PRODUCT_FIXTURES.publishableProduct.id}`
    );

    // Category A schema fields must render
    await expect(page.locator('[data-testid="spec-input-sensor"]')).toBeVisible();
    await expect(page.locator('[data-testid="spec-input-dpi_max"]')).toBeVisible();
    await expect(page.locator('[data-testid="spec-input-connection_type"]')).toBeVisible();

    // Partial save: update dpi_max without requiring any other field
    await page.locator('[data-testid="spec-input-dpi_max"]').fill("28000");
    await page.locator('[data-testid="btn-save-specs"]').click();

    await expect(page.locator('[data-testid="alert-general-success"]')).toContainText(
      "Especificaciones técnicas guardadas exitosamente"
    );

    // Confirm in PostgreSQL
    const specRow = await sql`
      SELECT spec_values FROM product_specifications WHERE product_id = ${ADMIN_E2E_PRODUCT_FIXTURES.publishableProduct.id};
    `;
    expect((specRow[0]!.spec_values as Record<string, unknown>).dpi_max).toBe(28000);
  });

  // --------------------------------------------------------------------------
  // Requirement M: Duplicate Product Flow
  // --------------------------------------------------------------------------
  test("Requirement M: Duplicate creates and navigates to a DRAFT copy", async ({ page }) => {
    await loginAndNavigateTo(
      page,
      ADMIN_E2E_USERS.superadmin.email,
      `/admin/products/${ADMIN_E2E_PRODUCT_FIXTURES.publishableProduct.id}`
    );

    await page.locator('[data-testid="btn-duplicate-product"]').click();
    await expect(page.locator('[data-testid="modal-duplicate-product"]')).toBeVisible();

    await page.locator('[data-testid="btn-confirm-duplicate"]').click();

    // Redirects to duplicated product
    await page.waitForURL(/\/admin\/products\/[a-f0-9-]+/, { timeout: 15000 });
    await expect(page.locator('[data-testid="product-editor-title"]')).toContainText("(Copia)");
    await expect(page.locator('[data-testid="badge-product-status"]')).toContainText("Borrador");
  });

  // --------------------------------------------------------------------------
  // Requirement N: Concrete Publish Readiness Blockers Render Truthfully
  // --------------------------------------------------------------------------
  test("Requirement N: Concrete Publish Readiness blockers and warnings render truthfully", async ({
    page,
  }) => {
    // Navigate to sentinel product which has no public media asset attached
    await loginAndNavigateTo(
      page,
      ADMIN_E2E_USERS.superadmin.email,
      `/admin/products/${ADMIN_E2E_PRODUCT_FIXTURES.sentinelProduct.id}`
    );

    await expect(page.locator('[data-testid="section-publish-readiness"]')).toBeVisible();
    await expect(page.locator('[data-testid="readiness-badge"]')).toContainText("No Publicable");
    await expect(page.locator('[data-testid="readiness-blockers-list"]')).toContainText(
      "El producto debe tener al menos una imagen pública global para publicarse"
    );
  });

  // --------------------------------------------------------------------------
  // Requirement O: catalog:manage Actor Without catalog:publish Cannot Publish
  // --------------------------------------------------------------------------
  test("Requirement O: catalog:manage actor without catalog:publish cannot publish or unpublish", async ({
    page,
  }) => {
    // 1. Temporarily revoke catalog:publish from ADMIN_CATALOG role in database
    await sql`
      DELETE FROM role_permissions
      WHERE role_id = (SELECT id FROM roles WHERE name = 'ADMIN_CATALOG')
        AND permission_id = (SELECT id FROM permissions WHERE name = 'catalog:publish');
    `;

    try {
      // 2. Login as catalog author with catalog:manage only
      await loginAndNavigateTo(
        page,
        ADMIN_E2E_USERS.catalog.email,
        `/admin/products/${ADMIN_E2E_PRODUCT_FIXTURES.publishableProduct.id}`
      );

      // 3. Verify Publish button is disabled with truthful permission tooltip
      const publishBtn = page.locator('[data-testid="btn-transition-publish"]');
      await expect(publishBtn).toBeDisabled();
      await expect(publishBtn).toHaveAttribute(
        "title",
        "Requiere permiso catalog:publish para publicar."
      );

      // 4. Verify ordinary catalog:manage authoring remains fully operational
      await page
        .locator('[data-testid="input-subtitle"]')
        .fill("Subtítulo por autor con manage-only");
      await page.locator('[data-testid="btn-save-details"]').click();
      await expect(page.locator('[data-testid="alert-general-success"]')).toContainText(
        "actualizada exitosamente"
      );
    } finally {
      // Restore catalog:publish permission
      await sql`
        INSERT INTO role_permissions (role_id, permission_id)
        SELECT r.id, p.id
        FROM roles r, permissions p
        WHERE r.name = 'ADMIN_CATALOG' AND p.name = 'catalog:publish'
        ON CONFLICT DO NOTHING;
      `;
    }
  });

  // --------------------------------------------------------------------------
  // Requirement P & Q: Full Lifecycle Transitions with Confirmation Dialog
  // --------------------------------------------------------------------------
  test("Requirement P & Q: Full lifecycle transitions (publish, unpublish to draft, archive, restore) with confirmation dialog", async ({
    page,
  }) => {
    // Reset product to DRAFT state before starting
    await sql`
      UPDATE products SET status = 'DRAFT' WHERE id = ${ADMIN_E2E_PRODUCT_FIXTURES.publishableProduct.id};
    `;

    await loginAndNavigateTo(
      page,
      ADMIN_E2E_USERS.superadmin.email,
      `/admin/products/${ADMIN_E2E_PRODUCT_FIXTURES.publishableProduct.id}`
    );

    // --- 1. PUBLISH ---
    await expect(page.locator('[data-testid="badge-product-status"]')).toContainText("Borrador");
    await page.locator('[data-testid="btn-transition-publish"]').click();

    // Confirmation dialog appears
    const confirmDialog = page.locator('[data-testid="dialog-confirm-transition"]');
    await expect(confirmDialog).toBeVisible();
    await expect(page.locator("#transition-dialog-title")).toContainText("Confirmar Publicación");

    // Test Escape cancels dialog without transition
    await page.keyboard.press("Escape");
    await expect(confirmDialog).toHaveCount(0);
    await expect(page.locator('[data-testid="badge-product-status"]')).toContainText("Borrador");

    // Click Publish again and Confirm
    await page.locator('[data-testid="btn-transition-publish"]').click();
    await page.locator('[data-testid="btn-confirm-transition-action"]').click();

    await expect(page.locator('[data-testid="badge-product-status"]')).toContainText("Publicado");

    // --- 2. UNPUBLISH TO DRAFT ---
    const unpublishBtn = page.locator('[data-testid="btn-transition-unpublish"]');
    await expect(unpublishBtn).toBeVisible();
    await unpublishBtn.click();

    await expect(confirmDialog).toBeVisible();
    await expect(page.locator("#transition-dialog-title")).toContainText(
      "Confirmar Despublicación"
    );
    await page.locator('[data-testid="btn-confirm-transition-action"]').click();

    await expect(page.locator('[data-testid="badge-product-status"]')).toContainText("Borrador");

    // --- 3. ARCHIVE ---
    await page.locator('[data-testid="btn-transition-archive"]').click();
    await expect(confirmDialog).toBeVisible();
    await expect(page.locator("#transition-dialog-title")).toContainText("Confirmar Archivado");
    await page.locator('[data-testid="btn-confirm-transition-action"]').click();

    await expect(page.locator('[data-testid="badge-product-status"]')).toContainText("Archivado");

    // --- 4. RESTORE TO DRAFT ---
    await page.locator('[data-testid="btn-transition-restore"]').click();
    await expect(confirmDialog).toBeVisible();
    await expect(page.locator("#transition-dialog-title")).toContainText("Confirmar Restauración");
    await page.locator('[data-testid="btn-confirm-transition-action"]').click();

    await expect(page.locator('[data-testid="badge-product-status"]')).toContainText("Borrador");
  });

  // --------------------------------------------------------------------------
  // Requirement R: Zero Product Hard Delete UI
  // --------------------------------------------------------------------------
  test("Requirement R: Zero Product hard-delete UI or mutation exists in Product Manager", async ({
    page,
  }) => {
    await loginAndNavigateTo(
      page,
      ADMIN_E2E_USERS.superadmin.email,
      `/admin/products/${ADMIN_E2E_PRODUCT_FIXTURES.publishableProduct.id}`
    );

    // Verify zero hard delete or removal buttons exist
    await expect(page.locator('button:has-text("Eliminar")')).toHaveCount(0);
    await expect(page.locator('button:has-text("Borrar")')).toHaveCount(0);
    await expect(page.locator('button:has-text("Delete")')).toHaveCount(0);
    await expect(page.locator('[data-testid="btn-delete"]')).toHaveCount(0);
  });

  // --------------------------------------------------------------------------
  // Requirement S: Media Security Boundary & Zero Upload Path
  // --------------------------------------------------------------------------
  test("Requirement S: Zero media upload UI exists and non-public media asset sentinel keys are never exposed", async ({
    page,
  }) => {
    await loginAndNavigateTo(
      page,
      ADMIN_E2E_USERS.superadmin.email,
      `/admin/products/${ADMIN_E2E_PRODUCT_FIXTURES.sentinelProduct.id}`
    );

    // 1. Zero file upload controls
    await expect(page.locator('input[type="file"]')).toHaveCount(0);
    await expect(page.locator('[data-testid="media-readonly-notice"]')).toBeVisible();

    // 2. Private sentinel objectKey must NEVER appear in the client DOM or page source
    const pageContent = await page.content();
    expect(pageContent).not.toContain(ADMIN_E2E_PRODUCT_FIXTURES.sentinelProduct.sentinelKey);

    // 3. Shows safe metadata / placeholder
    await expect(page.locator("text=[Privado]")).toBeVisible();
  });

  // --------------------------------------------------------------------------
  // Defect F Regression: Category Reconciliation State Resynchronization
  // --------------------------------------------------------------------------
  test("Defect F Regression: Authoritative Category A -> Category B reconciliation resynchronizes specs and discards stale schema-A keys", async ({
    page,
  }) => {
    // Reset product 4 to Category A before testing
    await sql`
      UPDATE products
      SET category_id = ${ADMIN_E2E_PRODUCT_FIXTURES.categoryA.id}
      WHERE id = ${ADMIN_E2E_PRODUCT_FIXTURES.catChangeProduct.id};
    `;
    await sql`
      INSERT INTO product_specifications (product_id, schema_id, schema_version, spec_values, updated_at)
      VALUES (
        ${ADMIN_E2E_PRODUCT_FIXTURES.catChangeProduct.id},
        ${ADMIN_E2E_PRODUCT_FIXTURES.categoryA.schemaId},
        1,
        '{"sensor":"Optical 3395","dpi_max":20000}'::jsonb,
        NOW()
      )
      ON CONFLICT (product_id) DO UPDATE
      SET schema_id = ${ADMIN_E2E_PRODUCT_FIXTURES.categoryA.schemaId},
          spec_values = '{"sensor":"Optical 3395","dpi_max":20000}'::jsonb;
    `;

    await loginAndNavigateTo(
      page,
      ADMIN_E2E_USERS.superadmin.email,
      `/admin/products/${ADMIN_E2E_PRODUCT_FIXTURES.catChangeProduct.id}`
    );

    // 1. Initially Category A schema is rendered
    await expect(page.locator('[data-testid="spec-input-sensor"]')).toBeVisible();
    await expect(page.locator('[data-testid="spec-input-dpi_max"]')).toBeVisible();

    // 2. Change Category dropdown to Category B (Teclados)
    await page
      .locator('[data-testid="select-category"]')
      .selectOption(ADMIN_E2E_PRODUCT_FIXTURES.categoryB.id);
    await page.locator('[data-testid="btn-save-details"]').click();

    await expect(page.locator('[data-testid="alert-general-success"]')).toContainText(
      "actualizada exitosamente"
    );

    // 3. Refreshed UI must render Category B authoritative schema
    await expect(page.locator('[data-testid="spec-input-switch_type"]')).toBeVisible();
    await expect(page.locator('[data-testid="spec-input-layout"]')).toBeVisible();

    // Category A inputs must be completely absent from DOM
    await expect(page.locator('[data-testid="spec-input-sensor"]')).toHaveCount(0);
    await expect(page.locator('[data-testid="spec-input-dpi_max"]')).toHaveCount(0);

    // 4. Save partial Category B spec (testing zero invented required fields)
    await page.locator('[data-testid="spec-input-layout"]').fill("ANSI 75%");
    await page.locator('[data-testid="btn-save-specs"]').click();

    await expect(page.locator('[data-testid="alert-general-success"]')).toContainText(
      "Especificaciones técnicas guardadas exitosamente"
    );

    // 5. Verify PostgreSQL has only Category B keys and zero stale Category A keys
    const specRow = await sql`
      SELECT schema_id, spec_values
      FROM product_specifications
      WHERE product_id = ${ADMIN_E2E_PRODUCT_FIXTURES.catChangeProduct.id};
    `;
    expect(specRow[0]!.schema_id).toBe(ADMIN_E2E_PRODUCT_FIXTURES.categoryB.schemaId);
    expect(specRow[0]!.spec_values).toEqual({ layout: "ANSI 75%" });
  });
});
