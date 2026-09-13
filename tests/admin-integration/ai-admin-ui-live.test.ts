import { createHash } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import postgres from "postgres";
import { assertLocalDatabaseTarget } from "@/lib/admin/test-target-guard";
import type { VerifiedAuthContextReady } from "@/lib/auth/rbac";
import {
  assertAdminProfileRuntimeCompatibility,
  assertAdminProviderHealthCheckSupported,
  assertAdminResearchSubmissionEligibility,
  getAdminAiSettings,
  getResearchJobDetail,
  getResearchWorkspaceBootstrap,
} from "@/lib/ai/admin/readers";
import { createResearchJob } from "@/lib/ai/research/job-service";

describe("GP-025 / CHK4-BR1 — safe Admin AI boundaries on local PostgreSQL", () => {
  const databaseUrl = assertLocalDatabaseTarget(
    process.env.DATABASE_URL ??
      process.env.DATABASE_MIGRATION_URL ??
      "postgres://postgres:postgres@127.0.0.1:54322/postgres"
  );
  let sql: postgres.Sql;
  const ids = {
    actor: "018f0025-4000-7000-8000-000000000101",
    googleProvider: "018f0025-4000-7000-8000-000000000102",
    googleProfile: "018f0025-4000-7000-8000-000000000103",
    credential: "018f0025-4000-7000-8000-000000000104",
    brand: "018f0025-4000-7000-8000-000000000105",
    category: "018f0025-4000-7000-8000-000000000106",
    draftProduct: "018f0025-4000-7000-8000-000000000107",
    job: "018f0025-4000-7000-8000-000000000108",
    item: "018f0025-4000-7000-8000-000000000109",
    proposal: "018f0025-4000-7000-8000-000000000110",
    openAiProvider: "018f0025-4000-7000-8000-000000000111",
    anthropicProvider: "018f0025-4000-7000-8000-000000000112",
    openAiProfile: "018f0025-4000-7000-8000-000000000113",
    anthropicProfile: "018f0025-4000-7000-8000-000000000114",
    publishedProduct: "018f0025-4000-7000-8000-000000000115",
    archivedProduct: "018f0025-4000-7000-8000-000000000116",
    missingProduct: "018f0025-4000-7000-8000-000000000117",
  };
  const actor: VerifiedAuthContextReady = {
    status: "READY",
    authUserId: ids.actor,
    email: "chk4-br1-reader@gamerperu.invalid",
    roles: ["SUPER_ADMIN"],
    permissions: new Set(["catalog:ai_research", "ai:manage_credentials"]),
  };

  async function cleanup() {
    await sql`DELETE FROM ai_product_proposals WHERE id = ${ids.proposal}`;
    await sql`
      DELETE FROM audit_events
      WHERE target_id IN (
        SELECT id::text FROM ai_research_jobs WHERE created_by_auth_user_id = ${ids.actor}
      )
    `;
    await sql`
      DELETE FROM ai_research_job_items
      WHERE job_id IN (
        SELECT id FROM ai_research_jobs WHERE created_by_auth_user_id = ${ids.actor}
      )
    `;
    await sql`DELETE FROM ai_research_jobs WHERE created_by_auth_user_id = ${ids.actor}`;
    await sql`DELETE FROM products WHERE id IN ${sql([
      ids.draftProduct,
      ids.publishedProduct,
      ids.archivedProduct,
    ])}`;
    await sql`DELETE FROM brands WHERE id = ${ids.brand}`;
    await sql`DELETE FROM categories WHERE id = ${ids.category}`;
    await sql`DELETE FROM ai_provider_credentials WHERE id = ${ids.credential}`;
    await sql`DELETE FROM ai_profiles WHERE id IN ${sql([
      ids.googleProfile,
      ids.openAiProfile,
      ids.anthropicProfile,
    ])}`;
    await sql`DELETE FROM ai_providers WHERE id IN ${sql([
      ids.googleProvider,
      ids.openAiProvider,
      ids.anthropicProvider,
    ])}`;
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
      VALUES
        (${ids.googleProvider}, 'google', 'Google CHK4-BR1 local', true, true, '{}', ${now}, ${now}),
        (${ids.openAiProvider}, 'openai', 'OpenAI CHK4-BR1 future', true, false, '{}', ${now}, ${now}),
        (${ids.anthropicProvider}, 'anthropic', 'Anthropic CHK4-BR1 future', true, false, '{}', ${now}, ${now})
    `;
    await sql`
      INSERT INTO ai_profiles (id, profile_key, provider_id, model_id, temperature, max_tokens, is_enabled, created_at, updated_at)
      VALUES
        (${ids.googleProfile}, 'PRODUCT_RESEARCH_FAST', ${ids.googleProvider}, 'gemini-local-fixture', '0.20', 1024, true, ${now}, ${now}),
        (${ids.openAiProfile}, 'PRODUCT_RESEARCH_DEEP', ${ids.openAiProvider}, 'openai-future-fixture', '0.20', 1024, true, ${now}, ${now}),
        (${ids.anthropicProfile}, 'SEO_COPY', ${ids.anthropicProvider}, 'anthropic-future-fixture', '0.20', 1024, true, ${now}, ${now})
    `;
    await sql`
      INSERT INTO ai_provider_credentials (
        id, provider_id, key_version, ciphertext, iv, auth_tag, masked_key, status,
        last_health_status, last_tested_at, created_at, updated_at
      ) VALUES (
        ${ids.credential}, ${ids.googleProvider}, 2, ${"ab".repeat(16)}, ${"cd".repeat(12)},
        ${"ef".repeat(16)}, '••••••br1', 'ACTIVE', 'UNTESTED', NULL, ${now}, ${now}
      )
    `;
    await sql`INSERT INTO brands (id, name, slug, status, created_at, updated_at) VALUES (${ids.brand}, 'Marca CHK4 BR1', 'marca-chk4-br1', 'PUBLISHED', ${now}, ${now})`;
    await sql`INSERT INTO categories (id, name, slug, status, display_order, created_at, updated_at) VALUES (${ids.category}, 'Categoría CHK4 BR1', 'categoria-chk4-br1', 'PUBLISHED', 0, ${now}, ${now})`;
    await sql`
      INSERT INTO products (id, brand_id, category_id, name, slug, status, is_featured, created_at, updated_at)
      VALUES
        (${ids.draftProduct}, ${ids.brand}, ${ids.category}, 'Producto CHK4 BR1 DRAFT', 'producto-chk4-br1-draft', 'DRAFT', false, ${now}, ${now}),
        (${ids.publishedProduct}, ${ids.brand}, ${ids.category}, 'Producto CHK4 BR1 PUBLISHED', 'producto-chk4-br1-published', 'PUBLISHED', false, ${now}, ${now}),
        (${ids.archivedProduct}, ${ids.brand}, ${ids.category}, 'Producto CHK4 BR1 ARCHIVED', 'producto-chk4-br1-archived', 'ARCHIVED', false, ${now}, ${now})
    `;
    await sql`
      INSERT INTO ai_research_jobs (
        id, mutation_request_digest, request_fingerprint, selected_profile_id, profile_snapshot,
        job_type, status, dispatch_status, inngest_event_id, total_items, completed_items,
        failed_items, created_by_auth_user_id, created_at, updated_at
      ) VALUES (
        ${ids.job}, ${createHash("sha256").update("chk4-br1-job").digest("hex")},
        ${createHash("sha256").update("chk4-br1-request").digest("hex")}, ${ids.googleProfile},
        ${sql.json({ profileKey: "PRODUCT_RESEARCH_FAST", providerId: ids.googleProvider, modelId: "gemini-local-fixture", temperature: 0.2, maxTokens: 1024 })},
        'SINGLE', 'COMPLETED', 'DISPATCHED', 'chk4-br1-local-event', 1, 1, 0, ${ids.actor}, ${now}, ${now}
      )
    `;
    await sql`
      INSERT INTO ai_research_job_items (
        id, job_id, item_index, input_query, mode, target_product_id,
        target_product_version_snapshot, identity_status, status, error_code,
        error_message, created_at, updated_at
      ) VALUES (
        ${ids.item}, ${ids.job}, 0, 'Producto CHK4 BR1', 'CREATE', NULL, NULL,
        'EXACT_MATCH', 'READY_FOR_REVIEW', NULL, 'internal raw value must not cross', ${now}, ${now}
      )
    `;
    await sql`
      INSERT INTO ai_product_proposals (
        id, job_item_id, proposed_name, proposed_slug, proposed_specifications,
        unmapped_specifications, proposed_variants, proposed_seo_draft, media_candidates,
        status, created_at, updated_at
      ) VALUES (
        ${ids.proposal}, ${ids.item}, 'Producto CHK4 BR1', 'producto-chk4-br1', '{}', '{}', '[]', '{}',
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

  it("returns server-derived runtime capability and only DRAFT ENRICH targets", async () => {
    const bootstrap = await getResearchWorkspaceBootstrap({ authContext: actor });
    expect(bootstrap.profiles).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: ids.googleProfile,
          providerDisplayName: "Google CHK4-BR1 local",
          researchExecutionSupported: true,
        }),
        expect.objectContaining({
          id: ids.openAiProfile,
          researchExecutionSupported: false,
        }),
        expect.objectContaining({
          id: ids.anthropicProfile,
          researchExecutionSupported: false,
        }),
      ])
    );
    expect(bootstrap.products).toContainEqual({
      id: ids.draftProduct,
      name: "Producto CHK4 BR1 DRAFT",
      slug: "producto-chk4-br1-draft",
      status: "DRAFT",
    });
    expect(bootstrap.products.map((product) => product.id)).not.toContain(ids.publishedProduct);
    expect(bootstrap.products.map((product) => product.id)).not.toContain(ids.archivedProduct);
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

  it("returns safe provider/profile capabilities without encrypted credential fields", async () => {
    const settings = await getAdminAiSettings({ authContext: actor });
    const serialized = JSON.stringify(settings);
    expect(settings.providerCapabilities).toEqual([
      {
        providerKey: "google",
        researchExecutionSupported: true,
        healthCheckSupported: true,
      },
      {
        providerKey: "openai",
        researchExecutionSupported: false,
        healthCheckSupported: false,
      },
      {
        providerKey: "anthropic",
        researchExecutionSupported: false,
        healthCheckSupported: false,
      },
    ]);
    expect(
      settings.providers.find((provider) => provider.id === ids.googleProvider)?.credential
    ).toMatchObject({
      maskedKey: "••••••br1",
      keyVersion: 2,
      lastHealthStatus: "UNTESTED",
    });
    expect(settings.profiles.find((profile) => profile.id === ids.openAiProfile)).toMatchObject({
      isEnabled: true,
      researchExecutionSupported: false,
    });
    expect(serialized).not.toMatch(/ciphertext|authTag|auth_tag|"iv"|abababab|efefefef/);
  });

  it("enforces runtime compatibility for enabled profiles and health checks", async () => {
    await expect(
      assertAdminProfileRuntimeCompatibility(
        { providerId: ids.googleProvider, isEnabled: true },
        { authContext: actor }
      )
    ).resolves.toBeUndefined();
    await expect(
      assertAdminProfileRuntimeCompatibility(
        { providerId: ids.openAiProvider, isEnabled: true },
        { authContext: actor }
      )
    ).rejects.toThrow(/^AI_PROFILE_PROVIDER_UNSUPPORTED:/);
    await expect(
      assertAdminProfileRuntimeCompatibility(
        { providerId: ids.anthropicProvider, isEnabled: false },
        { authContext: actor }
      )
    ).resolves.toBeUndefined();
    await expect(
      assertAdminProviderHealthCheckSupported(ids.googleProvider, { authContext: actor })
    ).resolves.toBeUndefined();
    await expect(
      assertAdminProviderHealthCheckSupported(ids.openAiProvider, { authContext: actor })
    ).rejects.toThrow(/^AI_PROVIDER_HEALTH_CHECK_UNSUPPORTED:/);
    await expect(
      assertAdminProviderHealthCheckSupported(ids.anthropicProvider, { authContext: actor })
    ).rejects.toThrow(/^AI_PROVIDER_HEALTH_CHECK_UNSUPPORTED:/);
  });

  it("rejects unsupported research profiles before any job, item, or dispatch state exists", async () => {
    for (const selectedProfileId of [ids.openAiProfile, ids.anthropicProfile]) {
      await expect(
        assertAdminResearchSubmissionEligibility(
          {
            selectedProfileId,
            items: [{ mode: "CREATE" }],
          },
          { authContext: actor }
        )
      ).rejects.toThrow(/^AI_RESEARCH_PROVIDER_UNSUPPORTED:/);
    }
    const [jobCount] = await sql<{ count: number }[]>`
      SELECT count(*)::int AS count
      FROM ai_research_jobs
      WHERE selected_profile_id IN (${ids.openAiProfile}, ${ids.anthropicProfile})
    `;
    const [itemCount] = await sql<{ count: number }[]>`
      SELECT count(*)::int AS count
      FROM ai_research_job_items item
      JOIN ai_research_jobs job ON job.id = item.job_id
      WHERE job.selected_profile_id IN (${ids.openAiProfile}, ${ids.anthropicProfile})
    `;
    expect(jobCount?.count).toBe(0);
    expect(itemCount?.count).toBe(0);
  });

  it("admits only DRAFT ENRICH and preserves server-authoritative version capture", async () => {
    const draftInput = {
      selectedProfileId: ids.googleProfile,
      items: [
        { query: "Draft eligible", mode: "ENRICH" as const, targetProductId: ids.draftProduct },
      ],
    };
    expect(JSON.stringify(draftInput)).not.toContain("targetProductVersionSnapshot");
    await expect(
      assertAdminResearchSubmissionEligibility(draftInput, { authContext: actor })
    ).resolves.toBeUndefined();
    for (const targetProductId of [ids.publishedProduct, ids.archivedProduct]) {
      await expect(
        assertAdminResearchSubmissionEligibility(
          {
            selectedProfileId: ids.googleProfile,
            items: [{ mode: "ENRICH", targetProductId }],
          },
          { authContext: actor }
        )
      ).rejects.toThrow(/^AI_ENRICH_TARGET_NOT_DRAFT:/);
    }
    await expect(
      assertAdminResearchSubmissionEligibility(
        {
          selectedProfileId: ids.googleProfile,
          items: [
            {
              mode: "ENRICH",
              targetProductId: ids.missingProduct,
            },
          ],
        },
        { authContext: actor }
      )
    ).rejects.toThrow(/^AI_TARGET_PRODUCT_NOT_FOUND:/);

    const created = await createResearchJob(
      {
        mutationRequestId: crypto.randomUUID(),
        ...draftInput,
      },
      { authContext: actor }
    );
    const [captured] = await sql<
      { target_product_version_snapshot: Date | null }[]
    >`SELECT target_product_version_snapshot FROM ai_research_job_items WHERE job_id = ${created.jobId}`;
    expect(captured?.target_product_version_snapshot?.toISOString()).toBe(
      "2026-09-13T12:00:00.000Z"
    );
  });

  it("fails closed before reads or admission checks without current permission", async () => {
    const denied = { ...actor, permissions: new Set() } as VerifiedAuthContextReady;
    await expect(getResearchWorkspaceBootstrap({ authContext: denied })).rejects.toMatchObject({
      name: "ForbiddenError",
    });
    await expect(getAdminAiSettings({ authContext: denied })).rejects.toMatchObject({
      name: "ForbiddenError",
    });
    await expect(
      assertAdminResearchSubmissionEligibility(
        { selectedProfileId: ids.googleProfile, items: [{ mode: "CREATE" }] },
        { authContext: denied }
      )
    ).rejects.toMatchObject({ name: "ForbiddenError" });
  });
});
