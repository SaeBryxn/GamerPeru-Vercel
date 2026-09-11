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
    await expect(
      page.locator('[data-testid="table-variants"]').locator(`text=${mixedCaseSku}`)
    ).toBeVisible();

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
    await expect(
      page.locator('[data-testid="table-variants"]').locator(`text=${specialCasingSku}`)
    ).toBeVisible();

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
    await expect(
      page.locator('[data-testid="table-variants"]').locator("text=Variante Publicable Actualizada")
    ).toBeVisible();
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
  // Requirement O: catalog:manage Actor Without catalog:publish Cannot Publish, Unpublish or Archive
  // --------------------------------------------------------------------------
  test("Requirement O (Draft): catalog:manage actor without catalog:publish cannot transition draft to published", async ({
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

  test("Requirement O (Published): catalog:manage actor without catalog:publish cannot unpublish or archive published product", async ({
    page,
  }) => {
    // 1. Ensure product is PUBLISHED
    await sql`
      UPDATE products SET status = 'PUBLISHED' WHERE id = ${ADMIN_E2E_PRODUCT_FIXTURES.publishableProduct.id};
    `;

    // 2. Temporarily revoke catalog:publish from ADMIN_CATALOG role
    await sql`
      DELETE FROM role_permissions
      WHERE role_id = (SELECT id FROM roles WHERE name = 'ADMIN_CATALOG')
        AND permission_id = (SELECT id FROM permissions WHERE name = 'catalog:publish');
    `;

    try {
      // 3. Login as catalog author with catalog:manage only
      await loginAndNavigateTo(
        page,
        ADMIN_E2E_USERS.catalog.email,
        `/admin/products/${ADMIN_E2E_PRODUCT_FIXTURES.publishableProduct.id}`
      );

      await expect(page.locator('[data-testid="badge-product-status"]')).toContainText("Publicado");

      // 4. Assert Unpublish control is disabled
      const unpublishBtn = page.locator('[data-testid="btn-transition-unpublish"]');
      await expect(unpublishBtn).toBeVisible();
      await expect(unpublishBtn).toBeDisabled();
      await expect(unpublishBtn).toHaveAttribute(
        "title",
        "Despublicar un producto requiere catalog:publish."
      );

      // 5. Assert Archive control is disabled
      const archiveBtn = page.locator('[data-testid="btn-transition-archive"]');
      await expect(archiveBtn).toBeVisible();
      await expect(archiveBtn).toBeDisabled();
      await expect(archiveBtn).toHaveAttribute(
        "title",
        "Archivar un producto publicado requiere catalog:publish."
      );

      // 6. Ordinary catalog:manage authoring remains operational
      await page
        .locator('[data-testid="input-subtitle"]')
        .fill("Subtítulo por autor con manage-only en publicado");
      await page.locator('[data-testid="btn-save-details"]').click();
      await expect(page.locator('[data-testid="alert-general-success"]')).toContainText(
        "actualizada exitosamente"
      );
    } finally {
      // 7. Always restore catalog:publish permission
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
  // Defect C Regression: Lifecycle Dialog Focus Containment & Keyboard Navigation
  // --------------------------------------------------------------------------
  test("Defect C Regression: Lifecycle confirmation dialog keyboard focus containment (Tab wrap, Shift+Tab wrap, Escape, focus restoration)", async ({
    page,
  }) => {
    // Reset product to DRAFT state
    await sql`
      UPDATE products SET status = 'DRAFT' WHERE id = ${ADMIN_E2E_PRODUCT_FIXTURES.publishableProduct.id};
    `;

    await loginAndNavigateTo(
      page,
      ADMIN_E2E_USERS.superadmin.email,
      `/admin/products/${ADMIN_E2E_PRODUCT_FIXTURES.publishableProduct.id}`
    );

    const publishTrigger = page.locator('[data-testid="btn-transition-publish"]');
    await expect(publishTrigger).toBeVisible();

    // 1. Click trigger to open confirmation dialog
    await publishTrigger.click();

    const dialog = page.locator('[data-testid="dialog-confirm-transition"]');
    await expect(dialog).toBeVisible();

    // Wait for initial focus inside dialog (Cancel button)
    const cancelBtn = page.locator('[data-testid="btn-cancel-transition-action"]');
    const confirmBtn = page.locator('[data-testid="btn-confirm-transition-action"]');
    await expect(cancelBtn).toBeFocused();

    // 2. Tab moves forward to Confirm button
    await page.keyboard.press("Tab");
    await expect(confirmBtn).toBeFocused();

    // 3. Tab from last focusable element wraps back to first element (Cancel button)
    await page.keyboard.press("Tab");
    await expect(cancelBtn).toBeFocused();

    // 4. Shift+Tab from first element wraps to last element (Confirm button)
    await page.keyboard.press("Shift+Tab");
    await expect(confirmBtn).toBeFocused();

    // 5. Shift+Tab again moves backwards to Cancel button
    await page.keyboard.press("Shift+Tab");
    await expect(cancelBtn).toBeFocused();

    // 6. Escape closes dialog and restores focus to triggering button
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(publishTrigger).toBeFocused();

    // 7. Re-open and verify confirmation still performs the transition successfully
    await publishTrigger.click();
    await expect(dialog).toBeVisible();
    await confirmBtn.click();
    await expect(page.locator('[data-testid="badge-product-status"]')).toContainText("Publicado");
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
  // Requirement S: Media Security Boundary, Gallery, Operations & Accessibility (CHK3-BR1)
  // --------------------------------------------------------------------------
  async function resetPublishableProductMedia() {
    await sql`
      UPDATE products
      SET primary_media_id = ${ADMIN_E2E_PRODUCT_FIXTURES.publishableProduct.mediaAssetId},
          updated_at = NOW()
      WHERE id = ${ADMIN_E2E_PRODUCT_FIXTURES.publishableProduct.id};
    `;

    await sql`
      UPDATE media_assets
      SET alt_text = 'Mouse Blanco Principal'
      WHERE id = ${ADMIN_E2E_PRODUCT_FIXTURES.publishableProduct.mediaAssetId};
    `;

    await sql`
      DELETE FROM product_media
      WHERE product_id = ${ADMIN_E2E_PRODUCT_FIXTURES.publishableProduct.id};
    `;

    await sql`
      INSERT INTO product_media (id, product_id, media_asset_id, variant_id, display_order, created_at)
      VALUES
        (
          ${ADMIN_E2E_PRODUCT_FIXTURES.publishableProduct.productMediaId1},
          ${ADMIN_E2E_PRODUCT_FIXTURES.publishableProduct.id},
          ${ADMIN_E2E_PRODUCT_FIXTURES.publishableProduct.mediaAssetId},
          NULL,
          0,
          NOW()
        ),
        (
          ${ADMIN_E2E_PRODUCT_FIXTURES.publishableProduct.productMediaId2},
          ${ADMIN_E2E_PRODUCT_FIXTURES.publishableProduct.id},
          ${ADMIN_E2E_PRODUCT_FIXTURES.publishableProduct.mediaAsset2Id},
          NULL,
          1,
          NOW()
        ),
        (
          ${ADMIN_E2E_PRODUCT_FIXTURES.publishableProduct.productMediaId3},
          ${ADMIN_E2E_PRODUCT_FIXTURES.publishableProduct.id},
          ${ADMIN_E2E_PRODUCT_FIXTURES.publishableProduct.mediaAsset3Id},
          ${ADMIN_E2E_PRODUCT_FIXTURES.publishableProduct.variantId},
          2,
          NOW()
        );
    `;
  }

  test("Requirement S1: Media Security Boundary — private sentinel keys are never exposed and private assets render safe placeholders", async ({
    page,
  }) => {
    await loginAndNavigateTo(
      page,
      ADMIN_E2E_USERS.superadmin.email,
      `/admin/products/${ADMIN_E2E_PRODUCT_FIXTURES.sentinelProduct.id}`
    );

    // 1. Media Authoring controls are present
    await expect(page.locator('[data-testid="section-media"]')).toBeVisible();
    await expect(page.locator('[data-testid="media-upload-area"]')).toBeVisible();
    await expect(page.locator('[data-testid="media-upload-limits"]')).toContainText("10 MiB");
    await expect(page.locator('input[data-testid="input-media-file"]')).toBeVisible();
    await expect(page.locator('[data-testid="select-media-upload-variant"]')).toBeVisible();
    await expect(page.locator('[data-testid="btn-upload-media"]')).toBeVisible();

    // 2. Private sentinel objectKey must NEVER appear in client DOM or page source
    const pageContent = await page.content();
    expect(pageContent).not.toContain(ADMIN_E2E_PRODUCT_FIXTURES.sentinelProduct.sentinelKey);

    // 3. Shows safe metadata / placeholder for non-public media
    await expect(page.locator("text=[Privado]").first()).toBeVisible();

    // 4. Zero permanent deletion controls exist across the entire media section
    await expect(page.locator('[data-testid^="btn-delete-media"]')).toHaveCount(0);
  });

  test("Requirement S2: Media Gallery UI — renders PUBLIC_MEDIA previews, Global badge, Variant badge, and Primary badge", async ({
    page,
  }) => {
    await resetPublishableProductMedia();

    await loginAndNavigateTo(
      page,
      ADMIN_E2E_USERS.superadmin.email,
      `/admin/products/${ADMIN_E2E_PRODUCT_FIXTURES.publishableProduct.id}`
    );

    const card1 = page.locator(
      `[data-testid="media-card-${ADMIN_E2E_PRODUCT_FIXTURES.publishableProduct.productMediaId1}"]`
    );
    const card2 = page.locator(
      `[data-testid="media-card-${ADMIN_E2E_PRODUCT_FIXTURES.publishableProduct.productMediaId2}"]`
    );
    const card3 = page.locator(
      `[data-testid="media-card-${ADMIN_E2E_PRODUCT_FIXTURES.publishableProduct.productMediaId3}"]`
    );

    await expect(card1).toBeVisible();
    await expect(card2).toBeVisible();
    await expect(card3).toBeVisible();

    // PUBLIC_MEDIA previews render img elements
    await expect(card1.locator("img")).toBeVisible();
    await expect(card2.locator("img")).toBeVisible();
    await expect(card3.locator("img")).toBeVisible();

    // Card 1: Primary + Global
    await expect(
      page.locator(
        `[data-testid="badge-primary-${ADMIN_E2E_PRODUCT_FIXTURES.publishableProduct.productMediaId1}"]`
      )
    ).toContainText("Principal");
    await expect(
      page.locator(
        `[data-testid="badge-global-${ADMIN_E2E_PRODUCT_FIXTURES.publishableProduct.productMediaId1}"]`
      )
    ).toContainText("Global");

    // Card 2: Global (non-primary)
    await expect(
      page.locator(
        `[data-testid="badge-global-${ADMIN_E2E_PRODUCT_FIXTURES.publishableProduct.productMediaId2}"]`
      )
    ).toContainText("Global");
    await expect(
      page.locator(
        `[data-testid="badge-primary-${ADMIN_E2E_PRODUCT_FIXTURES.publishableProduct.productMediaId2}"]`
      )
    ).toHaveCount(0);

    // Card 3: Variant-scoped
    await expect(
      page.locator(
        `[data-testid="badge-variant-${ADMIN_E2E_PRODUCT_FIXTURES.publishableProduct.productMediaId3}"]`
      )
    ).toContainText("Variante");
    await expect(
      page.locator(
        `[data-testid="badge-primary-${ADMIN_E2E_PRODUCT_FIXTURES.publishableProduct.productMediaId3}"]`
      )
    ).toHaveCount(0);
  });

  test("Requirement S3: Set Primary Media — disabled for Variant media, enabled for Global media, and mutates authoritative state", async ({
    page,
  }) => {
    await resetPublishableProductMedia();

    await loginAndNavigateTo(
      page,
      ADMIN_E2E_USERS.superadmin.email,
      `/admin/products/${ADMIN_E2E_PRODUCT_FIXTURES.publishableProduct.id}`
    );

    // 1. Variant-specific media button is disabled
    const varSetPrimaryBtn = page.locator(
      `[data-testid="btn-set-primary-${ADMIN_E2E_PRODUCT_FIXTURES.publishableProduct.productMediaId3}"]`
    );
    await expect(varSetPrimaryBtn).toBeDisabled();
    await expect(varSetPrimaryBtn).toHaveAttribute(
      "title",
      "Las imágenes de variante no pueden ser asignadas como principal global"
    );

    // 2. Global secondary media button is enabled
    const globalSetPrimaryBtn = page.locator(
      `[data-testid="btn-set-primary-${ADMIN_E2E_PRODUCT_FIXTURES.publishableProduct.productMediaId2}"]`
    );
    await expect(globalSetPrimaryBtn).toBeEnabled();
    await expect(globalSetPrimaryBtn).toContainText("Hacer Principal");

    // 3. Click Set Primary and verify authoritative persistence
    await globalSetPrimaryBtn.click();
    await expect(page.locator('[data-testid="media-op-success"]')).toContainText(
      "Imagen principal actualizada exitosamente"
    );

    // Database verification: primary_media_id is now mediaAsset2Id
    const productRow = await sql`
      SELECT primary_media_id
      FROM products
      WHERE id = ${ADMIN_E2E_PRODUCT_FIXTURES.publishableProduct.id};
    `;
    expect(productRow[0]!.primary_media_id).toBe(
      ADMIN_E2E_PRODUCT_FIXTURES.publishableProduct.mediaAsset2Id
    );

    // UI verification: Card 2 now shows Primary badge
    await expect(
      page.locator(
        `[data-testid="badge-primary-${ADMIN_E2E_PRODUCT_FIXTURES.publishableProduct.productMediaId2}"]`
      )
    ).toBeVisible();
  });

  test("Requirement S4: Alt-Text Editor — opens modal with disclosure and updates authoritative MediaAsset alt_text", async ({
    page,
  }) => {
    await resetPublishableProductMedia();

    await loginAndNavigateTo(
      page,
      ADMIN_E2E_USERS.superadmin.email,
      `/admin/products/${ADMIN_E2E_PRODUCT_FIXTURES.publishableProduct.id}`
    );

    // 1. Open Alt-Text modal
    const altBtn = page.locator(
      `[data-testid="btn-edit-alt-${ADMIN_E2E_PRODUCT_FIXTURES.publishableProduct.productMediaId1}"]`
    );
    await altBtn.click();

    const modal = page.locator('[data-testid="modal-alt-text"]');
    await expect(modal).toBeVisible();
    await expect(page.locator("#modal-alt-title")).toContainText("Editar Texto Alternativo");

    // 2. Global-impact disclosure notice is visible
    const notice = page.locator('[data-testid="notice-shared-alt-text"]');
    await expect(notice).toBeVisible();
    await expect(notice).toContainText("Al actualizarse a nivel de MediaAsset, se comparte");

    // 3. Fill and save new alt text
    const newAltText = "Mouse Gamer Ergonomico Blanco E2E";
    const altInput = page.locator('[data-testid="input-media-alt-text"]');
    await altInput.fill(newAltText);
    await page.locator('[data-testid="btn-save-alt-text"]').click();

    // Modal closes and success notification appears
    await expect(modal).not.toBeVisible();
    await expect(page.locator('[data-testid="media-op-success"]')).toContainText(
      "Texto alternativo actualizado exitosamente"
    );

    // Database verification: MediaAsset authoritative alt_text updated
    const assetRow = await sql`
      SELECT alt_text
      FROM media_assets
      WHERE id = ${ADMIN_E2E_PRODUCT_FIXTURES.publishableProduct.mediaAssetId};
    `;
    expect(assetRow[0]!.alt_text).toBe(newAltText);
  });

  test("Requirement S5: Media Reordering — accessible controls update display_order and persist authoritatively", async ({
    page,
  }) => {
    await resetPublishableProductMedia();

    await loginAndNavigateTo(
      page,
      ADMIN_E2E_USERS.superadmin.email,
      `/admin/products/${ADMIN_E2E_PRODUCT_FIXTURES.publishableProduct.id}`
    );

    // 1. Verify accessible names on reorder buttons
    const moveDownBtn1 = page.locator(
      `[data-testid="btn-move-down-${ADMIN_E2E_PRODUCT_FIXTURES.publishableProduct.productMediaId1}"]`
    );
    const moveUpBtn1 = page.locator(
      `[data-testid="btn-move-up-${ADMIN_E2E_PRODUCT_FIXTURES.publishableProduct.productMediaId1}"]`
    );
    await expect(moveDownBtn1).toHaveAttribute("aria-label", "Mover hacia abajo");
    await expect(moveUpBtn1).toHaveAttribute("aria-label", "Mover hacia arriba");
    await expect(moveUpBtn1).toBeDisabled(); // First item cannot move up

    // 2. Move item 1 down
    await moveDownBtn1.click();
    await expect(page.locator('[data-testid="media-op-success"]')).toContainText(
      "Orden de medios actualizado exitosamente"
    );

    // 3. Database verification: display_order updated atomically
    const orderRows = await sql`
      SELECT id, display_order
      FROM product_media
      WHERE product_id = ${ADMIN_E2E_PRODUCT_FIXTURES.publishableProduct.id}
      ORDER BY display_order ASC;
    `;
    expect(orderRows[0]!.id).toBe(ADMIN_E2E_PRODUCT_FIXTURES.publishableProduct.productMediaId2);
    expect(orderRows[0]!.display_order).toBe(0);
    expect(orderRows[1]!.id).toBe(ADMIN_E2E_PRODUCT_FIXTURES.publishableProduct.productMediaId1);
    expect(orderRows[1]!.display_order).toBe(1);
  });

  test("Requirement S6: Variant Reassignment — Global to Variant, Variant to Global, and primary-invalid blocked", async ({
    page,
  }) => {
    await resetPublishableProductMedia();

    await loginAndNavigateTo(
      page,
      ADMIN_E2E_USERS.superadmin.email,
      `/admin/products/${ADMIN_E2E_PRODUCT_FIXTURES.publishableProduct.id}`
    );

    // --- Sub-case A: Global -> Variant succeeds ---
    const reassignBtn2 = page.locator(
      `[data-testid="btn-reassign-variant-${ADMIN_E2E_PRODUCT_FIXTURES.publishableProduct.productMediaId2}"]`
    );
    await reassignBtn2.click();

    const varModal = page.locator('[data-testid="modal-reassign-variant"]');
    await expect(varModal).toBeVisible();

    const selectVar = page.locator('[data-testid="select-media-variant"]');
    await selectVar.selectOption(ADMIN_E2E_PRODUCT_FIXTURES.publishableProduct.variantId);
    await page.locator('[data-testid="btn-save-reassign-variant"]').click();

    await expect(varModal).not.toBeVisible();
    await expect(page.locator('[data-testid="media-op-success"]')).toContainText(
      "Asociación de variante actualizada exitosamente"
    );

    const pm2Row = await sql`
      SELECT variant_id
      FROM product_media
      WHERE id = ${ADMIN_E2E_PRODUCT_FIXTURES.publishableProduct.productMediaId2};
    `;
    expect(pm2Row[0]!.variant_id).toBe(ADMIN_E2E_PRODUCT_FIXTURES.publishableProduct.variantId);

    // --- Sub-case B: Variant -> Global succeeds ---
    const reassignBtn3 = page.locator(
      `[data-testid="btn-reassign-variant-${ADMIN_E2E_PRODUCT_FIXTURES.publishableProduct.productMediaId3}"]`
    );
    await reassignBtn3.click();
    await expect(varModal).toBeVisible();

    await selectVar.selectOption("");
    await page.locator('[data-testid="btn-save-reassign-variant"]').click();

    await expect(varModal).not.toBeVisible();
    await expect(page.locator('[data-testid="media-op-success"]')).toContainText(
      "Asociación de variante actualizada exitosamente"
    );

    const pm3Row = await sql`
      SELECT variant_id
      FROM product_media
      WHERE id = ${ADMIN_E2E_PRODUCT_FIXTURES.publishableProduct.productMediaId3};
    `;
    expect(pm3Row[0]!.variant_id).toBeNull();

    // --- Sub-case C: Primary-invalid reassignment is blocked ---
    const reassignBtn1 = page.locator(
      `[data-testid="btn-reassign-variant-${ADMIN_E2E_PRODUCT_FIXTURES.publishableProduct.productMediaId1}"]`
    );
    await reassignBtn1.click();
    await expect(varModal).toBeVisible();

    await selectVar.selectOption(ADMIN_E2E_PRODUCT_FIXTURES.publishableProduct.variantId);

    // Warning is visible inside modal
    const warningNotice = page.locator('[data-testid="variant-primary-warning"]');
    await expect(warningNotice).toBeVisible();
    await expect(warningNotice).toContainText(
      "Esta imagen es la imagen principal actual del producto"
    );

    await page.locator('[data-testid="btn-save-reassign-variant"]').click();

    // Invariant check rejects and shows error
    await expect(page.locator('[data-testid="reassign-variant-error"]')).toBeVisible();

    // Database check: variant_id remains NULL (unchanged)
    const pm1Row = await sql`
      SELECT variant_id
      FROM product_media
      WHERE id = ${ADMIN_E2E_PRODUCT_FIXTURES.publishableProduct.productMediaId1};
    `;
    expect(pm1Row[0]!.variant_id).toBeNull();

    // Cancel to close modal
    await page.locator('[data-testid="btn-cancel-reassign-variant"]').click();
    await expect(varModal).not.toBeVisible();
  });

  test("Requirement S7: Authorization — unauthorized actor without catalog:manage cannot access Product media manager", async ({
    page,
  }) => {
    await loginAndNavigateTo(
      page,
      ADMIN_E2E_USERS.norole.email,
      `/admin/products/${ADMIN_E2E_PRODUCT_FIXTURES.publishableProduct.id}`
    );

    // Forbidden surface displayed
    await expect(page.getByRole("heading", { level: 1 })).toContainText(/Acceso no autorizado/i);

    // Media section is completely absent
    await expect(page.locator('[data-testid="section-media"]')).toHaveCount(0);
    await expect(page.locator('[data-testid="media-upload-area"]')).toHaveCount(0);
  });

  test("Requirement S8: Upload advisory, accept attribute, client-side >10 MiB rejection, and zero deletion controls", async ({
    page,
  }) => {
    await loginAndNavigateTo(
      page,
      ADMIN_E2E_USERS.superadmin.email,
      `/admin/products/${ADMIN_E2E_PRODUCT_FIXTURES.publishableProduct.id}`
    );

    // 1. Input accept attribute contains exactly intended MIME types
    const fileInput = page.locator('input[data-testid="input-media-file"]');
    await expect(fileInput).toHaveAttribute("accept", "image/jpeg,image/png,image/webp,image/avif");

    // 2. Client-side rejection of > 10 MiB file (10,485,761 bytes)
    const oversizedBuffer = Buffer.alloc(10485761);
    await fileInput.setInputFiles({
      name: "oversized.png",
      mimeType: "image/png",
      buffer: oversizedBuffer,
    });

    // Advisory error is visible and has role="alert" / aria-live="assertive"
    const clientError = page.locator('[data-testid="media-client-error"]');
    await expect(clientError).toBeVisible();
    await expect(clientError).toContainText("10 MiB");
    await expect(clientError).toHaveAttribute("role", "alert");
    await expect(clientError).toHaveAttribute("aria-live", "assertive");

    // Upload button remains disabled
    const uploadBtn = page.locator('[data-testid="btn-upload-media"]');
    await expect(uploadBtn).toBeDisabled();

    // 3. Zero permanent deletion controls across entire page
    await expect(page.locator('[data-testid^="btn-delete-media"]')).toHaveCount(0);
    await expect(page.locator('button:has-text("Eliminar Imagen")')).toHaveCount(0);
    await expect(page.locator('button:has-text("Delete Image")')).toHaveCount(0);
  });

  test("Requirement S9: Modal Accessibility — Accessible titles, focus containment, and Escape key dismissal", async ({
    page,
  }) => {
    await loginAndNavigateTo(
      page,
      ADMIN_E2E_USERS.superadmin.email,
      `/admin/products/${ADMIN_E2E_PRODUCT_FIXTURES.publishableProduct.id}`
    );

    // --- Alt-Text Modal Accessibility ---
    const altBtn = page.locator(
      `[data-testid="btn-edit-alt-${ADMIN_E2E_PRODUCT_FIXTURES.publishableProduct.productMediaId1}"]`
    );
    await altBtn.click();

    const altModal = page.locator('[data-testid="modal-alt-text"]');
    await expect(altModal).toBeVisible();
    await expect(page.locator("#modal-alt-title")).toBeVisible();

    // Escape closes modal and restores focus
    await page.keyboard.press("Escape");
    await expect(altModal).not.toBeVisible();
    await expect(altBtn).toBeFocused();

    // --- Variant Reassignment Modal Accessibility ---
    const varBtn = page.locator(
      `[data-testid="btn-reassign-variant-${ADMIN_E2E_PRODUCT_FIXTURES.publishableProduct.productMediaId1}"]`
    );
    await varBtn.click();

    const varModal = page.locator('[data-testid="modal-reassign-variant"]');
    await expect(varModal).toBeVisible();
    await expect(page.locator("#modal-variant-title")).toBeVisible();

    // Escape closes modal and restores focus
    await page.keyboard.press("Escape");
    await expect(varModal).not.toBeVisible();
    await expect(varBtn).toBeFocused();
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

  // --------------------------------------------------------------------------
  // Defect B Regression: Enum with ENUM_MULTI renders single-choice select and persists exact string
  // --------------------------------------------------------------------------
  test("Defect B Regression: Enum with ENUM_MULTI renders single-choice select and persists exact string without array or INVALID_ENUM_TYPE", async ({
    page,
  }) => {
    // Reset product specifications for publishableProduct (Category A)
    await sql`
      INSERT INTO product_specifications (product_id, schema_id, schema_version, spec_values, updated_at)
      VALUES (
        ${ADMIN_E2E_PRODUCT_FIXTURES.publishableProduct.id},
        ${ADMIN_E2E_PRODUCT_FIXTURES.categoryA.schemaId},
        1,
        '{"sensor":"PAW3395","dpi_max":26000}'::jsonb,
        NOW()
      )
      ON CONFLICT (product_id) DO UPDATE
      SET schema_id = ${ADMIN_E2E_PRODUCT_FIXTURES.categoryA.schemaId},
          spec_values = '{"sensor":"PAW3395","dpi_max":26000}'::jsonb;
    `;

    await loginAndNavigateTo(
      page,
      ADMIN_E2E_USERS.superadmin.email,
      `/admin/products/${ADMIN_E2E_PRODUCT_FIXTURES.publishableProduct.id}`
    );

    // 1. Verify numeric step advisory attribute on dpi_max
    const dpiInput = page.locator('[data-testid="spec-input-dpi_max"]');
    await expect(dpiInput).toBeVisible();
    await expect(dpiInput).toHaveAttribute("step", "100");

    // 2. Verify connection_type (dataType: "enum", filterKind: "ENUM_MULTI") renders as a single select
    const connSelect = page.locator('[data-testid="spec-input-connection_type"]');
    await expect(connSelect).toBeVisible();
    await expect(connSelect).toHaveRole("combobox");

    // Ensure zero checkboxes exist for connection_type
    const connCheckboxes = page.locator('input[type="checkbox"][id*="connection_type"]');
    await expect(connCheckboxes).toHaveCount(0);

    // 3. Select option "wireless"
    await connSelect.selectOption("wireless");

    // 4. Save specifications
    await page.locator('[data-testid="btn-save-specs"]').click();
    await expect(page.locator('[data-testid="alert-general-success"]')).toContainText(
      "Especificaciones técnicas guardadas exitosamente"
    );

    // 5. Assert PostgreSQL database persistence:
    // spec_values.connection_type must equal "wireless" exactly, NOT ["wireless"]
    const specRow = await sql`
      SELECT spec_values->>'connection_type' as conn_type,
             spec_values->'connection_type' as raw_conn
      FROM product_specifications
      WHERE product_id = ${ADMIN_E2E_PRODUCT_FIXTURES.publishableProduct.id};
    `;
    expect(specRow[0]!.conn_type).toBe("wireless");
    expect(typeof specRow[0]!.conn_type).toBe("string");
    // Ensure raw json is not an array
    expect(Array.isArray(specRow[0]!.raw_conn)).toBe(false);
  });
});
