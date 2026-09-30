import { describe, it, expect, beforeAll, afterAll } from "vitest";
import postgres from "postgres";
import sharp from "sharp";
import { sharpImageProcessor } from "../fixtures/sharp-image-processor";
import { assertLocalDatabaseTarget } from "@/lib/admin/test-target-guard";
import {
  requestCatalogMediaUploadIntent,
  finalizeCatalogMediaUpload,
  updateMediaAssetAltText,
  reorderProductMedia,
  setProductPrimaryMedia,
  reassignProductMediaVariant,
} from "@/lib/admin/catalog/media-service";
import {
  InMemoryCatalogStorageAdapter,
  type CatalogStorageAdapter,
} from "@/lib/admin/catalog/media-storage";
import {
  verifyAndParseMediaUploadIntent,
  computeMediaIntentDigest,
} from "@/lib/admin/catalog/media-crypto";
import { R2_BUCKETS } from "@/lib/storage/r2";
import { CatalogIdempotencyConflictError } from "@/lib/admin/catalog/types";
import { computeMutationRequestDigest } from "@/lib/admin/catalog/crypto";
import type { VerifiedAuthContextReady } from "@/lib/auth/rbac";
import { db } from "@/db";

function createBarrier(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function createFreshIntentRaceHarness(
  storage: InMemoryCatalogStorageAdapter,
  stagingObjectKey: string,
  loserFailurePoint: "head" | "get"
) {
  const winnerHeadReached = createBarrier();
  const loserHeadReached = createBarrier();
  const releaseHeads = createBarrier();
  const loserSuccessfulHead = createBarrier();
  const stagingDeleted = createBarrier();
  const evidence = {
    loserHeadSucceededBeforeDelete: false,
    loserHeadRanAfterDelete: false,
    loserGetRanAfterDelete: false,
    winnerDeletedStaging: false,
  };

  const isStagingTarget = (params: { bucket: string; key: string }) =>
    params.bucket === R2_BUCKETS.CATALOG_STAGING && params.key === stagingObjectKey;

  const createAdapter = (role: "winner" | "loser"): CatalogStorageAdapter => ({
    generatePresignedPutUrl: (params) => storage.generatePresignedPutUrl(params),
    headObject: async (params) => {
      if (!isStagingTarget(params)) return storage.headObject(params);

      if (role === "winner") {
        winnerHeadReached.resolve();
      } else {
        loserHeadReached.resolve();
      }
      await releaseHeads.promise;

      if (role === "loser" && loserFailurePoint === "head") {
        await stagingDeleted.promise;
        evidence.loserHeadRanAfterDelete = !storage.hasObject(params.bucket, params.key);
      }

      const result = await storage.headObject(params);
      if (role === "loser" && loserFailurePoint === "get") {
        evidence.loserHeadSucceededBeforeDelete =
          result !== null && storage.hasObject(params.bucket, params.key);
        loserSuccessfulHead.resolve();
      }
      return result;
    },
    getObjectBytes: (params) => storage.getObjectBytes(params),
    getObjectBytesBounded: async (params) => {
      if (isStagingTarget(params)) {
        if (role === "winner" && loserFailurePoint === "get") {
          await loserSuccessfulHead.promise;
        }
        if (role === "loser" && loserFailurePoint === "get") {
          await stagingDeleted.promise;
          evidence.loserGetRanAfterDelete = !storage.hasObject(params.bucket, params.key);
        }
      }
      return storage.getObjectBytesBounded(params);
    },
    putObject: (params) => storage.putObject(params),
    putObjectIfNotExists: (params) => storage.putObjectIfNotExists(params),
    deleteObject: async (params) => {
      await storage.deleteObject(params);
      if (role === "winner" && isStagingTarget(params)) {
        evidence.winnerDeletedStaging = !storage.hasObject(params.bucket, params.key);
        stagingDeleted.resolve();
      }
    },
  });

  return {
    winnerAdapter: createAdapter("winner"),
    loserAdapter: createAdapter("loser"),
    winnerHeadReached: winnerHeadReached.promise,
    bothInitialProbesReached: Promise.all([winnerHeadReached.promise, loserHeadReached.promise]),
    releaseHeads: releaseHeads.resolve,
    evidence,
  };
}

describe("GP-024 / CHK3 — Admin Catalog Media Pipeline Live Integration", () => {
  const rawDatabaseUrl =
    process.env.DATABASE_URL ??
    process.env.DATABASE_MIGRATION_URL ??
    "postgres://postgres:postgres@127.0.0.1:54322/postgres";

  const databaseUrl = assertLocalDatabaseTarget(rawDatabaseUrl);
  let pgSql: postgres.Sql;

  const PFX = "018f0024-00e3-7000-8000-";
  const fixtureIds = {
    adminUser: `${PFX}000000000001`,
    unauthorizedUser: `${PFX}000000000002`,
    brand: `${PFX}000000000010`,
    category: `${PFX}000000000020`,
    product: `${PFX}000000000030`,
    otherProduct: `${PFX}000000000031`,
    variantA: `${PFX}000000000040`,
    variantB: `${PFX}000000000041`,
  };

  const authCatalogAdmin: VerifiedAuthContextReady = {
    status: "READY",
    authUserId: fixtureIds.adminUser,
    email: "catalogadmin.gp024@gamerperu.pe",
    roles: ["ADMIN_CATALOG"],
    permissions: new Set(["catalog:manage", "catalog:publish"]),
  };

  const authUnauthorized: VerifiedAuthContextReady = {
    status: "READY",
    authUserId: fixtureIds.unauthorizedUser,
    email: "unauthorized.gp024@gamerperu.pe",
    roles: ["CUSTOMER"],
    permissions: new Set([]),
  };

  const TEST_HMAC_SECRET = "a1b2c3d4e5f67890123456789abcdef0a1b2c3d4e5f67890123456789abcdef0";

  beforeAll(async () => {
    pgSql = postgres(databaseUrl, { max: 10 });

    await pgSql.begin(async (tx) => {
      // 1. Seed users
      await tx`
        INSERT INTO auth.users (id, email, raw_app_meta_data, raw_user_meta_data, is_super_admin, created_at, updated_at)
        VALUES
          (${fixtureIds.adminUser}, 'catalogadmin.gp024@gamerperu.pe', '{"provider":"email"}', '{}', false, NOW(), NOW()),
          (${fixtureIds.unauthorizedUser}, 'unauthorized.gp024@gamerperu.pe', '{"provider":"email"}', '{}', false, NOW(), NOW())
        ON CONFLICT (id) DO NOTHING;
      `;

      // 2. Brand
      await tx`
        INSERT INTO brands (id, name, slug, description, status, created_at, updated_at)
        VALUES (${fixtureIds.brand}, 'Brand Media Test', 'brand-media-test', 'Testing media brand', 'PUBLISHED', NOW(), NOW())
        ON CONFLICT (id) DO NOTHING;
      `;

      // 3. Category
      await tx`
        INSERT INTO categories (id, name, slug, display_order, status, created_at, updated_at)
        VALUES (${fixtureIds.category}, 'Category Media Test', 'cat-media-test', 1, 'PUBLISHED', NOW(), NOW())
        ON CONFLICT (id) DO NOTHING;
      `;

      // 4. Products
      await tx`
        INSERT INTO products (id, name, slug, brand_id, category_id, status, created_at, updated_at)
        VALUES
          (${fixtureIds.product}, 'Product Media Test', 'prod-media-test', ${fixtureIds.brand}, ${fixtureIds.category}, 'DRAFT', NOW(), NOW()),
          (${fixtureIds.otherProduct}, 'Other Product Test', 'other-prod-test', ${fixtureIds.brand}, ${fixtureIds.category}, 'DRAFT', NOW(), NOW())
        ON CONFLICT (id) DO NOTHING;
      `;

      // 5. Variants
      await tx`
        INSERT INTO product_variants (id, product_id, sku, title, price_cents, status, created_at, updated_at)
        VALUES
          (${fixtureIds.variantA}, ${fixtureIds.product}, 'SKU-MED-001', 'Variante A', 9900, 'ACTIVE', NOW(), NOW()),
          (${fixtureIds.variantB}, ${fixtureIds.product}, 'SKU-MED-002', 'Variante B', 10900, 'ACTIVE', NOW(), NOW())
        ON CONFLICT (id) DO NOTHING;
      `;
    });
  });

  afterAll(async () => {
    if (pgSql) {
      await pgSql.begin(async (tx) => {
        await tx`DELETE FROM product_media WHERE product_id IN (${fixtureIds.product}, ${fixtureIds.otherProduct});`;
        await tx`DELETE FROM product_variants WHERE product_id IN (${fixtureIds.product}, ${fixtureIds.otherProduct});`;
        await tx`DELETE FROM products WHERE id IN (${fixtureIds.product}, ${fixtureIds.otherProduct});`;
        await tx`DELETE FROM categories WHERE id = ${fixtureIds.category};`;
        await tx`DELETE FROM brands WHERE id = ${fixtureIds.brand};`;
        await tx`DELETE FROM audit_events WHERE actor_id IN (${fixtureIds.adminUser}, ${fixtureIds.unauthorizedUser});`;
        await tx`DELETE FROM auth.users WHERE id IN (${fixtureIds.adminUser}, ${fixtureIds.unauthorizedUser});`;
      });
      await pgSql.end();
    }
  });

  async function runFreshIntentConcurrentReplayRace(
    loserFailurePoint: "head" | "get"
  ): Promise<void> {
    const storage = new InMemoryCatalogStorageAdapter();
    const baseServiceOptions = {
      authContext: authCatalogAdmin,
      storageAdapter: storage,
      imageProcessor: sharpImageProcessor,
      intentSecret: TEST_HMAC_SECRET,
    };
    const intent = await requestCatalogMediaUploadIntent(
      { productId: fixtureIds.product, variantId: null, mimeType: "image/png" },
      baseServiceOptions
    );
    const payload = verifyAndParseMediaUploadIntent(intent.signedIntentToken, TEST_HMAC_SECRET);
    const mediaIntentDigest = computeMediaIntentDigest(payload);
    const mutationRequestIdA = `018f0024-br3-${loserFailurePoint}-race-caller-a`;
    const mutationRequestIdB = `018f0024-br3-${loserFailurePoint}-race-caller-b`;
    const mutationDigestA = computeMutationRequestDigest(
      fixtureIds.adminUser,
      "catalog:media:attach",
      mutationRequestIdA
    );
    const mutationDigestB = computeMutationRequestDigest(
      fixtureIds.adminUser,
      "catalog:media:attach",
      mutationRequestIdB
    );

    const markerCountsBefore = await pgSql`
      SELECT
        COUNT(*) FILTER (
          WHERE metadata->>'media_intent_digest' = ${mediaIntentDigest}
        )::int AS intent_count,
        COUNT(*) FILTER (
          WHERE metadata->>'mutation_request_digest' IN (${mutationDigestA}, ${mutationDigestB})
        )::int AS mutation_count
      FROM audit_events
      WHERE actor_id = ${fixtureIds.adminUser}
        AND action = 'catalog:media:attach';
    `;
    expect(Number(markerCountsBefore[0]?.intent_count)).toBe(0);
    expect(Number(markerCountsBefore[0]?.mutation_count)).toBe(0);

    const testPngBuffer = await sharp({
      create: {
        width: loserFailurePoint === "head" ? 19 : 23,
        height: loserFailurePoint === "head" ? 17 : 21,
        channels: 4,
        background:
          loserFailurePoint === "head"
            ? { r: 24, g: 83, b: 192, alpha: 1 }
            : { r: 181, g: 62, b: 37, alpha: 1 },
      },
    })
      .png()
      .toBuffer();
    storage.setObject(
      R2_BUCKETS.CATALOG_STAGING,
      payload.stagingObjectKey,
      testPngBuffer,
      "image/png"
    );

    const race = createFreshIntentRaceHarness(storage, payload.stagingObjectKey, loserFailurePoint);
    const callerA = finalizeCatalogMediaUpload(
      { signedIntentToken: intent.signedIntentToken, mutationRequestId: mutationRequestIdA },
      { ...baseServiceOptions, storageAdapter: race.winnerAdapter }
    );
    await race.winnerHeadReached;
    const callerB = finalizeCatalogMediaUpload(
      { signedIntentToken: intent.signedIntentToken, mutationRequestId: mutationRequestIdB },
      { ...baseServiceOptions, storageAdapter: race.loserAdapter }
    );
    await race.bothInitialProbesReached;

    const markerCountsAtBarrier = await pgSql`
      SELECT
        COUNT(*) FILTER (
          WHERE metadata->>'media_intent_digest' = ${mediaIntentDigest}
        )::int AS intent_count,
        COUNT(*) FILTER (
          WHERE metadata->>'mutation_request_digest' IN (${mutationDigestA}, ${mutationDigestB})
        )::int AS mutation_count
      FROM audit_events
      WHERE actor_id = ${fixtureIds.adminUser}
        AND action = 'catalog:media:attach';
    `;
    expect(Number(markerCountsAtBarrier[0]?.intent_count)).toBe(0);
    expect(Number(markerCountsAtBarrier[0]?.mutation_count)).toBe(0);
    race.releaseHeads();

    const [resultA, resultB] = await Promise.all([callerA, callerB]);
    expect(resultA.replayed).toBe(false);
    expect(resultB.replayed).toBe(true);
    expect(resultB.productMedia.id).toBe(resultA.productMedia.id);
    expect(resultB.mediaAsset.id).toBe(resultA.mediaAsset.id);

    const committedCounts = await pgSql`
      SELECT
        COUNT(DISTINCT pm.id)::int AS product_media_count,
        COUNT(DISTINCT ae.id)::int AS audit_event_count
      FROM audit_events ae
      LEFT JOIN product_media pm ON pm.id::text = ae.target_id
      WHERE ae.actor_id = ${fixtureIds.adminUser}
        AND ae.action = 'catalog:media:attach'
        AND ae.metadata->>'media_intent_digest' = ${mediaIntentDigest};
    `;
    expect(Number(committedCounts[0]?.product_media_count)).toBe(1);
    expect(Number(committedCounts[0]?.audit_event_count)).toBe(1);
    expect(storage.hasObject(R2_BUCKETS.CATALOG_STAGING, payload.stagingObjectKey)).toBe(false);
    expect(race.evidence.winnerDeletedStaging).toBe(true);

    if (loserFailurePoint === "head") {
      expect(race.evidence.loserHeadRanAfterDelete).toBe(true);
    } else {
      expect(race.evidence.loserHeadSucceededBeforeDelete).toBe(true);
      expect(race.evidence.loserGetRanAfterDelete).toBe(true);
    }
  }

  it("enforces service-layer RBAC on all media operations", async () => {
    const storage = new InMemoryCatalogStorageAdapter();
    const serviceOpts = {
      authContext: authUnauthorized,
      storageAdapter: storage,
      imageProcessor: sharpImageProcessor,
      intentSecret: TEST_HMAC_SECRET,
    };

    await expect(
      requestCatalogMediaUploadIntent(
        { productId: fixtureIds.product, variantId: null, mimeType: "image/png" },
        serviceOpts
      )
    ).rejects.toThrow(/permisos suficientes/i);

    await expect(
      finalizeCatalogMediaUpload(
        { signedIntentToken: "dummy", mutationRequestId: "mr-1" },
        serviceOpts
      )
    ).rejects.toThrow(/permisos suficientes/i);

    await expect(
      updateMediaAssetAltText(
        {
          productId: fixtureIds.product,
          mediaAssetId: "asset-1",
          altText: "alt",
          mutationRequestId: "mr-2",
        },
        serviceOpts
      )
    ).rejects.toThrow(/permisos suficientes/i);

    await expect(
      reorderProductMedia(
        { productId: fixtureIds.product, orderedProductMediaIds: [], mutationRequestId: "mr-3" },
        serviceOpts
      )
    ).rejects.toThrow(/permisos suficientes/i);

    await expect(
      setProductPrimaryMedia(
        {
          productId: fixtureIds.product,
          productMediaId: "pm-1",
          expectedUpdatedAt: new Date().toISOString(),
          mutationRequestId: "mr-4",
        },
        serviceOpts
      )
    ).rejects.toThrow(/permisos suficientes/i);

    await expect(
      reassignProductMediaVariant(
        {
          productId: fixtureIds.product,
          productMediaId: "pm-1",
          targetVariantId: null,
          mutationRequestId: "mr-5",
        },
        serviceOpts
      )
    ).rejects.toThrow(/permisos suficientes/i);
  });

  it("executes upload intent request, private staging, and first finalization", async () => {
    const storage = new InMemoryCatalogStorageAdapter();
    const serviceOpts = {
      authContext: authCatalogAdmin,
      storageAdapter: storage,
      imageProcessor: sharpImageProcessor,
      intentSecret: TEST_HMAC_SECRET,
    };

    // 1. Request intent
    const intent = await requestCatalogMediaUploadIntent(
      { productId: fixtureIds.product, variantId: null, mimeType: "image/png" },
      serviceOpts
    );

    expect(intent.signedIntentToken).toBeTypeOf("string");
    expect(intent.requiredHeaders["Content-Type"]).toBe("image/png");

    const payload = verifyAndParseMediaUploadIntent(intent.signedIntentToken, TEST_HMAC_SECRET);
    expect(payload.stagingObjectKey).toMatch(/^temp\/catalog\//);

    // 2. Stage valid image buffer
    const testPngBuffer = await sharp({
      create: {
        width: 16,
        height: 16,
        channels: 4,
        background: { r: 10, g: 150, b: 200, alpha: 1 },
      },
    })
      .png()
      .toBuffer();

    storage.setObject(
      R2_BUCKETS.CATALOG_STAGING,
      payload.stagingObjectKey,
      testPngBuffer,
      "image/png"
    );

    // 3. Finalize upload
    const mutationRequestId = "018f0024-mr-0000-0000-000000000001";
    const result = await finalizeCatalogMediaUpload(
      {
        signedIntentToken: intent.signedIntentToken,
        mutationRequestId,
      },
      serviceOpts
    );

    expect(result.productMedia.productId).toBe(fixtureIds.product);
    expect(result.productMedia.variantId).toBeNull();
    expect(result.productMedia.displayOrder).toBe(0);
    expect(result.mediaAsset.mimeType).toBe("image/webp");
    expect(result.mediaAsset.width).toBe(16);
    expect(result.mediaAsset.height).toBe(16);
    expect(result.mediaAsset.objectKey).toMatch(
      /^products\/brand-media-test\/prod-media-test\/[0-9a-f]{64}\.webp$/
    );

    // Verify public storage object exists
    const publicObj = await storage.headObject({
      bucket: R2_BUCKETS.PUBLIC_MEDIA,
      key: result.mediaAsset.objectKey,
    });
    expect(publicObj).not.toBeNull();
    expect(publicObj?.contentType).toBe("image/webp");

    // Verify staging object was deleted
    const stagedRemaining = await storage.headObject({
      bucket: R2_BUCKETS.CATALOG_STAGING,
      key: payload.stagingObjectKey,
    });
    expect(stagedRemaining).toBeNull();

    // Verify DB records
    const pmRows = await pgSql`SELECT * FROM product_media WHERE id = ${result.productMedia.id};`;
    expect(pmRows.length).toBe(1);

    const assetRows = await pgSql`SELECT * FROM media_assets WHERE id = ${result.mediaAsset.id};`;
    expect(assetRows.length).toBe(1);

    const auditRows = await pgSql`
      SELECT * FROM audit_events
      WHERE target_id = ${result.productMedia.id} AND action = 'catalog:media:attach';
    `;
    expect(auditRows.length).toBe(1);

    // 4. Scenario A: same intent + same mutationRequestId
    const replayResult = await finalizeCatalogMediaUpload(
      {
        signedIntentToken: intent.signedIntentToken,
        mutationRequestId,
      },
      serviceOpts
    );
    expect(replayResult.productMedia.id).toBe(result.productMedia.id);
    expect(replayResult.mediaAsset.id).toBe(result.mediaAsset.id);
    expect(replayResult.replayed).toBe(true);

    // Ensure zero new ProductMedia and zero new AuditEvent
    const pmRowsAfter =
      await pgSql`SELECT * FROM product_media WHERE id = ${result.productMedia.id};`;
    expect(pmRowsAfter.length).toBe(1);
    const auditRowsAfter = await pgSql`
      SELECT * FROM audit_events
      WHERE target_id = ${result.productMedia.id} AND action = 'catalog:media:attach';
    `;
    expect(auditRowsAfter.length).toBe(1);

    // 5. Scenario B: same intent + DIFFERENT mutationRequestId SEQUENTIALLY
    // Frozen contract: mediaIntentDigest consumption replay succeeds!
    const seqReplayResult = await finalizeCatalogMediaUpload(
      {
        signedIntentToken: intent.signedIntentToken,
        mutationRequestId: "018f0024-mr-0000-0000-sequential002",
      },
      serviceOpts
    );
    expect(seqReplayResult.productMedia.id).toBe(result.productMedia.id);
    expect(seqReplayResult.mediaAsset.id).toBe(result.mediaAsset.id);
    expect(seqReplayResult.replayed).toBe(true);

    // Verify still exactly 1 ProductMedia and 1 AuditEvent
    const pmRowsSeq =
      await pgSql`SELECT * FROM product_media WHERE id = ${result.productMedia.id};`;
    expect(pmRowsSeq.length).toBe(1);
    const auditRowsSeq = await pgSql`
      SELECT * FROM audit_events
      WHERE target_id = ${result.productMedia.id} AND action = 'catalog:media:attach';
    `;
    expect(auditRowsSeq.length).toBe(1);

    // 6. Scenario C: same intent + different mutationRequestId CONCURRENTLY
    const [concurRes1, concurRes2] = await Promise.all([
      finalizeCatalogMediaUpload(
        {
          signedIntentToken: intent.signedIntentToken,
          mutationRequestId: "018f0024-mr-0000-0000-concur00001",
        },
        serviceOpts
      ),
      finalizeCatalogMediaUpload(
        {
          signedIntentToken: intent.signedIntentToken,
          mutationRequestId: "018f0024-mr-0000-0000-concur00002",
        },
        serviceOpts
      ),
    ]);
    expect(concurRes1.productMedia.id).toBe(result.productMedia.id);
    expect(concurRes2.productMedia.id).toBe(result.productMedia.id);
    expect(concurRes1.replayed).toBe(true);
    expect(concurRes2.replayed).toBe(true);

    const pmRowsConcur =
      await pgSql`SELECT * FROM product_media WHERE id = ${result.productMedia.id};`;
    expect(pmRowsConcur.length).toBe(1);
    const auditRowsConcur = await pgSql`
      SELECT * FROM audit_events
      WHERE target_id = ${result.productMedia.id} AND action = 'catalog:media:attach';
    `;
    expect(auditRowsConcur.length).toBe(1);

    // 7. Scenario D: consumed intent after staging object is already deleted, with different request ID
    // Verify staging object does NOT exist in storage:
    const stagedCheck = await storage.headObject({
      bucket: R2_BUCKETS.CATALOG_STAGING,
      key: payload.stagingObjectKey,
    });
    expect(stagedCheck).toBeNull();

    const replayWithoutStaging = await finalizeCatalogMediaUpload(
      {
        signedIntentToken: intent.signedIntentToken,
        mutationRequestId: "018f0024-mr-0000-0000-nostaging0003",
      },
      serviceOpts
    );
    expect(replayWithoutStaging.productMedia.id).toBe(result.productMedia.id);
    expect(replayWithoutStaging.replayed).toBe(true);

    // 8. Scenario G: same mutationRequestId + different valid intent => CATALOG_IDEMPOTENCY_CONFLICT
    const intent2 = await requestCatalogMediaUploadIntent(
      { productId: fixtureIds.product, variantId: null, mimeType: "image/png" },
      serviceOpts
    );
    await expect(
      finalizeCatalogMediaUpload(
        {
          signedIntentToken: intent2.signedIntentToken,
          mutationRequestId, // reused!
        },
        serviceOpts
      )
    ).rejects.toThrow(CatalogIdempotencyConflictError);
  });

  it("converges a fresh same-intent race when caller B HEAD resumes after caller A commits and deletes staging", async () => {
    await runFreshIntentConcurrentReplayRace("head");
  });

  it("converges a fresh same-intent race when caller B GET resumes after a successful HEAD and caller A deletes staging", async () => {
    await runFreshIntentConcurrentReplayRace("get");
  });

  it("handles concurrent finalization with identical bytes safely (race-safe MediaAsset reuse)", async () => {
    const storage = new InMemoryCatalogStorageAdapter();
    const serviceOpts = {
      authContext: authCatalogAdmin,
      storageAdapter: storage,
      imageProcessor: sharpImageProcessor,
      intentSecret: TEST_HMAC_SECRET,
    };

    // Create 2 distinct intents
    const intentA = await requestCatalogMediaUploadIntent(
      { productId: fixtureIds.product, variantId: null, mimeType: "image/png" },
      serviceOpts
    );
    const intentB = await requestCatalogMediaUploadIntent(
      { productId: fixtureIds.product, variantId: null, mimeType: "image/png" },
      serviceOpts
    );

    const payloadA = verifyAndParseMediaUploadIntent(intentA.signedIntentToken, TEST_HMAC_SECRET);
    const payloadB = verifyAndParseMediaUploadIntent(intentB.signedIntentToken, TEST_HMAC_SECRET);

    // Stage exact same bytes in both staging keys
    const sharedPngBuffer = await sharp({
      create: {
        width: 32,
        height: 32,
        channels: 4,
        background: { r: 50, g: 100, b: 150, alpha: 1 },
      },
    })
      .png()
      .toBuffer();

    storage.setObject(
      R2_BUCKETS.CATALOG_STAGING,
      payloadA.stagingObjectKey,
      sharedPngBuffer,
      "image/png"
    );
    storage.setObject(
      R2_BUCKETS.CATALOG_STAGING,
      payloadB.stagingObjectKey,
      sharedPngBuffer,
      "image/png"
    );

    // Execute concurrent finalization
    const [resA, resB] = await Promise.all([
      finalizeCatalogMediaUpload(
        {
          signedIntentToken: intentA.signedIntentToken,
          mutationRequestId: "018f0024-mr-concurrent-00000000001a",
        },
        serviceOpts
      ),
      finalizeCatalogMediaUpload(
        {
          signedIntentToken: intentB.signedIntentToken,
          mutationRequestId: "018f0024-mr-concurrent-00000000001b",
        },
        serviceOpts
      ),
    ]);

    // Both finalizations must succeed!
    expect(resA.productMedia.id).not.toBe(resB.productMedia.id); // distinct product_media rows
    expect(resA.mediaAsset.id).toBe(resB.mediaAsset.id); // same canonical MediaAsset reused!
    expect(resA.mediaAsset.objectKey).toBe(resB.mediaAsset.objectKey);

    // Verify DB integrity
    const assets = await pgSql`
      SELECT * FROM media_assets WHERE object_key = ${resA.mediaAsset.objectKey};
    `;
    expect(assets.length).toBe(1); // exactly one MediaAsset row

    const attachedPM = await pgSql`
      SELECT * FROM product_media WHERE media_asset_id = ${resA.mediaAsset.id};
    `;
    expect(attachedPM.length).toBeGreaterThanOrEqual(2);
  });

  it("verifies public object content-integrity on reuse and fails closed on tampering", async () => {
    const storage = new InMemoryCatalogStorageAdapter();
    const serviceOpts = {
      authContext: authCatalogAdmin,
      storageAdapter: storage,
      imageProcessor: sharpImageProcessor,
      intentSecret: TEST_HMAC_SECRET,
    };

    const intent = await requestCatalogMediaUploadIntent(
      { productId: fixtureIds.product, variantId: null, mimeType: "image/png" },
      serviceOpts
    );

    const payload = verifyAndParseMediaUploadIntent(intent.signedIntentToken, TEST_HMAC_SECRET);

    const testPngBuffer = await sharp({
      create: { width: 24, height: 24, channels: 4, background: { r: 12, g: 34, b: 56, alpha: 1 } },
    })
      .png()
      .toBuffer();

    storage.setObject(
      R2_BUCKETS.CATALOG_STAGING,
      payload.stagingObjectKey,
      testPngBuffer,
      "image/png"
    );

    // 1. Finalize normally first
    const res = await finalizeCatalogMediaUpload(
      {
        signedIntentToken: intent.signedIntentToken,
        mutationRequestId: "018f0024-mr-integrity-00000000001",
      },
      serviceOpts
    );

    // 2. Tamper the public object in storage with corrupt bytes
    storage.setObject(
      R2_BUCKETS.PUBLIC_MEDIA,
      res.mediaAsset.objectKey,
      Buffer.from("corrupted bytes"),
      "image/webp"
    );

    // 3. New intent with the same original bytes attempts finalization
    const intentTampered = await requestCatalogMediaUploadIntent(
      { productId: fixtureIds.product, variantId: null, mimeType: "image/png" },
      serviceOpts
    );
    const payloadTampered = verifyAndParseMediaUploadIntent(
      intentTampered.signedIntentToken,
      TEST_HMAC_SECRET
    );
    storage.setObject(
      R2_BUCKETS.CATALOG_STAGING,
      payloadTampered.stagingObjectKey,
      testPngBuffer,
      "image/png"
    );

    // Must FAIL CLOSED with integrity error!
    try {
      await finalizeCatalogMediaUpload(
        {
          signedIntentToken: intentTampered.signedIntentToken,
          mutationRequestId: "018f0024-mr-integrity-00000000002",
        },
        serviceOpts
      );
      expect.fail("should have thrown");
    } catch (err: unknown) {
      expect((err as { code: string }).code).toBe("MEDIA_PUBLIC_INTEGRITY_MISMATCH");
    }
  });

  it("updates alt text idempotently and audits changes", async () => {
    const storage = new InMemoryCatalogStorageAdapter();
    const serviceOpts = {
      authContext: authCatalogAdmin,
      storageAdapter: storage,
      imageProcessor: sharpImageProcessor,
      intentSecret: TEST_HMAC_SECRET,
    };

    // Get an existing media asset on the product
    const pmRows =
      await pgSql`SELECT * FROM product_media WHERE product_id = ${fixtureIds.product} LIMIT 1;`;
    expect(pmRows.length).toBeGreaterThan(0);
    const pm = pmRows[0]!;

    const mutationRequestId = "018f0024-mr-alt-0000000000001";
    const res = await updateMediaAssetAltText(
      {
        productId: fixtureIds.product,
        mediaAssetId: pm.media_asset_id,
        altText: "  Mouse gamer vista frontal  ",
        mutationRequestId,
      },
      serviceOpts
    );

    expect(res.mediaAsset.altText).toBe("Mouse gamer vista frontal"); // trimmed!

    // Replay with same mutationRequestId
    const replayRes = await updateMediaAssetAltText(
      {
        productId: fixtureIds.product,
        mediaAssetId: pm.media_asset_id,
        altText: "Mouse gamer vista frontal",
        mutationRequestId,
      },
      serviceOpts
    );
    expect(replayRes.mediaAsset.altText).toBe("Mouse gamer vista frontal");

    // Empty/blank string sets null
    const emptyRes = await updateMediaAssetAltText(
      {
        productId: fixtureIds.product,
        mediaAssetId: pm.media_asset_id,
        altText: "   ",
        mutationRequestId: "018f0024-mr-alt-0000000000002",
      },
      serviceOpts
    );
    expect(emptyRes.mediaAsset.altText).toBeNull();

    // Alt text > 255 chars rejected
    await expect(
      updateMediaAssetAltText(
        {
          productId: fixtureIds.product,
          mediaAssetId: pm.media_asset_id,
          altText: "x".repeat(256),
          mutationRequestId: "018f0024-mr-alt-0000000000003",
        },
        serviceOpts
      )
    ).rejects.toThrow(/255 caracteres/);
  });

  it("reorders product media idempotently and atomically", async () => {
    const storage = new InMemoryCatalogStorageAdapter();
    const serviceOpts = {
      authContext: authCatalogAdmin,
      storageAdapter: storage,
      imageProcessor: sharpImageProcessor,
      intentSecret: TEST_HMAC_SECRET,
    };

    const pms =
      await pgSql`SELECT id FROM product_media WHERE product_id = ${fixtureIds.product} ORDER BY display_order;`;
    expect(pms.length).toBeGreaterThanOrEqual(2);

    const reversedIds = [pms[1]!.id, pms[0]!.id, ...pms.slice(2).map((r) => r.id)];
    const mutationRequestId = "018f0024-mr-reorder-00000000001";

    const res = await reorderProductMedia(
      {
        productId: fixtureIds.product,
        orderedProductMediaIds: reversedIds,
        mutationRequestId,
      },
      serviceOpts
    );
    expect(res.success).toBe(true);

    // Verify DB order
    const firstRow = await pgSql`SELECT * FROM product_media WHERE id = ${reversedIds[0]};`;
    expect(firstRow[0]!.display_order).toBe(0);

    // Replay
    const replay = await reorderProductMedia(
      {
        productId: fixtureIds.product,
        orderedProductMediaIds: reversedIds,
        mutationRequestId,
      },
      serviceOpts
    );
    expect(replay.success).toBe(true);

    // Rejects duplicate IDs
    await expect(
      reorderProductMedia(
        {
          productId: fixtureIds.product,
          orderedProductMediaIds: [reversedIds[0], reversedIds[0]],
          mutationRequestId: "018f0024-mr-reorder-00000000002",
        },
        serviceOpts
      )
    ).rejects.toThrow(/duplicados/);
  });

  it("designates primary media enforcing the global attachment invariant", async () => {
    const storage = new InMemoryCatalogStorageAdapter();
    const serviceOpts = {
      authContext: authCatalogAdmin,
      storageAdapter: storage,
      imageProcessor: sharpImageProcessor,
      intentSecret: TEST_HMAC_SECRET,
    };

    // Find a global product media row
    const globalPmRows = await pgSql`
      SELECT * FROM product_media
      WHERE product_id = ${fixtureIds.product} AND variant_id IS NULL
      LIMIT 1;
    `;
    expect(globalPmRows.length).toBeGreaterThan(0);
    const globalPm = globalPmRows[0]!;

    const [prodRow] =
      await pgSql`SELECT updated_at FROM products WHERE id = ${fixtureIds.product};`;
    const mutationRequestId = "018f0024-mr-primary-00000000001";
    const res = await setProductPrimaryMedia(
      {
        productId: fixtureIds.product,
        productMediaId: globalPm.id,
        expectedUpdatedAt: prodRow!.updated_at.toISOString(),
        mutationRequestId,
      },
      serviceOpts
    );
    expect(res.primaryMediaId).toBe(globalPm.media_asset_id);

    // Replay
    const replay = await setProductPrimaryMedia(
      {
        productId: fixtureIds.product,
        productMediaId: globalPm.id,
        expectedUpdatedAt: prodRow!.updated_at.toISOString(),
        mutationRequestId,
      },
      serviceOpts
    );
    expect(replay.primaryMediaId).toBe(globalPm.media_asset_id);

    // Assign a different media to variant
    const [varPm] = await pgSql`
      SELECT * FROM product_media
      WHERE product_id = ${fixtureIds.product} AND id != ${globalPm.id}
      LIMIT 1;
    `;
    if (varPm) {
      await pgSql`UPDATE product_media SET variant_id = ${fixtureIds.variantA} WHERE id = ${varPm.id};`;
      const [freshProd] =
        await pgSql`SELECT updated_at FROM products WHERE id = ${fixtureIds.product};`;

      // Attempting to set variant-scoped media as primary must FAIL
      await expect(
        setProductPrimaryMedia(
          {
            productId: fixtureIds.product,
            productMediaId: varPm.id,
            expectedUpdatedAt: freshProd!.updated_at.toISOString(),
            mutationRequestId: "018f0024-mr-primary-00000000002",
          },
          serviceOpts
        )
      ).rejects.toThrow(/medio multimedia global/i);
    }
  });

  it("preserves the global primary invariant during variant reassignment", async () => {
    const storage = new InMemoryCatalogStorageAdapter();
    const serviceOpts = {
      authContext: authCatalogAdmin,
      storageAdapter: storage,
      imageProcessor: sharpImageProcessor,
      intentSecret: TEST_HMAC_SECRET,
    };

    // Get current product state and its primaryMediaId
    const prodRows = await pgSql`SELECT * FROM products WHERE id = ${fixtureIds.product};`;
    expect(prodRows.length).toBeGreaterThan(0);
    const prod = prodRows[0]!;
    expect(prod.primary_media_id).not.toBeNull();

    // Find the sole global ProductMedia backing this primary asset
    const primaryPms = await pgSql`
      SELECT * FROM product_media
      WHERE product_id = ${fixtureIds.product} AND media_asset_id = ${prod.primary_media_id} AND variant_id IS NULL;
    `;
    expect(primaryPms.length).toBeGreaterThanOrEqual(1);
    const targetPm = primaryPms[0]!;

    // Ensure there is only 1 global attachment for this primary asset by moving any extras to a variant
    if (primaryPms.length > 1) {
      for (let i = 1; i < primaryPms.length; i++) {
        await pgSql`UPDATE product_media SET variant_id = ${fixtureIds.variantA} WHERE id = ${primaryPms[i]!.id};`;
      }
    }

    // Now attempt to reassign targetPm to variantB -> MUST REJECT to protect the primary invariant!
    await expect(
      reassignProductMediaVariant(
        {
          productId: fixtureIds.product,
          productMediaId: targetPm.id,
          targetVariantId: fixtureIds.variantB,
          mutationRequestId: "018f0024-mr-varreassign-0000000001",
        },
        serviceOpts
      )
    ).rejects.toThrow(/respalda la imagen principal actual/i);
  });

  it("fails closed when secondary media replay markers have corrupted identities", async () => {
    const serviceOpts = {
      authContext: authCatalogAdmin,
      storageAdapter: new InMemoryCatalogStorageAdapter(),
      imageProcessor: sharpImageProcessor,
      intentSecret: TEST_HMAC_SECRET,
    };

    const [mediaRow] = await pgSql`
      SELECT id, media_asset_id, variant_id
      FROM product_media
      WHERE product_id = ${fixtureIds.product}
      ORDER BY created_at ASC
      LIMIT 1;
    `;
    expect(mediaRow).toBeDefined();

    const altMutationId = "018f0024-br2-replay-alt-000000001";
    await updateMediaAssetAltText(
      {
        productId: fixtureIds.product,
        mediaAssetId: String(mediaRow!.media_asset_id),
        altText: "Replay marker integrity",
        mutationRequestId: altMutationId,
      },
      serviceOpts
    );
    const altDigest = computeMutationRequestDigest(
      fixtureIds.adminUser,
      "catalog:media:alt_text",
      altMutationId
    );
    await pgSql`
      UPDATE audit_events
      SET action = 'catalog:media:corrupted'
      WHERE actor_id = ${fixtureIds.adminUser}
        AND metadata->>'mutation_request_digest' = ${altDigest};
    `;
    await expect(
      updateMediaAssetAltText(
        {
          productId: fixtureIds.product,
          mediaAssetId: String(mediaRow!.media_asset_id),
          altText: "Replay marker integrity",
          mutationRequestId: altMutationId,
        },
        serviceOpts
      )
    ).rejects.toMatchObject({ code: "CATALOG_REPLAY_INTEGRITY_ERROR" });

    const currentMedia = await pgSql`
      SELECT id
      FROM product_media
      WHERE product_id = ${fixtureIds.product}
      ORDER BY display_order ASC, id ASC;
    `;
    const orderedIds = currentMedia.map((row) => String(row.id));
    const reorderMutationId = "018f0024-br2-replay-order-0000001";
    await reorderProductMedia(
      {
        productId: fixtureIds.product,
        orderedProductMediaIds: orderedIds,
        mutationRequestId: reorderMutationId,
      },
      serviceOpts
    );
    const reorderDigest = computeMutationRequestDigest(
      fixtureIds.adminUser,
      "catalog:media:reorder",
      reorderMutationId
    );
    await pgSql`
      UPDATE audit_events
      SET target_type = 'media_asset'
      WHERE actor_id = ${fixtureIds.adminUser}
        AND metadata->>'mutation_request_digest' = ${reorderDigest};
    `;
    await expect(
      reorderProductMedia(
        {
          productId: fixtureIds.product,
          orderedProductMediaIds: orderedIds,
          mutationRequestId: reorderMutationId,
        },
        serviceOpts
      )
    ).rejects.toMatchObject({ code: "CATALOG_REPLAY_INTEGRITY_ERROR" });

    const [globalMediaRow] = await pgSql`
      SELECT id
      FROM product_media
      WHERE product_id = ${fixtureIds.product} AND variant_id IS NULL
      ORDER BY created_at ASC
      LIMIT 1;
    `;
    const [productBeforePrimary] = await pgSql`
      SELECT updated_at
      FROM products
      WHERE id = ${fixtureIds.product};
    `;
    expect(globalMediaRow).toBeDefined();
    expect(productBeforePrimary).toBeDefined();

    const primaryMutationId = "018f0024-br2-replay-primary-00001";
    await setProductPrimaryMedia(
      {
        productId: fixtureIds.product,
        productMediaId: String(globalMediaRow!.id),
        expectedUpdatedAt: productBeforePrimary!.updated_at.toISOString(),
        mutationRequestId: primaryMutationId,
      },
      serviceOpts
    );
    const primaryDigest = computeMutationRequestDigest(
      fixtureIds.adminUser,
      "catalog:media:primary",
      primaryMutationId
    );
    await pgSql`
      UPDATE audit_events
      SET metadata = jsonb_set(
        metadata,
        '{media_asset_id}',
        to_jsonb('not-a-valid-media-asset-id'::text),
        true
      )
      WHERE actor_id = ${fixtureIds.adminUser}
        AND metadata->>'mutation_request_digest' = ${primaryDigest};
    `;
    await expect(
      setProductPrimaryMedia(
        {
          productId: fixtureIds.product,
          productMediaId: String(globalMediaRow!.id),
          expectedUpdatedAt: productBeforePrimary!.updated_at.toISOString(),
          mutationRequestId: primaryMutationId,
        },
        serviceOpts
      )
    ).rejects.toMatchObject({ code: "CATALOG_REPLAY_INTEGRITY_ERROR" });

    const variantMutationId = "018f0024-br2-replay-variant-000001";
    const currentTargetVariantId = mediaRow!.variant_id ? String(mediaRow!.variant_id) : null;
    await reassignProductMediaVariant(
      {
        productId: fixtureIds.product,
        productMediaId: String(mediaRow!.id),
        targetVariantId: currentTargetVariantId,
        mutationRequestId: variantMutationId,
      },
      serviceOpts
    );
    const variantDigest = computeMutationRequestDigest(
      fixtureIds.adminUser,
      "catalog:media:variant",
      variantMutationId
    );
    await pgSql`
      UPDATE audit_events
      SET target_id = gen_random_uuid()
      WHERE actor_id = ${fixtureIds.adminUser}
        AND metadata->>'mutation_request_digest' = ${variantDigest};
    `;
    await expect(
      reassignProductMediaVariant(
        {
          productId: fixtureIds.product,
          productMediaId: String(mediaRow!.id),
          targetVariantId: currentTargetVariantId,
          mutationRequestId: variantMutationId,
        },
        serviceOpts
      )
    ).rejects.toMatchObject({ code: "CATALOG_REPLAY_INTEGRITY_ERROR" });

    for (const digest of [altDigest, reorderDigest, primaryDigest, variantDigest]) {
      await pgSql`
        DELETE FROM audit_events
        WHERE actor_id = ${fixtureIds.adminUser}
          AND metadata->>'mutation_request_digest' = ${digest};
      `;
    }
  });

  it("fails closed with MEDIA_UPLOAD_INTENT_CONSUMPTION_INTEGRITY_ERROR on corrupted consumed intent markers (Scenarios E & F)", async () => {
    const storage = new InMemoryCatalogStorageAdapter();
    const serviceOpts = {
      authContext: authCatalogAdmin,
      storageAdapter: storage,
      imageProcessor: sharpImageProcessor,
      intentSecret: TEST_HMAC_SECRET,
    };

    // 1. Create a signed intent
    const intent = await requestCatalogMediaUploadIntent(
      { productId: fixtureIds.product, variantId: null, mimeType: "image/png" },
      serviceOpts
    );
    const parsed = verifyAndParseMediaUploadIntent(intent.signedIntentToken, TEST_HMAC_SECRET);
    const intentDigest = computeMediaIntentDigest(parsed);

    // 2. Scenario E: audit event marker points to a non-existent ProductMedia
    const fakePmId = "018f0024-0000-0000-0000-deadbeef0001";
    await pgSql`
      INSERT INTO audit_events (
        id, actor_type, actor_id, action, target_type, target_id, metadata, timestamp
      ) VALUES (
        gen_random_uuid(),
        'ADMIN',
        ${fixtureIds.adminUser},
        'catalog:media:attach',
        'product_media',
        ${fakePmId},
        ${pgSql.json({ media_intent_digest: intentDigest, product_id: fixtureIds.product })},
        NOW()
      );
    `;

    // Must fail closed with canonical replay integrity error
    try {
      await finalizeCatalogMediaUpload(
        {
          signedIntentToken: intent.signedIntentToken,
          mutationRequestId: "018f0024-mr-corrupt-000000000001",
        },
        serviceOpts
      );
      expect.fail("should have thrown");
    } catch (err: unknown) {
      expect((err as { code: string }).code).toBe(
        "MEDIA_UPLOAD_INTENT_CONSUMPTION_INTEGRITY_ERROR"
      );
    }

    // Clean up marker
    await pgSql`DELETE FROM audit_events WHERE target_id = ${fakePmId};`;

    // 3. Scenario F: audit event marker points to ProductMedia belonging to WRONG product
    // First create a real ProductMedia on otherProduct
    const [otherAsset] = await pgSql`
      INSERT INTO media_assets (
        id, object_key, security_class, media_type, mime_type, file_size_bytes, width, height, checksum_sha256, created_at
      ) VALUES (
        gen_random_uuid(), 'products/other/asset.webp', 'PUBLIC_MEDIA', 'IMAGE', 'image/webp', 100, 10, 10, '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef', NOW()
      ) RETURNING id;
    `;
    const [otherPm] = await pgSql`
      INSERT INTO product_media (
        id, product_id, variant_id, media_asset_id, display_order, created_at
      ) VALUES (
        gen_random_uuid(), ${fixtureIds.otherProduct}, NULL, ${otherAsset!.id}, 0, NOW()
      ) RETURNING id;
    `;

    await pgSql`
      INSERT INTO audit_events (
        id, actor_type, actor_id, action, target_type, target_id, metadata, timestamp
      ) VALUES (
        gen_random_uuid(),
        'ADMIN',
        ${fixtureIds.adminUser},
        'catalog:media:attach',
        'product_media',
        ${otherPm!.id},
        ${pgSql.json({ media_intent_digest: intentDigest, product_id: fixtureIds.otherProduct })},
        NOW()
      );
    `;

    try {
      await finalizeCatalogMediaUpload(
        {
          signedIntentToken: intent.signedIntentToken,
          mutationRequestId: "018f0024-mr-corrupt-000000000002",
        },
        serviceOpts
      );
      expect.fail("should have thrown");
    } catch (err: unknown) {
      expect((err as { code: string }).code).toBe(
        "MEDIA_UPLOAD_INTENT_CONSUMPTION_INTEGRITY_ERROR"
      );
    }

    // Cleanup
    await pgSql`DELETE FROM audit_events WHERE target_id = ${otherPm!.id};`;
    await pgSql`DELETE FROM product_media WHERE id = ${otherPm!.id};`;
    await pgSql`DELETE FROM media_assets WHERE id = ${otherAsset!.id};`;
  });

  it("handles staging delete failure after commit safely (Section 24 A)", async () => {
    const storage = new InMemoryCatalogStorageAdapter();
    const serviceOpts = {
      authContext: authCatalogAdmin,
      storageAdapter: storage,
      imageProcessor: sharpImageProcessor,
      intentSecret: TEST_HMAC_SECRET,
    };

    const intent = await requestCatalogMediaUploadIntent(
      { productId: fixtureIds.product, variantId: null, mimeType: "image/png" },
      serviceOpts
    );
    const payload = verifyAndParseMediaUploadIntent(intent.signedIntentToken, TEST_HMAC_SECRET);

    const testPngBuffer = await sharp({
      create: { width: 12, height: 12, channels: 4, background: { r: 1, g: 2, b: 3, alpha: 1 } },
    })
      .png()
      .toBuffer();

    storage.setObject(
      R2_BUCKETS.CATALOG_STAGING,
      payload.stagingObjectKey,
      testPngBuffer,
      "image/png"
    );

    // Instruct fake storage to fail deleteObject on staging key
    storage.deleteFailures.add(payload.stagingObjectKey);

    const res = await finalizeCatalogMediaUpload(
      {
        signedIntentToken: intent.signedIntentToken,
        mutationRequestId: "018f0024-mr-stgfail-000000000001",
      },
      serviceOpts
    );

    // Operation still succeeds!
    expect(res.productMedia.productId).toBe(fixtureIds.product);

    // DB rows remain committed
    const pm = await pgSql`SELECT * FROM product_media WHERE id = ${res.productMedia.id};`;
    expect(pm.length).toBe(1);
    const audit = await pgSql`SELECT * FROM audit_events WHERE target_id = ${res.productMedia.id};`;
    expect(audit.length).toBe(1);
  });

  it("retains public object when database transaction fails (Section 24 B)", async () => {
    const storage = new InMemoryCatalogStorageAdapter();
    const serviceOpts = {
      authContext: authCatalogAdmin,
      storageAdapter: storage,
      imageProcessor: sharpImageProcessor,
      intentSecret: TEST_HMAC_SECRET,
    };

    const intent = await requestCatalogMediaUploadIntent(
      { productId: fixtureIds.product, variantId: null, mimeType: "image/png" },
      serviceOpts
    );
    const payload = verifyAndParseMediaUploadIntent(intent.signedIntentToken, TEST_HMAC_SECRET);

    const testPngBuffer = await sharp({
      create: { width: 14, height: 14, channels: 4, background: { r: 99, g: 88, b: 77, alpha: 1 } },
    })
      .png()
      .toBuffer();

    storage.setObject(
      R2_BUCKETS.CATALOG_STAGING,
      payload.stagingObjectKey,
      testPngBuffer,
      "image/png"
    );

    // Inject failing db that errors inside transaction after public object was written
    const baseDb = db;
    const failingDb = new Proxy(baseDb, {
      get(target, prop, receiver) {
        if (prop === "transaction") {
          return async () => {
            throw new Error("Simulated DB Transaction Failure After Public Write");
          };
        }
        return Reflect.get(target, prop, receiver);
      },
    });

    const failingServiceOpts = {
      ...serviceOpts,
      db: failingDb,
    };

    await expect(
      finalizeCatalogMediaUpload(
        {
          signedIntentToken: intent.signedIntentToken,
          mutationRequestId: "018f0024-mr-dbfail-000000000001",
        },
        failingServiceOpts
      )
    ).rejects.toThrow(/Simulated DB Transaction Failure After Public Write/);

    // Verify public storage: the public object was created and RETAINED (no unsafe public delete)
    const allKeys = Array.from(
      (storage as unknown as { store: Map<string, unknown> }).store.keys()
    );
    const publicObjects = allKeys.filter((k: string) => k.startsWith(R2_BUCKETS.PUBLIC_MEDIA));
    expect(publicObjects.length).toBeGreaterThan(0);
  });

  it("rejects cross-product variant assignment with MEDIA_VARIANT_PRODUCT_MISMATCH (Section 24 C)", async () => {
    const storage = new InMemoryCatalogStorageAdapter();
    const serviceOpts = {
      authContext: authCatalogAdmin,
      storageAdapter: storage,
      imageProcessor: sharpImageProcessor,
      intentSecret: TEST_HMAC_SECRET,
    };

    // 1. Variant belongs to fixtureIds.product, but request specifies otherProduct
    try {
      await requestCatalogMediaUploadIntent(
        {
          productId: fixtureIds.otherProduct,
          variantId: fixtureIds.variantA, // belongs to fixtureIds.product!
          mimeType: "image/png",
        },
        serviceOpts
      );
      expect.fail("should have thrown");
    } catch (err: unknown) {
      expect((err as { code: string }).code).toBe("MEDIA_VARIANT_PRODUCT_MISMATCH");
    }

    // 2. In reassignProductMediaVariant
    const [pm] =
      await pgSql`SELECT id FROM product_media WHERE product_id = ${fixtureIds.product} LIMIT 1;`;
    if (pm) {
      // Create variant on otherProduct
      const [otherVar] = await pgSql`
        INSERT INTO product_variants (id, product_id, sku, title, price_cents, status, created_at, updated_at)
        VALUES (gen_random_uuid(), ${fixtureIds.otherProduct}, 'SKU-OTH-001', 'Other Var', 1000, 'ACTIVE', NOW(), NOW())
        RETURNING id;
      `;

      try {
        await reassignProductMediaVariant(
          {
            productId: fixtureIds.product,
            productMediaId: pm.id,
            targetVariantId: otherVar!.id,
            mutationRequestId: "018f0024-mr-varmismatch-000001",
          },
          serviceOpts
        );
        expect.fail("should have thrown");
      } catch (err: unknown) {
        expect((err as { code: string }).code).toBe("MEDIA_VARIANT_PRODUCT_MISMATCH");
      }

      await pgSql`DELETE FROM product_variants WHERE id = ${otherVar!.id};`;
    }
  });

  it("fails closed when existing public object has wrong Content-Type (Section 24 E)", async () => {
    const storage = new InMemoryCatalogStorageAdapter();
    const serviceOpts = {
      authContext: authCatalogAdmin,
      storageAdapter: storage,
      imageProcessor: sharpImageProcessor,
      intentSecret: TEST_HMAC_SECRET,
    };

    const intent = await requestCatalogMediaUploadIntent(
      { productId: fixtureIds.product, variantId: null, mimeType: "image/png" },
      serviceOpts
    );
    const payload = verifyAndParseMediaUploadIntent(intent.signedIntentToken, TEST_HMAC_SECRET);

    const testPngBuffer = await sharp({
      create: { width: 18, height: 18, channels: 4, background: { r: 40, g: 50, b: 60, alpha: 1 } },
    })
      .png()
      .toBuffer();

    storage.setObject(
      R2_BUCKETS.CATALOG_STAGING,
      payload.stagingObjectKey,
      testPngBuffer,
      "image/png"
    );

    // Finalize first time to write public object
    const res = await finalizeCatalogMediaUpload(
      {
        signedIntentToken: intent.signedIntentToken,
        mutationRequestId: "018f0024-mr-mimecheck-000001",
      },
      serviceOpts
    );

    // Tamper Content-Type of the public object in storage to image/jpeg while keeping bytes
    const publicStoreKey = `${R2_BUCKETS.PUBLIC_MEDIA}:::${res.mediaAsset.objectKey}`;
    const publicItem = (
      storage as unknown as { store: Map<string, { contentType: string }> }
    ).store.get(publicStoreKey);
    if (publicItem) {
      publicItem.contentType = "image/jpeg";
    }

    // Now attempt a second distinct intent with the identical image bytes
    const intent2 = await requestCatalogMediaUploadIntent(
      { productId: fixtureIds.product, variantId: null, mimeType: "image/png" },
      serviceOpts
    );
    const payload2 = verifyAndParseMediaUploadIntent(intent2.signedIntentToken, TEST_HMAC_SECRET);
    storage.setObject(
      R2_BUCKETS.CATALOG_STAGING,
      payload2.stagingObjectKey,
      testPngBuffer,
      "image/png"
    );

    try {
      await finalizeCatalogMediaUpload(
        {
          signedIntentToken: intent2.signedIntentToken,
          mutationRequestId: "018f0024-mr-mimecheck-000002",
        },
        serviceOpts
      );
      expect.fail("should have thrown");
    } catch (err: unknown) {
      expect((err as { code: string }).code).toBe("MEDIA_PUBLIC_INTEGRITY_MISMATCH");
    }
  });

  it("serializes a concurrent set-primary / variant-reassignment race and preserves the global-primary invariant", async () => {
    const serviceOpts = {
      authContext: authCatalogAdmin,
      storageAdapter: new InMemoryCatalogStorageAdapter(),
      imageProcessor: sharpImageProcessor,
      intentSecret: TEST_HMAC_SECRET,
    };
    const primaryMutationId = "018f0024-br2-race-primary-000001";
    const variantMutationId = "018f0024-br2-race-variant-000001";
    const primaryDigest = computeMutationRequestDigest(
      fixtureIds.adminUser,
      "catalog:media:primary",
      primaryMutationId
    );
    const variantDigest = computeMutationRequestDigest(
      fixtureIds.adminUser,
      "catalog:media:variant",
      variantMutationId
    );

    const [asset] = await pgSql`
      INSERT INTO media_assets (
        id,
        object_key,
        security_class,
        media_type,
        mime_type,
        file_size_bytes,
        width,
        height,
        checksum_sha256,
        created_at
      ) VALUES (
        gen_random_uuid(),
        'products/concurrency/' || gen_random_uuid()::text || '.webp',
        'PUBLIC_MEDIA',
        'IMAGE',
        'image/webp',
        128,
        16,
        16,
        'abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789',
        NOW()
      )
      RETURNING id;
    `;
    const [targetProductMedia] = await pgSql`
      INSERT INTO product_media (
        id, product_id, variant_id, media_asset_id, display_order, created_at
      ) VALUES (
        gen_random_uuid(), ${fixtureIds.product}, NULL, ${asset!.id}, 999, NOW()
      )
      RETURNING id;
    `;
    const [beforeRace] = await pgSql`
      SELECT primary_media_id, updated_at
      FROM products
      WHERE id = ${fixtureIds.product};
    `;

    try {
      const [primaryResult, reassignmentResult] = await Promise.allSettled([
        setProductPrimaryMedia(
          {
            productId: fixtureIds.product,
            productMediaId: String(targetProductMedia!.id),
            expectedUpdatedAt: beforeRace!.updated_at.toISOString(),
            mutationRequestId: primaryMutationId,
          },
          serviceOpts
        ),
        reassignProductMediaVariant(
          {
            productId: fixtureIds.product,
            productMediaId: String(targetProductMedia!.id),
            targetVariantId: fixtureIds.variantA,
            mutationRequestId: variantMutationId,
          },
          serviceOpts
        ),
      ]);

      if (primaryResult.status === "fulfilled") {
        expect(reassignmentResult.status).toBe("rejected");
        if (reassignmentResult.status === "rejected") {
          expect((reassignmentResult.reason as { code?: unknown }).code).toBe(
            "PRIMARY_MEDIA_CANNOT_BE_VARIANT_SPECIFIC"
          );
        }
      } else {
        expect((primaryResult.reason as { code?: unknown }).code).toBe(
          "PRIMARY_MEDIA_MUST_BE_GLOBAL"
        );
        expect(reassignmentResult.status).toBe("fulfilled");
      }

      const [invariantProof] = await pgSql`
        SELECT NOT EXISTS (
          SELECT 1
          FROM products p
          WHERE p.id = ${fixtureIds.product}
            AND p.primary_media_id IS NOT NULL
            AND NOT EXISTS (
              SELECT 1
              FROM product_media pm
              WHERE pm.product_id = p.id
                AND pm.media_asset_id = p.primary_media_id
                AND pm.variant_id IS NULL
            )
        ) AS invariant_holds;
      `;
      expect(invariantProof!.invariant_holds).toBe(true);
    } finally {
      await pgSql`
        UPDATE products
        SET primary_media_id = ${beforeRace!.primary_media_id}, updated_at = NOW()
        WHERE id = ${fixtureIds.product};
      `;
      await pgSql`
        DELETE FROM audit_events
        WHERE actor_id = ${fixtureIds.adminUser}
          AND (
            metadata->>'mutation_request_digest' = ${primaryDigest}
            OR metadata->>'mutation_request_digest' = ${variantDigest}
          );
      `;
      await pgSql`DELETE FROM product_media WHERE id = ${targetProductMedia!.id};`;
      await pgSql`DELETE FROM media_assets WHERE id = ${asset!.id};`;
    }
  });

  it("confirms audit event safety: zero raw secrets, tokens, or URLs logged", async () => {
    const audits = await pgSql`
      SELECT action, metadata FROM audit_events
      WHERE actor_id = ${fixtureIds.adminUser};
    `;
    expect(audits.length).toBeGreaterThan(0);

    for (const a of audits) {
      const metaStr = JSON.stringify(a.metadata);
      expect(metaStr).not.toContain(TEST_HMAC_SECRET);
      expect(metaStr).not.toContain("temp/catalog");
      expect(metaStr).not.toContain("presignedPutUrl");
      expect(metaStr).not.toContain("signedIntentToken");
    }
  });
});
