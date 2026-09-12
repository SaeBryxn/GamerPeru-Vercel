import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import postgres from "postgres";
import { assertLocalDatabaseTarget } from "@/lib/admin/test-target-guard";
import {
  claimResearchItem,
  createProviderAttempt,
  createResearchJob,
  failResearchItem,
  heartbeatResearchItem,
  markSearchInProgress,
  persistEvidenceSourceSet,
  processClaimedResearchItem,
  publishDraftProposal,
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
  };
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
  });

  beforeEach(async () => {
    await cleanResearchFixtures();
  });

  afterAll(async () => {
    if (!sql) return;
    await cleanResearchFixtures();
    await sql`DELETE FROM ai_profiles WHERE id = ${ids.profile}`;
    await sql`DELETE FROM ai_provider_credentials WHERE provider_id = ${ids.provider}`;
    await sql`DELETE FROM ai_providers WHERE id = ${ids.provider}`;
    await sql`DELETE FROM auth.users WHERE id IN (${ids.actorOne}, ${ids.actorTwo})`;
    await sql.end();
    vi.unstubAllEnvs();
  });

  const createInput = (mutationRequestId: string, queries: string[]) => ({
    mutationRequestId,
    selectedProfileId: ids.profile,
    items: queries.map((query) => ({ query, mode: "CREATE" as const })),
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

  it("keeps an existing job snapshot immutable after later profile changes", async () => {
    const result = await createResearchJob(createInput("snapshot-M", ["Mouse A"]), {
      authContext: actor(ids.actorOne),
    });
    try {
      await sql`
        UPDATE ai_profiles SET model_id = 'changed-model', temperature = 0.90, max_tokens = 2048
        WHERE id = ${ids.profile}
      `;
      const [job] =
        await sql`SELECT profile_snapshot FROM ai_research_jobs WHERE id = ${result.jobId}`;
      expect(job!.profile_snapshot).toEqual(snapshot);
    } finally {
      await sql`
        UPDATE ai_profiles SET model_id = 'gemini-test', temperature = 0.20, max_tokens = 1024
        WHERE id = ${ids.profile}
      `;
    }
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
    const [job] =
      await sql`SELECT status, failed_items FROM ai_research_jobs WHERE id = ${result.jobId}`;
    expect(job).toEqual({ status: "FAILED", failed_items: 1 });
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
      SELECT retrieval_method, provider_citation_id, snippet FROM ai_sources WHERE job_item_id = ${item.id}
    `;
    expect(stored).toEqual({
      retrieval_method: "SEARCH_API",
      provider_citation_id: null,
      snippet: "Normalized external product evidence source",
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
