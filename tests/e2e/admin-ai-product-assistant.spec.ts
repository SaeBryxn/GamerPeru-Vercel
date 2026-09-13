import { createHash } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import postgres from "postgres";
import { seedAdminUsers } from "../../scripts/test/seed-admin-e2e.mjs";
import {
  ADMIN_E2E_PASSWORD,
  ADMIN_E2E_PRODUCT_FIXTURES,
  ADMIN_E2E_USERS,
} from "./helpers/admin-fixtures";

const databaseUrl =
  process.env.DATABASE_URL ?? "postgres://postgres:postgres@127.0.0.1:54322/postgres";
const sql = postgres(databaseUrl, { max: 1 });

// This file shares one deterministic database fixture across its cases. Keeping
// the block serial prevents fully-parallel projects from racing the same Auth
// user and proposal setup while leaving the rest of the E2E suite parallel.
test.describe.configure({ mode: "serial" });
test.setTimeout(60_000);

const ids = {
  provider: "018f0025-4000-7000-8000-000000000201",
  profile: "018f0025-4000-7000-8000-000000000202",
  credential: "018f0025-4000-7000-8000-000000000203",
  job: "018f0025-4000-7000-8000-000000000204",
  item: "018f0025-4000-7000-8000-000000000205",
  proposal: "018f0025-4000-7000-8000-000000000206",
  source: "018f0025-4000-7000-8000-000000000207",
  nameReview: "018f0025-4000-7000-8000-000000000208",
  specReview: "018f0025-4000-7000-8000-000000000209",
  variantReview: "018f0025-4000-7000-8000-000000000210",
  sourceLink: "018f0025-4000-7000-8000-000000000211",
};

const proposedName = "Mouse CHK4 E2E Review";
const proposedSlug = "mouse-chk4-e2e-review";

async function loginAndNavigate(page: Page, email: string, target: string) {
  await page.context().clearCookies();
  await page.goto(`/auth/login?redirect=${encodeURIComponent(target)}`);
  await page.getByLabel("Correo electrónico").fill(email);
  await page.getByLabel("Contraseña").fill(ADMIN_E2E_PASSWORD);
  await page.getByRole("button", { name: "Iniciar sesión" }).click();
  await page.waitForURL((url) => !url.pathname.includes("/auth/login"));
  await page.goto(target);
  await page.waitForLoadState("domcontentloaded");
  await page.waitForSelector("h1");
}

async function cleanupAiFixtures() {
  const products = await sql<
    { id: string }[]
  >`SELECT id FROM products WHERE slug = ${proposedSlug}`;
  const productIds = products.map((row) => row.id);
  if (productIds.length > 0) {
    await sql`DELETE FROM product_specifications WHERE product_id IN ${sql(productIds)}`;
    await sql`DELETE FROM product_variants WHERE product_id IN ${sql(productIds)}`;
    await sql`DELETE FROM audit_events WHERE target_id IN ${sql(productIds)}`;
    await sql`DELETE FROM products WHERE id IN ${sql(productIds)}`;
  }
  await sql`DELETE FROM ai_proposal_apply_steps WHERE proposal_id = ${ids.proposal}`;
  await sql`DELETE FROM ai_proposal_field_sources WHERE field_review_id IN (${ids.nameReview}, ${ids.specReview}, ${ids.variantReview})`;
  await sql`DELETE FROM ai_proposal_field_reviews WHERE proposal_id = ${ids.proposal}`;
  await sql`UPDATE ai_product_proposals SET applied_product_id = NULL WHERE id = ${ids.proposal}`;
  await sql`DELETE FROM ai_product_proposals WHERE id = ${ids.proposal}`;
  await sql`DELETE FROM ai_sources WHERE id = ${ids.source}`;
  await sql`DELETE FROM ai_research_job_items WHERE id = ${ids.item}`;
  await sql`DELETE FROM ai_research_jobs WHERE id = ${ids.job}`;
  await sql`DELETE FROM ai_provider_credentials WHERE id = ${ids.credential}`;
  await sql`DELETE FROM ai_profiles WHERE id = ${ids.profile}`;
  await sql`DELETE FROM ai_providers WHERE id = ${ids.provider}`;
  await sql`DELETE FROM audit_events WHERE target_id IN (${ids.proposal}, ${ids.job}, ${ids.credential}, ${ids.provider}, ${ids.profile})`;
}

