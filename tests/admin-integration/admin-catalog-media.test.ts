import { describe, it, expect, beforeAll, afterAll } from "vitest";
import postgres from "postgres";
import { assertLocalDatabaseTarget } from "@/lib/admin/test-target-guard";
import {
  updateMediaAssetAltText,
  reorderProductMedia,
  setProductPrimaryMedia,
  reassignProductMediaVariant,
} from "@/lib/admin/catalog/media-service";
import { InMemoryCatalogStorageAdapter } from "@/lib/admin/catalog/media-storage";
import {
  confirmGalleryImageUpload,
  requestGalleryImageUpload,
} from "@/lib/admin/catalog/gallery-media-service";
import { R2_BUCKETS } from "@/lib/storage/r2";
import { computeMutationRequestDigest } from "@/lib/admin/catalog/crypto";
import type { VerifiedAuthContextReady } from "@/lib/auth/rbac";

/** Final object key carried by a direct-upload token (its payload is base64url JSON). */
function tokenObjectKey(uploadToken: string): string {
  const [body] = uploadToken.split(".");
  return (JSON.parse(Buffer.from(body!, "base64url").toString("utf8")) as { objectKey: string })
    .objectKey;
}

describe("GP-024 / GP-055 — Admin Catalog Media Live Integration", () => {
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

  /** Signs, "uploads" into the in-memory bucket and confirms one gallery photo. */
  async function uploadGalleryPhoto(
    storage: InMemoryCatalogStorageAdapter,
    serviceOpts: {
      authContext: VerifiedAuthContextReady;
      storageAdapter: InMemoryCatalogStorageAdapter;
      intentSecret: string;
    },
    variantId: string | null,
    mutationRequestId: string
  ) {
    const body = Buffer.from(`webp-bytes-${mutationRequestId}`);
    const request = await requestGalleryImageUpload(
      {
        productId: fixtureIds.product,
        variantId,
        mimeType: "image/webp",
        fileSizeBytes: body.length,
      },
      serviceOpts
    );
    storage.setObject(
      R2_BUCKETS.PUBLIC_MEDIA,
      tokenObjectKey(request.uploadToken),
      body,
      "image/webp"
    );
    const result = await confirmGalleryImageUpload(
      { uploadToken: request.uploadToken, width: 1200, height: 1200, mutationRequestId },
      serviceOpts
    );
    return { result, uploadToken: request.uploadToken };
  }

  it("enforces service-layer RBAC on all media operations", async () => {
    const storage = new InMemoryCatalogStorageAdapter();
    const serviceOpts = {
      authContext: authUnauthorized,
      storageAdapter: storage,
      intentSecret: TEST_HMAC_SECRET,
    };

    await expect(
      requestGalleryImageUpload(
        {
          productId: fixtureIds.product,
          variantId: null,
          mimeType: "image/webp",
          fileSizeBytes: 10,
        },
        serviceOpts
      )
    ).rejects.toThrow(/permisos suficientes/i);

    await expect(confirmGalleryImageUpload({ uploadToken: "dummy" }, serviceOpts)).rejects.toThrow(
      /permisos suficientes/i
    );

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

  it("uploads gallery photos straight to storage and attaches them once", async () => {
    const storage = new InMemoryCatalogStorageAdapter();
    const serviceOpts = {
      authContext: authCatalogAdmin,
      storageAdapter: storage,
      intentSecret: TEST_HMAC_SECRET,
    };

    const first = await uploadGalleryPhoto(
      storage,
      serviceOpts,
      null,
      "018f0024-mr-upload-0000000001"
    );
    const second = await uploadGalleryPhoto(
      storage,
      serviceOpts,
      null,
      "018f0024-mr-upload-0000000002"
    );
    const third = await uploadGalleryPhoto(
      storage,
      serviceOpts,
      fixtureIds.variantA,
      "018f0024-mr-upload-0000000003"
    );
    expect(first.result.replayed).toBe(false);

    const rows = await pgSql`
      SELECT pm.id, pm.display_order, pm.variant_id, pm.placement, ma.object_key, ma.media_type,
             ma.mime_type, ma.checksum_sha256
      FROM product_media pm JOIN media_assets ma ON ma.id = pm.media_asset_id
      WHERE pm.product_id = ${fixtureIds.product}
      ORDER BY pm.display_order;
    `;
    expect(rows.map((row) => row.id)).toEqual([
      first.result.productMediaId,
      second.result.productMediaId,
      third.result.productMediaId,
    ]);
    expect(rows.map((row) => row.display_order)).toEqual([0, 1, 2]);
    expect(rows[2]!.variant_id).toBe(fixtureIds.variantA);
    for (const row of rows) {
      expect(row.placement).toBe("GALLERY");
      expect(row.media_type).toBe("IMAGE");
      expect(row.mime_type).toBe("image/webp");
      expect(row.checksum_sha256).toBeNull();
      expect(String(row.object_key)).toMatch(
        /^products\/brand-media-test\/prod-media-test\/[0-9a-f-]{36}\.webp$/
      );
    }

    // A repeated confirm returns the same attachment.
    const replay = await confirmGalleryImageUpload(
      { uploadToken: first.uploadToken, mutationRequestId: "018f0024-mr-upload-0000000001" },
      serviceOpts
    );
    expect(replay).toMatchObject({ productMediaId: first.result.productMediaId, replayed: true });

    // An object whose length differs from the signed one is rejected and deleted.
    const request = await requestGalleryImageUpload(
      { productId: fixtureIds.product, variantId: null, mimeType: "image/webp", fileSizeBytes: 64 },
      serviceOpts
    );
    const objectKey = tokenObjectKey(request.uploadToken);
    storage.setObject(R2_BUCKETS.PUBLIC_MEDIA, objectKey, Buffer.alloc(65, 1), "image/webp");
    await expect(
      confirmGalleryImageUpload({ uploadToken: request.uploadToken }, serviceOpts)
    ).rejects.toMatchObject({ code: "DIRECT_UPLOAD_MISMATCH" });
    expect(storage.hasObject(R2_BUCKETS.PUBLIC_MEDIA, objectKey)).toBe(false);
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

  it("rejects cross-product variant assignment with MEDIA_VARIANT_PRODUCT_MISMATCH (Section 24 C)", async () => {
    const storage = new InMemoryCatalogStorageAdapter();
    const serviceOpts = {
      authContext: authCatalogAdmin,
      storageAdapter: storage,
      intentSecret: TEST_HMAC_SECRET,
    };

    // 1. Variant belongs to fixtureIds.product, but request specifies otherProduct
    try {
      await requestGalleryImageUpload(
        {
          productId: fixtureIds.otherProduct,
          variantId: fixtureIds.variantA, // belongs to fixtureIds.product!
          mimeType: "image/webp",
          fileSizeBytes: 10,
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

  it("serializes a concurrent set-primary / variant-reassignment race and preserves the global-primary invariant", async () => {
    const serviceOpts = {
      authContext: authCatalogAdmin,
      storageAdapter: new InMemoryCatalogStorageAdapter(),
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
      expect(metaStr).not.toContain("X-Amz-Signature");
      expect(metaStr).not.toContain("presignedPutUrl");
      expect(metaStr).not.toContain("uploadToken");
    }
  });
});
