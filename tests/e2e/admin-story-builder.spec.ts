import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import postgres from "postgres";
import {
  ADMIN_E2E_PASSWORD,
  ADMIN_E2E_PRODUCT_FIXTURES,
  ADMIN_E2E_USERS,
} from "./helpers/admin-fixtures";
import { installGp014MediaFixtures } from "./helpers/gp014-media-fixtures";

const databaseUrl =
  process.env.DATABASE_URL ?? "postgres://postgres:postgres@127.0.0.1:54322/postgres";
const sql = postgres(databaseUrl, { max: 1 });
const product = ADMIN_E2E_PRODUCT_FIXTURES.publishableProduct;
const storyPath = `/admin/products/${product.id}/story`;
const draftRevisionId = "018f0026-2000-7000-8000-000000000201";
const firstBlockId = "018f0026-2000-7000-8000-000000000301";
const secondBlockId = "018f0026-2000-7000-8000-000000000302";

const testVideoAssetId = "018f0000-0000-7000-8000-000000006a10";
const testVideoProductMediaId = "018f0000-0000-7000-8000-000000002a10";

const validBlocks = [
  {
    block_id: firstBlockId,
    type: "stat_highlight",
    order: 1,
    payload: { title: "Rendimiento", stats: [{ value: "26K", label: "DPI" }] },
  },
  {
    block_id: secondBlockId,
    type: "faq",
    order: 2,
    payload: {
      title: "Preguntas frecuentes",
      items: [{ question: "¿Incluye cable?", answer: "Sí, incluye un cable desmontable." }],
    },
  },
];

async function ensureVideoFixture() {
  await sql`
    INSERT INTO media_assets (
      id, object_key, security_class, media_type, mime_type, file_size_bytes, width, height, alt_text, created_at
    ) VALUES (
      ${testVideoAssetId}, 'stories/mouse-pro-mod-01/performance-demo.mp4', 'PUBLIC_MEDIA', 'VIDEO', 'video/mp4', 468, 1920, 1080, 'Video demo producto', NOW()
    ) ON CONFLICT (id) DO NOTHING;
  `;
  await sql`
    INSERT INTO product_media (
      id, product_id, media_asset_id, variant_id, display_order, created_at
    ) VALUES (
      ${testVideoProductMediaId}, ${product.id}, ${testVideoAssetId}, NULL, 4, NOW()
    ) ON CONFLICT (id) DO NOTHING;
  `;
}

async function removeVideoFixture() {
  await sql`DELETE FROM product_media WHERE id = ${testVideoProductMediaId};`;
  await sql`DELETE FROM media_assets WHERE id = ${testVideoAssetId};`;
}

async function clearStory() {
  await sql`DELETE FROM product_stories WHERE product_id = ${product.id};`;
  await sql`DELETE FROM product_story_revisions WHERE product_id = ${product.id};`;
}

async function resetDraft() {
  await clearStory();
  await sql`
    INSERT INTO product_story_revisions (
      id, product_id, revision_number, status, blocks, created_by_auth_user_id, created_at
    ) VALUES (
      ${draftRevisionId}, ${product.id}, 1, 'DRAFT', ${sql.json(validBlocks)},
      ${ADMIN_E2E_USERS.superadmin.id}, NOW()
    );
  `;
  await sql`
    INSERT INTO product_stories (product_id, draft_revision_id, published_revision_id, updated_at)
    VALUES (${product.id}, ${draftRevisionId}, NULL, NOW());
  `;
}

async function loginAndNavigateTo(page: Page, email: string, targetPath: string) {
  await page.context().clearCookies();
  await installGp014MediaFixtures(page);
  await page.goto(`/auth/login?redirect=${encodeURIComponent(targetPath)}`);
  await page.getByLabel("Correo electrónico").fill(email);
  await page.getByLabel("Contraseña").fill(ADMIN_E2E_PASSWORD);
  await page.getByRole("button", { name: "Iniciar sesión" }).click();
  await page.waitForURL((url) => !url.pathname.includes("/auth/login"), { timeout: 15000 });
  await page.goto(targetPath);
  await page.waitForLoadState("domcontentloaded");
}