test.beforeAll(async () => {
  await seedAdminUsers();
  await cleanupAiFixtures();
  const now = new Date("2026-09-13T15:00:00.000Z");
  await sql`
    INSERT INTO ai_providers (id, provider_key, display_name, is_enabled, is_default, settings, created_at, updated_at)
    VALUES (${ids.provider}, 'google', 'Gemini local E2E', true, true, '{}', ${now}, ${now})
  `;
  await sql`
    INSERT INTO ai_profiles (id, profile_key, provider_id, model_id, temperature, max_tokens, is_enabled, created_at, updated_at)
    VALUES (${ids.profile}, 'PRODUCT_RESEARCH_FAST', ${ids.provider}, 'gemini-fixture-no-network', '0.20', 1024, true, ${now}, ${now})
  `;
  await sql`
    INSERT INTO ai_provider_credentials (
      id, provider_id, key_version, ciphertext, iv, auth_tag, masked_key, status,
      last_health_status, last_tested_at, created_at, updated_at
    ) VALUES (
      ${ids.credential}, ${ids.provider}, 1, ${"12".repeat(16)}, ${"34".repeat(12)},
      ${"56".repeat(16)}, '••••••e2e4', 'ACTIVE', 'UNTESTED', NULL, ${now}, ${now}
    )
  `;
  await sql`
    INSERT INTO ai_research_jobs (
      id, mutation_request_digest, request_fingerprint, selected_profile_id, profile_snapshot,
      job_type, status, dispatch_status, inngest_event_id, total_items, completed_items,
      failed_items, created_by_auth_user_id, created_at, updated_at
    ) VALUES (
      ${ids.job}, ${createHash("sha256").update("chk4-e2e-job").digest("hex")},
      ${createHash("sha256").update("chk4-e2e-request").digest("hex")}, ${ids.profile},
      ${sql.json({ profileKey: "PRODUCT_RESEARCH_FAST", providerId: ids.provider, modelId: "gemini-fixture-no-network", temperature: 0.2, maxTokens: 1024 })},
      'SINGLE', 'COMPLETED', 'DISPATCHED', 'chk4-e2e-local-event', 1, 1, 0,
      ${ADMIN_E2E_USERS.superadmin.id}, ${now}, ${now}
    )
  `;
  await sql`
    INSERT INTO ai_research_job_items (
      id, job_id, item_index, input_query, mode, identity_status, status, created_at, updated_at
    ) VALUES (${ids.item}, ${ids.job}, 0, ${proposedName}, 'CREATE', 'EXACT_MATCH', 'SOURCE_CONFLICT', ${now}, ${now})
  `;
  await sql`
    INSERT INTO ai_sources (
      id, job_item_id, original_url, resolved_url, source_name, retrieval_method,
      trust_tier, trust_basis, fetched_at, content_sha256, fetch_status, snippet
    ) VALUES (
      ${ids.source}, ${ids.item}, 'https://example.com/chk4', 'https://example.com/chk4',
      'Ficha oficial local', 'DIRECT_URL', 'TIER_1_OFFICIAL_MANUFACTURER',
      'CANONICAL_BRAND_DOMAIN_MATCH', ${now}, ${"aa".repeat(32)}, 'SUCCESS',
      'Sensor óptico Focus Pro validado por fixture local.'
    )
  `;
  await sql`
    INSERT INTO ai_product_proposals (
      id, job_item_id, proposed_name, proposed_slug, proposed_specifications,
      unmapped_specifications, proposed_variants, proposed_seo_draft, media_candidates,
      status, created_at, updated_at
    ) VALUES (
      ${ids.proposal}, ${ids.item}, ${proposedName}, ${proposedSlug},
      ${sql.json({ sensor: "Focus Pro" })}, '{}',
      ${sql.json([{ sku: "CHK4-E2E-SKU", attributes: { color: "negro" } }])},
      '{}', '[]', 'DRAFT', ${now}, ${now}
    )
  `;
  await sql`
    INSERT INTO ai_proposal_field_reviews (
      id, proposal_id, field_path, proposed_value, decision, verification_state,
      conflict_details, created_at, updated_at
    ) VALUES
      (${ids.nameReview}, ${ids.proposal}, 'copy.name', ${sql.json(proposedName)}, 'PENDING', 'AI_INFERRED', NULL, ${now}, ${now}),
      (${ids.specReview}, ${ids.proposal}, 'sensor', ${sql.json("Focus Pro")}, 'PENDING', 'SOURCE_CONFLICT', ${sql.json({ alternatives: ["Focus Pro", "Hero"] })}, ${now}, ${now}),
      (${ids.variantReview}, ${ids.proposal}, 'research.variants', ${sql.json([{ sku: "CHK4-E2E-SKU", attributes: { color: "negro" } }])}, 'PENDING', 'AI_INFERRED', NULL, ${now}, ${now})
  `;
  await sql`
    INSERT INTO ai_proposal_field_sources (id, field_review_id, source_id, relationship, source_value, created_at)
    VALUES (${ids.sourceLink}, ${ids.specReview}, ${ids.source}, 'SUPPORTS', ${sql.json("Focus Pro")}, ${now})
  `;
});

test.afterAll(async () => {
  await cleanupAiFixtures();
  await sql.end();
});

