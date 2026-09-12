import { createHash } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import postgres from "postgres";
import { assertLocalDatabaseTarget } from "@/lib/admin/test-target-guard";
import {
  AI_RESEARCH_SYSTEM_INSTRUCTION,
  claimResearchItem,
  createProviderAttempt,
  createProviderRequestDigest,
  createResearchJob,
  failResearchItem,
  heartbeatResearchItem,
  markSearchInProgress,
  persistEvidenceSourceSet,
  processClaimedResearchItem,
  publishDraftProposal,
  refreshResearchJobCounters,
  reconcileResearchDispatches,
  recoverExpiredResearchWork,
  runProviderAttempt,
} from "@/lib/ai/research";
import type { ExternalProductEvidence, ResearchProfileSnapshot } from "@/lib/ai/research";
import {
  AiGatewayError,
  type AiExecutionOptions,
  type AiGenerationInput,
  type AiProviderAdapter,
} from "@/lib/ai/gateway/types";
import type { VerifiedAuthContextReady } from "@/lib/auth/rbac";

describe("GP-025 / CHK2 — Research orchestration live PostgreSQL verification", () => {
  const rawDatabaseUrl =
    process.env.DATABASE_URL ??
    process.env.DATABASE_MIGRATION_URL ??
    "postgres://postgres:postgres@127.0.0.1:54322/postgres";
  const databaseUrl = assertLocalDatabaseTarget(rawDatabaseUrl);
  let sql: postgres.Sql;

  const ids = {
    actorOne: "018f0025-2000-7000-8000-000000000001",
    actorTwo: "018f0025-2000-7000-8000-000000000002",
    provider: "018f0025-2000-7000-8000-000000000010",
    profile: "018f0025-2000-7000-8000-000000000020",
    brand: "018f0025-2000-7000-8000-000000000030",
    category: "018f0025-2000-7000-8000-000000000031",
    product: "018f0025-2000-7000-8000-000000000032",
  };
  const initialProductVersion = new Date("2026-01-15T12:00:00.000Z");
  const snapshot: ResearchProfileSnapshot = {
    profileKey: "CHK2_RESEARCH_TEST",
    providerId: ids.provider,
    modelId: "gemini-test",
    temperature: 0.2,
    maxTokens: 1024,
  };
  const actor = (id: string): VerifiedAuthContextReady => ({
    status: "READY",
    authUserId: id,
    email: "research-test@gamerperu.invalid",
    roles: ["ADMIN_CATALOG"],
    permissions: new Set(["catalog:ai_research"]),
  });

  async function cleanResearchFixtures(): Promise<void> {
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
      await tx`DELETE FROM ai_provider_attempts WHERE provider_id = ${ids.provider}`;
      await tx`DELETE FROM ai_research_job_items WHERE job_id IN (
        SELECT id FROM ai_research_jobs WHERE created_by_auth_user_id IN (${ids.actorOne}, ${ids.actorTwo})
      )`;
      await tx`DELETE FROM ai_research_jobs WHERE created_by_auth_user_id IN (${ids.actorOne}, ${ids.actorTwo})`;
      await tx`DELETE FROM audit_events WHERE actor_id IN (${ids.actorOne}, ${ids.actorTwo})`;
    });
  }

  beforeAll(async () => {
    vi.stubEnv(
      "AI_RESEARCH_FETCH_USER_AGENT",
      "GamerPeruResearchBot/1.0 (operations-contact=integration-test)"
    );
    sql = postgres(databaseUrl, { max: 4 });
    await sql`
      INSERT INTO auth.users (id, email, raw_app_meta_data, raw_user_meta_data, is_super_admin, created_at, updated_at)
      VALUES
        (${ids.actorOne}, 'research-one@gamerperu.invalid', '{"provider":"email"}', '{}', false, NOW(), NOW()),
        (${ids.actorTwo}, 'research-two@gamerperu.invalid', '{"provider":"email"}', '{}', false, NOW(), NOW())
      ON CONFLICT (id) DO UPDATE SET updated_at = NOW()
    `;
    await sql`
      INSERT INTO ai_providers (id, provider_key, display_name, is_enabled, is_default, settings)
      VALUES (${ids.provider}, 'google', 'Google CHK2 Test', true, false, '{}')
      ON CONFLICT (id) DO UPDATE SET is_enabled = true
    `;
    await sql`
      INSERT INTO ai_profiles (id, profile_key, provider_id, model_id, temperature, max_tokens, is_enabled)
      VALUES (${ids.profile}, 'CHK2_RESEARCH_TEST', ${ids.provider}, 'gemini-test', 0.20, 1024, true)
      ON CONFLICT (id) DO UPDATE SET is_enabled = true
    `;
    await sql`
      INSERT INTO brands (id, name, slug, status, created_at, updated_at)
      VALUES (${ids.brand}, 'GP025 BR1 Brand', 'gp025-br1-brand', 'PUBLISHED', NOW(), NOW())
      ON CONFLICT (id) DO NOTHING
    `;
    await sql`
      INSERT INTO categories (id, name, slug, display_order, status, created_at, updated_at)
      VALUES (${ids.category}, 'GP025 BR1 Category', 'gp025-br1-category', 25025, 'PUBLISHED', NOW(), NOW())
      ON CONFLICT (id) DO NOTHING
    `;
    await sql`
      INSERT INTO products (id, brand_id, category_id, name, slug, status, created_at, updated_at)
      VALUES (${ids.product}, ${ids.brand}, ${ids.category}, 'GP025 BR1 Product', 'gp025-br1-product', 'DRAFT', NOW(), ${initialProductVersion})
      ON CONFLICT (id) DO UPDATE SET updated_at = EXCLUDED.updated_at
    `;
  });

  beforeEach(async () => {
    await cleanResearchFixtures();
    await sql`
      UPDATE ai_profiles
      SET model_id = 'gemini-test', temperature = 0.20, max_tokens = 1024, is_enabled = true
      WHERE id = ${ids.profile}
    `;
    await sql`UPDATE ai_providers SET is_enabled = true WHERE id = ${ids.provider}`;
    await sql`UPDATE products SET updated_at = ${initialProductVersion} WHERE id = ${ids.product}`;
  });

  afterAll(async () => {
    if (!sql) return;
    await cleanResearchFixtures();
    await sql`DELETE FROM ai_profiles WHERE id = ${ids.profile}`;
    await sql`DELETE FROM ai_provider_credentials WHERE provider_id = ${ids.provider}`;
    await sql`DELETE FROM ai_providers WHERE id = ${ids.provider}`;
    await sql`DELETE FROM products WHERE id = ${ids.product}`;
    await sql`DELETE FROM categories WHERE id = ${ids.category}`;
    await sql`DELETE FROM brands WHERE id = ${ids.brand}`;
    await sql`DELETE FROM auth.users WHERE id IN (${ids.actorOne}, ${ids.actorTwo})`;
    await sql.end();
    vi.unstubAllEnvs();
  });

  const createInput = (mutationRequestId: string, queries: string[]) => ({
    mutationRequestId,
    selectedProfileId: ids.profile,
    items: queries.map((query) => ({ query, mode: "CREATE" as const })),
  });

  const enrichInput = (mutationRequestId: string) => ({
    mutationRequestId,
    selectedProfileId: ids.profile,
    items: [{ query: "GP025 BR1 Product", mode: "ENRICH" as const, targetProductId: ids.product }],
  });

  const evidence = (suffix: string): ExternalProductEvidence => ({
    originalUrl: `https://example.com/${suffix}`,
    resolvedUrl: `https://example.com/${suffix}`,
    title: `Evidence ${suffix}`,
    text: `Normalized external product evidence ${suffix}`,
    snippet: `Normalized external product evidence ${suffix}`,
    contentSha256: "a".repeat(64),
    retrievalMethod: "SEARCH_API",
    trustTier: "TIER_6_PUBLIC_SUPPORTING",
    trustBasis: "UNVERIFIED_DEFAULT",
    fetchedAt: new Date(),
  });

  it("fails closed when the verified server context lacks catalog:ai_research", async () => {
    await expect(
      createResearchJob(createInput("unauthorized-M", ["Mouse A"]), {
        authContext: { ...actor(ids.actorOne), permissions: new Set() },
      })
    ).rejects.toThrow("Missing catalog:ai_research permission");
    expect(Number((await sql`SELECT count(*) FROM ai_research_jobs`)[0]!.count)).toBe(0);
  });

  it("serializes same-actor concurrent replay and isolates a different actor namespace", async () => {
    const input = createInput("replay-M", ["Mouse A"]);
    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        createResearchJob(input, { authContext: actor(ids.actorOne) })
      )
    );
    expect(new Set(results.map((result) => result.jobId)).size).toBe(1);
    expect(results.filter((result) => result.replayed)).toHaveLength(4);

    const otherActor = await createResearchJob(input, { authContext: actor(ids.actorTwo) });
    expect(otherActor.jobId).not.toBe(results[0]!.jobId);
    const rows = await sql`SELECT mutation_request_digest FROM ai_research_jobs ORDER BY id`;
    expect(new Set(rows.map((row) => row.mutation_request_digest)).size).toBe(2);
  });

  it("makes concurrent same-digest/different-fingerprint requests commit one and conflict one", async () => {
    const outcomes = await Promise.allSettled([
      createResearchJob(createInput("conflict-M", ["Mouse A"]), {
        authContext: actor(ids.actorOne),
      }),
      createResearchJob(createInput("conflict-M", ["Mouse B"]), {
        authContext: actor(ids.actorOne),
      }),
    ]);
    expect(outcomes.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const rejected = outcomes.find((result) => result.status === "rejected");
    expect(rejected).toMatchObject({ reason: { code: "AI_IDEMPOTENCY_CONFLICT" } });
    const countRows = await sql`SELECT count(*)::int AS count FROM ai_research_jobs`;
    expect(countRows[0]!.count).toBe(1);
  });

  it("creates a job, ordered items, immutable profile snapshot, and audit atomically", async () => {
    const result = await createResearchJob(createInput("batch-M", ["Mouse A", "Mouse B"]), {
      authContext: actor(ids.actorOne),
    });
    const [job] = await sql`SELECT * FROM ai_research_jobs WHERE id = ${result.jobId}`;
    const items = await sql`
      SELECT item_index, input_query FROM ai_research_job_items
      WHERE job_id = ${result.jobId} ORDER BY item_index
    `;
    expect(job!.job_type).toBe("BATCH");
    expect(job!.dispatch_status).toBe("PENDING_DISPATCH");
    expect(job!.profile_snapshot).toEqual(snapshot);
    expect(job!.inngest_event_id).toBe(`gp-ai-job-${result.jobId}`);
    expect(items.map((item) => item.input_query)).toEqual(["Mouse A", "Mouse B"]);
    const auditCountRows = await sql`
      SELECT count(*)::int AS count FROM audit_events
      WHERE target_id = ${result.jobId} AND action = 'AI_RESEARCH_JOB_CREATED' AND request_id IS NULL
    `;
    expect(auditCountRows[0]!.count).toBe(1);
  });

  it("replays from the committed snapshot after current profile settings change", async () => {
    const input = createInput("snapshot-M", ["Mouse A"]);
    const result = await createResearchJob(createInput("snapshot-M", ["Mouse A"]), {
      authContext: actor(ids.actorOne),
    });
    await sql`
      UPDATE ai_profiles SET model_id = 'changed-model', temperature = 0.90, max_tokens = 2048
      WHERE id = ${ids.profile}
    `;
    const replay = await createResearchJob(input, { authContext: actor(ids.actorOne) });
    expect(replay).toMatchObject({ jobId: result.jobId, replayed: true });
    const [job] = await sql`
      SELECT profile_snapshot,
        (SELECT count(*)::int FROM ai_research_jobs) AS job_count
      FROM ai_research_jobs WHERE id = ${result.jobId}
    `;
    expect(job).toEqual({ profile_snapshot: snapshot, job_count: 1 });
  });

  it("resolves a committed replay even after its current profile and provider are disabled", async () => {
    const input = createInput("disabled-replay-M", ["Mouse A"]);
    const result = await createResearchJob(input, { authContext: actor(ids.actorOne) });
    await sql`UPDATE ai_profiles SET is_enabled = false WHERE id = ${ids.profile}`;
    await sql`UPDATE ai_providers SET is_enabled = false WHERE id = ${ids.provider}`;

    const replay = await createResearchJob(input, { authContext: actor(ids.actorOne) });
    expect(replay).toMatchObject({ jobId: result.jobId, replayed: true });
    expect(Number((await sql`SELECT count(*) FROM ai_research_jobs`)[0]!.count)).toBe(1);
    const [job] = await sql`
      SELECT profile_snapshot FROM ai_research_jobs WHERE id = ${result.jobId}
    `;
    expect(job!.profile_snapshot).toEqual(snapshot);
  });

  it("derives ENRICH updatedAt server-side and preserves it across product changes and replay", async () => {
    const input = enrichInput("enrich-snapshot-M");
    const result = await createResearchJob(input, { authContext: actor(ids.actorOne) });
    const [created] = await sql`
      SELECT target_product_id, target_product_version_snapshot
      FROM ai_research_job_items WHERE job_id = ${result.jobId}
    `;
    expect(created).toEqual({
      target_product_id: ids.product,
      target_product_version_snapshot: initialProductVersion,
    });

    const laterVersion = new Date("2026-02-20T18:30:00.000Z");
    await sql`UPDATE products SET updated_at = ${laterVersion} WHERE id = ${ids.product}`;
    const replay = await createResearchJob(input, { authContext: actor(ids.actorOne) });
    expect(replay).toMatchObject({ jobId: result.jobId, replayed: true });
    const [replayedItem] = await sql`
      SELECT target_product_version_snapshot
      FROM ai_research_job_items WHERE job_id = ${result.jobId}
    `;
    expect(replayedItem!.target_product_version_snapshot).toEqual(initialProductVersion);
  });

  it("fails closed when the canonical ENRICH target does not exist", async () => {
    const missingProduct = "018f0025-2000-7000-8000-000000000099";
    await expect(
      createResearchJob(
        {
          mutationRequestId: "missing-enrich-M",
          selectedProfileId: ids.profile,
          items: [
            {
              query: "Missing Product",
              mode: "ENRICH",
              targetProductId: missingProduct,
            },
          ],
        },
        { authContext: actor(ids.actorOne) }
      )
    ).rejects.toThrow("AI_TARGET_PRODUCT_NOT_FOUND");
    expect(Number((await sql`SELECT count(*) FROM ai_research_jobs`)[0]!.count)).toBe(0);
  });

  it("fails closed with exact codes when the frozen profile or provider is later disabled", async () => {
    const profileJob = await createResearchJob(createInput("disabled-profile-M", ["Mouse A"]), {
      authContext: actor(ids.actorOne),
    });
    const profileItem = (await claimResearchItem(profileJob.jobId))!;
    try {
      await sql`UPDATE ai_profiles SET is_enabled = false WHERE id = ${ids.profile}`;
      await processClaimedResearchItem(profileItem);
      const [failed] =
        await sql`SELECT status, error_code FROM ai_research_job_items WHERE id = ${profileItem.id}`;
      expect(failed).toEqual({ status: "FAILED", error_code: "AI_PROFILE_DISABLED" });
    } finally {
      await sql`UPDATE ai_profiles SET is_enabled = true WHERE id = ${ids.profile}`;
    }

    const providerJob = await createResearchJob(createInput("disabled-provider-M", ["Mouse B"]), {
      authContext: actor(ids.actorOne),
    });
    const providerItem = (await claimResearchItem(providerJob.jobId))!;
    try {
      await sql`UPDATE ai_providers SET is_enabled = false WHERE id = ${ids.provider}`;
      await processClaimedResearchItem(providerItem);
      const [failed] =
        await sql`SELECT status, error_code FROM ai_research_job_items WHERE id = ${providerItem.id}`;
      expect(failed).toEqual({ status: "FAILED", error_code: "AI_PROVIDER_DISABLED" });
    } finally {
      await sql`UPDATE ai_providers SET is_enabled = true WHERE id = ${ids.provider}`;
    }
  });

  it("selects stale dispatches once with SKIP LOCKED and sends minimum deterministic events", async () => {
    const result = await createResearchJob(createInput("dispatch-M", ["Mouse A"]), {
      authContext: actor(ids.actorOne),
    });
    await sql`UPDATE ai_research_jobs SET updated_at = NOW() - INTERVAL '5 minutes' WHERE id = ${result.jobId}`;
    const send = vi.fn(async () => undefined);
    const outcomes = await Promise.all([
      reconcileResearchDispatches({ send }),
      reconcileResearchDispatches({ send }),
    ]);
    expect(outcomes.reduce((sum, outcome) => sum + outcome.dispatched, 0)).toBe(1);
    expect(send).toHaveBeenCalledWith({
      id: `gp-ai-job-${result.jobId}`,
      name: "gp/ai.research-job.requested",
      data: { jobId: result.jobId },
    });
    expect(JSON.stringify(send.mock.calls)).not.toContain("Mouse A");
  });

  it("grants exactly one simultaneous lease owner and rejects a stale owner after reclaim", async () => {
    const result = await createResearchJob(createInput("claim-M", ["Mouse A"]), {
      authContext: actor(ids.actorOne),
    });
    const claims = await Promise.all([
      claimResearchItem(result.jobId),
      claimResearchItem(result.jobId),
    ]);
    const first = claims.find(Boolean)!;
    expect(claims.filter(Boolean)).toHaveLength(1);
    await heartbeatResearchItem(first.id, first.leaseToken);

    await sql`
      UPDATE ai_research_job_items SET processing_lease_expires_at = NOW() - INTERVAL '1 second'
      WHERE id = ${first.id}
    `;
    const reclaimed = await claimResearchItem(result.jobId);
    expect(reclaimed!.leaseToken).not.toBe(first.leaseToken);
    await expect(heartbeatResearchItem(first.id, first.leaseToken)).rejects.toMatchObject({
      code: "LEASE_LOST",
    });
  });

  it("stores the exact search marker and converts an expired ambiguous search to attention", async () => {
    const result = await createResearchJob(createInput("marker-M", ["Mouse A"]), {
      authContext: actor(ids.actorOne),
    });
    const item = (await claimResearchItem(result.jobId))!;
    await markSearchInProgress(item.id, item.leaseToken);
    const [marked] = await sql`
      SELECT status, error_code, error_message FROM ai_research_job_items WHERE id = ${item.id}
    `;
    expect(marked).toEqual({
      status: "RESEARCHING",
      error_code: "AI_SEARCH_IN_PROGRESS",
      error_message: null,
    });
    await sql`
      UPDATE ai_research_job_items SET processing_lease_expires_at = NOW() - INTERVAL '1 second'
      WHERE id = ${item.id}
    `;
    const recovered = await recoverExpiredResearchWork();
    expect(recovered.needsAttention).toBe(1);
    const [final] = await sql`
      SELECT status, error_code, processing_lease_token FROM ai_research_job_items WHERE id = ${item.id}
    `;
    expect(final).toMatchObject({
      status: "NEEDS_ATTENTION",
      error_code: "AI_SEARCH_OUTCOME_UNKNOWN",
      processing_lease_token: null,
    });
    const [job] = await sql`
      SELECT status, completed_items, failed_items FROM ai_research_jobs WHERE id = ${result.jobId}
    `;
    expect(job).toEqual({ status: "COMPLETED", completed_items: 1, failed_items: 0 });
  });

  it("commits the normalized source set transactionally and clears the search marker", async () => {
    const result = await createResearchJob(createInput("source-M", ["Mouse A"]), {
      authContext: actor(ids.actorOne),
    });
    const item = (await claimResearchItem(result.jobId))!;
    await markSearchInProgress(item.id, item.leaseToken);
    const sources = await persistEvidenceSourceSet(item.id, item.leaseToken, [evidence("source")]);
    expect(sources).toHaveLength(1);
    const [stored] = await sql`
      SELECT original_url, resolved_url, retrieval_method, provider_citation_id, snippet, content_sha256
      FROM ai_sources WHERE job_item_id = ${item.id}
    `;
    expect(stored).toEqual({
      original_url: "https://example.com/source",
      resolved_url: "https://example.com/source",
      retrieval_method: "SEARCH_API",
      provider_citation_id: null,
      snippet: "Normalized external product evidence source",
      content_sha256: createHash("sha256")
        .update("Normalized external product evidence source", "utf8")
        .digest("hex"),
    });
    const [state] = await sql`SELECT error_code FROM ai_research_job_items WHERE id = ${item.id}`;
    expect(state!.error_code).toBeNull();
  });

  it("allocates unique provider-attempt ordinals and recovers abandoned RUNNING as UNKNOWN", async () => {
    const result = await createResearchJob(createInput("attempt-M", ["Mouse A"]), {
      authContext: actor(ids.actorOne),
    });
    const item = (await claimResearchItem(result.jobId))!;
    const context = {
      itemId: item.id,
      leaseToken: item.leaseToken,
      profileId: ids.profile,
      snapshot,
      operationType: "SPEC_EXTRACTION" as const,
      requestDigest: "d".repeat(64),
    };
    await Promise.all([createProviderAttempt(context), createProviderAttempt(context)]);
    const attempts = await sql`
      SELECT attempt_ordinal, status, cost_source, cost_micros, currency
      FROM ai_provider_attempts WHERE job_item_id = ${item.id} ORDER BY attempt_ordinal
    `;
    expect(attempts).toEqual([
      {
        attempt_ordinal: 1,
        status: "RUNNING",
        cost_source: "UNAVAILABLE",
        cost_micros: null,
        currency: null,
      },
      {
        attempt_ordinal: 2,
        status: "RUNNING",
        cost_source: "UNAVAILABLE",
        cost_micros: null,
        currency: null,
      },
    ]);
    await sql`
      UPDATE ai_provider_attempts SET started_at = NOW() - INTERVAL '10 minutes'
      WHERE job_item_id = ${item.id}
    `;
    const activeRecovery = await recoverExpiredResearchWork();
    expect(activeRecovery.attemptsUnknown).toBe(0);
    await sql`
      UPDATE ai_research_job_items SET processing_lease_expires_at = NOW() - INTERVAL '1 second'
      WHERE id = ${item.id}
    `;
    const recovery = await recoverExpiredResearchWork();
    expect(recovery.requeued).toBe(1);
    expect(recovery.attemptsUnknown).toBe(2);
  });

  it("records explicit provider throttling as RATE_LIMITED without fabricated cost", async () => {
    const result = await createResearchJob(createInput("rate-limited-M", ["Mouse A"]), {
      authContext: actor(ids.actorOne),
    });
    const item = (await claimResearchItem(result.jobId))!;
    await expect(
      runProviderAttempt(
        {
          itemId: item.id,
          leaseToken: item.leaseToken,
          profileId: ids.profile,
          snapshot,
          operationType: "IDENTITY_RESOLUTION",
          requestDigest: "f".repeat(64),
        },
        async () => {
          throw new AiGatewayError("AI_PROVIDER_RATE_LIMITED", "Controlled test rejection.");
        }
      )
    ).rejects.toMatchObject({ code: "AI_PROVIDER_RATE_LIMITED" });
    const [attempt] = await sql`
      SELECT status, error_code, cost_source, cost_micros, currency
      FROM ai_provider_attempts WHERE job_item_id = ${item.id}
    `;
    expect(attempt).toEqual({
      status: "RATE_LIMITED",
      error_code: "AI_PROVIDER_RATE_LIMITED",
      cost_source: "UNAVAILABLE",
      cost_micros: null,
      currency: null,
    });
  });

  it("prevents a stale worker from publishing a provider result after lease reclaim", async () => {
    const result = await createResearchJob(createInput("stale-attempt-M", ["Mouse A"]), {
      authContext: actor(ids.actorOne),
    });
    const item = (await claimResearchItem(result.jobId))!;
    let release!: () => void;
    const barrier = new Promise<void>((resolve) => {
      release = resolve;
    });
    const running = runProviderAttempt(
      {
        itemId: item.id,
        leaseToken: item.leaseToken,
        profileId: ids.profile,
        snapshot,
        operationType: "COPY_GENERATION",
        requestDigest: "e".repeat(64),
      },
      async () => {
        await barrier;
        return {
          data: { ok: true },
          providerRequestId: "remote-request",
          usage: {
            inputTokens: 1,
            outputTokens: 1,
            totalTokens: 2,
            costMicros: null,
            currency: null,
            costSource: "UNAVAILABLE" as const,
          },
        };
      }
    );
    await vi.waitFor(async () => {
      const countRows = await sql`
        SELECT count(*)::int AS count FROM ai_provider_attempts WHERE job_item_id = ${item.id}
      `;
      expect(countRows[0]!.count).toBe(1);
    });
    await sql`
      UPDATE ai_research_job_items SET processing_lease_expires_at = NOW() - INTERVAL '1 second'
      WHERE id = ${item.id}
    `;
    const reclaimed = await claimResearchItem(result.jobId);
    expect(reclaimed).not.toBeNull();
    release();
    await expect(running).rejects.toMatchObject({ code: "LEASE_LOST" });
    const [attempt] = await sql`
      SELECT status, provider_request_id FROM ai_provider_attempts WHERE job_item_id = ${item.id}
    `;
    expect(attempt).toEqual({ status: "RUNNING", provider_request_id: null });
  });

  it("prevents automatic Gemini replay after reclaim when a prior attempt exists", async () => {
    const result = await createResearchJob(createInput("provider-replay-M", ["Mouse A"]), {
      authContext: actor(ids.actorOne),
    });
    const first = (await claimResearchItem(result.jobId))!;
    await createProviderAttempt({
      itemId: first.id,
      leaseToken: first.leaseToken,
      profileId: ids.profile,
      snapshot,
      operationType: "IDENTITY_RESOLUTION",
      requestDigest: "1".repeat(64),
    });
    await sql`
      UPDATE ai_research_job_items SET processing_lease_expires_at = NOW() - INTERVAL '1 second'
      WHERE id = ${first.id}
    `;
    const reclaimed = (await claimResearchItem(result.jobId))!;
    const resolveAdapter = vi.fn(() => {
      throw new Error("Provider must not be called");
    });
    const acquireSearch = vi.fn(async () => [evidence("must-not-run")]);
    await processClaimedResearchItem(reclaimed, { resolveAdapter, acquireSearch });

    expect(resolveAdapter).not.toHaveBeenCalled();
    expect(acquireSearch).not.toHaveBeenCalled();
    const [state] = await sql`
      SELECT status, error_code, processing_lease_token
      FROM ai_research_job_items WHERE id = ${first.id}
    `;
    expect(state).toEqual({
      status: "NEEDS_ATTENTION",
      error_code: "AI_PROVIDER_OUTCOME_UNKNOWN",
      processing_lease_token: null,
    });
    expect(
      Number(
        (await sql`SELECT count(*) FROM ai_provider_attempts WHERE job_item_id = ${first.id}`)[0]!
          .count
      )
    ).toBe(1);
  });

  it("runs the complete fake-network pipeline through validated attempts and DRAFT staging", async () => {
    const result = await createResearchJob(createInput("pipeline-M", ["Mouse Pipeline"]), {
      authContext: actor(ids.actorOne),
    });
    const item = (await claimResearchItem(result.jobId))!;
    const generated = [
      {
        status: "EXACT_MATCH",
        brandName: "Brand",
        modelName: "Mouse Pipeline",
        rationale: "The normalized evidence supports this identity.",
      },
      {
        specifications: [
          {
            fieldPath: "weightGrams",
            value: 54,
            sourceIndexes: [0],
            conflictingValues: [],
          },
        ],
        unmappedSpecifications: {},
        variants: [],
        mediaCandidates: [],
      },
      {
        name: "Brand Mouse Pipeline",
        subtitle: "Wireless competitive mouse",
        description: "A concise original GamerPeru product draft for staff review.",
        seoTitle: "Brand Mouse Pipeline",
        seoDescription: "Technical product draft prepared for staff verification.",
      },
    ];
    const generateStructured = vi.fn(
      async (
        _apiKey: string,
        _input: AiGenerationInput,
        _jsonSchema: Record<string, unknown>,
        _options: AiExecutionOptions
      ) => ({
        data: generated.shift(),
        providerRequestId: `interaction-${3 - generated.length}`,
        usage: {
          inputTokens: 10,
          outputTokens: 5,
          totalTokens: 15,
          costMicros: null,
          currency: null,
          costSource: "UNAVAILABLE" as const,
        },
      })
    );
    const adapter: AiProviderAdapter = {
      providerKey: "google",
      healthCheck: async () => ({ ok: true, status: "HEALTHY" }),
      generateText: async () => {
        throw new Error("Unexpected text generation call");
      },
      generateStructured,
    };
    const withCredential = async <T>(
      _providerId: string,
      operation: (apiKey: string) => Promise<T>
    ): Promise<T> => await operation("fake-gemini-key");

    await processClaimedResearchItem(item, {
      resolveAdapter: () => adapter,
      withCredential,
      acquireSearch: async () => [evidence("pipeline")],
    });

    expect(generateStructured).toHaveBeenCalledTimes(3);
    expect(
      generateStructured.mock.calls.every(
        (call) =>
          call[3]?.modelId === snapshot.modelId &&
          call[3]?.temperature === snapshot.temperature &&
          call[3]?.maxTokens === snapshot.maxTokens &&
          call[3]?.signal instanceof AbortSignal
      )
    ).toBe(true);
    const attempts = await sql`
      SELECT operation_type, status, provider_request_id, cost_source, cost_micros
      FROM ai_provider_attempts WHERE job_item_id = ${item.id} ORDER BY attempt_ordinal, operation_type
    `;
    expect(attempts).toEqual([
      {
        operation_type: "COPY_GENERATION",
        status: "COMPLETED",
        provider_request_id: "interaction-3",
        cost_source: "UNAVAILABLE",
        cost_micros: null,
      },
      {
        operation_type: "IDENTITY_RESOLUTION",
        status: "COMPLETED",
        provider_request_id: "interaction-1",
        cost_source: "UNAVAILABLE",
        cost_micros: null,
      },
      {
        operation_type: "SPEC_EXTRACTION",
        status: "COMPLETED",
        provider_request_id: "interaction-2",
        cost_source: "UNAVAILABLE",
        cost_micros: null,
      },
    ]);
    const [proposal] = await sql`
      SELECT proposal.status, proposal.applied_product_id, item.status AS item_status,
             item.processing_lease_token
      FROM ai_product_proposals proposal
      JOIN ai_research_job_items item ON item.id = proposal.job_item_id
      WHERE proposal.job_item_id = ${item.id}
    `;
    expect(proposal).toEqual({
      status: "DRAFT",
      applied_product_id: null,
      item_status: "READY_FOR_REVIEW",
      processing_lease_token: null,
    });
  });

  it("rehydrates persisted evidence without Tavily and sends only matching full evidence to Gemini", async () => {
    const fullEvidenceText = `Stable recovered product evidence ${"x".repeat(2_000)}`;
    const acquired = {
      ...evidence("rehydrate"),
      text: fullEvidenceText,
      snippet: fullEvidenceText.slice(0, 1_000),
    };
    const result = await createResearchJob(createInput("rehydrate-M", ["Mouse Recovery"]), {
      authContext: actor(ids.actorOne),
    });
    const first = (await claimResearchItem(result.jobId))!;
    await persistEvidenceSourceSet(first.id, first.leaseToken, [acquired]);
    await sql`
      UPDATE ai_research_job_items SET processing_lease_expires_at = NOW() - INTERVAL '1 second'
      WHERE id = ${first.id}
    `;
    const reclaimed = (await claimResearchItem(result.jobId))!;
    const responses = [
      {
        status: "EXACT_MATCH",
        brandName: "Brand",
        modelName: "Mouse Recovery",
        rationale: "Recovered evidence supports the identity.",
      },
      {
        specifications: [],
        unmappedSpecifications: {},
        variants: [],
        mediaCandidates: [],
      },
      {
        name: "Mouse Recovery",
        subtitle: null,
        description: "An original product draft prepared from verified evidence.",
        seoTitle: null,
        seoDescription: null,
      },
    ];
    const generateStructured = vi.fn(
      async (
        _apiKey: string,
        _input: AiGenerationInput,
        _jsonSchema: Record<string, unknown>,
        _options: AiExecutionOptions
      ) => ({
        data: responses.shift(),
        providerRequestId: "rehydrated-interaction",
        usage: {
          inputTokens: 1,
          outputTokens: 1,
          totalTokens: 2,
          costMicros: null,
          currency: null,
          costSource: "UNAVAILABLE" as const,
        },
      })
    );
    const adapter: AiProviderAdapter = {
      providerKey: "google",
      healthCheck: async () => ({ ok: true, status: "HEALTHY" }),
      generateText: async () => {
        throw new Error("Unexpected text generation call");
      },
      generateStructured,
    };
    const acquireSearch = vi.fn(async () => [evidence("must-not-run")]);
    const rehydrateDestination = vi.fn(async () => ({
      originalUrl: acquired.resolvedUrl,
      resolvedUrl: acquired.resolvedUrl,
      title: acquired.title,
      text: fullEvidenceText,
      snippet: fullEvidenceText.slice(0, 1_000),
      contentSha256: createHash("sha256").update(fullEvidenceText, "utf8").digest("hex"),
      fetchedAt: new Date(),
    }));

    await processClaimedResearchItem(reclaimed, {
      acquireSearch,
      rehydrateDestination,
      resolveAdapter: () => adapter,
      withCredential: async (_providerId, operation) => await operation("fake-gemini-key"),
    });

    expect(acquireSearch).not.toHaveBeenCalled();
    expect(rehydrateDestination).toHaveBeenCalledWith(
      expect.objectContaining({ url: acquired.resolvedUrl })
    );
    const firstProviderInput = JSON.parse(generateStructured.mock.calls[0]![1].input);
    expect(firstProviderInput.external_product_evidence[0].text).toBe(fullEvidenceText);
    expect(firstProviderInput.external_product_evidence[0].text).not.toBe(
      fullEvidenceText.slice(0, 1_000)
    );
    const [stored] = await sql`
      SELECT snippet, content_sha256 FROM ai_sources WHERE job_item_id = ${first.id}
    `;
    expect(stored).toEqual({
      snippet: fullEvidenceText.slice(0, 1_000),
      content_sha256: createHash("sha256").update(fullEvidenceText, "utf8").digest("hex"),
    });
    const [attempt] = await sql`
      SELECT request_digest FROM ai_provider_attempts
      WHERE job_item_id = ${first.id} AND operation_type = 'IDENTITY_RESOLUTION'
    `;
    const identityCall = generateStructured.mock.calls[0]!;
    expect(attempt!.request_digest).toBe(
      createProviderRequestDigest({
        operationType: "IDENTITY_RESOLUTION",
        modelId: snapshot.modelId,
        temperature: snapshot.temperature,
        maxTokens: snapshot.maxTokens,
        systemInstruction: AI_RESEARCH_SYSTEM_INSTRUCTION,
        input: identityCall[1].input,
        jsonSchema: identityCall[2],
      })
    );
  });

  it("moves changed persisted evidence to NEEDS_ATTENTION without Tavily or Gemini", async () => {
    const result = await createResearchJob(createInput("evidence-changed-M", ["Mouse A"]), {
      authContext: actor(ids.actorOne),
    });
    const first = (await claimResearchItem(result.jobId))!;
    await persistEvidenceSourceSet(first.id, first.leaseToken, [evidence("changed")]);
    await sql`
      UPDATE ai_research_job_items SET processing_lease_expires_at = NOW() - INTERVAL '1 second'
      WHERE id = ${first.id}
    `;
    const reclaimed = (await claimResearchItem(result.jobId))!;
    const acquireSearch = vi.fn(async () => [evidence("must-not-run")]);
    const resolveAdapter = vi.fn(() => {
      throw new Error("Gemini must not run");
    });

    await processClaimedResearchItem(reclaimed, {
      acquireSearch,
      resolveAdapter,
      rehydrateDestination: async () => ({
        originalUrl: "https://example.com/changed",
        resolvedUrl: "https://example.com/changed",
        title: "Changed",
        text: "Different evidence",
        snippet: "Different evidence",
        contentSha256: createHash("sha256").update("Different evidence", "utf8").digest("hex"),
        fetchedAt: new Date(),
      }),
    });

    expect(acquireSearch).not.toHaveBeenCalled();
    expect(resolveAdapter).not.toHaveBeenCalled();
    const [state] = await sql`
      SELECT status, error_code FROM ai_research_job_items WHERE id = ${first.id}
    `;
    expect(state).toEqual({ status: "NEEDS_ATTENTION", error_code: "AI_EVIDENCE_CHANGED" });
  });

  it("does not substitute a persisted snippet when evidence rehydration fails", async () => {
    const result = await createResearchJob(createInput("evidence-refetch-M", ["Mouse A"]), {
      authContext: actor(ids.actorOne),
    });
    const first = (await claimResearchItem(result.jobId))!;
    await persistEvidenceSourceSet(first.id, first.leaseToken, [evidence("refetch")]);
    await sql`
      UPDATE ai_research_job_items SET processing_lease_expires_at = NOW() - INTERVAL '1 second'
      WHERE id = ${first.id}
    `;
    const reclaimed = (await claimResearchItem(result.jobId))!;
    const acquireSearch = vi.fn(async () => [evidence("must-not-run")]);
    const resolveAdapter = vi.fn(() => {
      throw new Error("Gemini must not run");
    });

    await processClaimedResearchItem(reclaimed, {
      acquireSearch,
      resolveAdapter,
      rehydrateDestination: async () => {
        throw new Error("Publisher policy block");
      },
    });

    expect(acquireSearch).not.toHaveBeenCalled();
    expect(resolveAdapter).not.toHaveBeenCalled();
    const [state] = await sql`
      SELECT status, error_code FROM ai_research_job_items WHERE id = ${first.id}
    `;
    expect(state).toEqual({
      status: "NEEDS_ATTENTION",
      error_code: "AI_EVIDENCE_REHYDRATION_FAILED",
    });
    expect(Number((await sql`SELECT count(*) FROM ai_provider_attempts`)[0]!.count)).toBe(0);
  });

  it("publishes only DRAFT proposals with conflict provenance and clears the lease", async () => {
    const result = await createResearchJob(createInput("proposal-M", ["Mouse A"]), {
      authContext: actor(ids.actorOne),
    });
    const item = (await claimResearchItem(result.jobId))!;
    const sourceIds = (
      await persistEvidenceSourceSet(item.id, item.leaseToken, [evidence("a"), evidence("b")])
    ).map((source) => source.id);
    const published = await publishDraftProposal({
      itemId: item.id,
      leaseToken: item.leaseToken,
      identity: {
        status: "EXACT_MATCH",
        brandName: "Brand",
        modelName: "Mouse A",
        rationale: "Evidence",
      },
      extraction: {
        specifications: [
          {
            fieldPath: "weightGrams",
            value: 54,
            sourceIndexes: [0],
            conflictingValues: [{ value: 55, sourceIndexes: [1] }],
          },
        ],
        unmappedSpecifications: {},
        variants: [],
        mediaCandidates: [],
      },
      copy: {
        name: "Brand Mouse A",
        subtitle: "Competitive wireless mouse",
        description: "An original GamerPeru draft based on reviewed technical evidence.",
        seoTitle: "Brand Mouse A",
        seoDescription: "Draft product information for later staff review.",
      },
      sourceIds,
    });
    expect(published.itemStatus).toBe("SOURCE_CONFLICT");
    const [proposal] =
      await sql`SELECT status, applied_product_id FROM ai_product_proposals WHERE id = ${published.proposalId}`;
    expect(proposal).toEqual({ status: "DRAFT", applied_product_id: null });
    const relationships = await sql`
      SELECT source.relationship FROM ai_proposal_field_sources source
      JOIN ai_proposal_field_reviews review ON review.id = source.field_review_id
      WHERE review.field_path = 'weightGrams' ORDER BY source.relationship
    `;
    expect(relationships.map((row) => row.relationship)).toEqual(["CONFLICTS", "SUPPORTS"]);
    const [state] = await sql`
      SELECT status, processing_lease_token, processing_lease_expires_at, last_heartbeat_at
      FROM ai_research_job_items WHERE id = ${item.id}
    `;
    expect(state).toEqual({
      status: "SOURCE_CONFLICT",
      processing_lease_token: null,
      processing_lease_expires_at: null,
      last_heartbeat_at: null,
    });
    const [catalogMutations] = await sql`
      SELECT count(*)::int AS count FROM audit_events
      WHERE actor_id = ${ids.actorOne} AND action LIKE 'catalog:%'
    `;
    expect(catalogMutations!.count).toBe(0);
  });

  it("counts every research-settled and future review state as completed, not failed", async () => {
    const settledStatuses = [
      "READY_FOR_REVIEW",
      "NEEDS_ATTENTION",
      "AMBIGUOUS",
      "SOURCE_CONFLICT",
      "APPROVED",
      "APPLIED",
    ] as const;
    for (const [index, status] of settledStatuses.entries()) {
      const result = await createResearchJob(
        createInput(`settled-counter-${index}`, [`Mouse ${index}`]),
        { authContext: actor(ids.actorOne) }
      );
      await sql`UPDATE ai_research_job_items SET status = ${status} WHERE job_id = ${result.jobId}`;
      await refreshResearchJobCounters(result.jobId);
      const [job] = await sql`
        SELECT status, completed_items, failed_items FROM ai_research_jobs WHERE id = ${result.jobId}
      `;
      expect(job, status).toEqual({
        status: "COMPLETED",
        completed_items: 1,
        failed_items: 0,
      });
    }
  });

  it("counts only FAILED as technical failure", async () => {
    const result = await createResearchJob(createInput("failed-counter-M", ["Mouse A"]), {
      authContext: actor(ids.actorOne),
    });
    await sql`UPDATE ai_research_job_items SET status = 'FAILED' WHERE job_id = ${result.jobId}`;
    await refreshResearchJobCounters(result.jobId);
    const [job] = await sql`
      SELECT status, completed_items, failed_items FROM ai_research_jobs WHERE id = ${result.jobId}
    `;
    expect(job).toEqual({ status: "FAILED", completed_items: 0, failed_items: 1 });
  });

  it("classifies NEEDS_ATTENTION plus FAILED as PARTIALLY_FAILED", async () => {
    const result = await createResearchJob(
      createInput("attention-partial-M", ["Mouse A", "Mouse B"]),
      { authContext: actor(ids.actorOne) }
    );
    const items = await sql`
      SELECT id FROM ai_research_job_items WHERE job_id = ${result.jobId} ORDER BY item_index
    `;
    await sql`UPDATE ai_research_job_items SET status = 'NEEDS_ATTENTION' WHERE id = ${items[0]!.id}`;
    await sql`UPDATE ai_research_job_items SET status = 'FAILED' WHERE id = ${items[1]!.id}`;
    await refreshResearchJobCounters(result.jobId);
    const [job] = await sql`
      SELECT status, completed_items, failed_items FROM ai_research_jobs WHERE id = ${result.jobId}
    `;
    expect(job).toEqual({ status: "PARTIALLY_FAILED", completed_items: 1, failed_items: 1 });
  });

  it("rolls back proposal publication on invalid provenance and classifies batch partial failure", async () => {
    const result = await createResearchJob(createInput("batch-final-M", ["Mouse A", "Mouse B"]), {
      authContext: actor(ids.actorOne),
    });
    const first = (await claimResearchItem(result.jobId))!;
    const firstSources = await persistEvidenceSourceSet(first.id, first.leaseToken, [
      evidence("first"),
    ]);
    await expect(
      publishDraftProposal({
        itemId: first.id,
        leaseToken: first.leaseToken,
        identity: {
          status: "EXACT_MATCH",
          brandName: "Brand",
          modelName: "A",
          rationale: "Evidence",
        },
        extraction: {
          specifications: [
            { fieldPath: "weight", value: 54, sourceIndexes: [1], conflictingValues: [] },
          ],
          unmappedSpecifications: {},
          variants: [],
          mediaCandidates: [],
        },
        copy: {
          name: "Mouse A",
          subtitle: null,
          description: null,
          seoTitle: null,
          seoDescription: null,
        },
        sourceIds: firstSources.map((source) => source.id),
      })
    ).rejects.toThrow("AI_PROVIDER_RESPONSE_INVALID");
    expect(
      Number(
        (await sql`SELECT count(*) FROM ai_product_proposals WHERE job_item_id = ${first.id}`)[0]!
          .count
      )
    ).toBe(0);

    await publishDraftProposal({
      itemId: first.id,
      leaseToken: first.leaseToken,
      identity: {
        status: "EXACT_MATCH",
        brandName: "Brand",
        modelName: "A",
        rationale: "Evidence",
      },
      extraction: {
        specifications: [
          { fieldPath: "weight", value: 54, sourceIndexes: [0], conflictingValues: [] },
        ],
        unmappedSpecifications: {},
        variants: [],
        mediaCandidates: [],
      },
      copy: {
        name: "Mouse A",
        subtitle: null,
        description: null,
        seoTitle: null,
        seoDescription: null,
      },
      sourceIds: firstSources.map((source) => source.id),
    });
    const second = (await claimResearchItem(result.jobId))!;
    await failResearchItem(second.id, second.leaseToken, "AI_FETCH_FAILED");
    const [job] = await sql`
      SELECT status, completed_items, failed_items FROM ai_research_jobs WHERE id = ${result.jobId}
    `;
    expect(job).toEqual({ status: "PARTIALLY_FAILED", completed_items: 1, failed_items: 1 });
  });

  it("enforces provenance foreign keys in the real database", async () => {
    const result = await createResearchJob(createInput("fk-M", ["Mouse A"]), {
      authContext: actor(ids.actorOne),
    });
    const item = (await claimResearchItem(result.jobId))!;
    const source = await persistEvidenceSourceSet(item.id, item.leaseToken, [evidence("fk")]);
    await expect(
      sql`
        INSERT INTO ai_proposal_field_sources (id, field_review_id, source_id, relationship)
        VALUES ('018f0025-ffff-7000-8000-000000000001',
          '018f0025-ffff-7000-8000-000000000002', ${source[0]!.id}, 'SUPPORTS')
      `
    ).rejects.toThrow();
  });
});