async function addBlockViaLibrary(page: Page, labelRegex: RegExp) {
  const addTrigger = page
    .getByTestId("story-add-block")
    .or(page.getByRole("button", { name: "Agregar primer bloque" }));
  await addTrigger.first().click();
  const chooser = page.getByRole("dialog", { name: "Agregar bloque" });
  await expect(chooser).toBeVisible();
  await chooser.getByRole("button", { name: labelRegex }).click();
  await expect(chooser).toBeHidden();
}

async function selectFirstMediaOption(page: Page, isVideo = false, optionIndex = 0) {
  const dialog = page.getByRole("dialog", {
    name: isVideo ? /Seleccionar video/i : /Seleccionar (imagen|póster)/i,
  });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("option").nth(optionIndex).click();
  await expect(dialog).toBeHidden();
}

function getStoryCards(page: Page) {
  return page.locator('[data-testid^="story-block-"][data-block-id]');
}

test.describe("GP-026 CHK3 — Admin Product Story Builder", () => {
  test.describe.configure({ mode: "serial" });

  test.beforeAll(async () => {
    await ensureVideoFixture();
  });

  test.beforeEach(async () => {
    await resetDraft();
  });

  test.afterAll(async () => {
    await clearStory();
    await removeVideoFixture();
    await sql.end();
  });

  test("Product Manager entry navigates to the authorized Story shell and unauthorized actors fail closed", async ({
    page,
  }) => {
    await clearStory();
    const productPath = `/admin/products/${product.id}`;
    await loginAndNavigateTo(page, ADMIN_E2E_USERS.catalog.email, productPath);

    await expect(page.getByTestId("product-story-entry")).toBeVisible();
    await expect(page.getByTestId("product-story-status")).toHaveText("Estado: Sin historia");
    await page.getByTestId("product-story-link").click();
    await expect(page).toHaveURL(storyPath);
    await expect(
      page.getByRole("heading", { level: 1, name: "Historia del producto" })
    ).toBeVisible();
    await expect(page.getByText(product.name, { exact: true })).toBeVisible();
    await expect(page.getByText(`/${product.slug}`, { exact: true })).toBeVisible();
    await expect(page.getByTestId("story-lifecycle-status")).toHaveText("Sin historia");
    await expect(page.getByRole("button", { name: /Preview|Publicar|Despublicar/i })).toHaveCount(
      0
    );

    await loginAndNavigateTo(page, ADMIN_E2E_USERS.customer.email, storyPath);
    await expect(page.getByRole("heading", { level: 1 })).toContainText(/Acceso no autorizado/i);
    await expect(page.getByTestId("story-builder")).toHaveCount(0);
  });

  test("empty shell supports keyboard insertion, direct incomplete deletion, dirty navigation guard, and 360px layout", async ({
    page,
  }) => {
    await clearStory();
    await page.setViewportSize({ width: 360, height: 800 });
    await loginAndNavigateTo(page, ADMIN_E2E_USERS.catalog.email, storyPath);

    await expect(page.getByTestId("story-empty-state")).toBeVisible();
    const addButton = page.getByRole("button", { name: "Agregar primer bloque" });
    await addButton.focus();
    await page.keyboard.press("Enter");
    const chooser = page.getByRole("dialog", { name: "Agregar bloque" });
    await expect(chooser).toBeVisible();
    await expect(chooser.locator("[data-story-block-type]")).toHaveCount(13);

    const heroOption = chooser.getByRole("button", { name: /Portada multimedia/i });
    await heroOption.focus();
    await page.keyboard.press("Enter");
    const card = page.locator('[data-testid^="story-block-"][data-block-id]').first();
    await expect(card).toBeFocused();
    await expect(card).toContainText("Configuración pendiente");
    await expect(page.getByTestId("story-dirty-state")).toHaveText("Cambios sin guardar");
    await expect(page.getByTestId("story-save-draft")).toBeEnabled();

    const backLink = page.getByTestId("story-back-link");
    await backLink.click();
    await expect(page.getByRole("dialog", { name: "Salir con cambios sin guardar" })).toBeVisible();
    await page.getByRole("button", { name: "Cancelar" }).click();
    await expect(backLink).toBeFocused();

    await card.getByRole("button", { name: /Eliminar Portada multimedia/i }).focus();
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("story-empty-state")).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth
    );
    expect(overflow).toBe(false);
  });

  test("valid blocks duplicate with fresh identity, reorder, delete with confirmation, and save durably", async ({
    page,
  }) => {
    await loginAndNavigateTo(page, ADMIN_E2E_USERS.superadmin.email, storyPath);
    await expect(page.getByTestId("story-lifecycle-status")).toHaveText("Borrador r1");

    const cards = page.locator('[data-testid^="story-block-"][data-block-id]');
    await expect(cards).toHaveCount(2);
    await cards
      .first()
      .getByRole("button", { name: /Duplicar Datos destacados/i })
      .click();
    await expect(cards).toHaveCount(3);
    const duplicateId = await cards.nth(1).getAttribute("data-block-id");
    expect(duplicateId).not.toBe(firstBlockId);
    await cards
      .nth(1)
      .getByRole("button", { name: /Mover Datos destacados hacia arriba/i })
      .click();
    await expect(cards.first()).toHaveAttribute("data-block-id", duplicateId!);

    const faqCard = cards.filter({ hasText: "Preguntas frecuentes" });
    const deleteButton = faqCard.getByRole("button", { name: /Eliminar Preguntas frecuentes/i });
    await deleteButton.click();
    const confirmation = page.getByRole("dialog", { name: "Eliminar bloque guardado" });
    await expect(confirmation).toContainText("Preguntas frecuentes");
    await confirmation.getByRole("button", { name: "Cancelar" }).click();
    await expect(deleteButton).toBeFocused();
    await deleteButton.click();
    await confirmation.getByRole("button", { name: "Eliminar bloque" }).click();
    await expect(cards).toHaveCount(2);

    await page.getByTestId("story-save-draft").click();
    await expect(page.getByTestId("story-success")).toContainText("Borrador r2 guardado");
    await expect(page.getByTestId("story-dirty-state")).toHaveText(
      "Todos los cambios están guardados"
    );
    await expect(page.getByTestId("story-lifecycle-status")).toHaveText("Borrador r2");

    const rows = await sql`
      SELECT revision_number, blocks
      FROM product_story_revisions
      WHERE product_id = ${product.id} AND status = 'DRAFT';
    `;
    expect(rows).toHaveLength(1);
    expect(rows[0]!.revision_number).toBe(2);
    expect(rows[0]!.blocks).toHaveLength(2);
    expect(rows[0]!.blocks[0].block_id).toBe(duplicateId);
    expect(rows[0]!.blocks[0].order).toBe(1);
  });

  test("an empty document saves as a durable draft and can be discarded explicitly", async ({
    page,
  }) => {
    await clearStory();
    await loginAndNavigateTo(page, ADMIN_E2E_USERS.catalog.email, storyPath);

    await page.getByTestId("story-save-draft").click();
    await expect(page.getByTestId("story-success")).toContainText("Borrador r1 guardado");
    await expect(page.getByTestId("story-discard-draft")).toBeVisible();
    const savedRows = await sql`
      SELECT stories.draft_revision_id, revisions.blocks
      FROM product_stories AS stories
      INNER JOIN product_story_revisions AS revisions ON revisions.id = stories.draft_revision_id
      WHERE stories.product_id = ${product.id};
    `;
    expect(savedRows).toHaveLength(1);
    expect(savedRows[0]!.blocks).toEqual([]);

    await page.getByTestId("story-discard-draft").click();
    const discardDialog = page.getByRole("dialog", { name: "Descartar borrador guardado" });
    await discardDialog.getByRole("button", { name: "Descartar borrador" }).click();
    await expect(page.getByTestId("story-lifecycle-status")).toHaveText("Sin historia");
    await expect(page.getByTestId("story-discard-draft")).toHaveCount(0);
    const aggregateRows = await sql`
      SELECT draft_revision_id FROM product_stories WHERE product_id = ${product.id};
    `;
    expect(aggregateRows[0]!.draft_revision_id).toBeNull();
  });

  test("proves validation UX, operable Save on incomplete block, error focus, live correction and save", async ({
    page,
  }) => {
    await clearStory();
    await loginAndNavigateTo(page, ADMIN_E2E_USERS.catalog.email, storyPath);

    // Add hero_media block (empty shell, incomplete)
    await addBlockViaLibrary(page, /Portada multimedia/i);
    const card = page.locator('[data-testid^="story-block-"][data-block-id]').first();
    await expect(card).toContainText("Configuración pendiente");

    // Save button must remain operable
    const saveBtn = page.getByTestId("story-save-draft");
    await expect(saveBtn).toBeEnabled();

    // Clicking Save triggers local validation without calling server action
    await saveBtn.click();

    // ValidationSummary appears
    const summary = page.getByTestId("story-validation-summary");
    await expect(summary).toBeVisible();
    await expect(summary).toContainText("error que impide guardar la historia");

    // Inline field error is visible
    await expect(card.locator('p[id*="headline-error"]')).toBeVisible();

    // First invalid field receives focus
    const headlineInput = card.getByLabel(/Encabezado/i);
    await expect(headlineInput).toBeFocused();

    // Correct the field
    await headlineInput.fill("Título Portada Pro");

    // Summary clears live
    await expect(summary).toHaveCount(0);
    await expect(card).toContainText("Contenido guardado");

    // Save succeeds
    await saveBtn.click();
    await expect(page.getByTestId("story-success")).toContainText("Borrador r1 guardado");
  });

  test("authors Media-Centric Editors (hero_media, full_bleed_image, image_text, video) with picker type filtering and round-trip persistence", async ({
    page,
  }) => {
    test.setTimeout(90000);
    await clearStory();
    await loginAndNavigateTo(page, ADMIN_E2E_USERS.catalog.email, storyPath);

    // 1. Add hero_media
    await addBlockViaLibrary(page, /Portada multimedia/i);
    const heroCard = getStoryCards(page).first();
    await heroCard.getByLabel(/Encabezado/i).fill("Mouse Gamer Flagship");
    await heroCard.getByLabel(/Lema/i).fill("Rendimiento sin concesiones");

    // Open IMAGE picker on hero_media
    await heroCard.locator('[data-testid^="select-media-field-"]').first().click();
    const imgDialog = page.getByRole("dialog", { name: /Seleccionar (imagen|póster)/i });
    await expect(imgDialog).toBeVisible();
    // Verify IMAGE picker does NOT offer VIDEO
    await expect(imgDialog.getByText("MP4", { exact: true })).toHaveCount(0);
    // Verify variant context is visible
    await expect(imgDialog.getByText(/Variante: Variante Publicable Actualizada/i)).toBeVisible();
    await imgDialog.getByRole("option").first().click();
    await expect(imgDialog).toBeHidden();

    // 2. Add full_bleed_image
    await addBlockViaLibrary(page, /Imagen a todo lo ancho/i);
    const fullBleedCard = getStoryCards(page).nth(1);
    await fullBleedCard.locator('[data-testid^="select-media-field-"]').first().click();
    await selectFirstMediaOption(page);
    await fullBleedCard.getByLabel(/Texto alternativo/i).fill("Vista completa del chasis");
    await fullBleedCard.getByLabel(/Pie de imagen/i).fill("Chasis de magnesio ultraliviano");

    // 3. Add image_text
    await addBlockViaLibrary(page, /Imagen y texto/i);
    const imgTextCard = getStoryCards(page).nth(2);
    await imgTextCard.getByLabel(/Encabezado/i).fill("Sensor de alta precisión");
    await imgTextCard
      .getByLabel(/Cuerpo editorial/i)
      .fill("Diseñado para tracking competitivo pixel a pixel.");
    await imgTextCard.locator('[data-testid^="select-media-field-"]').first().click();
    await selectFirstMediaOption(page);

    // 4. Add video
    await addBlockViaLibrary(page, /^Video\b/i);
    const videoCard = getStoryCards(page).nth(3);
    await videoCard.getByLabel(/Título del video/i).fill("Tráiler cinemático");
    await videoCard.locator('[data-testid^="select-media-field-"]').first().click();
    const videoDialog = page.getByRole("dialog", { name: /Seleccionar video/i });
    await expect(videoDialog).toBeVisible();
    // Verify VIDEO picker only displays VIDEO (has MP4 badge) and not standard image thumbnails
    await expect(videoDialog.getByText("MP4", { exact: true })).toBeVisible();
    await videoDialog.getByRole("option").first().click();
    await expect(videoDialog).toBeHidden();

    // Save draft
    await page.getByTestId("story-save-draft").click();
    await expect(page.getByTestId("story-success")).toContainText("Borrador r1 guardado");

    // Reload and verify persistence round-trip
    await page.reload();
    await page.waitForLoadState("domcontentloaded");

    const reloadedCards = page.locator('[data-testid^="story-block-"][data-block-id]');
    await expect(reloadedCards).toHaveCount(4);
    await expect(reloadedCards.nth(0).getByLabel(/Encabezado/i)).toHaveValue(
      "Mouse Gamer Flagship"
    );
    await expect(reloadedCards.nth(1).getByLabel(/Texto alternativo/i)).toHaveValue(
      "Vista completa del chasis"
    );
    await expect(reloadedCards.nth(2).getByLabel(/Encabezado/i)).toHaveValue(
      "Sensor de alta precisión"
    );
    await expect(reloadedCards.nth(3).getByLabel(/Título del video/i)).toHaveValue(
      "Tráiler cinemático"
    );

    // Verify database
    const dbResult = await sql`
      SELECT revisions.blocks
      FROM product_stories AS stories
      INNER JOIN product_story_revisions AS revisions ON revisions.id = stories.draft_revision_id
      WHERE stories.product_id = ${product.id};
    `;
    expect(dbResult[0]!.blocks).toHaveLength(4);
    expect(dbResult[0]!.blocks.map((b: { type: string }) => b.type)).toEqual([
      "hero_media",
      "full_bleed_image",
      "image_text",
      "video",
    ]);
  });

  test("authors Repeatable Content Editors (stat_highlight, gallery, box_contents, faq) with row add/reorder/delete and persistence", async ({
    page,
  }) => {
    test.setTimeout(90000);
    await clearStory();
    await loginAndNavigateTo(page, ADMIN_E2E_USERS.catalog.email, storyPath);

    // 1. Add stat_highlight
    await addBlockViaLibrary(page, /Datos destacados/i);
    const statCard = getStoryCards(page).first();
    await statCard.getByLabel(/Título del bloque/i).fill("Métricas Pro");
    // Item 1
    await statCard.getByLabel("Valor *").first().fill("54g");
    await statCard.getByLabel("Etiqueta *").first().fill("Peso pluma");
    // Add Item 2
    await statCard.getByRole("button", { name: /Agregar estadística/i }).click();
    await statCard.getByLabel("Valor *").nth(1).fill("8000Hz");
    await statCard.getByLabel("Etiqueta *").nth(1).fill("Polling rate");
    // Reorder Item 2 up
    await statCard.getByRole("button", { name: /Mover estadística 2 hacia arriba/i }).click();
    await expect(statCard.getByLabel("Valor *").first()).toHaveValue("8000Hz");

    // 2. Add gallery (requires 3 to 6 images, initial block has 3 items)
    await addBlockViaLibrary(page, /Galería/i);
    const galleryCard = getStoryCards(page).nth(1);
    await galleryCard.getByLabel(/Título de la galería/i).fill("Galería de fotos");
    // Select media for the 3 initial gallery items
    for (let i = 0; i < 3; i++) {
      await galleryCard.locator('[data-testid^="select-media-field-"]').first().click();
      await selectFirstMediaOption(page, false, i % 3);
    }
    // Reorder gallery items
    await galleryCard
      .getByRole("button", { name: /Mover elemento de galería 2 hacia arriba/i })
      .click();

    // 3. Add box_contents (initial block has 1 item)
    await addBlockViaLibrary(page, /Contenido de la caja/i);
    const boxCard = getStoryCards(page).nth(2);
    await boxCard.getByLabel(/Título del bloque/i).fill("¿Qué incluye la caja?");
    // Fill initial Item 1
    await boxCard
      .getByLabel(/Nombre del accesorio/i)
      .first()
      .fill("Receptor USB 4K");
    await boxCard
      .getByLabel(/Cantidad/i)
      .first()
      .fill("1");
    // Add Item 2
    await boxCard.getByRole("button", { name: /Agregar elemento a la caja/i }).click();
    await boxCard
      .getByLabel(/Nombre del accesorio/i)
      .nth(1)
      .fill("Cable trenzado paracord");
    await boxCard
      .getByLabel(/Cantidad/i)
      .nth(1)
      .fill("1");
    // Reorder box items
    await boxCard.getByRole("button", { name: /Mover elemento 2 hacia arriba/i }).click();
    await expect(boxCard.getByLabel(/Nombre del accesorio/i).first()).toHaveValue(
      "Cable trenzado paracord"
    );

    // 4. Add faq (initial block has 1 item)
    await addBlockViaLibrary(page, /Preguntas frecuentes/i);
    const faqCard = getStoryCards(page).nth(3);
    await faqCard.getByLabel(/Título de la sección/i).fill("Preguntas y Respuestas");
    // Fill initial Item 1
    await faqCard
      .getByLabel(/^Pregunta/i)
      .first()
      .fill("¿Funciona en macOS?");
    await faqCard
      .getByLabel(/^Respuesta/i)
      .first()
      .fill("Sí, con configuración plug & play.");
    // Add Item 2
    await faqCard.getByRole("button", { name: /Agregar pregunta frecuente/i }).click();
    await faqCard
      .getByLabel(/^Pregunta/i)
      .nth(1)
      .fill("¿Qué garantía tiene?");
    await faqCard
      .getByLabel(/^Respuesta/i)
      .nth(1)
      .fill("Garantía oficial de 12 meses.");
    // Reorder FAQ items
    await faqCard.getByRole("button", { name: /Mover pregunta 2 hacia arriba/i }).click();
    await expect(faqCard.getByLabel(/^Pregunta/i).first()).toHaveValue("¿Qué garantía tiene?");

    // Save draft
    await page.getByTestId("story-save-draft").click();
    await expect(page.getByTestId("story-success")).toContainText("Borrador r1 guardado");

    // Reload and verify persistence round-trip
    await page.reload();
    await page.waitForLoadState("domcontentloaded");

    const reloadedCards = page.locator('[data-testid^="story-block-"][data-block-id]');
    await expect(reloadedCards).toHaveCount(4);
    await expect(reloadedCards.nth(0).getByLabel("Valor *").first()).toHaveValue("8000Hz");
    await expect(
      reloadedCards
        .nth(2)
        .getByLabel(/Nombre del accesorio/i)
        .first()
    ).toHaveValue("Cable trenzado paracord");
    await expect(
      reloadedCards
        .nth(3)
        .getByLabel(/^Pregunta/i)
        .first()
    ).toHaveValue("¿Qué garantía tiene?");

    // Verify database
    const dbResult = await sql`
      SELECT revisions.blocks
      FROM product_stories AS stories
      INNER JOIN product_story_revisions AS revisions ON revisions.id = stories.draft_revision_id
      WHERE stories.product_id = ${product.id};
    `;
    expect(dbResult[0]!.blocks).toHaveLength(4);
    expect(dbResult[0]!.blocks.map((b: { type: string }) => b.type)).toEqual([
      "stat_highlight",
      "gallery",
      "box_contents",
      "faq",
    ]);
  });

  test("authors Technical, Matrix & Selector Editors (comparison, dimensions, technical_specs, spec_feature, related_products)", async ({
    page,
  }) => {
    test.setTimeout(90000);
    await clearStory();
    await loginAndNavigateTo(page, ADMIN_E2E_USERS.catalog.email, storyPath);

    // 1. Add comparison
    await addBlockViaLibrary(page, /Comparación/i);
    const compCard = getStoryCards(page).first();
    await compCard.getByLabel(/Título de la comparación/i).fill("Comparativa de Modelos");
    // Add column (increases headers to 3 and adds cell to all rows)
    await compCard.getByRole("button", { name: /Agregar columna a la comparación/i }).click();
    // Fill headers
    await compCard.getByPlaceholder("Encabezado 1").fill("Estándar");
    await compCard.getByPlaceholder("Encabezado 2").fill("Pro");
    await compCard.getByPlaceholder("Encabezado 3").fill("Ultra");
    // Fill row 1 cells
    await compCard.getByPlaceholder("Estándar *").first().fill("1000Hz");
    await compCard.getByPlaceholder("Pro *").first().fill("4000Hz");
    await compCard.getByPlaceholder("Ultra *").first().fill("8000Hz");
    // Add row
    await compCard.getByRole("button", { name: /Agregar fila a la comparación/i }).click();
    await compCard.getByPlaceholder("Estándar *").nth(1).fill("PAW3395");
    await compCard.getByPlaceholder("Pro *").nth(1).fill("PAW3950");
    await compCard.getByPlaceholder("Ultra *").nth(1).fill("PAW3950 MAX");

    // 2. Add dimensions
    await addBlockViaLibrary(page, /Dimensiones/i);
    const dimCard = getStoryCards(page).nth(1);
    await dimCard.getByLabel(/Largo \(mm\)/i).fill("121.5");
    await dimCard.getByLabel(/Ancho \(mm\)/i).fill("65.8");
    await dimCard.getByLabel(/Alto \(mm\)/i).fill("38.2");
    // Select grip types
    await dimCard.getByRole("button", { name: /Agregar tipo de agarre/i }).click();
    await dimCard.getByPlaceholder(/Tipo de agarre 1/i).fill("Claw Grip");

    // 3. Add technical_specs (initial block has 1 group with 1 spec)
    await addBlockViaLibrary(page, /Especificaciones técnicas/i);
    const techCard = getStoryCards(page).nth(2);
    await techCard.getByLabel(/Título del bloque/i).fill("Especificaciones Detalladas");
    // Fill initial group 1
    await techCard
      .getByPlaceholder(/Ej: Sensor y Óptica/i)
      .first()
      .fill("Sensor y Switches");
    // Fill spec 1
    await techCard
      .getByPlaceholder(/Etiqueta \(ej: DPI máximo\)/i)
      .first()
      .fill("Sensor");
    await techCard
      .getByPlaceholder(/Valor \(ej: 26,000 DPI\)/i)
      .first()
      .fill("PixArt 3950");
    // Add spec 2
    await techCard
      .getByRole("button", { name: /Agregar especificación al grupo/i })
      .first()
      .click();
    await techCard
      .getByPlaceholder(/Etiqueta \(ej: DPI máximo\)/i)
      .nth(1)
      .fill("Switches");
    await techCard
      .getByPlaceholder(/Valor \(ej: 26,000 DPI\)/i)
      .nth(1)
      .fill("Ópticos Omron 100M");

    // 4. Add spec_feature
    await addBlockViaLibrary(page, /Característica destacada/i);
    const specFeatCard = getStoryCards(page).nth(3);
    await specFeatCard.getByLabel(/Título de la característica/i).fill("Construcción en Magnesio");
    await specFeatCard
      .getByLabel(/Descripción/i)
      .fill("Chasis esculpido para máxima ligereza y rigidez torsional.");
    await specFeatCard.getByLabel(/Distintivo/i).fill("EXCLUSIVO");

    // 5. Add related_products
    await addBlockViaLibrary(page, /Productos relacionados/i);
    const relatedCard = getStoryCards(page).nth(4);
    await relatedCard.getByLabel(/Título de la sección/i).fill("Accesorios Recomendados");
    // Open related products picker
    await relatedCard.getByRole("button", { name: /Buscar.*producto/i }).click();
    const relatedDialog = page.getByRole("dialog", { name: /Buscar productos relacionados/i });
    await expect(relatedDialog).toBeVisible();

    // Search "Gamer"
    const searchInput = relatedDialog.getByTestId("related-product-search-input");
    await searchInput.fill("Gamer");
    // Wait for search results
    await expect(relatedDialog.getByText("Gamer Mouse Pro")).toBeVisible();
    // Verify current product is NOT present (no self-reference)
    await expect(relatedDialog.getByText(product.name)).toHaveCount(0);

    // Add first product
    await relatedDialog.getByRole("button", { name: /Agregar Gamer Mouse Pro/i }).click();
    await expect(relatedDialog).toBeHidden();
    await expect(relatedCard.getByText("Gamer Mouse Pro")).toBeVisible();

    // Open again to verify duplicate unavailable
    await relatedCard.getByRole("button", { name: /Buscar.*producto/i }).click();
    await searchInput.fill("Gamer");
    await expect(
      relatedDialog.getByRole("button", { name: /Gamer Mouse Pro ya está seleccionado/i })
    ).toBeDisabled();

    // Add second product
    await relatedDialog.getByRole("button", { name: /Agregar Gamer Mouse Ultra/i }).click();
    await expect(relatedDialog).toBeHidden();
    await expect(relatedCard.getByText("Gamer Mouse Ultra")).toBeVisible();

    // Reorder related products
    await relatedCard
      .getByRole("button", { name: /Mover.*Gamer Mouse Ultra.*hacia arriba/i })
      .click();

    // Save draft
    await page.getByTestId("story-save-draft").click();
    await expect(page.getByTestId("story-success")).toContainText("Borrador r1 guardado");

    // Reload and verify persistence round-trip
    await page.reload();
    await page.waitForLoadState("domcontentloaded");

    const reloadedCards = page.locator('[data-testid^="story-block-"][data-block-id]');
    await expect(reloadedCards).toHaveCount(5);
    await expect(reloadedCards.nth(0).getByPlaceholder("Encabezado 3")).toHaveValue("Ultra");
    await expect(reloadedCards.nth(1).getByLabel(/Largo \(mm\)/i)).toHaveValue("121.5");
    await expect(
      reloadedCards
        .nth(2)
        .getByPlaceholder(/Ej: Sensor y Óptica/i)
        .first()
    ).toHaveValue("Sensor y Switches");
    await expect(reloadedCards.nth(3).getByLabel(/Título de la característica/i)).toHaveValue(
      "Construcción en Magnesio"
    );
    await expect(reloadedCards.nth(4).locator("strong").first()).toContainText("Gamer Mouse Ultra");

    // Verify database
    const dbResult = await sql`
      SELECT revisions.blocks
      FROM product_stories AS stories
      INNER JOIN product_story_revisions AS revisions ON revisions.id = stories.draft_revision_id
      WHERE stories.product_id = ${product.id};
    `;
    expect(dbResult[0]!.blocks).toHaveLength(5);
    expect(dbResult[0]!.blocks.map((b: { type: string }) => b.type)).toEqual([
      "comparison",
      "dimensions",
      "technical_specs",
      "spec_feature",
      "related_products",
    ]);
  });

  test("passes WCAG 2.1 A/AA Axe accessibility audit across populated complex builder states", async ({
    page,
  }) => {
    test.setTimeout(90000);
    await clearStory();
    await loginAndNavigateTo(page, ADMIN_E2E_USERS.catalog.email, storyPath);

    // 1. Add Technical Specs (nested repeaters)
    await addBlockViaLibrary(page, /Especificaciones técnicas/i);
    const techCard = getStoryCards(page).first();
    await techCard
      .getByPlaceholder(/Ej: Sensor y Óptica/i)
      .first()
      .fill("Óptica");
    await techCard
      .getByPlaceholder(/Etiqueta \(ej: DPI máximo\)/i)
      .first()
      .fill("DPI");
    await techCard
      .getByPlaceholder(/Valor \(ej: 26,000 DPI\)/i)
      .first()
      .fill("26K");

    // 2. Add Comparison (table with internal scroll region)
    await addBlockViaLibrary(page, /Comparación/i);
    const compCard = getStoryCards(page).nth(1);
    await compCard.getByRole("button", { name: /Agregar columna a la comparación/i }).click();

    // 3. Trigger validation error to show ValidationSummary with errors
    await addBlockViaLibrary(page, /Portada multimedia/i);
    await page.getByTestId("story-save-draft").click();
    await expect(page.getByTestId("story-validation-summary")).toBeVisible();

    // Audit 1: Story Builder with nested cards, comparison scroll region, and validation summary
    const scan1 = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    expect(scan1.violations).toEqual([]);

    // Audit 2: Media Picker dialog open
    await techCard.getByRole("button", { name: /Colapsar bloque 1/i }).click();
    const heroCard = getStoryCards(page).nth(2);
    await heroCard.locator('[data-testid^="select-media-field-"]').first().click();
    const mediaDialog = page.getByRole("dialog", { name: /Seleccionar (imagen|póster)/i });
    await expect(mediaDialog).toBeVisible();

    const scan2 = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    expect(scan2.violations).toEqual([]);

    await mediaDialog.getByRole("button", { name: /Cerrar/i }).click();
    await expect(mediaDialog).toBeHidden();

    // Audit 3: Related Products Picker dialog open
    await addBlockViaLibrary(page, /Productos relacionados/i);
    const relatedCard = getStoryCards(page).nth(3);
    await relatedCard.getByRole("button", { name: /Buscar.*producto/i }).click();
    const relatedDialog = page.getByRole("dialog", { name: /Buscar productos relacionados/i });
    await expect(relatedDialog).toBeVisible();

    const scan3 = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    expect(scan3.violations).toEqual([]);

    await relatedDialog.getByRole("button", { name: /Cerrar/i }).click();
    await expect(relatedDialog).toBeHidden();
  });
});