test.describe("GP-025 / CHK4 — Admin AI Product Assistant", () => {
  test("fails closed on direct routes and filters navigation by current permission", async ({
    page,
  }) => {
    await loginAndNavigate(page, ADMIN_E2E_USERS.orders.email, "/admin/products/ai-import");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Acceso no autorizado");

    await loginAndNavigate(page, ADMIN_E2E_USERS.catalog.email, "/admin/products/ai-import");
    await expect(page.getByRole("heading", { name: "Asistente IA de productos" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Asistente IA" }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: "Configuración IA" })).toHaveCount(0);

    await page.goto("/admin/settings/ai");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Acceso no autorizado");
  });

  test("renders only masked credential metadata on the protected settings route", async ({
    page,
  }) => {
    await loginAndNavigate(page, ADMIN_E2E_USERS.superadmin.email, "/admin/settings/ai");
    await expect(page.getByRole("heading", { name: "Configuración IA" })).toBeVisible();
    await expect(page.getByText("••••••e2e4")).toBeVisible();
    const text = await page.locator("body").innerText();
    expect(text).not.toContain("1212121212121212");
    expect(text).not.toMatch(/ciphertext|auth tag|master key/i);
  });

  test("reviews, prices, approves and applies a deterministic proposal into a canonical DRAFT Product", async ({
    page,
  }) => {
    await loginAndNavigate(page, ADMIN_E2E_USERS.superadmin.email, "/admin/products/ai-import");
    await page.getByTestId(`recent-job-${ids.job}`).click();
    await expect(page.getByTestId("research-job-detail")).toContainText(proposedName);
    await page.getByRole("link", { name: "Resolver conflicto" }).click();
    await expect(page.getByRole("heading", { name: proposedName })).toBeVisible();

    await page.getByRole("button", { name: "Preparar revisión" }).click();
    await expect(page.getByTestId("review-field-catalog.brandId")).toBeVisible();

    const brand = page.getByTestId("review-field-catalog.brandId");
    await brand.getByLabel("Decisión").selectOption("MANUALLY_EDITED");
    await brand
      .getByLabel("Selección humana para Marca")
      .selectOption(ADMIN_E2E_PRODUCT_FIXTURES.brand.id);
    await brand.getByRole("button", { name: "Guardar decisión" }).click();
    await expect(page.getByTestId("pending-review-count")).toHaveText("5");

    const category = page.getByTestId("review-field-catalog.categoryId");
    await category.getByLabel("Decisión").selectOption("MANUALLY_EDITED");
    await category
      .getByLabel("Selección humana para Categoría")
      .selectOption(ADMIN_E2E_PRODUCT_FIXTURES.categoryA.id);
    await category.getByRole("button", { name: "Guardar decisión" }).click();
    await expect(page.getByTestId("pending-review-count")).toHaveText("4");

    const slug = page.getByTestId("review-field-catalog.slug");
    await slug.getByLabel("Decisión").selectOption("ACCEPTED");
    await slug.getByRole("button", { name: "Guardar decisión" }).click();
    await expect(page.getByTestId("pending-review-count")).toHaveText("3");

    const name = page.getByTestId("review-field-copy.name");
    await name.getByLabel("Decisión").selectOption("ACCEPTED");
    await name.getByRole("button", { name: "Guardar decisión" }).click();
    await expect(page.getByTestId("pending-review-count")).toHaveText("2");

    const sensor = page.getByTestId("review-field-sensor");
    await sensor.getByLabel("Decisión").selectOption("ACCEPTED");
    await sensor
      .getByText("Fuente preferida para la resolución")
      .locator("..")
      .getByRole("combobox")
      .selectOption(ids.source);
    await sensor.getByRole("button", { name: "Guardar decisión" }).click();
    await expect(page.getByTestId("pending-review-count")).toHaveText("1");

    await page.getByLabel("Precio PEN").fill("149.90");
    await page.getByRole("button", { name: "Guardar plan con precios humanos" }).click();
    await expect(page.getByTestId("pending-review-count")).toHaveText("0");
    await expect(page.getByRole("button", { name: "Aprobar propuesta" })).toBeEnabled();
    await page.getByRole("button", { name: "Aprobar propuesta" }).click();

    await expect(page.getByText("APPROVED", { exact: true }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Aplicar como borrador" })).toBeVisible();
    await page.getByRole("button", { name: "Aplicar como borrador" }).click();
    const productLink = page.getByRole("link", { name: "Abrir producto DRAFT" });
    await expect(productLink).toBeVisible();
    await productLink.click();
    await expect(page.getByRole("heading", { name: proposedName })).toBeVisible();

    const rows = await sql<{ status: string; price_cents: number }[]>`
      SELECT p.status, v.price_cents
      FROM products p JOIN product_variants v ON v.product_id = p.id
      WHERE p.slug = ${proposedSlug}
    `;
    expect(rows).toEqual([{ status: "DRAFT", price_cents: 14990 }]);
  });
});
