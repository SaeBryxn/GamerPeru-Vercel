import { createHash } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import postgres from "postgres";
import { generateUuidV7 } from "@/db/utils/uuid";
import { assertLocalDatabaseTarget } from "@/lib/admin/test-target-guard";
import { computeRequestFingerprint } from "@/lib/admin/catalog/crypto";
import { createProduct, createVariant, updateProduct } from "@/lib/admin/catalog/service";
import {
  deriveApplyMutationRequestId,
  productCreateApplyPayloadSchema,
  variantCreateApplyPayloadSchema,
} from "@/lib/ai/proposals/apply-schemas";
import { applyProposal, getProposalApplyStatus } from "@/lib/ai/proposals/apply-service";
import type { VerifiedAuthContextReady } from "@/lib/auth/rbac";

describe("GP-025 / CHK3-C — crash-safe canonical catalog apply live PostgreSQL", () => {
  const rawDatabaseUrl =
    process.env.DATABASE_URL ??
    process.env.DATABASE_MIGRATION_URL ??
    "postgres://postgres:postgres@127.0.0.1:54322/postgres";
  const databaseUrl = assertLocalDatabaseTarget(rawDatabaseUrl);
  let pg: postgres.Sql;
  let sequence = 0;

  const ids = {
    actorOne: "018f0025-4000-7000-8000-000000000001",
    actorTwo: "018f0025-4000-7000-8000-000000000002",
    noPermission: "018f0025-4000-7000-8000-000000000003",
    provider: "018f0025-4000-7000-8000-000000000010",
    profile: "018f0025-4000-7000-8000-000000000020",
    brand: "018f0025-4000-7000-8000-000000000030",
    category: "018f0025-4000-7000-8000-000000000040",
    schema: "018f0025-4000-7000-8000-000000000041",
    targetProduct: "018f0025-4000-7000-8000-000000000050",
  };
  const targetVersion = new Date("2026-09-12T18:00:00.000Z");

  const actor = (authUserId: string, manage = true): VerifiedAuthContextReady => ({
    status: "READY",
    authUserId,
    email: "proposal-apply@gamerperu.invalid",
    roles: ["ADMIN_CATALOG"],
    permissions: new Set(manage ? ["catalog:manage"] : ["catalog:ai_research"]),
  });

  interface VariantPlan {
    sku: string;
    title: string;
    priceCents: number;
    compareAtPriceCents: number | null;
    costCents: number | null;
    weightGrams: number | null;
    attributes: Record<string, string>;
    displayOrder: number;
  }

  interface SeedOptions {
    mode?: "CREATE" | "ENRICH";
    specifications?: Record<string, unknown>;
    variants?: VariantPlan[];
    subtitle?: string;
    description?: string;
    slug?: string;
  }

  interface SeededProposal {
    proposalId: string;
    itemId: string;
    slug: string;
    name: string;
    specifications: Record<string, unknown>;
    variants: VariantPlan[];
    mode: "CREATE" | "ENRICH";
  }

  async function cleanFixtures(): Promise<void> {
    await pg.begin(async (tx) => {
      await tx`DELETE FROM ai_proposal_apply_steps WHERE proposal_id IN (
        SELECT proposal.id FROM ai_product_proposals proposal
        JOIN ai_research_job_items item ON item.id = proposal.job_item_id
        JOIN ai_research_jobs job ON job.id = item.job_id
        WHERE job.created_by_auth_user_id IN (${ids.actorOne}, ${ids.actorTwo})
      )`;
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
        SELECT item.id FROM ai_research_job_items item
        JOIN ai_research_jobs job ON job.id = item.job_id
        WHERE job.created_by_auth_user_id IN (${ids.actorOne}, ${ids.actorTwo})
      )`;
      await tx`DELETE FROM ai_sources WHERE job_item_id IN (
        SELECT item.id FROM ai_research_job_items item
        JOIN ai_research_jobs job ON job.id = item.job_id
        WHERE job.created_by_auth_user_id IN (${ids.actorOne}, ${ids.actorTwo})
      )`;
      await tx`DELETE FROM ai_research_job_items WHERE job_id IN (
        SELECT id FROM ai_research_jobs
        WHERE created_by_auth_user_id IN (${ids.actorOne}, ${ids.actorTwo})
      )`;
      await tx`DELETE FROM ai_research_jobs
        WHERE created_by_auth_user_id IN (${ids.actorOne}, ${ids.actorTwo})`;
      await tx`DELETE FROM audit_events
        WHERE actor_id IN (${ids.actorOne}, ${ids.actorTwo}, ${ids.noPermission})`;
      await tx`DELETE FROM product_specifications WHERE product_id IN (
        SELECT id FROM products WHERE slug LIKE 'gp025-chk3c-%'
      ) OR product_id = ${ids.targetProduct}`;
      await tx`DELETE FROM product_variants WHERE product_id IN (
        SELECT id FROM products WHERE slug LIKE 'gp025-chk3c-%'
      ) OR product_id = ${ids.targetProduct}`;
      await tx`DELETE FROM products
        WHERE slug LIKE 'gp025-chk3c-%' AND id <> ${ids.targetProduct}`;
    });
  }

  async function insertReview(input: {
    proposalId: string;
    fieldPath: string;
    proposedValue: unknown;
    selectedValue: unknown;
    decision: "ACCEPTED" | "MANUALLY_EDITED" | "REJECTED";
    verificationState?: "AI_INFERRED" | "UNVERIFIED";
    reviewedAt: Date;
  }): Promise<void> {
    await pg`
      INSERT INTO ai_proposal_field_reviews (
        id, proposal_id, field_path, proposed_value, selected_value, decision,
        verification_state, preferred_source_id, conflict_details,
        reviewed_by_auth_user_id, reviewed_at, created_at, updated_at
      ) VALUES (
        ${generateUuidV7()}, ${input.proposalId}, ${input.fieldPath},
        CASE WHEN ${input.proposedValue === null} THEN 'null'::jsonb
          ELSE ${pg.json(input.proposedValue as postgres.JSONValue)} END,
        CASE WHEN ${input.decision === "REJECTED"} THEN NULL
          ELSE ${pg.json(input.selectedValue as postgres.JSONValue)} END,
        ${input.decision}, ${input.verificationState ?? "AI_INFERRED"}, NULL, NULL,
        ${ids.actorOne}, ${input.reviewedAt}, ${input.reviewedAt}, ${input.reviewedAt}
      )
    `;
  }

  async function seedApprovedProposal(options: SeedOptions = {}): Promise<SeededProposal> {
    sequence += 1;
    const jobId = generateUuidV7();
    const itemId = generateUuidV7();
    const proposalId = generateUuidV7();
    const mode = options.mode ?? "CREATE";
    const slug = options.slug ?? `gp025-chk3c-${sequence}`;
    const name = `CHK3-C Product ${sequence}`;
    const specifications = options.specifications ?? {};
    const variants = options.variants ?? [];
    const reviewedAt = new Date();
    const proposedVariants = variants.map((variant) => ({
      sku: variant.sku,
      title: variant.title,
      attributes: variant.attributes,
    }));
    await pg`
      INSERT INTO ai_research_jobs (
        id, mutation_request_digest, request_fingerprint, selected_profile_id,
        profile_snapshot, job_type, status, dispatch_status, inngest_event_id,
        total_items, completed_items, failed_items, created_by_auth_user_id
      ) VALUES (
        ${jobId}, ${createHash("sha256").update(jobId).digest("hex")},
        ${createHash("sha256").update(itemId).digest("hex")}, ${ids.profile},
        ${pg.json({ profileKey: "CHK3_C_TEST", providerId: ids.provider, modelId: "test", temperature: 0.2, maxTokens: 512 })},
        'SINGLE', 'COMPLETED', 'DISPATCHED', ${`chk3-c-${jobId}`}, 1, 1, 0,
        ${ids.actorOne}
      )
    `;
    await pg`
      INSERT INTO ai_research_job_items (
        id, job_id, item_index, input_query, mode, target_product_id,
        target_product_version_snapshot, identity_status, status, created_at, updated_at
      ) VALUES (
        ${itemId}, ${jobId}, 0, ${name}, ${mode},
        ${mode === "ENRICH" ? ids.targetProduct : null},
        ${mode === "ENRICH" ? targetVersion : null}, 'EXACT_MATCH', 'APPROVED',
        ${reviewedAt}, ${reviewedAt}
      )
    `;
    await pg`
      INSERT INTO ai_product_proposals (
        id, job_item_id, brand_id, category_id, proposed_name, proposed_slug,
        proposed_subtitle, proposed_description, proposed_specifications,
        unmapped_specifications, proposed_variants, proposed_seo_draft,
        media_candidates, status, reviewed_by_auth_user_id, reviewed_at,
        created_at, updated_at
      ) VALUES (
        ${proposalId}, ${itemId}, ${ids.brand}, ${ids.category}, ${name}, ${slug},
        ${options.subtitle ?? null}, ${options.description ?? null},
        ${pg.json(specifications as postgres.JSONValue)}, '{}'::jsonb, ${pg.json(proposedVariants)},
        '{}'::jsonb, '[]'::jsonb, 'APPROVED', ${ids.actorOne}, ${reviewedAt},
        ${reviewedAt}, ${reviewedAt}
      )
    `;

    await insertReview({
      proposalId,
      fieldPath: "catalog.brandId",
      proposedValue: null,
      selectedValue: ids.brand,
      decision: "MANUALLY_EDITED",
      verificationState: "UNVERIFIED",
      reviewedAt,
    });
    await insertReview({
      proposalId,
      fieldPath: "catalog.categoryId",
      proposedValue: null,
      selectedValue: ids.category,
      decision: "MANUALLY_EDITED",
      verificationState: "UNVERIFIED",
      reviewedAt,
    });
    await insertReview({
      proposalId,
      fieldPath: "catalog.slug",
      proposedValue: slug,
      selectedValue: slug,
      decision: "ACCEPTED",
      reviewedAt,
    });
    await insertReview({
      proposalId,
      fieldPath: "copy.name",
      proposedValue: name,
      selectedValue: name,
      decision: "ACCEPTED",
      reviewedAt,
    });
    if (options.subtitle) {
      await insertReview({
        proposalId,
        fieldPath: "copy.subtitle",
        proposedValue: options.subtitle,
        selectedValue: options.subtitle,
        decision: "ACCEPTED",
        reviewedAt,
      });
    }
    if (options.description) {
      await insertReview({
        proposalId,
        fieldPath: "copy.description",
        proposedValue: options.description,
        selectedValue: options.description,
        decision: "ACCEPTED",
        reviewedAt,
      });
    }
    for (const [fieldPath, value] of Object.entries(specifications)) {
      await insertReview({
        proposalId,
        fieldPath,
        proposedValue: value,
        selectedValue: value,
        decision: "ACCEPTED",
        reviewedAt,
      });
    }
    if (variants.length > 0) {
      await insertReview({
        proposalId,
        fieldPath: "research.variants",
        proposedValue: proposedVariants,
        selectedValue: variants,
        decision: "MANUALLY_EDITED",
        reviewedAt,
      });
    }
    const reviewCount = (
      await pg`
      SELECT count(*)::int AS count FROM ai_proposal_field_reviews
      WHERE proposal_id = ${proposalId}
        AND decision IN ('ACCEPTED', 'MANUALLY_EDITED')
    `
    )[0]!;
    await pg`
      INSERT INTO audit_events (
        id, timestamp, actor_type, actor_id, action, target_type, target_id,
        metadata, request_id
      ) VALUES (
        ${generateUuidV7()}, ${reviewedAt}, 'ADMIN', ${ids.actorOne},
        'AI_PROPOSAL_REVIEWED', 'ai_product_proposal', ${proposalId},
        ${pg.json({ proposalId, approvedFieldsCount: reviewCount.count, rejectedFieldsCount: 0 })}, NULL
      )
    `;
    return { proposalId, itemId, slug, name, specifications, variants, mode };
  }

  async function insertApplyStep(input: {
    seed: SeededProposal;
    operationId: string;
    stepKey: string;
    stepOrdinal: number;
    payload: unknown;
    status: "PREPARED" | "IN_FLIGHT" | "COMMITTED";
    targetId?: string;
    fingerprint?: string;
  }): Promise<void> {
    await pg`
      INSERT INTO ai_proposal_apply_steps (
        id, proposal_id, apply_operation_id, apply_actor_auth_user_id,
        step_key, step_ordinal, mutation_request_id, request_fingerprint,
        request_payload, step_status, target_id, error_message
      ) VALUES (
        ${generateUuidV7()}, ${input.seed.proposalId}, ${input.operationId}, ${ids.actorOne},
        ${input.stepKey}, ${input.stepOrdinal},
        ${deriveApplyMutationRequestId(input.operationId, input.stepKey)},
        ${input.fingerprint ?? computeRequestFingerprint(input.payload)},
        ${pg.json(input.payload as postgres.JSONValue)}, ${input.status}, ${input.targetId ?? null}, NULL
      )
    `;
  }

  function productPayload(seed: SeededProposal) {
    return productCreateApplyPayloadSchema.parse({
      name: seed.name,
      slug: seed.slug,
      brandId: ids.brand,
      categoryId: ids.category,
      subtitle: null,
      description: null,
      isFeatured: false,
    });
  }

  async function markApplying(seed: SeededProposal): Promise<void> {
    await pg`UPDATE ai_product_proposals SET status = 'APPLYING' WHERE id = ${seed.proposalId}`;
  }

  async function loadImmutableApplyLedger(proposalId: string) {
    return await pg`
      SELECT step_status, target_id::text AS target_id,
        apply_operation_id::text AS apply_operation_id,
        apply_actor_auth_user_id::text AS apply_actor_auth_user_id,
        step_key, step_ordinal, mutation_request_id, request_fingerprint,
        request_payload::text AS request_payload
      FROM ai_proposal_apply_steps
      WHERE proposal_id = ${proposalId}
      ORDER BY step_ordinal, step_key
    `;
  }

  async function loadFinalizationState(proposalId: string) {
    const [state] = await pg`
      SELECT proposal.status, item.status AS item_status,
        (SELECT count(*)::int FROM audit_events
          WHERE action = 'AI_PROPOSAL_APPLIED' AND target_id = proposal.id::text
        ) AS applied_events
      FROM ai_product_proposals proposal
      JOIN ai_research_job_items item ON item.id = proposal.job_item_id
      WHERE proposal.id = ${proposalId}
    `;
    return state;
  }

  beforeAll(async () => {
    pg = postgres(databaseUrl, { max: 12 });
    await pg`
      INSERT INTO auth.users (
        id, email, raw_app_meta_data, raw_user_meta_data, is_super_admin, created_at, updated_at
      ) VALUES
        (${ids.actorOne}, 'chk3c-one@gamerperu.invalid', '{"provider":"email"}', '{}', false, NOW(), NOW()),
        (${ids.actorTwo}, 'chk3c-two@gamerperu.invalid', '{"provider":"email"}', '{}', false, NOW(), NOW()),
        (${ids.noPermission}, 'chk3c-none@gamerperu.invalid', '{"provider":"email"}', '{}', false, NOW(), NOW())
      ON CONFLICT (id) DO UPDATE SET updated_at = NOW()
    `;
    await pg`
      INSERT INTO ai_providers (id, provider_key, display_name, is_enabled, is_default, settings)
      VALUES (${ids.provider}, 'chk3-c-test', 'CHK3-C Test', true, false, '{}')
      ON CONFLICT (id) DO NOTHING
    `;
    await pg`
      INSERT INTO ai_profiles (
        id, profile_key, provider_id, model_id, temperature, max_tokens, is_enabled
      ) VALUES (${ids.profile}, 'CHK3_C_TEST', ${ids.provider}, 'test', 0.20, 512, true)
      ON CONFLICT (id) DO NOTHING
    `;
    await pg`
      INSERT INTO brands (id, name, slug, status)
      VALUES (${ids.brand}, 'CHK3-C Brand', 'chk3-c-brand', 'PUBLISHED')
      ON CONFLICT (id) DO UPDATE SET status = 'PUBLISHED'
    `;
    await pg`
      INSERT INTO categories (id, name, slug, display_order, status)
      VALUES (${ids.category}, 'CHK3-C Category', 'chk3-c-category', 2540, 'PUBLISHED')
      ON CONFLICT (id) DO UPDATE SET status = 'PUBLISHED'
    `;
    await pg`
      INSERT INTO category_specification_schemas (
        id, category_id, schema_version, field_definitions, is_active
      ) VALUES (
        ${ids.schema}, ${ids.category}, 1,
        ${pg.json([{ key: "weight_g", label: "Weight", dataType: "number", unit: "g", filterable: true, filterKind: "NUMBER_RANGE", publicParam: "weight", displayOrder: 0, min: 1, max: 200, step: 1 }])},
        true
      ) ON CONFLICT (id) DO NOTHING
    `;
    await pg`UPDATE categories SET current_spec_schema_id = ${ids.schema} WHERE id = ${ids.category}`;
    await pg`
      INSERT INTO products (
        id, brand_id, category_id, name, slug, status, is_featured, created_at, updated_at
      ) VALUES (
        ${ids.targetProduct}, ${ids.brand}, ${ids.category}, 'CHK3-C Existing',
        'gp025-chk3c-existing', 'DRAFT', false, ${targetVersion}, ${targetVersion}
      ) ON CONFLICT (id) DO NOTHING
    `;
  });

  beforeEach(async () => {
    await cleanFixtures();
    await pg`UPDATE brands SET status = 'PUBLISHED' WHERE id = ${ids.brand}`;
    await pg`UPDATE categories SET status = 'PUBLISHED' WHERE id = ${ids.category}`;
    await pg`
      UPDATE products SET brand_id = ${ids.brand}, category_id = ${ids.category},
        name = 'CHK3-C Existing', slug = 'gp025-chk3c-existing', subtitle = NULL,
        description = NULL, status = 'DRAFT', is_featured = false,
        created_at = ${targetVersion}, updated_at = ${targetVersion}
      WHERE id = ${ids.targetProduct}
    `;
  });

  afterAll(async () => {
    if (!pg) return;
    await cleanFixtures();
    await pg`DELETE FROM products WHERE id = ${ids.targetProduct}`;
    await pg`UPDATE categories SET current_spec_schema_id = NULL WHERE id = ${ids.category}`;
    await pg`DELETE FROM category_specification_schemas WHERE id = ${ids.schema}`;
    await pg`DELETE FROM categories WHERE id = ${ids.category}`;
    await pg`DELETE FROM brands WHERE id = ${ids.brand}`;
    await pg`DELETE FROM ai_profiles WHERE id = ${ids.profile}`;
    await pg`DELETE FROM ai_providers WHERE id = ${ids.provider}`;
    await pg`DELETE FROM auth.users WHERE id IN (${ids.actorOne}, ${ids.actorTwo}, ${ids.noPermission})`;
    await pg.end();
  });

  it("applies CREATE through Product, specification and human-priced Variant steps", async () => {
    const seed = await seedApprovedProposal({
      specifications: { weight_g: 54 },
      variants: [
        {
          sku: "CHK3C-CREATE-0",
          title: "Negro",
          priceCents: 19_990,
          compareAtPriceCents: 22_990,
          costCents: 10_000,
          weightGrams: 54,
          attributes: { color: "black" },
          displayOrder: 0,
        },
      ],
      subtitle: "Selección humana",
      description: "Descripción humana aprobada para el catálogo.",
    });
    const result = await applyProposal(
      { proposalId: seed.proposalId },
      { authContext: actor(ids.actorOne) }
    );
    expect(result.status).toBe("APPLIED");
    expect(result.replayed).toBe(false);

    const [proposal] = await pg`
      SELECT proposal.status, proposal.applied_product_id, proposal.applied_at,
        item.status AS item_status
      FROM ai_product_proposals proposal
      JOIN ai_research_job_items item ON item.id = proposal.job_item_id
      WHERE proposal.id = ${seed.proposalId}
    `;
    expect(proposal).toMatchObject({ status: "APPLIED", item_status: "APPLIED" });
    expect(proposal!.applied_product_id).toBe(result.canonicalProductId);
    expect(proposal!.applied_at).not.toBeNull();

    const [product] = await pg`
      SELECT name, slug, subtitle, description, status, is_featured
      FROM products WHERE id = ${result.canonicalProductId}
    `;
    expect(product).toEqual({
      name: seed.name,
      slug: seed.slug,
      subtitle: "Selección humana",
      description: "Descripción humana aprobada para el catálogo.",
      status: "DRAFT",
      is_featured: false,
    });
    const [specification] = await pg`
      SELECT spec_values FROM product_specifications WHERE product_id = ${result.canonicalProductId}
    `;
    expect(specification!.spec_values).toEqual({ weight_g: 54 });
    const variants = await pg`
      SELECT sku, price_cents, compare_at_price_cents, cost_cents, status, display_order
      FROM product_variants WHERE product_id = ${result.canonicalProductId}
    `;
    expect(variants).toEqual([
      {
        sku: "CHK3C-CREATE-0",
        price_cents: 19_990,
        compare_at_price_cents: 22_990,
        cost_cents: 10_000,
        status: "ACTIVE",
        display_order: 0,
      },
    ]);
    const steps = await pg`
      SELECT step_key, step_ordinal, step_status, mutation_request_id, request_payload, target_id
      FROM ai_proposal_apply_steps WHERE proposal_id = ${seed.proposalId}
      ORDER BY step_ordinal
    `;
    expect(steps.map((step) => [step.step_key, step.step_ordinal, step.step_status])).toEqual([
      ["PRODUCT_CREATE", 0, "COMMITTED"],
      ["PRODUCT_UPDATE", 1, "COMMITTED"],
      ["VARIANT_CREATE:0", 2, "COMMITTED"],
    ]);
    expect(steps[0]!.request_payload).not.toHaveProperty("initialVariant");
    expect(steps[0]!.request_payload).not.toHaveProperty("mutationRequestId");
    expect(steps[2]!.request_payload).not.toHaveProperty("pricePen");
    const appliedEvents = await pg`
      SELECT metadata
      FROM audit_events
      WHERE action = 'AI_PROPOSAL_APPLIED' AND target_id = ${seed.proposalId}
    `;
    expect(appliedEvents).toHaveLength(1);
    expect(appliedEvents[0]!.metadata).toEqual({
      proposalId: seed.proposalId,
      canonicalProductId: result.canonicalProductId,
      variantsCreatedCount: 1,
    });
    const status = await getProposalApplyStatus(seed.proposalId, {
      authContext: actor(ids.actorTwo),
    });
    expect(status.steps).toHaveLength(3);
    expect(status).not.toHaveProperty("applyActorAuthUserId");
  });

  it("serializes concurrent initial apply and terminal replay without duplicates", async () => {
    const seed = await seedApprovedProposal({
      variants: [
        {
          sku: "CHK3C-CONCURRENT",
          title: "Única",
          priceCents: 10_000,
          compareAtPriceCents: null,
          costCents: null,
          weightGrams: null,
          attributes: {},
          displayOrder: 0,
        },
      ],
    });
    const [first, second] = await Promise.all([
      applyProposal({ proposalId: seed.proposalId }, { authContext: actor(ids.actorOne) }),
      applyProposal({ proposalId: seed.proposalId }, { authContext: actor(ids.actorOne) }),
    ]);
    expect(first.canonicalProductId).toBe(second.canonicalProductId);
    expect(new Set([first.applyOperationId, second.applyOperationId]).size).toBe(1);
    const counts = (
      await pg`
      SELECT
        (SELECT count(*)::int FROM products WHERE slug = ${seed.slug}) AS products,
        (SELECT count(*)::int FROM product_variants WHERE product_id = ${first.canonicalProductId}) AS variants,
        (SELECT count(DISTINCT apply_operation_id)::int FROM ai_proposal_apply_steps
          WHERE proposal_id = ${seed.proposalId}) AS operations,
        (SELECT count(*)::int FROM audit_events WHERE action = 'AI_PROPOSAL_APPLIED'
          AND target_id = ${seed.proposalId}) AS events
    `
    )[0]!;
    const { products, variants, operations, events } = counts;
    expect({ products, variants, operations, events }).toEqual({
      products: 1,
      variants: 1,
      operations: 1,
      events: 1,
    });
  });

  it("binds a concurrent initial operation to exactly one current actor", async () => {
    const seed = await seedApprovedProposal();
    const results = await Promise.allSettled([
      applyProposal({ proposalId: seed.proposalId }, { authContext: actor(ids.actorOne) }),
      applyProposal({ proposalId: seed.proposalId }, { authContext: actor(ids.actorTwo) }),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((result) => result.status === "rejected");
    expect(rejected).toMatchObject({ reason: { code: "APPLY_ACTOR_MISMATCH" } });
    const counts = (
      await pg`
      SELECT
        (SELECT count(DISTINCT apply_operation_id)::int FROM ai_proposal_apply_steps
          WHERE proposal_id = ${seed.proposalId}) AS operations,
        (SELECT count(*)::int FROM products WHERE slug = ${seed.slug}) AS products,
        (SELECT count(*)::int FROM audit_events WHERE action = 'AI_PROPOSAL_APPLIED'
          AND target_id = ${seed.proposalId}) AS events
    `
    )[0]!;
    const { operations, products, events } = counts;
    expect({ operations, products, events }).toEqual({ operations: 1, products: 1, events: 1 });
  });

  it("serializes concurrent same-actor resumes, step completion, finalization and APPLIED replay", async () => {
    const seed = await seedApprovedProposal();
    const operationId = generateUuidV7();
    await markApplying(seed);
    await insertApplyStep({
      seed,
      operationId,
      stepKey: "PRODUCT_CREATE",
      stepOrdinal: 0,
      payload: productPayload(seed),
      status: "PREPARED",
    });

    const resumed = await Promise.all([
      applyProposal({ proposalId: seed.proposalId }, { authContext: actor(ids.actorOne) }),
      applyProposal({ proposalId: seed.proposalId }, { authContext: actor(ids.actorOne) }),
      applyProposal({ proposalId: seed.proposalId }, { authContext: actor(ids.actorOne) }),
    ]);
    expect(new Set(resumed.map((result) => result.canonicalProductId)).size).toBe(1);
    expect(new Set(resumed.map((result) => result.applyOperationId))).toEqual(
      new Set([operationId])
    );

    const replays = await Promise.all([
      applyProposal({ proposalId: seed.proposalId }, { authContext: actor(ids.actorOne) }),
      applyProposal({ proposalId: seed.proposalId }, { authContext: actor(ids.actorOne) }),
      applyProposal({ proposalId: seed.proposalId }, { authContext: actor(ids.actorOne) }),
    ]);
    expect(replays.every((result) => result.replayed)).toBe(true);
    const counts = (
      await pg`
        SELECT
          (SELECT count(*)::int FROM products WHERE slug = ${seed.slug}) AS products,
          (SELECT count(*)::int FROM audit_events WHERE action = 'catalog:product:create'
            AND target_id = ${resumed[0].canonicalProductId}) AS create_events,
          (SELECT count(*)::int FROM audit_events WHERE action = 'AI_PROPOSAL_APPLIED'
            AND target_id = ${seed.proposalId}) AS applied_events
      `
    )[0]!;
    expect(counts).toEqual({ products: 1, create_events: 1, applied_events: 1 });
  });

  it("recovers a lost PRODUCT_CREATE response with its exact durable mutation identity", async () => {
    const seed = await seedApprovedProposal({ specifications: { weight_g: 55 } });
    const operationId = generateUuidV7();
    const payload = productPayload(seed);
    await markApplying(seed);
    await insertApplyStep({
      seed,
      operationId,
      stepKey: "PRODUCT_CREATE",
      stepOrdinal: 0,
      payload,
      status: "IN_FLIGHT",
    });
    const mutationRequestId = deriveApplyMutationRequestId(operationId, "PRODUCT_CREATE");
    const committed = await createProduct(
      { ...payload, mutationRequestId },
      { authContext: actor(ids.actorOne) }
    );
    const result = await applyProposal(
      { proposalId: seed.proposalId },
      { authContext: actor(ids.actorOne) }
    );
    expect(result.canonicalProductId).toBe(committed.id);
    const counts = (
      await pg`
      SELECT
        (SELECT count(*)::int FROM products WHERE slug = ${seed.slug}) AS products,
        (SELECT count(*)::int FROM audit_events WHERE action = 'catalog:product:create'
          AND target_id = ${committed.id}) AS "createAudits"
    `
    )[0]!;
    const { products, createAudits } = counts;
    expect({ products, createAudits }).toEqual({ products: 1, createAudits: 1 });
    const keys = await pg`
      SELECT step_key, step_status FROM ai_proposal_apply_steps
      WHERE proposal_id = ${seed.proposalId} ORDER BY step_ordinal
    `;
    expect(keys).toEqual([
      { step_key: "PRODUCT_CREATE", step_status: "COMMITTED" },
      { step_key: "PRODUCT_UPDATE", step_status: "COMMITTED" },
    ]);
  });

  it("recovers concurrent retries of a lost IN_FLIGHT Variant response without a duplicate", async () => {
    const variant: VariantPlan = {
      sku: "CHK3C-LOST-VARIANT",
      title: "Perdida",
      priceCents: 12_345,
      compareAtPriceCents: null,
      costCents: null,
      weightGrams: 60,
      attributes: { color: "white" },
      displayOrder: 0,
    };
    const seed = await seedApprovedProposal({ variants: [variant] });
    const operationId = generateUuidV7();
    const createPayload = productPayload(seed);
    const created = await createProduct(
      {
        ...createPayload,
        mutationRequestId: deriveApplyMutationRequestId(operationId, "PRODUCT_CREATE"),
      },
      { authContext: actor(ids.actorOne) }
    );
    const variantPayload = variantCreateApplyPayloadSchema.parse({
      productId: created.id,
      ...variant,
      status: "ACTIVE",
    });
    await markApplying(seed);
    await insertApplyStep({
      seed,
      operationId,
      stepKey: "PRODUCT_CREATE",
      stepOrdinal: 0,
      payload: createPayload,
      status: "COMMITTED",
      targetId: created.id,
    });
    await insertApplyStep({
      seed,
      operationId,
      stepKey: "VARIANT_CREATE:0",
      stepOrdinal: 2,
      payload: variantPayload,
      status: "IN_FLIGHT",
    });
    const durableVariant = await createVariant(
      {
        ...variantPayload,
        mutationRequestId: deriveApplyMutationRequestId(operationId, "VARIANT_CREATE:0"),
      },
      { authContext: actor(ids.actorOne), requiredProductStatus: "DRAFT" }
    );
    const results = await Promise.all([
      applyProposal({ proposalId: seed.proposalId }, { authContext: actor(ids.actorOne) }),
      applyProposal({ proposalId: seed.proposalId }, { authContext: actor(ids.actorOne) }),
    ]);
    expect(results.every((result) => result.status === "APPLIED")).toBe(true);
    expect(new Set(results.map((result) => result.canonicalProductId))).toEqual(
      new Set([created.id])
    );
    const variants = await pg`
      SELECT id FROM product_variants WHERE product_id = ${created.id}
        AND sku = ${variant.sku}
    `;
    expect(variants).toEqual([{ id: durableVariant.id }]);
  });

  it("applies ENRICH from the original frozen version without modifying existing Variants", async () => {
    await pg`
      INSERT INTO product_variants (
        id, product_id, sku, title, price_cents, attributes, status, display_order
      ) VALUES (${generateUuidV7()}, ${ids.targetProduct}, 'CHK3C-EXISTING-VAR', 'Existing', 5000, '{}', 'ACTIVE', 0)
    `;
    const seed = await seedApprovedProposal({
      mode: "ENRICH",
      specifications: { weight_g: 57 },
      variants: [
        {
          sku: "CHK3C-ENRICH-NEW",
          title: "New",
          priceCents: 20_000,
          compareAtPriceCents: null,
          costCents: null,
          weightGrams: 57,
          attributes: {},
          displayOrder: 0,
        },
      ],
    });
    const before = await pg`
      SELECT id, sku, price_cents, updated_at FROM product_variants
      WHERE product_id = ${ids.targetProduct} AND sku = 'CHK3C-EXISTING-VAR'
    `;
    const result = await applyProposal(
      { proposalId: seed.proposalId },
      { authContext: actor(ids.actorOne) }
    );
    expect(result.canonicalProductId).toBe(ids.targetProduct);
    const after = await pg`
      SELECT id id, sku, price_cents, updated_at FROM product_variants
      WHERE product_id = ${ids.targetProduct} AND sku = 'CHK3C-EXISTING-VAR'
    `;
    expect(after).toEqual(before);
    const steps = await pg`
      SELECT step_key, step_ordinal, request_payload->>'expectedUpdatedAt' AS expected
      FROM ai_proposal_apply_steps WHERE proposal_id = ${seed.proposalId}
      ORDER BY step_ordinal
    `;
    expect(steps[0]).toMatchObject({
      step_key: "PRODUCT_UPDATE",
      step_ordinal: 0,
      expected: targetVersion.toISOString(),
    });
    expect(steps[1]).toMatchObject({ step_key: "VARIANT_CREATE:0", step_ordinal: 1 });
    const [product] = await pg`SELECT status FROM products WHERE id = ${ids.targetProduct}`;
    expect(product!.status).toBe("DRAFT");
  });

  it("recovers a lost ENRICH update response before stale validation", async () => {
    const seed = await seedApprovedProposal({ mode: "ENRICH", specifications: { weight_g: 58 } });
    const operationId = generateUuidV7();
    const payload = {
      productId: ids.targetProduct,
      expectedUpdatedAt: targetVersion.toISOString(),
      name: seed.name,
      slug: seed.slug,
      brandId: ids.brand,
      categoryId: ids.category,
      specValues: seed.specifications,
    };
    await markApplying(seed);
    await insertApplyStep({
      seed,
      operationId,
      stepKey: "PRODUCT_UPDATE",
      stepOrdinal: 0,
      payload,
      status: "IN_FLIGHT",
    });
    const mutationRequestId = deriveApplyMutationRequestId(operationId, "PRODUCT_UPDATE");
    await updateProduct(
      { ...payload, mutationRequestId },
      { authContext: actor(ids.actorOne), requiredProductStatus: "DRAFT" }
    );
    const result = await applyProposal(
      { proposalId: seed.proposalId },
      { authContext: actor(ids.actorOne) }
    );
    expect(result.status).toBe("APPLIED");
    const updateAuditCount = (
      await pg`
      SELECT count(*)::int AS "updateAudits" FROM audit_events
      WHERE action = 'catalog:product:update' AND target_id = ${ids.targetProduct}
    `
    )[0]!;
    expect(updateAuditCount.updateAudits).toBe(1);
  });

  it("classifies a fresh stale ENRICH update as terminal without refreshing or applying Variants", async () => {
    const seed = await seedApprovedProposal({
      mode: "ENRICH",
      variants: [
        {
          sku: "CHK3C-STALE-NOT-CREATED",
          title: "Blocked",
          priceCents: 30_000,
          compareAtPriceCents: null,
          costCents: null,
          weightGrams: null,
          attributes: {},
          displayOrder: 0,
        },
      ],
    });
    await pg`
      UPDATE products SET name = 'Externally changed', updated_at = ${new Date("2026-09-12T19:00:00.000Z")}
      WHERE id = ${ids.targetProduct}
    `;
    await expect(
      applyProposal({ proposalId: seed.proposalId }, { authContext: actor(ids.actorOne) })
    ).rejects.toMatchObject({ code: "AI_PROPOSAL_APPLY_FAILED_TERMINAL" });
    const [state] = await pg`
      SELECT proposal.status, item.status AS item_status, step.step_status,
        step.request_payload->>'expectedUpdatedAt' AS expected
      FROM ai_product_proposals proposal
      JOIN ai_research_job_items item ON item.id = proposal.job_item_id
      JOIN ai_proposal_apply_steps step ON step.proposal_id = proposal.id
      WHERE proposal.id = ${seed.proposalId} AND step.step_key = 'PRODUCT_UPDATE'
    `;
    expect(state).toMatchObject({
      status: "APPLYING",
      item_status: "APPROVED",
      step_status: "FAILED_TERMINAL",
      expected: targetVersion.toISOString(),
    });
    const [variantCount] = await pg`
      SELECT count(*)::int AS count FROM product_variants WHERE sku = 'CHK3C-STALE-NOT-CREATED'
    `;
    expect(variantCount!.count).toBe(0);
  });

  it("preserves committed CREATE effects after a later terminal Variant failure", async () => {
    await pg`
      INSERT INTO product_variants (
        id, product_id, sku, title, price_cents, attributes, status, display_order
      ) VALUES (${generateUuidV7()}, ${ids.targetProduct}, 'CHK3C-CONFLICT', 'Conflict', 5000, '{}', 'ACTIVE', 0)
    `;
    const seed = await seedApprovedProposal({
      variants: [
        {
          sku: "CHK3C-PARTIAL-OK",
          title: "Committed",
          priceCents: 15_000,
          compareAtPriceCents: null,
          costCents: null,
          weightGrams: null,
          attributes: {},
          displayOrder: 0,
        },
        {
          sku: "CHK3C-CONFLICT",
          title: "Fails",
          priceCents: 16_000,
          compareAtPriceCents: null,
          costCents: null,
          weightGrams: null,
          attributes: {},
          displayOrder: 1,
        },
      ],
    });
    await expect(
      applyProposal({ proposalId: seed.proposalId }, { authContext: actor(ids.actorOne) })
    ).rejects.toMatchObject({ code: "AI_PROPOSAL_APPLY_FAILED_TERMINAL" });
    const [product] = await pg`SELECT id, status FROM products WHERE slug = ${seed.slug}`;
    expect(product!.status).toBe("DRAFT");
    const variants = await pg`
      SELECT sku FROM product_variants WHERE product_id = ${product!.id} ORDER BY display_order
    `;
    expect(variants).toEqual([{ sku: "CHK3C-PARTIAL-OK" }]);
    const states = await pg`
      SELECT step_key, step_status, target_id::text AS target_id
      FROM ai_proposal_apply_steps
      WHERE proposal_id = ${seed.proposalId} ORDER BY step_ordinal
    `;
    expect(states).toEqual([
      { step_key: "PRODUCT_CREATE", step_status: "COMMITTED", target_id: product!.id },
      {
        step_key: "VARIANT_CREATE:0",
        step_status: "COMMITTED",
        target_id: expect.any(String),
      },
      { step_key: "VARIANT_CREATE:1", step_status: "FAILED_TERMINAL", target_id: null },
    ]);
    const [terminal] = await pg`
      SELECT proposal.status, item.status AS item_status,
        (SELECT count(*)::int FROM audit_events WHERE action = 'AI_PROPOSAL_APPLIED'
          AND target_id = proposal.id::text) AS applied_events
      FROM ai_product_proposals proposal
      JOIN ai_research_job_items item ON item.id = proposal.job_item_id
      WHERE proposal.id = ${seed.proposalId}
    `;
    expect(terminal).toEqual({ status: "APPLYING", item_status: "APPROVED", applied_events: 0 });
  });

  it("records a CREATE slug conflict as terminal without replacing the existing Product", async () => {
    const seed = await seedApprovedProposal();
    const existing = await createProduct(
      {
        ...productPayload(seed),
        name: `${seed.name} existing`,
      },
      { authContext: actor(ids.actorOne) }
    );
    await expect(
      applyProposal({ proposalId: seed.proposalId }, { authContext: actor(ids.actorOne) })
    ).rejects.toMatchObject({ code: "AI_PROPOSAL_APPLY_FAILED_TERMINAL" });
    const products = await pg`SELECT id FROM products WHERE slug = ${seed.slug}`;
    expect(products).toEqual([{ id: existing.id }]);
    const [step] = await pg`
      SELECT step_status, error_message FROM ai_proposal_apply_steps
      WHERE proposal_id = ${seed.proposalId}
    `;
    expect(step).toMatchObject({ step_status: "FAILED_TERMINAL" });
    expect(step!.error_message).toContain("SLUG_CONFLICT");
  });

  it("revalidates current permission and rejects a different authorized actor on resume", async () => {
    const seed = await seedApprovedProposal();
    const operationId = generateUuidV7();
    await markApplying(seed);
    await insertApplyStep({
      seed,
      operationId,
      stepKey: "PRODUCT_CREATE",
      stepOrdinal: 0,
      payload: productPayload(seed),
      status: "PREPARED",
    });
    await expect(
      applyProposal(
        { proposalId: seed.proposalId },
        { authContext: actor(ids.noPermission, false) }
      )
    ).rejects.toThrow("Missing catalog:manage permission");
    await expect(
      applyProposal({ proposalId: seed.proposalId }, { authContext: actor(ids.actorTwo) })
    ).rejects.toMatchObject({ code: "APPLY_ACTOR_MISMATCH" });
    const [step] = await pg`
      SELECT step_status FROM ai_proposal_apply_steps WHERE proposal_id = ${seed.proposalId}
    `;
    expect(step!.step_status).toBe("PREPARED");
    const result = await applyProposal(
      { proposalId: seed.proposalId },
      { authContext: actor(ids.actorOne) }
    );
    expect(result.status).toBe("APPLIED");
  });

  it("marks persisted fingerprint corruption terminal before invoking GP-024", async () => {
    const seed = await seedApprovedProposal();
    const operationId = generateUuidV7();
    await markApplying(seed);
    await insertApplyStep({
      seed,
      operationId,
      stepKey: "PRODUCT_CREATE",
      stepOrdinal: 0,
      payload: productPayload(seed),
      status: "PREPARED",
      fingerprint: "0".repeat(64),
    });
    await expect(
      applyProposal({ proposalId: seed.proposalId }, { authContext: actor(ids.actorOne) })
    ).rejects.toMatchObject({ code: "AI_PROPOSAL_APPLY_FAILED_TERMINAL" });
    const [step] = await pg`
      SELECT step_status, error_message FROM ai_proposal_apply_steps
      WHERE proposal_id = ${seed.proposalId}
    `;
    expect(step!.step_status).toBe("FAILED_TERMINAL");
    expect(step!.error_message).toContain("AI_PROPOSAL_APPLY_INTEGRITY_ERROR");
    const [productCount] = await pg`
      SELECT count(*)::int AS count FROM products WHERE slug = ${seed.slug}
    `;
    expect(productCount!.count).toBe(0);
  });

  it("fails closed on malformed payload and wrong durable mutation identity", async () => {
    for (const corruption of ["payload", "mutation"] as const) {
      const seed = await seedApprovedProposal();
      const operationId = generateUuidV7();
      await markApplying(seed);
      await insertApplyStep({
        seed,
        operationId,
        stepKey: "PRODUCT_CREATE",
        stepOrdinal: 0,
        payload: productPayload(seed),
        status: "PREPARED",
      });
      if (corruption === "payload") {
        const malformedPayload = { unexpected: true };
        await pg`
          UPDATE ai_proposal_apply_steps
          SET request_payload = ${pg.json(malformedPayload)},
            request_fingerprint = ${computeRequestFingerprint(malformedPayload)}
          WHERE proposal_id = ${seed.proposalId}
        `;
      } else {
        await pg`
          UPDATE ai_proposal_apply_steps SET mutation_request_id = 'tampered-mutation-id'
          WHERE proposal_id = ${seed.proposalId}
        `;
      }
      await expect(
        applyProposal({ proposalId: seed.proposalId }, { authContext: actor(ids.actorOne) })
      ).rejects.toMatchObject({ code: "AI_PROPOSAL_APPLY_FAILED_TERMINAL" });
      const [productCount] = await pg`
        SELECT count(*)::int AS count FROM products WHERE slug = ${seed.slug}
      `;
      expect(productCount!.count).toBe(0);
    }
  });

  it("fails closed on mixed operation IDs and mixed stored actors", async () => {
    const variant: VariantPlan = {
      sku: "CHK3C-MIXED-IDENTITY",
      title: "Mixed",
      priceCents: 11_000,
      compareAtPriceCents: null,
      costCents: null,
      weightGrams: null,
      attributes: {},
      displayOrder: 0,
    };
    for (const corruption of ["operation", "actor"] as const) {
      const seed = await seedApprovedProposal({ variants: [variant] });
      const operationId = generateUuidV7();
      await markApplying(seed);
      await insertApplyStep({
        seed,
        operationId,
        stepKey: "PRODUCT_CREATE",
        stepOrdinal: 0,
        payload: productPayload(seed),
        status: "PREPARED",
      });
      await insertApplyStep({
        seed,
        operationId,
        stepKey: "VARIANT_CREATE:0",
        stepOrdinal: 2,
        payload: variantCreateApplyPayloadSchema.parse({
          productId: ids.targetProduct,
          ...variant,
          status: "ACTIVE",
        }),
        status: "PREPARED",
      });
      if (corruption === "operation") {
        await pg`
          UPDATE ai_proposal_apply_steps SET apply_operation_id = ${generateUuidV7()}
          WHERE proposal_id = ${seed.proposalId} AND step_key = 'VARIANT_CREATE:0'
        `;
      } else {
        await pg`
          UPDATE ai_proposal_apply_steps SET apply_actor_auth_user_id = ${ids.actorTwo}
          WHERE proposal_id = ${seed.proposalId} AND step_key = 'VARIANT_CREATE:0'
        `;
      }
      await expect(
        applyProposal({ proposalId: seed.proposalId }, { authContext: actor(ids.actorOne) })
      ).rejects.toMatchObject({ code: "AI_PROPOSAL_APPLY_FAILED_TERMINAL" });
    }
  });

  it("fails closed on extra, wrong-ordinal and invalid-status step ledgers", async () => {
    for (const corruption of ["extra", "ordinal", "status"] as const) {
      const seed = await seedApprovedProposal();
      const operationId = generateUuidV7();
      await markApplying(seed);
      await insertApplyStep({
        seed,
        operationId,
        stepKey: "PRODUCT_CREATE",
        stepOrdinal: 0,
        payload: productPayload(seed),
        status: corruption === "status" ? "COMMITTED" : "PREPARED",
      });
      if (corruption === "extra") {
        await insertApplyStep({
          seed,
          operationId,
          stepKey: "VARIANT_CREATE:0",
          stepOrdinal: 2,
          payload: variantCreateApplyPayloadSchema.parse({
            productId: ids.targetProduct,
            sku: "CHK3C-EXTRA-STEP",
            title: "Extra",
            priceCents: 11_000,
            compareAtPriceCents: null,
            costCents: null,
            weightGrams: null,
            attributes: {},
            status: "ACTIVE",
            displayOrder: 0,
          }),
          status: "PREPARED",
        });
      } else if (corruption === "ordinal") {
        await pg`
          UPDATE ai_proposal_apply_steps SET step_ordinal = 7
          WHERE proposal_id = ${seed.proposalId}
        `;
      }
      await expect(
        applyProposal({ proposalId: seed.proposalId }, { authContext: actor(ids.actorOne) })
      ).rejects.toMatchObject({ code: "AI_PROPOSAL_APPLY_FAILED_TERMINAL" });
    }
  });

  it("fails closed when a required downstream step is missing", async () => {
    const variant: VariantPlan = {
      sku: "CHK3C-MISSING-STEP",
      title: "Missing",
      priceCents: 11_000,
      compareAtPriceCents: null,
      costCents: null,
      weightGrams: null,
      attributes: {},
      displayOrder: 0,
    };
    const seed = await seedApprovedProposal({ variants: [variant] });
    const operationId = generateUuidV7();
    const payload = productPayload(seed);
    const product = await createProduct(
      {
        ...payload,
        mutationRequestId: deriveApplyMutationRequestId(operationId, "PRODUCT_CREATE"),
      },
      { authContext: actor(ids.actorOne) }
    );
    await markApplying(seed);
    await insertApplyStep({
      seed,
      operationId,
      stepKey: "PRODUCT_CREATE",
      stepOrdinal: 0,
      payload,
      status: "COMMITTED",
      targetId: product.id,
    });
    await expect(
      applyProposal({ proposalId: seed.proposalId }, { authContext: actor(ids.actorOne) })
    ).rejects.toMatchObject({ code: "AI_PROPOSAL_APPLY_FAILED_TERMINAL" });
  });

  it("rejects a committed Product step rebound to a different durable Product", async () => {
    const seed = await seedApprovedProposal();
    const operationId = generateUuidV7();
    const payload = productPayload(seed);
    const durableProduct = await createProduct(
      {
        ...payload,
        mutationRequestId: deriveApplyMutationRequestId(operationId, "PRODUCT_CREATE"),
      },
      { authContext: actor(ids.actorOne) }
    );
    const wrongProduct = await createProduct(
      {
        ...payload,
        name: `${seed.name} wrong target`,
        slug: `${seed.slug}-wrong-target`,
      },
      { authContext: actor(ids.actorOne) }
    );
    await markApplying(seed);
    await insertApplyStep({
      seed,
      operationId,
      stepKey: "PRODUCT_CREATE",
      stepOrdinal: 0,
      payload,
      status: "COMMITTED",
      targetId: wrongProduct.id,
    });
    const ledgerBefore = await loadImmutableApplyLedger(seed.proposalId);
    expect(ledgerBefore).toHaveLength(1);
    expect(ledgerBefore[0]).toMatchObject({
      step_status: "COMMITTED",
      target_id: wrongProduct.id,
    });
    await expect(
      applyProposal({ proposalId: seed.proposalId }, { authContext: actor(ids.actorOne) })
    ).rejects.toMatchObject({ code: "AI_PROPOSAL_APPLY_FAILED_TERMINAL" });
    expect(await loadImmutableApplyLedger(seed.proposalId)).toEqual(ledgerBefore);
    expect(await loadFinalizationState(seed.proposalId)).toEqual({
      status: "APPLYING",
      item_status: "APPROVED",
      applied_events: 0,
    });
    const products = await pg`
      SELECT id::text AS id FROM products
      WHERE id IN (${durableProduct.id}, ${wrongProduct.id}) ORDER BY id
    `;
    expect(products).toHaveLength(2);
  });

  it("rejects a committed Variant target belonging to another Product", async () => {
    const variant: VariantPlan = {
      sku: "CHK3C-FOREIGN-VARIANT",
      title: "Foreign",
      priceCents: 11_000,
      compareAtPriceCents: null,
      costCents: null,
      weightGrams: null,
      attributes: {},
      displayOrder: 0,
    };
    const seed = await seedApprovedProposal({ variants: [variant] });
    const operationId = generateUuidV7();
    const createPayload = productPayload(seed);
    const product = await createProduct(
      {
        ...createPayload,
        mutationRequestId: deriveApplyMutationRequestId(operationId, "PRODUCT_CREATE"),
      },
      { authContext: actor(ids.actorOne) }
    );
    const foreignProduct = await createProduct(
      {
        ...createPayload,
        name: `${seed.name} foreign`,
        slug: `${seed.slug}-foreign`,
      },
      { authContext: actor(ids.actorOne) }
    );
    const foreignVariant = await createVariant(
      {
        productId: foreignProduct.id,
        ...variant,
        status: "ACTIVE",
        mutationRequestId: deriveApplyMutationRequestId(operationId, "VARIANT_CREATE:0"),
      },
      { authContext: actor(ids.actorOne) }
    );
    await markApplying(seed);
    await insertApplyStep({
      seed,
      operationId,
      stepKey: "PRODUCT_CREATE",
      stepOrdinal: 0,
      payload: createPayload,
      status: "COMMITTED",
      targetId: product.id,
    });
    await insertApplyStep({
      seed,
      operationId,
      stepKey: "VARIANT_CREATE:0",
      stepOrdinal: 2,
      payload: variantCreateApplyPayloadSchema.parse({
        productId: product.id,
        ...variant,
        status: "ACTIVE",
      }),
      status: "COMMITTED",
      targetId: foreignVariant.id,
    });
    const ledgerBefore = await loadImmutableApplyLedger(seed.proposalId);
    expect(ledgerBefore).toHaveLength(2);
    await expect(
      applyProposal({ proposalId: seed.proposalId }, { authContext: actor(ids.actorOne) })
    ).rejects.toMatchObject({ code: "AI_PROPOSAL_APPLY_FAILED_TERMINAL" });
    expect(await loadImmutableApplyLedger(seed.proposalId)).toEqual(ledgerBefore);
    expect(await loadFinalizationState(seed.proposalId)).toEqual({
      status: "APPLYING",
      item_status: "APPROVED",
      applied_events: 0,
    });
  });

  it("preserves the complete COMMITTED ledger across repeated finalization evidence failure", async () => {
    const seed = await seedApprovedProposal();
    const operationId = generateUuidV7();
    const payload = productPayload(seed);
    const product = await createProduct(
      {
        ...payload,
        mutationRequestId: deriveApplyMutationRequestId(operationId, "PRODUCT_CREATE"),
      },
      { authContext: actor(ids.actorOne) }
    );
    await markApplying(seed);
    await insertApplyStep({
      seed,
      operationId,
      stepKey: "PRODUCT_CREATE",
      stepOrdinal: 0,
      payload,
      status: "COMMITTED",
      targetId: product.id,
    });
    await pg`
      INSERT INTO audit_events (
        id, timestamp, actor_type, actor_id, action, target_type, target_id,
        metadata, request_id
      )
      SELECT ${generateUuidV7()}, timestamp, actor_type, actor_id, action, target_type,
        target_id, metadata, request_id
      FROM audit_events
      WHERE actor_id = ${ids.actorOne} AND action = 'catalog:product:create'
        AND target_id = ${product.id}
      ORDER BY timestamp, id
      LIMIT 1
    `;

    const ledgerBefore = await loadImmutableApplyLedger(seed.proposalId);
    const [catalogBefore] = await pg`
      SELECT
        (SELECT count(*)::int FROM products WHERE slug = ${seed.slug}) AS products,
        (SELECT count(*)::int FROM product_variants WHERE product_id = ${product.id}) AS variants,
        (SELECT count(*)::int FROM audit_events
          WHERE actor_id = ${ids.actorOne} AND action LIKE 'catalog:%') AS catalog_events
    `;
    expect(catalogBefore).toEqual({ products: 1, variants: 0, catalog_events: 2 });

    for (let attempt = 0; attempt < 2; attempt += 1) {
      await expect(
        applyProposal({ proposalId: seed.proposalId }, { authContext: actor(ids.actorOne) })
      ).rejects.toMatchObject({ code: "AI_PROPOSAL_APPLY_FAILED_TERMINAL" });
      expect(await loadImmutableApplyLedger(seed.proposalId)).toEqual(ledgerBefore);
      expect(await loadFinalizationState(seed.proposalId)).toEqual({
        status: "APPLYING",
        item_status: "APPROVED",
        applied_events: 0,
      });
      const [catalogAfter] = await pg`
        SELECT
          (SELECT count(*)::int FROM products WHERE slug = ${seed.slug}) AS products,
          (SELECT count(*)::int FROM product_variants WHERE product_id = ${product.id}) AS variants,
          (SELECT count(*)::int FROM audit_events
            WHERE actor_id = ${ids.actorOne} AND action LIKE 'catalog:%') AS catalog_events
      `;
      expect(catalogAfter).toEqual(catalogBefore);
    }
  });

  it("finalizes a valid all-COMMITTED operation without changing its durable step", async () => {
    const seed = await seedApprovedProposal();
    const operationId = generateUuidV7();
    const payload = productPayload(seed);
    const product = await createProduct(
      {
        ...payload,
        mutationRequestId: deriveApplyMutationRequestId(operationId, "PRODUCT_CREATE"),
      },
      { authContext: actor(ids.actorOne) }
    );
    await markApplying(seed);
    await insertApplyStep({
      seed,
      operationId,
      stepKey: "PRODUCT_CREATE",
      stepOrdinal: 0,
      payload,
      status: "COMMITTED",
      targetId: product.id,
    });
    const ledgerBefore = await loadImmutableApplyLedger(seed.proposalId);

    await expect(
      applyProposal({ proposalId: seed.proposalId }, { authContext: actor(ids.actorOne) })
    ).resolves.toMatchObject({
      status: "APPLIED",
      canonicalProductId: product.id,
      applyOperationId: operationId,
      replayed: false,
    });
    expect(await loadImmutableApplyLedger(seed.proposalId)).toEqual(ledgerBefore);
    expect(await loadFinalizationState(seed.proposalId)).toEqual({
      status: "APPLIED",
      item_status: "APPLIED",
      applied_events: 1,
    });
  });

  it("fails closed when terminal APPLIED audit evidence is malformed", async () => {
    const seed = await seedApprovedProposal();
    await applyProposal({ proposalId: seed.proposalId }, { authContext: actor(ids.actorOne) });
    await pg`
      UPDATE audit_events SET metadata = ${pg.json({ proposalId: seed.proposalId })}
      WHERE action = 'AI_PROPOSAL_APPLIED' AND target_id = ${seed.proposalId}
    `;
    await expect(
      applyProposal({ proposalId: seed.proposalId }, { authContext: actor(ids.actorOne) })
    ).rejects.toMatchObject({ code: "AI_PROPOSAL_APPLY_INTEGRITY_ERROR" });
  });

  it("fails closed on approved-ledger catalog drift before creating operation steps", async () => {
    const seed = await seedApprovedProposal();
    await pg`UPDATE brands SET status = 'DRAFT' WHERE id = ${ids.brand}`;
    await expect(
      applyProposal({ proposalId: seed.proposalId }, { authContext: actor(ids.actorOne) })
    ).rejects.toMatchObject({ code: "AI_PROPOSAL_APPLY_FAILED_TERMINAL" });
    const [state] = await pg`
      SELECT proposal.status,
        (SELECT count(*)::int FROM ai_proposal_apply_steps WHERE proposal_id = proposal.id) AS steps
      FROM ai_product_proposals proposal WHERE proposal.id = ${seed.proposalId}
    `;
    expect(state).toEqual({ status: "APPROVED", steps: 0 });
  });
});
