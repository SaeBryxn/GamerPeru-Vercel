import { describe, it, expect, beforeAll, afterAll } from "vitest";
import postgres from "postgres";
import sharp from "sharp";
import { assertLocalDatabaseTarget } from "@/lib/admin/test-target-guard";
import {
  requestCatalogMediaUploadIntent,
  finalizeCatalogMediaUpload,
  updateMediaAssetAltText,
  reorderProductMedia,
  setProductPrimaryMedia,
  reassignProductMediaVariant,
} from "@/lib/admin/catalog/media-service";
import { InMemoryCatalogStorageAdapter } from "@/lib/admin/catalog/media-storage";
import { verifyAndParseMediaUploadIntent } from "@/lib/admin/catalog/media-crypto";
import { R2_BUCKETS } from "@/lib/storage/r2";
import { CatalogIdempotencyConflictError } from "@/lib/admin/catalog/types";
import type { VerifiedAuthContextReady } from "@/lib/auth/rbac";

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

  const TEST_HMAC_SECRET = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

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

  it("enforces service-layer RBAC on all media operations", async () => {
    const storage = new InMemoryCatalogStorageAdapter();
    const serviceOpts = {
      authContext: authUnauthorized,
      storageAdapter: storage,
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
        { productId: fixtureIds.product, productMediaId: "pm-1", mutationRequestId: "mr-4" },
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

    // 4. Idempotency Replay: same intent + same mutationRequestId
    const replayResult = await finalizeCatalogMediaUpload(
      {
        signedIntentToken: intent.signedIntentToken,
        mutationRequestId,
      },
      serviceOpts
    );
    expect(replayResult.productMedia.id).toBe(result.productMedia.id);
    expect(replayResult.mediaAsset.id).toBe(result.mediaAsset.id);

    // Ensure no duplicate rows were inserted
    const pmRowsAfter =
      await pgSql`SELECT * FROM product_media WHERE id = ${result.productMedia.id};`;
    expect(pmRowsAfter.length).toBe(1);

    // 5. Conflict: different intent + same mutationRequestId
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

    // 6. Already Consumed Intent: same intent + different mutationRequestId
    await expect(
      finalizeCatalogMediaUpload(
        {
          signedIntentToken: intent.signedIntentToken,
          mutationRequestId: "018f0024-mr-0000-0000-different0002",
        },
        serviceOpts
      )
    ).rejects.toThrow(/consumido por otra solicitud/i);
  });

  it("handles concurrent finalization with identical bytes safely (race-safe MediaAsset reuse)", async () => {
    const storage = new InMemoryCatalogStorageAdapter();
    const serviceOpts = {
      authContext: authCatalogAdmin,
      storageAdapter: storage,
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
    await expect(
      finalizeCatalogMediaUpload(
        {
          signedIntentToken: intentTampered.signedIntentToken,
          mutationRequestId: "018f0024-mr-integrity-00000000002",
        },
        serviceOpts
      )
    ).rejects.toThrow(/Discrepancia de integridad/i);
  });

  it("updates alt text idempotently and audits changes", async () => {
    const storage = new InMemoryCatalogStorageAdapter();
    const serviceOpts = {
      authContext: authCatalogAdmin,
      storageAdapter: storage,
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

    const mutationRequestId = "018f0024-mr-primary-00000000001";
    const res = await setProductPrimaryMedia(
      {
        productId: fixtureIds.product,
        productMediaId: globalPm.id,
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

      // Attempting to set variant-scoped media as primary must FAIL
      await expect(
        setProductPrimaryMedia(
          {
            productId: fixtureIds.product,
            productMediaId: varPm.id,
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
