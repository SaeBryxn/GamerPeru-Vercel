import { createHash } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import postgres from "postgres";
import { generateUuidV7 } from "@/db/utils/uuid";
import { assertLocalDatabaseTarget } from "@/lib/admin/test-target-guard";
import {
  approveProposal,
  getProposalReviewDetail,
  initializeCatalogSelectionReviews,
  rejectProposal,
  reviewProposalField,
  setHumanVariantPlan,
} from "@/lib/ai/proposals/review-service";
import type { VerifiedAuthContextReady } from "@/lib/auth/rbac";

describe("GP-025 / CHK3-B — proposal review lifecycle live PostgreSQL verification", () => {
  const rawDatabaseUrl =
    process.env.DATABASE_URL ??
    process.env.DATABASE_MIGRATION_URL ??
    "postgres://postgres:postgres@127.0.0.1:54322/postgres";
  const databaseUrl = assertLocalDatabaseTarget(rawDatabaseUrl);
  let sql: postgres.Sql;

  const ids = {
    actorOne: "018f0025-3000-7000-8000-000000000001",
    actorTwo: "018f0025-3000-7000-8000-000000000002",
    provider: "018f0025-3000-7000-8000-000000000010",
    profile: "018f0025-3000-7000-8000-000000000020",
    brand: "018f0025-3000-7000-8000-000000000030",
    unpublishedBrand: "018f0025-3000-7000-8000-000000000031",
    category: "018f0025-3000-7000-8000-000000000040",
    noSchemaCategory: "018f0025-3000-7000-8000-000000000041",
    schema: "018f0025-3000-7000-8000-000000000042",
    targetProduct: "018f0025-3000-7000-8000-000000000050",
  };
  const targetVersion = new Date("2026-09-12T12:00:00.000Z");
  const actor = (id: string): VerifiedAuthContextReady => ({
    status: "READY",
    authUserId: id,
    email: "proposal-review@gamerperu.invalid",
    roles: ["ADMIN_CATALOG"],
    permissions: new Set(["catalog:ai_research"]),
  });

  interface SeedOptions {
    conflict?: boolean;
    enrich?: boolean;
    includeVariants?: boolean;
    proposedSlug?: string;
    proposedSpecifications?: Record<string, unknown>;
  }

  interface SeededProposal {
    proposalId: string;
    itemId: string;
    supportSourceId: string;
    conflictSourceId: string;
    updatedAt: string;
  }

  async function cleanFixtures(): Promise<void> {
    await sql.begin(async (tx) => {
      await tx`DELETE FROM ai_proposal_field_sources WHERE field_review_id IN (
        SELECT review.id FROM ai_proposal_field_reviews review
        JOIN ai_product_proposals proposal ON proposal.id = review.proposal_id
        JOIN ai_research_job_items item ON item.id = proposal.job_item_id
        JOIN ai_research_jobs job ON job.id = item.job_id
        WHERE job.created_by_auth_user_id IN (${ids.actorOne}, ${ids.actorTwo})
      )`;
      await tx`DELETE FROM ai_proposal_field_reviews WHERE proposal_id IN (
        SELECT proposal.id FROM ai_product_proposals proposal
        JOIN ai_research_job_items item ON item.id = proposal.job_item_id
        JOIN ai_research_jobs job ON job.id = item.job_id
        WHERE job.created_by_auth_user_id IN (${ids.actorOne}, ${ids.actorTwo})
      )`;
      await tx`DELETE FROM ai_product_proposals WHERE job_item_id IN (
        SELECT item.id FROM ai_research_job_items item JOIN ai_research_jobs job ON job.id = item.job_id
        WHERE job.created_by_auth_user_id IN (${ids.actorOne}, ${ids.actorTwo})
      )`;
      await tx`DELETE FROM ai_sources WHERE job_item_id IN (
        SELECT item.id FROM ai_research_job_items item JOIN ai_research_jobs job ON job.id = item.job_id
        WHERE job.created_by_auth_user_id IN (${ids.actorOne}, ${ids.actorTwo})
      )`;
      await tx`DELETE FROM ai_research_job_items WHERE job_id IN (
        SELECT id FROM ai_research_jobs WHERE created_by_auth_user_id IN (${ids.actorOne}, ${ids.actorTwo})
      )`;
      await tx`DELETE FROM ai_research_jobs WHERE created_by_auth_user_id IN (${ids.actorOne}, ${ids.actorTwo})`;
      await tx`DELETE FROM audit_events WHERE actor_id IN (${ids.actorOne}, ${ids.actorTwo})`;
    });
  }

  async function seedProposal(options: SeedOptions = {}): Promise<SeededProposal> {
    const jobId = generateUuidV7();
    const itemId = generateUuidV7();
    const proposalId = generateUuidV7();
    const supportSourceId = generateUuidV7();
    const conflictSourceId = generateUuidV7();
    const now = new Date();
    const specifications = options.proposedSpecifications ?? { weight_g: 54 };
    const digest = createHash("sha256").update(jobId).digest("hex");
    const fingerprint = createHash("sha256").update(itemId).digest("hex");
    await sql`
      INSERT INTO ai_research_jobs (
        id, mutation_request_digest, request_fingerprint, selected_profile_id, profile_snapshot,
        job_type, status, dispatch_status, inngest_event_id, total_items, completed_items,
        failed_items, created_by_auth_user_id
      ) VALUES (
        ${jobId}, ${digest}, ${fingerprint}, ${ids.profile},
        ${sql.json({ profileKey: "CHK3_B_TEST", providerId: ids.provider, modelId: "test", temperature: 0.2, maxTokens: 512 })},
        'SINGLE', 'COMPLETED', 'DISPATCHED', ${`chk3-b-${jobId}`}, 1, 1, 0, ${ids.actorOne}
      )
    `;
    await sql`
      INSERT INTO ai_research_job_items (
        id, job_id, item_index, input_query, mode, target_product_id,
        target_product_version_snapshot, identity_status, status, created_at, updated_at
      ) VALUES (
        ${itemId}, ${jobId}, 0, 'GP CHK3-B Mouse', ${options.enrich ? "ENRICH" : "CREATE"},
        ${options.enrich ? ids.targetProduct : null}, ${options.enrich ? targetVersion : null},
        'EXACT_MATCH', ${options.conflict ? "SOURCE_CONFLICT" : "READY_FOR_REVIEW"}, ${now}, ${now}
      )
    `;
    await sql`
      INSERT INTO ai_sources (
        id, job_item_id, original_url, resolved_url, source_name, retrieval_method,
        trust_tier, trust_basis, fetched_at, content_sha256, fetch_status, snippet
      ) VALUES
        (${supportSourceId}, ${itemId}, 'https://example.com/support', 'https://example.com/support',
          'Official support', 'DIRECT_URL', 'TIER_1_OFFICIAL_MANUFACTURER',
          'CANONICAL_BRAND_DOMAIN_MATCH', ${now}, ${"a".repeat(64)}, 'SUCCESS', 'Safe support evidence'),
        (${conflictSourceId}, ${itemId}, 'https://example.com/conflict', 'https://example.com/conflict',
          'Conflicting source', 'SEARCH_API', 'TIER_5_REPUTABLE_SECONDARY',
          'UNVERIFIED_DEFAULT', ${now}, ${"b".repeat(64)}, 'SUCCESS', 'Safe conflicting evidence')
    `;
    await sql`
      INSERT INTO ai_product_proposals (
        id, job_item_id, proposed_name, proposed_slug, proposed_subtitle,
        proposed_description, proposed_specifications, proposed_variants, proposed_seo_draft,
        media_candidates, status, created_at, updated_at
      ) VALUES (
        ${proposalId}, ${itemId}, 'GP CHK3-B Mouse', ${options.proposedSlug ?? "gp-chk3-b-mouse"},
        NULL, NULL, ${sql.json(JSON.parse(JSON.stringify(specifications)))},
        ${sql.json(options.includeVariants ? [{ sku: "AI-SKU", attributes: { color: "black" } }] : [])},
        ${sql.json({ title: null, description: null })}, '[]'::jsonb,
        'DRAFT', ${now}, ${now}
      )
    `;

    const insertReview = async (
      fieldPath: string,
      proposedValue: unknown,
      verificationState: "AI_INFERRED" | "SOURCE_CONFLICT" = "AI_INFERRED"
    ): Promise<string> => {
      const reviewId = generateUuidV7();
      await sql`
        INSERT INTO ai_proposal_field_reviews (
          id, proposal_id, field_path, proposed_value, decision, verification_state,
          conflict_details, created_at, updated_at
        ) VALUES (
          ${reviewId}, ${proposalId}, ${fieldPath}, ${sql.json(JSON.parse(JSON.stringify(proposedValue)))}, 'PENDING',
          ${verificationState},
          ${verificationState === "SOURCE_CONFLICT" ? sql.json({ competingValues: [55] }) : null},
          ${now}, ${now}
        )
      `;
      return reviewId;
    };

    const nameReviewId = await insertReview("copy.name", "GP CHK3-B Mouse");
    const specEntries = Object.entries(specifications);
    for (const [fieldPath, value] of specEntries) {
      const reviewId = await insertReview(
        fieldPath,
        value,
        options.conflict ? "SOURCE_CONFLICT" : "AI_INFERRED"
      );
      await sql`
        INSERT INTO ai_proposal_field_sources (
          id, field_review_id, source_id, relationship, source_value
        ) VALUES (${generateUuidV7()}, ${reviewId}, ${supportSourceId}, 'SUPPORTS', ${sql.json(JSON.parse(JSON.stringify(value)))})
      `;
      if (options.conflict) {
        await sql`
          INSERT INTO ai_proposal_field_sources (
            id, field_review_id, source_id, relationship, source_value
          ) VALUES (${generateUuidV7()}, ${reviewId}, ${conflictSourceId}, 'CONFLICTS', ${sql.json(55)})
        `;
      }
    }
    await sql`
      INSERT INTO ai_proposal_field_sources (
        id, field_review_id, source_id, relationship, source_value
      ) VALUES (${generateUuidV7()}, ${nameReviewId}, ${supportSourceId}, 'CONTEXT_ONLY', NULL)
    `;
    if (options.includeVariants) {
      const variantReviewId = await insertReview("research.variants", [
        { sku: "AI-SKU", attributes: { color: "black" } },
      ]);
      await sql`
        INSERT INTO ai_proposal_field_sources (
          id, field_review_id, source_id, relationship, source_value
        ) VALUES (${generateUuidV7()}, ${variantReviewId}, ${supportSourceId}, 'CONTEXT_ONLY', NULL)
      `;
    }
    return {
      proposalId,
      itemId,
      supportSourceId,
      conflictSourceId,
      updatedAt: now.toISOString(),
    };
  }

  async function initialize(seed: SeededProposal): Promise<string> {
    return (
      await initializeCatalogSelectionReviews(
        {
          proposalId: seed.proposalId,
          expectedProposalUpdatedAt: seed.updatedAt,
        },
        { authContext: actor(ids.actorOne) }
      )
    ).proposalUpdatedAt;
  }

  async function decide(
    proposalId: string,
    version: string,
    fieldPath: string,
    decision: "PENDING" | "ACCEPTED" | "REJECTED" | "MANUALLY_EDITED",
    selectedValue?: unknown,
    preferredSourceId?: string | null,
    actorId = ids.actorOne
  ): Promise<string> {
    return (
      await reviewProposalField(
        {
          proposalId,
          expectedProposalUpdatedAt: version,
          fieldPath,
          decision,
          selectedValue,
          preferredSourceId,
        },
        { authContext: actor(actorId) }
      )
    ).proposalUpdatedAt;
  }

  async function readyForApproval(
    seed: SeededProposal,
    options: { categoryId?: string; rejectSpec?: boolean } = {}
  ): Promise<string> {
    let version = await initialize(seed);
    version = await decide(
      seed.proposalId,
      version,
      "catalog.brandId",
      "MANUALLY_EDITED",
      ids.brand
    );
    version = await decide(
      seed.proposalId,
      version,
      "catalog.categoryId",
      "MANUALLY_EDITED",
      options.categoryId ?? ids.category
    );
    version = await decide(seed.proposalId, version, "catalog.slug", "ACCEPTED");
    version = await decide(seed.proposalId, version, "copy.name", "ACCEPTED");
    for (const key of Object.keys(
      (await getProposalReviewDetail(seed.proposalId, { authContext: actor(ids.actorOne) }))
        .proposal.proposedSpecifications as Record<string, unknown>
    )) {
      version = await decide(
        seed.proposalId,
        version,
        key,
        options.rejectSpec ? "REJECTED" : "ACCEPTED",
        undefined,
        options.rejectSpec
          ? null
          : seed.conflictSourceId === seed.supportSourceId
            ? null
            : undefined
      );
    }
    return version;
  }

  async function catalogSnapshot() {
    const [counts] = await sql`
      SELECT
        (SELECT count(*)::int FROM products WHERE id = ${ids.targetProduct}) AS products,
        (SELECT count(*)::int FROM product_variants WHERE product_id = ${ids.targetProduct}) AS variants,
        (SELECT count(*)::int FROM product_specifications WHERE product_id = ${ids.targetProduct}) AS specifications,
        (SELECT count(*)::int FROM inventory_items inventory
          JOIN product_variants variant ON variant.id = inventory.variant_id
          WHERE variant.product_id = ${ids.targetProduct}) AS inventory,
        (SELECT count(DISTINCT order_item.order_id)::int FROM order_items order_item
          JOIN product_variants variant ON variant.id = order_item.variant_id
          WHERE variant.product_id = ${ids.targetProduct}) AS orders,
        (SELECT count(*)::int FROM payments payment
          JOIN order_items order_item ON order_item.order_id = payment.order_id
          JOIN product_variants variant ON variant.id = order_item.variant_id
          WHERE variant.product_id = ${ids.targetProduct}) AS payments
    `;
    const [target] = await sql`
      SELECT brand_id, category_id, name, slug, updated_at
      FROM products WHERE id = ${ids.targetProduct}
    `;
    return { counts, target };
  }

  beforeAll(async () => {
    sql = postgres(databaseUrl, { max: 8 });
    await sql`
      INSERT INTO auth.users (id, email, raw_app_meta_data, raw_user_meta_data, is_super_admin, created_at, updated_at)
      VALUES
        (${ids.actorOne}, 'chk3b-one@gamerperu.invalid', '{"provider":"email"}', '{}', false, NOW(), NOW()),
        (${ids.actorTwo}, 'chk3b-two@gamerperu.invalid', '{"provider":"email"}', '{}', false, NOW(), NOW())
      ON CONFLICT (id) DO UPDATE SET updated_at = NOW()
    `;
    await sql`
      INSERT INTO ai_providers (id, provider_key, display_name, is_enabled, is_default, settings)
      VALUES (${ids.provider}, 'chk3-b-test', 'CHK3-B Test', true, false, '{}')
      ON CONFLICT (id) DO NOTHING
    `;
    await sql`
      INSERT INTO ai_profiles (id, profile_key, provider_id, model_id, temperature, max_tokens, is_enabled)
      VALUES (${ids.profile}, 'CHK3_B_TEST', ${ids.provider}, 'test', 0.20, 512, true)
      ON CONFLICT (id) DO NOTHING
    `;
    await sql`
      INSERT INTO brands (id, name, slug, status)
      VALUES
        (${ids.brand}, 'CHK3-B Published Brand', 'chk3-b-published-brand', 'PUBLISHED'),
        (${ids.unpublishedBrand}, 'CHK3-B Draft Brand', 'chk3-b-draft-brand', 'DRAFT')
      ON CONFLICT (id) DO NOTHING
    `;
    await sql`
      INSERT INTO categories (id, name, slug, display_order, status)
      VALUES
        (${ids.category}, 'CHK3-B Category', 'chk3-b-category', 2530, 'PUBLISHED'),
        (${ids.noSchemaCategory}, 'CHK3-B No Schema', 'chk3-b-no-schema', 2531, 'PUBLISHED')
      ON CONFLICT (id) DO NOTHING
    `;
    await sql`
      INSERT INTO category_specification_schemas (
        id, category_id, schema_version, field_definitions, is_active
      ) VALUES (
        ${ids.schema}, ${ids.category}, 1,
        ${sql.json([
          {
            key: "weight_g",
            label: "Weight",
            dataType: "number",
            unit: "g",
            filterable: true,
            filterKind: "NUMBER_RANGE",
            publicParam: "weight",
            displayOrder: 0,
            min: 1,
            max: 200,
            step: 1,
          },
        ])}, true
      ) ON CONFLICT (id) DO NOTHING
    `;
    await sql`UPDATE categories SET current_spec_schema_id = ${ids.schema} WHERE id = ${ids.category}`;
    await sql`
      INSERT INTO products (id, brand_id, category_id, name, slug, status, created_at, updated_at)
      VALUES (${ids.targetProduct}, ${ids.brand}, ${ids.category}, 'Existing Target',
        'chk3-b-existing-target', 'DRAFT', NOW(), ${targetVersion})
      ON CONFLICT (id) DO UPDATE SET updated_at = EXCLUDED.updated_at
    `;
  });

  beforeEach(async () => {
    await cleanFixtures();
    await sql`UPDATE brands SET status = 'PUBLISHED' WHERE id = ${ids.brand}`;
    await sql`UPDATE brands SET status = 'DRAFT' WHERE id = ${ids.unpublishedBrand}`;
    await sql`UPDATE categories SET status = 'PUBLISHED' WHERE id IN (${ids.category}, ${ids.noSchemaCategory})`;
    await sql`UPDATE products SET updated_at = ${targetVersion} WHERE id = ${ids.targetProduct}`;
  });

  afterAll(async () => {
    if (!sql) return;
    await cleanFixtures();
    await sql`DELETE FROM products WHERE id = ${ids.targetProduct}`;
    await sql`UPDATE categories SET current_spec_schema_id = NULL WHERE id = ${ids.category}`;
    await sql`DELETE FROM category_specification_schemas WHERE id = ${ids.schema}`;
    await sql`DELETE FROM categories WHERE id IN (${ids.category}, ${ids.noSchemaCategory})`;
    await sql`DELETE FROM brands WHERE id IN (${ids.brand}, ${ids.unpublishedBrand})`;
    await sql`DELETE FROM ai_profiles WHERE id = ${ids.profile}`;
    await sql`DELETE FROM ai_providers WHERE id = ${ids.provider}`;
    await sql`DELETE FROM auth.users WHERE id IN (${ids.actorOne}, ${ids.actorTwo})`;
    await sql.end();
  });

  it("enforces catalog:ai_research for reads and mutations", async () => {
    const seed = await seedProposal();
    const unauthorized: VerifiedAuthContextReady = {
      ...actor(ids.actorOne),
      permissions: new Set(),
    };
    await expect(
      getProposalReviewDetail(seed.proposalId, { authContext: unauthorized })
    ).rejects.toThrow("Missing catalog:ai_research permission");
    await expect(
      initializeCatalogSelectionReviews(
        { proposalId: seed.proposalId, expectedProposalUpdatedAt: seed.updatedAt },
        { authContext: unauthorized }
      )
    ).rejects.toThrow("Missing catalog:ai_research permission");
  });

  it("returns a safe review DTO with item snapshot, fields, links and normalized sources", async () => {
    const seed = await seedProposal({ enrich: true });
    const detail = await getProposalReviewDetail(seed.proposalId, {
      authContext: actor(ids.actorOne),
    });
    expect(detail.item).toMatchObject({
      mode: "ENRICH",
      targetProductId: ids.targetProduct,
      targetProductVersionSnapshot: targetVersion.toISOString(),
    });
    expect(detail.fields.map((field) => field.fieldPath)).toEqual(["copy.name", "weight_g"]);
    expect(detail.sources).toHaveLength(1);
    expect(JSON.stringify(detail)).not.toMatch(/credential|token|cookie|prompt|api.?key/i);
  });

  it("initializes exactly three catalog rows with JSON-null identity proposals and replays harmlessly", async () => {
    const seed = await seedProposal();
    const first = await initializeCatalogSelectionReviews(
      { proposalId: seed.proposalId, expectedProposalUpdatedAt: seed.updatedAt },
      { authContext: actor(ids.actorOne) }
    );
    expect(first.replayed).toBe(false);
    expect(first.proposalUpdatedAt).not.toBe(seed.updatedAt);
    const rows = await sql`
      SELECT field_path, jsonb_typeof(proposed_value) AS proposed_type, proposed_value,
        selected_value, decision, verification_state, preferred_source_id,
        reviewed_by_auth_user_id, reviewed_at
      FROM ai_proposal_field_reviews
      WHERE proposal_id = ${seed.proposalId} AND field_path LIKE 'catalog.%'
      ORDER BY field_path
    `;
    expect(rows).toEqual([
      expect.objectContaining({
        field_path: "catalog.brandId",
        proposed_type: "null",
        selected_value: null,
        decision: "PENDING",
        verification_state: "UNVERIFIED",
      }),
      expect.objectContaining({
        field_path: "catalog.categoryId",
        proposed_type: "null",
        selected_value: null,
        decision: "PENDING",
        verification_state: "UNVERIFIED",
      }),
      expect.objectContaining({
        field_path: "catalog.slug",
        proposed_type: "string",
        proposed_value: "gp-chk3-b-mouse",
        decision: "PENDING",
        verification_state: "AI_INFERRED",
      }),
    ]);
    const replay = await initializeCatalogSelectionReviews(
      { proposalId: seed.proposalId, expectedProposalUpdatedAt: seed.updatedAt },
      { authContext: actor(ids.actorTwo) }
    );
    expect(replay).toMatchObject({ replayed: true, proposalUpdatedAt: first.proposalUpdatedAt });
  });

  it("serializes concurrent initialization into one atomic set", async () => {
    const seed = await seedProposal();
    const results = await Promise.all(
      Array.from({ length: 6 }, () =>
        initializeCatalogSelectionReviews(
          { proposalId: seed.proposalId, expectedProposalUpdatedAt: seed.updatedAt },
          { authContext: actor(ids.actorOne) }
        )
      )
    );
    expect(results.filter((result) => !result.replayed)).toHaveLength(1);
    expect(
      (
        await sql`SELECT count(*)::int AS count FROM ai_proposal_field_reviews WHERE proposal_id = ${seed.proposalId} AND field_path LIKE 'catalog.%'`
      )[0]!.count
    ).toBe(3);
  });

  it("fails closed on partial initialization, copy divergence and non-canonical stored slug", async () => {
    const partial = await seedProposal();
    await sql`
      INSERT INTO ai_proposal_field_reviews (
        id, proposal_id, field_path, proposed_value, decision, verification_state
      ) VALUES (${generateUuidV7()}, ${partial.proposalId}, 'catalog.brandId', 'null'::jsonb, 'PENDING', 'UNVERIFIED')
    `;
    await expect(initialize(partial)).rejects.toMatchObject({
      code: "AI_PROPOSAL_INTEGRITY_ERROR",
    });
    const divergent = await seedProposal();
    await sql`UPDATE ai_proposal_field_reviews SET proposed_value = '"Other"'::jsonb WHERE proposal_id = ${divergent.proposalId} AND field_path = 'copy.name'`;
    await expect(initialize(divergent)).rejects.toMatchObject({
      code: "AI_PROPOSAL_INTEGRITY_ERROR",
    });
    const invalidSlug = await seedProposal({ proposedSlug: "Upper-Slug" });
    await expect(initialize(invalidSlug)).rejects.toMatchObject({
      code: "AI_PROPOSAL_INVALID_SLUG",
    });
  });

  it("keeps Brand and Category mirrors synchronized and clears them on rejection", async () => {
    const seed = await seedProposal();
    let version = await initialize(seed);
    version = await decide(
      seed.proposalId,
      version,
      "catalog.brandId",
      "MANUALLY_EDITED",
      ids.brand
    );
    let [state] =
      await sql`SELECT brand_id FROM ai_product_proposals WHERE id = ${seed.proposalId}`;
    expect(state!.brand_id).toBe(ids.brand);
    await decide(seed.proposalId, version, "catalog.brandId", "REJECTED");
    [state] = await sql`SELECT brand_id FROM ai_product_proposals WHERE id = ${seed.proposalId}`;
    expect(state!.brand_id).toBeNull();
    const [field] =
      await sql`SELECT selected_value, preferred_source_id FROM ai_proposal_field_reviews WHERE proposal_id = ${seed.proposalId} AND field_path = 'catalog.brandId'`;
    expect(field).toEqual({ selected_value: null, preferred_source_id: null });
  });

  it("rejects ACCEPTED/null, nonexistent and unpublished Brand/Category selections", async () => {
    const seed = await seedProposal();
    const version = await initialize(seed);
    await expect(
      decide(seed.proposalId, version, "catalog.brandId", "ACCEPTED")
    ).rejects.toMatchObject({ code: "AI_PROPOSAL_INVALID_DECISION" });
    await expect(
      decide(seed.proposalId, version, "catalog.brandId", "MANUALLY_EDITED", ids.unpublishedBrand)
    ).rejects.toMatchObject({ code: "AI_PROPOSAL_INVALID_BRAND" });
    await expect(
      decide(seed.proposalId, version, "catalog.categoryId", "MANUALLY_EDITED", generateUuidV7())
    ).rejects.toMatchObject({ code: "AI_PROPOSAL_INVALID_CATEGORY" });
  });

  it("normalizes manual slug/name and never overwrites their proposed evidence", async () => {
    const seed = await seedProposal();
    let version = await initialize(seed);
    version = await decide(
      seed.proposalId,
      version,
      "catalog.slug",
      "MANUALLY_EDITED",
      "  Better-Slug  "
    );
    await decide(seed.proposalId, version, "copy.name", "MANUALLY_EDITED", "  Better Name  ");
    const rows = await sql`
      SELECT field_path, proposed_value, selected_value FROM ai_proposal_field_reviews
      WHERE proposal_id = ${seed.proposalId} AND field_path IN ('catalog.slug', 'copy.name')
      ORDER BY field_path
    `;
    expect(rows).toEqual([
      {
        field_path: "catalog.slug",
        proposed_value: "gp-chk3-b-mouse",
        selected_value: "better-slug",
      },
      { field_path: "copy.name", proposed_value: "GP CHK3-B Mouse", selected_value: "Better Name" },
    ]);
    const [proposal] =
      await sql`SELECT proposed_slug, proposed_name FROM ai_product_proposals WHERE id = ${seed.proposalId}`;
    expect(proposal).toEqual({
      proposed_slug: "gp-chk3-b-mouse",
      proposed_name: "GP CHK3-B Mouse",
    });
  });

  it("supports existing-field review before catalog initialization with strict reset and replay semantics", async () => {
    const seed = await seedProposal();
    const accepted = await decide(seed.proposalId, seed.updatedAt, "copy.name", "ACCEPTED");
    const [acceptedRow] = await sql`
      SELECT selected_value, decision, reviewed_by_auth_user_id, reviewed_at
      FROM ai_proposal_field_reviews
      WHERE proposal_id = ${seed.proposalId} AND field_path = 'copy.name'
    `;
    expect(acceptedRow).toMatchObject({
      selected_value: "GP CHK3-B Mouse",
      decision: "ACCEPTED",
      reviewed_by_auth_user_id: ids.actorOne,
    });
    expect(acceptedRow!.reviewed_at).toBeInstanceOf(Date);
    const replay = await decide(seed.proposalId, seed.updatedAt, "copy.name", "ACCEPTED");
    expect(replay).toBe(accepted);
    await expect(
      decide(
        seed.proposalId,
        seed.updatedAt,
        "copy.name",
        "ACCEPTED",
        undefined,
        null,
        ids.actorTwo
      )
    ).rejects.toMatchObject({ code: "AI_PROPOSAL_STALE" });
    const reset = await decide(seed.proposalId, accepted, "copy.name", "PENDING");
    expect(reset).not.toBe(accepted);
    const [pendingRow] = await sql`
      SELECT selected_value, decision, preferred_source_id, reviewed_by_auth_user_id, reviewed_at
      FROM ai_proposal_field_reviews
      WHERE proposal_id = ${seed.proposalId} AND field_path = 'copy.name'
    `;
    expect(pendingRow).toEqual({
      selected_value: null,
      decision: "PENDING",
      preferred_source_id: null,
      reviewed_by_auth_user_id: null,
      reviewed_at: null,
    });
  });

  it("serializes initializer versus existing-field edit at the aggregate version", async () => {
    const seed = await seedProposal();
    const outcomes = await Promise.allSettled([
      initializeCatalogSelectionReviews(
        { proposalId: seed.proposalId, expectedProposalUpdatedAt: seed.updatedAt },
        { authContext: actor(ids.actorOne) }
      ),
      reviewProposalField(
        {
          proposalId: seed.proposalId,
          expectedProposalUpdatedAt: seed.updatedAt,
          fieldPath: "copy.name",
          decision: "MANUALLY_EDITED",
          selectedValue: "Concurrent Name",
        },
        { authContext: actor(ids.actorOne) }
      ),
    ]);
    expect(outcomes.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(1);
    expect(outcomes.filter((outcome) => outcome.status === "rejected")).toHaveLength(1);
    const [catalogCount] = await sql`
      SELECT count(*)::int AS count FROM ai_proposal_field_reviews
      WHERE proposal_id = ${seed.proposalId} AND field_path LIKE 'catalog.%'
    `;
    expect([0, 3]).toContain(catalogCount!.count);
  });

  it("enforces source relationship/value semantics and explicit conflict resolution", async () => {
    const seed = await seedProposal({ conflict: true });
    const version = await initialize(seed);
    await expect(decide(seed.proposalId, version, "weight_g", "ACCEPTED")).rejects.toMatchObject({
      code: "AI_PROPOSAL_UNRESOLVED_CONFLICT",
    });
    await expect(
      decide(seed.proposalId, version, "weight_g", "ACCEPTED", undefined, seed.conflictSourceId)
    ).rejects.toMatchObject({ code: "AI_PROPOSAL_INVALID_PREFERRED_SOURCE" });
    const accepted = await decide(
      seed.proposalId,
      version,
      "weight_g",
      "ACCEPTED",
      undefined,
      seed.supportSourceId
    );
    expect(accepted).not.toBe(version);
  });

  it("supports sourced conflict edits, explicit human override and explicit exclusion without rewriting provenance", async () => {
    const sourced = await seedProposal({ conflict: true });
    let version = await initialize(sourced);
    const beforeLinks = await sql`
      SELECT relationship, source_value FROM ai_proposal_field_sources link
      JOIN ai_proposal_field_reviews review ON review.id = link.field_review_id
      WHERE review.proposal_id = ${sourced.proposalId} AND review.field_path = 'weight_g'
      ORDER BY relationship
    `;
    version = await decide(
      sourced.proposalId,
      version,
      "weight_g",
      "MANUALLY_EDITED",
      55,
      sourced.conflictSourceId
    );
    expect(version).toBeDefined();
    expect(
      await sql`
        SELECT relationship, source_value FROM ai_proposal_field_sources link
        JOIN ai_proposal_field_reviews review ON review.id = link.field_review_id
        WHERE review.proposal_id = ${sourced.proposalId} AND review.field_path = 'weight_g'
        ORDER BY relationship
      `
    ).toEqual(beforeLinks);

    const override = await seedProposal({ conflict: true });
    version = await initialize(override);
    await expect(
      decide(override.proposalId, version, "weight_g", "MANUALLY_EDITED", 56, null)
    ).resolves.toBeDefined();

    const excluded = await seedProposal({ conflict: true });
    version = await initialize(excluded);
    await expect(
      decide(excluded.proposalId, version, "weight_g", "REJECTED")
    ).resolves.toBeDefined();
  });

  it("rejects unrelated and cross-item preferred sources", async () => {
    const first = await seedProposal();
    const second = await seedProposal();
    const version = await initialize(first);
    await expect(
      decide(first.proposalId, version, "weight_g", "ACCEPTED", undefined, second.supportSourceId)
    ).rejects.toMatchObject({ code: "AI_PROPOSAL_CROSS_ITEM_SOURCE" });
  });

  it("stores only human-priced canonical variants and forbids plain AI acceptance", async () => {
    const seed = await seedProposal({ includeVariants: true });
    const version = await initialize(seed);
    await expect(
      decide(seed.proposalId, version, "research.variants", "ACCEPTED")
    ).rejects.toMatchObject({ code: "AI_PROPOSAL_HUMAN_PRICE_REQUIRED" });
    const result = await setHumanVariantPlan(
      {
        proposalId: seed.proposalId,
        expectedProposalUpdatedAt: version,
        variants: [
          {
            sku: " GP-HUMAN ",
            title: " Human priced ",
            pricePen: "S/ 129.90",
            compareAtPricePen: "149.90",
            costPen: "80",
            weightGrams: 54,
            attributes: { color: "black" },
          },
        ],
      },
      { authContext: actor(ids.actorOne) }
    );
    const [review] =
      await sql`SELECT decision, selected_value, preferred_source_id FROM ai_proposal_field_reviews WHERE proposal_id = ${seed.proposalId} AND field_path = 'research.variants'`;
    expect(review).toEqual({
      decision: "MANUALLY_EDITED",
      selected_value: [
        {
          sku: "GP-HUMAN",
          title: "Human priced",
          priceCents: 12_990,
          compareAtPriceCents: 14_990,
          costCents: 8_000,
          weightGrams: 54,
          attributes: { color: "black" },
          displayOrder: 0,
        },
      ],
      preferred_source_id: null,
    });
    expect(JSON.stringify(review)).not.toContain("pricePen");
    expect(result.replayed).toBe(false);
  });

  it("rejects comma prices and replays an identical human plan before stale rejection", async () => {
    const seed = await seedProposal({ includeVariants: true });
    const version = await initialize(seed);
    const invalid = {
      proposalId: seed.proposalId,
      expectedProposalUpdatedAt: version,
      variants: [{ sku: "SKU", title: "Title", pricePen: "129,90" }],
    };
    await expect(
      setHumanVariantPlan(invalid, { authContext: actor(ids.actorOne) })
    ).rejects.toMatchObject({ code: "AI_PROPOSAL_INVALID_VARIANT_PLAN" });
    const input = {
      ...invalid,
      variants: [{ sku: "SKU", title: "Title", pricePen: "129.90" }],
    };
    const first = await setHumanVariantPlan(input, { authContext: actor(ids.actorOne) });
    const replay = await setHumanVariantPlan(input, { authContext: actor(ids.actorOne) });
    expect(replay).toMatchObject({ replayed: true, proposalUpdatedAt: first.proposalUpdatedAt });
    await expect(
      setHumanVariantPlan(input, { authContext: actor(ids.actorTwo) })
    ).rejects.toMatchObject({ code: "AI_PROPOSAL_STALE" });
  });

  it("prevents lost updates for concurrent same-version edits and supports same-actor replay", async () => {
    const seed = await seedProposal();
    const version = await initialize(seed);
    const outcomes = await Promise.allSettled([
      decide(seed.proposalId, version, "copy.name", "MANUALLY_EDITED", "Name A"),
      decide(seed.proposalId, version, "catalog.slug", "MANUALLY_EDITED", "slug-b"),
    ]);
    expect(outcomes.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(1);
    expect(outcomes.filter((outcome) => outcome.status === "rejected")).toHaveLength(1);

    const [row] =
      await sql`SELECT field_path, selected_value, reviewed_by_auth_user_id FROM ai_proposal_field_reviews WHERE proposal_id = ${seed.proposalId} AND decision = 'MANUALLY_EDITED'`;
    const replay = await decide(
      seed.proposalId,
      version,
      String(row!.field_path),
      "MANUALLY_EDITED",
      row!.selected_value
    );
    expect(replay).toBeDefined();
    await expect(
      decide(
        seed.proposalId,
        version,
        String(row!.field_path),
        "MANUALLY_EDITED",
        row!.selected_value,
        null,
        ids.actorTwo
      )
    ).rejects.toMatchObject({ code: "AI_PROPOSAL_STALE" });
  });

  it("blocks approval with pending or rejected required fields", async () => {
    const seed = await seedProposal();
    const initialized = await initialize(seed);
    await expect(
      approveProposal(
        { proposalId: seed.proposalId, expectedProposalUpdatedAt: initialized },
        { authContext: actor(ids.actorOne) }
      )
    ).rejects.toMatchObject({ code: "AI_PROPOSAL_REVIEW_REQUIRED" });
    let version = await readyForApproval(seed);
    version = await decide(seed.proposalId, version, "copy.name", "REJECTED");
    await expect(
      approveProposal(
        { proposalId: seed.proposalId, expectedProposalUpdatedAt: version },
        { authContext: actor(ids.actorOne) }
      )
    ).rejects.toMatchObject({ code: "AI_PROPOSAL_INVALID_NAME" });
  });

  it("approves review-only, emits one exact audit event and leaves canonical catalog untouched", async () => {
    const seed = await seedProposal({ enrich: true });
    const before = await catalogSnapshot();
    const version = await readyForApproval(seed);
    const approved = await approveProposal(
      { proposalId: seed.proposalId, expectedProposalUpdatedAt: version },
      { authContext: actor(ids.actorOne) }
    );
    expect(approved).toMatchObject({ status: "APPROVED", replayed: false });
    const [item] =
      await sql`SELECT status, target_product_id, target_product_version_snapshot FROM ai_research_job_items WHERE id = ${seed.itemId}`;
    expect(item).toEqual({
      status: "APPROVED",
      target_product_id: ids.targetProduct,
      target_product_version_snapshot: targetVersion,
    });
    const [audit] =
      await sql`SELECT actor_type, actor_id, action, target_type, target_id, metadata, request_id FROM audit_events WHERE target_id = ${seed.proposalId}`;
    expect(audit).toEqual({
      actor_type: "ADMIN",
      actor_id: ids.actorOne,
      action: "AI_PROPOSAL_REVIEWED",
      target_type: "ai_product_proposal",
      target_id: seed.proposalId,
      metadata: { proposalId: seed.proposalId, approvedFieldsCount: 5, rejectedFieldsCount: 0 },
      request_id: null,
    });
    expect(await catalogSnapshot()).toEqual(before);
    expect(
      Number(
        (
          await sql`SELECT count(*) FROM ai_proposal_apply_steps WHERE proposal_id = ${seed.proposalId}`
        )[0]!.count
      )
    ).toBe(0);
  });

  it("allows explicit spec exclusion for a no-schema category", async () => {
    const seed = await seedProposal();
    const version = await readyForApproval(seed, {
      categoryId: ids.noSchemaCategory,
      rejectSpec: true,
    });
    await expect(
      approveProposal(
        { proposalId: seed.proposalId, expectedProposalUpdatedAt: version },
        { authContext: actor(ids.actorOne) }
      )
    ).resolves.toMatchObject({ status: "APPROVED" });
  });

  it("validates effective specifications against the selected authoritative category schema", async () => {
    const seed = await seedProposal({ proposedSpecifications: { unknown_key: "bad" } });
    const version = await readyForApproval(seed);
    await expect(
      approveProposal(
        { proposalId: seed.proposalId, expectedProposalUpdatedAt: version },
        { authContext: actor(ids.actorOne) }
      )
    ).rejects.toMatchObject({ code: "AI_PROPOSAL_INTEGRITY_ERROR" });
  });

  it("rejects out-of-range and reserved-root effective specification topology", async () => {
    const range = await seedProposal({ proposedSpecifications: { weight_g: 500 } });
    let version = await readyForApproval(range);
    await expect(
      approveProposal(
        { proposalId: range.proposalId, expectedProposalUpdatedAt: version },
        { authContext: actor(ids.actorOne) }
      )
    ).rejects.toMatchObject({ code: "AI_PROPOSAL_INTEGRITY_ERROR" });

    const collision = await seedProposal({ proposedSpecifications: { "copy.forbidden": "x" } });
    version = await readyForApproval(collision);
    await expect(
      approveProposal(
        { proposalId: collision.proposalId, expectedProposalUpdatedAt: version },
        { authContext: actor(ids.actorOne) }
      )
    ).rejects.toMatchObject({ code: "AI_PROPOSAL_INTEGRITY_ERROR" });
  });

  it("revalidates published selections and exact mirrors at the approval boundary", async () => {
    const unpublished = await seedProposal();
    let version = await readyForApproval(unpublished);
    await sql`UPDATE brands SET status = 'DRAFT' WHERE id = ${ids.brand}`;
    await expect(
      approveProposal(
        { proposalId: unpublished.proposalId, expectedProposalUpdatedAt: version },
        { authContext: actor(ids.actorOne) }
      )
    ).rejects.toMatchObject({ code: "AI_PROPOSAL_INVALID_BRAND" });
    await sql`UPDATE brands SET status = 'PUBLISHED' WHERE id = ${ids.brand}`;

    const divergent = await seedProposal();
    version = await readyForApproval(divergent);
    await sql`UPDATE ai_product_proposals SET category_id = NULL WHERE id = ${divergent.proposalId}`;
    await expect(
      approveProposal(
        { proposalId: divergent.proposalId, expectedProposalUpdatedAt: version },
        { authContext: actor(ids.actorOne) }
      )
    ).rejects.toMatchObject({ code: "AI_PROPOSAL_INTEGRITY_ERROR" });
  });

  it("rejects the whole proposal with unresolved fields while preserving the settled item state", async () => {
    const seed = await seedProposal({ conflict: true });
    const rejected = await rejectProposal(
      { proposalId: seed.proposalId, expectedProposalUpdatedAt: seed.updatedAt },
      { authContext: actor(ids.actorOne) }
    );
    expect(rejected).toMatchObject({ status: "REJECTED", replayed: false });
    const [item] = await sql`SELECT status FROM ai_research_job_items WHERE id = ${seed.itemId}`;
    expect(item!.status).toBe("SOURCE_CONFLICT");
    const [audit] =
      await sql`SELECT metadata FROM audit_events WHERE target_id = ${seed.proposalId}`;
    expect(audit!.metadata).toEqual({
      proposalId: seed.proposalId,
      approvedFieldsCount: 0,
      rejectedFieldsCount: 0,
    });
  });

  it("makes same-actor terminal retries harmless and fails closed for other actors/opposite intent", async () => {
    const seed = await seedProposal();
    const version = await initialize(seed);
    const first = await rejectProposal(
      { proposalId: seed.proposalId, expectedProposalUpdatedAt: version },
      { authContext: actor(ids.actorOne) }
    );
    const replay = await rejectProposal(
      { proposalId: seed.proposalId, expectedProposalUpdatedAt: seed.updatedAt },
      { authContext: actor(ids.actorOne) }
    );
    expect(replay).toMatchObject({ replayed: true, proposalUpdatedAt: first.proposalUpdatedAt });
    await expect(
      rejectProposal(
        { proposalId: seed.proposalId, expectedProposalUpdatedAt: version },
        { authContext: actor(ids.actorTwo) }
      )
    ).rejects.toMatchObject({ code: "AI_PROPOSAL_INTEGRITY_ERROR" });
    await expect(
      approveProposal(
        { proposalId: seed.proposalId, expectedProposalUpdatedAt: version },
        { authContext: actor(ids.actorOne) }
      )
    ).rejects.toMatchObject({ code: "AI_PROPOSAL_NOT_DRAFT" });
    expect(
      Number(
        (await sql`SELECT count(*) FROM audit_events WHERE target_id = ${seed.proposalId}`)[0]!
          .count
      )
    ).toBe(1);
  });

  it("replays approval for the same actor and serializes concurrent duplicate approvals", async () => {
    const seed = await seedProposal();
    const version = await readyForApproval(seed);
    const outcomes = await Promise.all([
      approveProposal(
        { proposalId: seed.proposalId, expectedProposalUpdatedAt: version },
        { authContext: actor(ids.actorOne) }
      ),
      approveProposal(
        { proposalId: seed.proposalId, expectedProposalUpdatedAt: version },
        { authContext: actor(ids.actorOne) }
      ),
    ]);
    expect(outcomes.filter((outcome) => outcome.replayed)).toHaveLength(1);
    expect(outcomes.filter((outcome) => !outcome.replayed)).toHaveLength(1);
    expect(
      Number(
        (await sql`SELECT count(*) FROM audit_events WHERE target_id = ${seed.proposalId}`)[0]!
          .count
      )
    ).toBe(1);
    await expect(
      rejectProposal(
        { proposalId: seed.proposalId, expectedProposalUpdatedAt: version },
        { authContext: actor(ids.actorOne) }
      )
    ).rejects.toMatchObject({ code: "AI_PROPOSAL_NOT_DRAFT" });
  });

  it("fails closed when terminal audit evidence is missing or duplicated", async () => {
    const missing = await seedProposal();
    let version = await initialize(missing);
    const terminal = await rejectProposal(
      { proposalId: missing.proposalId, expectedProposalUpdatedAt: version },
      { authContext: actor(ids.actorOne) }
    );
    await sql`DELETE FROM audit_events WHERE target_id = ${missing.proposalId}`;
    await expect(
      rejectProposal(
        { proposalId: missing.proposalId, expectedProposalUpdatedAt: terminal.proposalUpdatedAt },
        { authContext: actor(ids.actorOne) }
      )
    ).rejects.toMatchObject({ code: "AI_PROPOSAL_INTEGRITY_ERROR" });

    const duplicate = await seedProposal();
    version = await initialize(duplicate);
    await rejectProposal(
      { proposalId: duplicate.proposalId, expectedProposalUpdatedAt: version },
      { authContext: actor(ids.actorOne) }
    );
    const [audit] = await sql`SELECT * FROM audit_events WHERE target_id = ${duplicate.proposalId}`;
    await sql`
      INSERT INTO audit_events (id, timestamp, actor_type, actor_id, action, target_type, target_id, metadata)
      VALUES (${generateUuidV7()}, NOW(), ${audit!.actor_type}, ${audit!.actor_id}, ${audit!.action},
        ${audit!.target_type}, ${audit!.target_id}, ${sql.json(audit!.metadata)})
    `;
    await expect(
      rejectProposal(
        { proposalId: duplicate.proposalId, expectedProposalUpdatedAt: version },
        { authContext: actor(ids.actorOne) }
      )
    ).rejects.toMatchObject({ code: "AI_PROPOSAL_INTEGRITY_ERROR" });
  });

  it("serializes approval versus rejection and emits exactly one terminal event", async () => {
    const seed = await seedProposal();
    const version = await readyForApproval(seed);
    const outcomes = await Promise.allSettled([
      approveProposal(
        { proposalId: seed.proposalId, expectedProposalUpdatedAt: version },
        { authContext: actor(ids.actorOne) }
      ),
      rejectProposal(
        { proposalId: seed.proposalId, expectedProposalUpdatedAt: version },
        { authContext: actor(ids.actorOne) }
      ),
    ]);
    expect(outcomes.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(1);
    expect(outcomes.filter((outcome) => outcome.status === "rejected")).toHaveLength(1);
    expect(
      Number(
        (await sql`SELECT count(*) FROM audit_events WHERE target_id = ${seed.proposalId}`)[0]!
          .count
      )
    ).toBe(1);
    const [proposal] =
      await sql`SELECT status FROM ai_product_proposals WHERE id = ${seed.proposalId}`;
    expect(["APPROVED", "REJECTED"]).toContain(proposal!.status);
  });
});
