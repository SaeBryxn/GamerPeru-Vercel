import { createHash } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import postgres from "postgres";
import { assertLocalDatabaseTarget } from "@/lib/admin/test-target-guard";
import type { VerifiedAuthContextReady } from "@/lib/auth/rbac";
import {
  getAdminAiSettings,
  getResearchJobDetail,
  getResearchWorkspaceBootstrap,
} from "@/lib/ai/admin/readers";

describe("GP-025 / CHK4 — safe Admin AI readers on local PostgreSQL", () => {
  const databaseUrl = assertLocalDatabaseTarget(
    process.env.DATABASE_URL ??
      process.env.DATABASE_MIGRATION_URL ??
      "postgres://postgres:postgres@127.0.0.1:54322/postgres"
  );
  let sql: postgres.Sql;
  const ids = {
    actor: "018f0025-4000-7000-8000-000000000101",
    provider: "018f0025-4000-7000-8000-000000000102",
    profile: "018f0025-4000-7000-8000-000000000103",
    credential: "018f0025-4000-7000-8000-000000000104",
    brand: "018f0025-4000-7000-8000-000000000105",
    category: "018f0025-4000-7000-8000-000000000106",
    product: "018f0025-4000-7000-8000-000000000107",
    job: "018f0025-4000-7000-8000-000000000108",
    item: "018f0025-4000-7000-8000-000000000109",
    proposal: "018f0025-4000-7000-8000-000000000110",
  };
  const actor: VerifiedAuthContextReady = {
    status: "READY",
    authUserId: ids.actor,
    email: "chk4-reader@gamerperu.invalid",
    roles: ["SUPER_ADMIN"],
    permissions: new Set(["catalog:ai_research", "ai:manage_credentials"]),
  };

  async function cleanup() {
    await sql`DELETE FROM ai_product_proposals WHERE id = ${ids.proposal}`;
    await sql`DELETE FROM ai_research_job_items WHERE id = ${ids.item}`;
    await sql`DELETE FROM ai_research_jobs WHERE id = ${ids.job}`;
    await sql`DELETE FROM products WHERE id = ${ids.product}`;
    await sql`DELETE FROM brands WHERE id = ${ids.brand}`;
    await sql`DELETE FROM categories WHERE id = ${ids.category}`;
    await sql`DELETE FROM ai_provider_credentials WHERE id = ${ids.credential}`;
    await sql`DELETE FROM ai_profiles WHERE id = ${ids.profile}`;
    await sql`DELETE FROM ai_providers WHERE id = ${ids.provider}`;
    await sql`DELETE FROM auth.users WHERE id = ${ids.actor}`;
  }

  beforeAll(async () => {
    sql = postgres(databaseUrl, { max: 1 });
    await cleanup();
    const now = new Date("2026-09-13T12:00:00.000Z");
    await sql`
      INSERT INTO auth.users (id, email, raw_app_meta_data, raw_user_meta_data, is_super_admin, created_at, updated_at)
      VALUES (${ids.actor}, ${actor.email}, '{"provider":"email"}', '{}', false, ${now}, ${now})
    `;
    await sql`
      INSERT INTO ai_providers (id, provider_key, display_name, is_enabled, is_default, settings, created_at, updated_at)
      VALUES (${ids.provider}, 'anthropic', 'Anthropic CHK4 local', true, true, '{"region":"global"}', ${now}, ${now})
    `;
    await sql`
      INSERT INTO ai_profiles (id, profile_key, provider_id, model_id, temperature, max_tokens, is_enabled, created_at, updated_at)
      VALUES (${ids.profile}, 'PRODUCT_RESEARCH_FAST', ${ids.provider}, 'gemini-local-fixture', '0.20', 1024, true, ${now}, ${now})
    `;
    await sql`
      INSERT INTO ai_provider_credentials (
        id, provider_id, key_version, ciphertext, iv, auth_tag, masked_key, status,
        last_health_status, last_tested_at, created_at, updated_at
      ) VALUES (
        ${ids.credential}, ${ids.provider}, 2, ${"ab".repeat(16)}, ${"cd".repeat(12)},
        ${"ef".repeat(16)}, '••••••chk4', 'ACTIVE', 'UNTESTED', NULL, ${now}, ${now}
      )
    `;
    await sql`INSERT INTO brands (id, name, slug, status, created_at, updated_at) VALUES (${ids.brand}, 'Marca CHK4', 'marca-chk4', 'PUBLISHED', ${now}, ${now})`;
    await sql`INSERT INTO categories (id, name, slug, status, display_order, created_at, updated_at) VALUES (${ids.category}, 'Categoría CHK4', 'categoria-chk4', 'PUBLISHED', 0, ${now}, ${now})`;
    await sql`INSERT INTO products (id, brand_id, category_id, name, slug, status, is_featured, created_at, updated_at) VALUES (${ids.product}, ${ids.brand}, ${ids.category}, 'Producto CHK4 DRAFT', 'producto-chk4-draft', 'DRAFT', false, ${now}, ${now})`;
    await sql`
      INSERT INTO ai_research_jobs (
        id, mutation_request_digest, request_fingerprint, selected_profile_id, profile_snapshot,
        job_type, status, dispatch_status, inngest_event_id, total_items, completed_items,
        failed_items, created_by_auth_user_id, created_at, updated_at
      ) VALUES (
        ${ids.job}, ${createHash("sha256").update("chk4-job").digest("hex")},
        ${createHash("sha256").update("chk4-request").digest("hex")}, ${ids.profile},
        ${sql.json({ profileKey: "PRODUCT_RESEARCH_FAST", providerId: ids.provider, modelId: "gemini-local-fixture", temperature: 0.2, maxTokens: 1024 })},
        'SINGLE', 'COMPLETED', 'DISPATCHED', 'chk4-local-event', 1, 1, 0, ${ids.actor}, ${now}, ${now}
      )
    `;
    await sql`
      INSERT INTO ai_research_job_items (
        id, job_id, item_index, input_query, mode, target_product_id,
        target_product_version_snapshot, identity_status, status, error_code,
        error_message, created_at, updated_at
      ) VALUES (
        ${ids.item}, ${ids.job}, 0, 'Producto CHK4', 'CREATE', NULL, NULL,
        'EXACT_MATCH', 'READY_FOR_REVIEW', NULL, 'internal raw value must not cross', ${now}, ${now}
      )
    `;
    await sql`
      INSERT INTO ai_product_proposals (
        id, job_item_id, proposed_name, proposed_slug, proposed_specifications,
        unmapped_specifications, proposed_variants, proposed_seo_draft, media_candidates,
        status, created_at, updated_at
      ) VALUES (
        ${ids.proposal}, ${ids.item}, 'Producto CHK4', 'producto-chk4', '{}', '{}', '[]', '{}',
        '[]', 'DRAFT', ${now}, ${now}
      )
    `;
  });

  afterAll(async () => {
    if (sql) {
      await cleanup();
      await sql.end();
    }
  });

  it("returns bounded workspace profiles, products, recent jobs and durable progress", async () => {
    const bootstrap = await getResearchWorkspaceBootstrap({ authContext: actor });
    expect(bootstrap.profiles).toContainEqual({
      id: ids.profile,
      profileKey: "PRODUCT_RESEARCH_FAST",
      modelId: "gemini-local-fixture",
      isEnabled: true,
      providerDisplayName: "Anthropic CHK4 local",
      providerEnabled: true,
    });
    expect(bootstrap.products).toContainEqual({
      id: ids.product,
      name: "Producto CHK4 DRAFT",
      slug: "producto-chk4-draft",
      status: "DRAFT",
    });
    expect(bootstrap.recentJobs.find((job) => job.jobId === ids.job)).toMatchObject({
      totalItems: 1,
      completedItems: 1,
      failedItems: 0,
      reviewableItems: 1,
      activeItems: 0,
    });
    const detail = await getResearchJobDetail(ids.job, { authContext: actor });
    expect(detail?.items[0]).toMatchObject({
      status: "READY_FOR_REVIEW",
      proposalId: ids.proposal,
      proposalStatus: "DRAFT",
    });
    expect(JSON.stringify(detail)).not.toContain("internal raw value must not cross");
  });

  it("returns only safe settings projections without encrypted credential fields", async () => {
    const settings = await getAdminAiSettings({ authContext: actor });
    const serialized = JSON.stringify(settings);
    expect(
      settings.providers.find((provider) => provider.id === ids.provider)?.credential
    ).toMatchObject({
      maskedKey: "••••••chk4",
      keyVersion: 2,
      lastHealthStatus: "UNTESTED",
    });
    expect(serialized).not.toMatch(/ciphertext|authTag|auth_tag|"iv"|abababab|efefefef/);
  });

  it("fails closed before any read for missing research or credential permission", async () => {
    const denied = { ...actor, permissions: new Set() } as VerifiedAuthContextReady;
    await expect(getResearchWorkspaceBootstrap({ authContext: denied })).rejects.toMatchObject({
      name: "ForbiddenError",
    });
    await expect(getAdminAiSettings({ authContext: denied })).rejects.toMatchObject({
      name: "ForbiddenError",
    });
  });
});
