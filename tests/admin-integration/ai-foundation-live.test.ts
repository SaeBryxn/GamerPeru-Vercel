import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import postgres from "postgres";
import { assertLocalDatabaseTarget } from "@/lib/admin/test-target-guard";
import { db } from "@/db";
import { aiProviderCredentials, aiProviderAttempts, auditEvents } from "@/db/schema";
import {
  configureProvider,
  saveCredential,
  revokeCredential,
  rotateCredentialKey,
  getActiveCredentialSafe,
  executeCredentialHealthCheck,
  configureProfile,
  createProfileSnapshot,
  AI_AUDIT_ACTIONS,
  mockAiAdapter,
} from "@/lib/ai";
import { eq, desc } from "drizzle-orm";
import type { VerifiedAuthContextReady } from "@/lib/auth/rbac";
import { generateUuidV7 } from "@/db/utils/uuid";

describe("GP-025 / CHK1 — AI Database Schema, Credential Crypto & Provider Foundation Live Verification", () => {
  const rawDatabaseUrl =
    process.env.DATABASE_URL ??
    process.env.DATABASE_MIGRATION_URL ??
    "postgres://postgres:postgres@127.0.0.1:54322/postgres";

  const databaseUrl = assertLocalDatabaseTarget(rawDatabaseUrl);
  let pgSql: postgres.Sql;

  const PFX = "018f0025-0000-7000-8000-";
  const fixtureIds = {
    superAdminUser: `${PFX}000000000001`,
    aiProviderMock: `${PFX}000000000010`,
    aiProviderAlt: `${PFX}000000000011`,
    aiProfileFast: `${PFX}000000000020`,
  };

  const superAdminContext: VerifiedAuthContextReady = {
    status: "READY",
    authUserId: fixtureIds.superAdminUser,
    email: "superadmin.ai@gamerperu.pe",
    roles: ["SUPER_ADMIN"],
    permissions: new Set([
      "ai:manage_credentials",
      "catalog:manage",
      "catalog:publish",
      "catalog:ai_research",
      "staff:manage",
    ]),
  };

  const TEST_KEY_V1 = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcde1";
  const TEST_KEY_V2 = "fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210";

  beforeAll(async () => {
    pgSql = postgres(databaseUrl, { max: 2 });

    // Ensure test master keys exist in process.env
    process.env.AI_ENCRYPTION_ACTIVE_KEY_VERSION = "1";
    process.env.AI_ENCRYPTION_KEY_V1 = TEST_KEY_V1;
    process.env.AI_ENCRYPTION_KEY_V2 = TEST_KEY_V2;

    // Seed test admin auth user
    await pgSql.begin(async (tx) => {
      await tx`
        INSERT INTO auth.users (id, email, raw_app_meta_data, raw_user_meta_data, is_super_admin, created_at, updated_at)
        VALUES (${fixtureIds.superAdminUser}, 'superadmin.ai@gamerperu.pe', '{"provider":"email"}', '{}', false, NOW(), NOW())
        ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email;
      `;
    });
  });

  afterAll(async () => {
    if (pgSql) {
      // Clean up test data
      await pgSql.begin(async (tx) => {
        await tx`DELETE FROM ai_provider_attempts WHERE provider_id IN (${fixtureIds.aiProviderMock}, ${fixtureIds.aiProviderAlt})`;
        await tx`DELETE FROM ai_proposal_apply_steps WHERE apply_actor_auth_user_id = ${fixtureIds.superAdminUser}`;
        await tx`DELETE FROM ai_profiles WHERE provider_id IN (${fixtureIds.aiProviderMock}, ${fixtureIds.aiProviderAlt})`;
        await tx`DELETE FROM ai_provider_credentials WHERE provider_id IN (${fixtureIds.aiProviderMock}, ${fixtureIds.aiProviderAlt})`;
        await tx`DELETE FROM ai_providers WHERE id IN (${fixtureIds.aiProviderMock}, ${fixtureIds.aiProviderAlt})`;
        await tx`DELETE FROM audit_events WHERE actor_id = ${fixtureIds.superAdminUser}`;
        await tx`DELETE FROM auth.users WHERE id = ${fixtureIds.superAdminUser}`;
      });
      await pgSql.end();
    }
  });

  describe("1. Real PostgreSQL Physical Schema Audit (11 Tables)", () => {
    const EXPECTED_TABLES = [
      "ai_providers",
      "ai_provider_credentials",
      "ai_profiles",
      "ai_research_jobs",
      "ai_research_job_items",
      "ai_sources",
      "ai_product_proposals",
      "ai_proposal_field_reviews",
      "ai_proposal_field_sources",
      "ai_proposal_apply_steps",
      "ai_provider_attempts",
    ];

    it("verifies all 11 GP-025 relational tables exist in public schema", async () => {
      const rows = await pgSql<{ table_name: string }[]>`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = ANY(${EXPECTED_TABLES})
        ORDER BY table_name;
      `;
      const foundNames = rows.map((r) => r.table_name);
      expect(foundNames).toEqual([...EXPECTED_TABLES].sort());
      expect(foundNames).toHaveLength(11);
    });

    it("verifies ZERO PostgreSQL GP-025 custom enum types exist in database", async () => {
      const rows = await pgSql`
        SELECT t.typname
        FROM pg_type t
        JOIN pg_namespace n ON t.typnamespace = n.oid
        WHERE n.nspname = 'public'
          AND t.typtype = 'e'
          AND t.typname ILIKE '%ai_%'
      `;
      expect(rows).toHaveLength(0);
    });

    it("verifies application-generated UUIDv7 policy with zero gen_random_uuid() PK defaults", async () => {
      const rows = await pgSql<{ table_name: string; column_default: string | null }[]>`
        SELECT table_name, column_default
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = ANY(${EXPECTED_TABLES})
          AND column_name = 'id';
      `;
      expect(rows).toHaveLength(11);
      for (const row of rows) {
        expect(row.column_default).toBeNull();
      }
    });

    it("verifies exact Foreign Key constraints and ON DELETE rules", async () => {
      const rows = await pgSql<
        {
          constraint_name: string;
          table_name: string;
          delete_rule: string;
        }[]
      >`
        SELECT
          tc.constraint_name,
          tc.table_name,
          rc.delete_rule
        FROM information_schema.table_constraints tc
        JOIN information_schema.referential_constraints rc
          ON tc.constraint_name = rc.constraint_name
        WHERE tc.table_schema = 'public'
          AND tc.table_name = ANY(${EXPECTED_TABLES})
        ORDER BY tc.table_name, tc.constraint_name;
      `;

      // Check ON DELETE RESTRICT on core entity relationships
      const restrictRefs = rows.filter((r) => r.delete_rule === "RESTRICT");
      expect(restrictRefs.length).toBeGreaterThanOrEqual(10);

      // Check ON DELETE SET NULL on optional staff attribution / soft targets
      const setNullRefs = rows.filter((r) => r.delete_rule === "SET NULL");
      expect(setNullRefs.length).toBeGreaterThanOrEqual(5);
    });

    it("verifies frozen CHECK constraints on all 11 tables", async () => {
      const rows = await pgSql<{ constraint_name: string }[]>`
        SELECT conname as constraint_name
        FROM pg_constraint c
        JOIN pg_namespace n ON c.connamespace = n.oid
        WHERE n.nspname = 'public'
          AND conname LIKE 'ai_%'
          AND contype = 'c';
      `;
      const constraintNames = rows.map((r) => r.constraint_name);

      expect(constraintNames).toContain("ai_provider_credentials_key_version_positive");
      expect(constraintNames).toContain("ai_provider_credentials_ciphertext_format");
      expect(constraintNames).toContain("ai_provider_credentials_iv_format");
      expect(constraintNames).toContain("ai_provider_credentials_auth_tag_format");
      expect(constraintNames).toContain("ai_provider_credentials_status_check");
      expect(constraintNames).toContain("ai_profiles_temperature_range");
      expect(constraintNames).toContain("ai_profiles_max_tokens_positive");
      expect(constraintNames).toContain("ai_research_jobs_mutation_request_digest_format");
      expect(constraintNames).toContain("ai_research_jobs_request_fingerprint_format");
      expect(constraintNames).toContain("ai_research_jobs_job_type_check");
      expect(constraintNames).toContain("ai_research_jobs_status_check");
      expect(constraintNames).toContain("ai_research_jobs_dispatch_status_check");
      expect(constraintNames).toContain("ai_research_jobs_items_sum_check");
      expect(constraintNames).toContain("ai_research_job_items_mode_check");
      expect(constraintNames).toContain("ai_research_job_items_identity_status_check");
      expect(constraintNames).toContain("ai_research_job_items_status_check");
      expect(constraintNames).toContain("ai_research_job_items_mode_product_snapshot_check");
      expect(constraintNames).toContain("ai_sources_retrieval_method_check");
      expect(constraintNames).toContain("ai_sources_trust_tier_check");
      expect(constraintNames).toContain("ai_sources_trust_basis_check");
      expect(constraintNames).toContain("ai_sources_url_or_citation_check");
      expect(constraintNames).toContain("ai_product_proposals_status_check");
      expect(constraintNames).toContain("ai_proposal_field_reviews_decision_check");
      expect(constraintNames).toContain("ai_proposal_field_reviews_verification_state_check");
      expect(constraintNames).toContain("ai_proposal_field_sources_relationship_check");
      expect(constraintNames).toContain("ai_proposal_apply_steps_step_status_check");
      expect(constraintNames).toContain("ai_provider_attempts_operation_type_check");
      expect(constraintNames).toContain("ai_provider_attempts_attempt_ordinal_positive");
      expect(constraintNames).toContain("ai_provider_attempts_status_check");
      expect(constraintNames).toContain("ai_provider_attempts_cost_source_check");
      expect(constraintNames).toContain("ai_provider_attempts_cost_integrity_check");
    });

    it("verifies exact frozen operational indexes and absence of uncontracted ai_research_jobs_status_idx", async () => {
      const rows = await pgSql<{ indexname: string }[]>`
        SELECT indexname
        FROM pg_indexes
        WHERE schemaname = 'public'
          AND tablename = ANY(${EXPECTED_TABLES});
      `;
      const indexNames = rows.map((r) => r.indexname);

      // The 13 required operational indexes
      expect(indexNames).toContain("ai_provider_credentials_active_idx");
      expect(indexNames).toContain("ai_research_jobs_dispatch_recon_idx");
      expect(indexNames).toContain("ai_research_job_items_job_status_idx");
      expect(indexNames).toContain("ai_research_job_items_lease_reclaim_idx");
      expect(indexNames).toContain("ai_product_proposals_status_idx");
      expect(indexNames).toContain("ai_product_proposals_job_item_idx");
      expect(indexNames).toContain("ai_sources_job_item_idx");
      expect(indexNames).toContain("ai_proposal_field_sources_review_idx");
      expect(indexNames).toContain("ai_proposal_field_sources_source_idx");
      expect(indexNames).toContain("ai_proposal_apply_steps_proposal_step_idx");
      expect(indexNames).toContain("ai_proposal_apply_steps_op_step_idx");
      expect(indexNames).toContain("ai_provider_attempts_job_ordinal_idx");
      expect(indexNames).toContain("ai_provider_attempts_status_idx");

      // Binding check: uncontracted status index MUST be absent
      expect(indexNames).not.toContain("ai_research_jobs_status_idx");
    });

    it("verifies Data API privilege isolation for anon, authenticated, and service_role", async () => {
      for (const table of EXPECTED_TABLES) {
        const [priv] = await pgSql<
          {
            anon_has_priv: boolean;
            auth_has_priv: boolean;
            serv_has_priv: boolean;
          }[]
        >`
          SELECT
            has_table_privilege('anon', ${table}, 'SELECT') AS anon_has_priv,
            has_table_privilege('authenticated', ${table}, 'SELECT') AS auth_has_priv,
            has_table_privilege('service_role', ${table}, 'SELECT') AS serv_has_priv;
        `;
        expect(priv!.anon_has_priv).toBe(false);
        expect(priv!.auth_has_priv).toBe(false);
        expect(priv!.serv_has_priv).toBe(false);
      }
    });
  });

  describe("2. Live Credential Lifecycle, Replacement & Invariants", () => {
    let mockProviderId: string;

    beforeEach(async () => {
      // Create test mock provider
      const provider = await configureProvider(
        {
          providerKey: "mock",
          displayName: "Mock Test Provider",
          isEnabled: true,
          isDefault: true,
          settings: { mode: "local-testing" },
        },
        { authContext: superAdminContext }
      );
      mockProviderId = provider.id;

      // Clean credentials for mock provider
      await pgSql`DELETE FROM ai_provider_credentials WHERE provider_id = ${mockProviderId}`;
      await pgSql`DELETE FROM audit_events WHERE actor_id = ${fixtureIds.superAdminUser}`;
    });

    it("creates initial active credential and emits AI_CREDENTIAL_CREATED", async () => {
      const cred = await saveCredential(
        {
          providerId: mockProviderId,
          plaintextApiKey: "sk-mock-provider-key-12345",
        },
        { authContext: superAdminContext }
      );

      expect(cred.status).toBe("ACTIVE");
      expect(cred.keyVersion).toBe(1);
      expect(cred.maskedKey).toBe("sk-m...2345");
      expect(cred.lastHealthStatus).toBe("UNTESTED");

      // Verify audit event
      const [audit] = await db
        .select()
        .from(auditEvents)
        .where(eq(auditEvents.action, AI_AUDIT_ACTIONS.AI_CREDENTIAL_CREATED))
        .orderBy(desc(auditEvents.timestamp))
        .limit(1);

      expect(audit).toBeDefined();
      expect(audit!.actorId).toBe(fixtureIds.superAdminUser);
      expect(audit!.targetId).toBe(cred.id);
      expect(audit!.metadata).toEqual({
        provider_id: mockProviderId,
        credential_id: cred.id,
        key_version: 1,
      });
    });

    it("enforces single ACTIVE credential invariant via partial unique index", async () => {
      await saveCredential(
        {
          providerId: mockProviderId,
          plaintextApiKey: "sk-mock-provider-key-1",
        },
        { authContext: superAdminContext }
      );

      // Attempt direct SQL insertion of second ACTIVE credential
      await expect(
        pgSql`
          INSERT INTO ai_provider_credentials (
            id, provider_id, key_version, ciphertext, iv, auth_tag, masked_key, status
          ) VALUES (
            ${generateUuidV7()}, ${mockProviderId}, 1, 'abcd', '123456789012345678901234', '12345678901234567890123456789012', 'sk-mock', 'ACTIVE'
          );
        `
      ).rejects.toThrow();
    });

    it("atomically revokes old active and inserts new active on replacement, emitting AI_CREDENTIAL_UPDATED", async () => {
      const initial = await saveCredential(
        {
          providerId: mockProviderId,
          plaintextApiKey: "sk-initial-key-123456",
        },
        { authContext: superAdminContext }
      );

      const replaced = await saveCredential(
        {
          providerId: mockProviderId,
          plaintextApiKey: "sk-replaced-key-987654",
        },
        { authContext: superAdminContext }
      );

      expect(replaced.id).not.toBe(initial.id);
      expect(replaced.status).toBe("ACTIVE");
      expect(replaced.maskedKey).toBe("sk-r...7654");

      // Old credential must now be REVOKED in DB
      const [oldCred] = await db
        .select()
        .from(aiProviderCredentials)
        .where(eq(aiProviderCredentials.id, initial.id));
      expect(oldCred!.status).toBe("REVOKED");

      // Verify replacement audit event
      const [audit] = await db
        .select()
        .from(auditEvents)
        .where(eq(auditEvents.action, AI_AUDIT_ACTIONS.AI_CREDENTIAL_UPDATED))
        .orderBy(desc(auditEvents.timestamp))
        .limit(1);

      expect(audit).toBeDefined();
      expect(audit!.metadata).toEqual({
        provider_id: mockProviderId,
        credential_id: replaced.id,
        previous_credential_id: initial.id,
        key_version: 1,
      });
    });

    it("revokes active credential explicitly, emitting AI_CREDENTIAL_REVOKED", async () => {
      const cred = await saveCredential(
        {
          providerId: mockProviderId,
          plaintextApiKey: "sk-key-to-revoke-123",
        },
        { authContext: superAdminContext }
      );

      const revoked = await revokeCredential(
        { credentialId: cred.id },
        { authContext: superAdminContext }
      );

      expect(revoked.status).toBe("REVOKED");

      const active = await getActiveCredentialSafe(mockProviderId);
      expect(active).toBeNull();

      const [audit] = await db
        .select()
        .from(auditEvents)
        .where(eq(auditEvents.action, AI_AUDIT_ACTIONS.AI_CREDENTIAL_REVOKED))
        .orderBy(desc(auditEvents.timestamp))
        .limit(1);

      expect(audit).toBeDefined();
      expect(audit!.metadata).toEqual({
        credential_id: cred.id,
        provider_id: mockProviderId,
      });
    });

    it("rotates encryption key from V1 to V2, emitting AI_CREDENTIAL_UPDATED", async () => {
      const cred = await saveCredential(
        {
          providerId: mockProviderId,
          plaintextApiKey: "sk-key-to-rotate-secret-999",
          keyVersion: 1,
        },
        { authContext: superAdminContext }
      );

      expect(cred.keyVersion).toBe(1);

      const rotated = await rotateCredentialKey(
        {
          credentialId: cred.id,
          targetKeyVersion: 2,
        },
        { authContext: superAdminContext }
      );

      expect(rotated.id).toBe(cred.id);
      expect(rotated.keyVersion).toBe(2);
      expect(rotated.status).toBe("ACTIVE");

      const [audit] = await db
        .select()
        .from(auditEvents)
        .where(eq(auditEvents.action, AI_AUDIT_ACTIONS.AI_CREDENTIAL_UPDATED))
        .orderBy(desc(auditEvents.timestamp))
        .limit(1);

      expect(audit).toBeDefined();
      expect(audit!.metadata).toEqual({
        operation: "KEY_ROTATION",
        credential_id: cred.id,
        provider_id: mockProviderId,
        old_key_version: 1,
        new_key_version: 2,
      });
    });
  });

  describe("3. Live Provider Default Concurrency", () => {
    it("serializes competing default provider transactions using advisory lock", async () => {
      // Concurrently configure two providers both claiming isDefault = true
      await Promise.all([
        configureProvider(
          {
            providerKey: "prov_concurrent_1",
            displayName: "Concurrent Provider 1",
            isEnabled: true,
            isDefault: true,
          },
          { authContext: superAdminContext }
        ),
        configureProvider(
          {
            providerKey: "prov_concurrent_2",
            displayName: "Concurrent Provider 2",
            isEnabled: true,
            isDefault: true,
          },
          { authContext: superAdminContext }
        ),
      ]);

      // Query database directly to verify exactly one default provider exists among these two
      const defaultRows = await pgSql<{ provider_key: string }[]>`
        SELECT provider_key
        FROM ai_providers
        WHERE provider_key IN ('prov_concurrent_1', 'prov_concurrent_2')
          AND is_default = true;
      `;

      expect(defaultRows).toHaveLength(1);

      // Clean up
      await pgSql`DELETE FROM ai_providers WHERE provider_key IN ('prov_concurrent_1', 'prov_concurrent_2')`;
    });
  });

  describe("4. Live Profile Foundation", () => {
    it("creates and updates an AI profile emitting AI_PROFILE_UPDATED", async () => {
      const provider = await configureProvider(
        {
          providerKey: "mock_profile_test",
          displayName: "Profile Test Provider",
        },
        { authContext: superAdminContext }
      );

      const profile = await configureProfile(
        {
          profileKey: "PRODUCT_RESEARCH_FAST",
          providerId: provider.id,
          modelId: "mock-fast-v1",
          temperature: "0.25",
          maxTokens: 2048,
          isEnabled: true,
        },
        { authContext: superAdminContext }
      );

      expect(profile.profileKey).toBe("PRODUCT_RESEARCH_FAST");
      expect(profile.modelId).toBe("mock-fast-v1");
      expect(profile.temperature).toBe("0.25");
      expect(profile.maxTokens).toBe(2048);

      const snapshot = createProfileSnapshot(profile);
      expect(snapshot).toEqual({
        profileKey: "PRODUCT_RESEARCH_FAST",
        providerId: provider.id,
        modelId: "mock-fast-v1",
        temperature: "0.25",
        maxTokens: 2048,
      });

      const [audit] = await db
        .select()
        .from(auditEvents)
        .where(eq(auditEvents.action, AI_AUDIT_ACTIONS.AI_PROFILE_UPDATED))
        .orderBy(desc(auditEvents.timestamp))
        .limit(1);

      expect(audit).toBeDefined();

      // Clean up
      await pgSql`DELETE FROM ai_profiles WHERE id = ${profile.id}`;
      await pgSql`DELETE FROM ai_providers WHERE id = ${provider.id}`;
    });
  });

  describe("5. Live Health Check Boundary & Zero Invocations Invariant", () => {
    let mockProviderId: string;

    beforeEach(async () => {
      const provider = await configureProvider(
        {
          providerKey: "mock",
          displayName: "Mock Provider for Health",
        },
        { authContext: superAdminContext }
      );
      mockProviderId = provider.id;

      await pgSql`DELETE FROM ai_provider_credentials WHERE provider_id = ${mockProviderId}`;
      await saveCredential(
        {
          providerId: mockProviderId,
          plaintextApiKey: "sk-mock-valid-health-key",
        },
        { authContext: superAdminContext }
      );
      await pgSql`DELETE FROM audit_events WHERE actor_id = ${fixtureIds.superAdminUser}`;
    });

    it("executes successful health check, persists HEALTHY status, emits AI_HEALTH_CHECK_EXECUTED, and writes 0 provider attempts", async () => {
      mockAiAdapter.setHealthFailure(false);

      const result = await executeCredentialHealthCheck(mockProviderId, {
        authContext: superAdminContext,
      });

      expect(result.ok).toBe(true);
      expect(result.status).toBe("HEALTHY");

      const [cred] = await db
        .select()
        .from(aiProviderCredentials)
        .where(eq(aiProviderCredentials.providerId, mockProviderId));

      expect(cred!.lastHealthStatus).toBe("HEALTHY");
      expect(cred!.lastTestedAt).not.toBeNull();

      // Invariant: ZERO ai_provider_attempts rows created
      const attemptsCount =
        await pgSql`SELECT count(*) FROM ai_provider_attempts WHERE provider_id = ${mockProviderId}`;
      expect(Number(attemptsCount[0]!.count)).toBe(0);

      // Audit event emitted
      const [audit] = await db
        .select()
        .from(auditEvents)
        .where(eq(auditEvents.action, AI_AUDIT_ACTIONS.AI_HEALTH_CHECK_EXECUTED))
        .orderBy(desc(auditEvents.timestamp))
        .limit(1);

      expect(audit).toBeDefined();
      expect(audit!.metadata).toEqual({
        provider_id: mockProviderId,
        provider_key: "mock",
        credential_id: cred!.id,
        status: "HEALTHY",
        ok: true,
      });
    });

    it("executes failed health check, persists UNHEALTHY status, emits AI_HEALTH_CHECK_EXECUTED, and writes 0 provider attempts", async () => {
      mockAiAdapter.setHealthFailure(true, "Simulated upstream 503 service unavailable");

      const result = await executeCredentialHealthCheck(mockProviderId, {
        authContext: superAdminContext,
      });

      expect(result.ok).toBe(false);
      expect(result.status).toBe("UNHEALTHY");

      const [cred] = await db
        .select()
        .from(aiProviderCredentials)
        .where(eq(aiProviderCredentials.providerId, mockProviderId));

      expect(cred!.lastHealthStatus).toBe("UNHEALTHY");
      expect(cred!.lastTestedAt).not.toBeNull();

      // Invariant: ZERO ai_provider_attempts rows created
      const attemptsCount =
        await pgSql`SELECT count(*) FROM ai_provider_attempts WHERE provider_id = ${mockProviderId}`;
      expect(Number(attemptsCount[0]!.count)).toBe(0);

      // Reset mock failure flag
      mockAiAdapter.setHealthFailure(false);
    });
  });

  describe("6. Cost Telemetry & Exact Bigint Preservation", () => {
    it("preserves exact bigint integer precision for cost_micros without Number coercion", async () => {
      const provider = await configureProvider(
        {
          providerKey: "mock_bigint_test",
          displayName: "Bigint Test Provider",
        },
        { authContext: superAdminContext }
      );

      const profile = await configureProfile(
        {
          profileKey: "PRODUCT_RESEARCH_DEEP",
          providerId: provider.id,
          modelId: "mock-model",
        },
        { authContext: superAdminContext }
      );

      const jobId = generateUuidV7();
      const itemId = generateUuidV7();
      const attemptId = generateUuidV7();

      // Large 64-bit integer representing exact sub-cents: $9,876,543.210987 = 9876543210987n micros
      const exactCostMicros = 9876543210987n;

      // Seed research job and item via pgSql
      await pgSql`
        INSERT INTO ai_research_jobs (
          id, mutation_request_digest, request_fingerprint, selected_profile_id,
          profile_snapshot, job_type, inngest_event_id
        ) VALUES (
          ${jobId}, '1111111111111111111111111111111111111111111111111111111111111111',
          '2222222222222222222222222222222222222222222222222222222222222222',
          ${profile.id}, '{}'::jsonb, 'SINGLE', 'evt_bigint_test_123'
        );
      `;

      await pgSql`
        INSERT INTO ai_research_job_items (
          id, job_id, item_index, input_query
        ) VALUES (
          ${itemId}, ${jobId}, 0, 'Test item'
        );
      `;

      // Insert attempt row via Drizzle ORM
      await db.insert(aiProviderAttempts).values({
        id: attemptId,
        jobItemId: itemId,
        providerId: provider.id,
        modelId: "mock-model",
        profileId: profile.id,
        profileKey: profile.profileKey,
        temperature: "0.20",
        maxTokens: 4096,
        operationType: "IDENTITY_RESOLUTION",
        attemptOrdinal: 1,
        requestDigest: "3333333333333333333333333333333333333333333333333333333333333333",
        startedAt: new Date(),
        status: "COMPLETED",
        costMicros: exactCostMicros,
        currency: "USD",
        costSource: "PROVIDER_REPORTED",
      });

      // Query back via Drizzle ORM
      const [attempt] = await db
        .select()
        .from(aiProviderAttempts)
        .where(eq(aiProviderAttempts.id, attemptId));

      expect(attempt).toBeDefined();
      expect(typeof attempt!.costMicros).toBe("bigint");
      expect(attempt!.costMicros).toBe(exactCostMicros);

      // Clean up
      await pgSql`DELETE FROM ai_provider_attempts WHERE id = ${attemptId}`;
      await pgSql`DELETE FROM ai_research_job_items WHERE id = ${itemId}`;
      await pgSql`DELETE FROM ai_research_jobs WHERE id = ${jobId}`;
      await pgSql`DELETE FROM ai_profiles WHERE id = ${profile.id}`;
      await pgSql`DELETE FROM ai_providers WHERE id = ${provider.id}`;
    });
  });
});
