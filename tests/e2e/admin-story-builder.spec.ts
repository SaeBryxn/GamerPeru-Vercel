import { expect, test, type Page } from "@playwright/test";
import postgres from "postgres";
import {
  ADMIN_E2E_PASSWORD,
  ADMIN_E2E_PRODUCT_FIXTURES,
  ADMIN_E2E_USERS,
} from "./helpers/admin-fixtures";

const databaseUrl =
  process.env.DATABASE_URL ?? "postgres://postgres:postgres@127.0.0.1:54322/postgres";
const sql = postgres(databaseUrl, { max: 1 });
const product = ADMIN_E2E_PRODUCT_FIXTURES.publishableProduct;
const storyPath = `/admin/products/${product.id}/story`;
const draftRevisionId = "018f0026-2000-7000-8000-000000000201";
const firstBlockId = "018f0026-2000-7000-8000-000000000301";
const secondBlockId = "018f0026-2000-7000-8000-000000000302";

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
  await page.goto(`/auth/login?redirect=${encodeURIComponent(targetPath)}`);
  await page.getByLabel("Correo electrónico").fill(email);
  await page.getByLabel("Contraseña").fill(ADMIN_E2E_PASSWORD);
  await page.getByRole("button", { name: "Iniciar sesión" }).click();
  await page.waitForURL((url) => !url.pathname.includes("/auth/login"), { timeout: 15000 });
  await page.goto(targetPath);
  await page.waitForLoadState("domcontentloaded");
}

test.describe("GP-026 CHK2 — Admin Product Story Builder", () => {
  test.describe.configure({ mode: "serial" });

  test.beforeEach(async () => {
    await resetDraft();
  });

  test.afterAll(async () => {
    await clearStory();
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
    await expect(page.getByTestId("story-save-draft")).toBeDisabled();

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
});
