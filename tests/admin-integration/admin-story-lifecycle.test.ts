import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  CatalogIdempotencyConflictError,
  CatalogReplayIntegrityError,
  StoryStaleWriteError,
  StoryValidationError,
  discardProductStoryDraft,
  getAdminProductStory,
  publishProductStory,
  saveProductStoryDraft,
  unpublishProductStory,
} from "@/lib/admin/catalog";
import { assertLocalDatabaseTarget } from "@/lib/admin/test-target-guard";
import type { VerifiedAuthContextReady } from "@/lib/auth/rbac";

describe("GP-026 CHK1 Story lifecycle live integration", () => {
  const rawDatabaseUrl =
    process.env.DATABASE_URL ??
    process.env.DATABASE_MIGRATION_URL ??
    "postgres://postgres:postgres@127.0.0.1:54322/postgres";
  const databaseUrl = assertLocalDatabaseTarget(rawDatabaseUrl);
  const fixture = {
    actorId: "018f0026-1000-7000-8000-000000000001",
    brandId: "018f0026-1000-7000-8000-000000000002",
    categoryId: "018f0026-1000-7000-8000-000000000003",
  };
  let pgSql: postgres.Sql;

  const authorized: VerifiedAuthContextReady = {
    status: "READY",
    authUserId: fixture.actorId,
    email: "story.gp026@gamerperu.pe",
    roles: ["ADMIN_CATALOG"],
    permissions: new Set(["catalog:manage", "catalog:publish"]),
  };
  const manageOnly: VerifiedAuthContextReady = {
    ...authorized,
    permissions: new Set(["catalog:manage"]),
  };
  const publishOnly: VerifiedAuthContextReady = {
    ...authorized,
    permissions: new Set(["catalog:publish"]),
  };
  const noCatalogPermission: VerifiedAuthContextReady = {
    ...authorized,
    roles: ["ADMIN_ORDERS"],
    permissions: new Set(["orders:manage"]),
  };

  beforeAll(async () => {
    pgSql = postgres(databaseUrl, { max: 20, prepare: false });
    await pgSql`
      INSERT INTO auth.users (
        id, email, raw_app_meta_data, raw_user_meta_data, is_super_admin, created_at, updated_at
      ) VALUES (
        ${fixture.actorId},
        'story.gp026@gamerperu.pe',
        '{"provider":"email","providers":["email"]}',
        '{}',
        false,
        NOW(),
        NOW()
      ) ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email;
    `;
    await pgSql`
      INSERT INTO brands (id, name, slug, status, created_at, updated_at)
      VALUES (${fixture.brandId}, 'GP026 Brand', 'gp026-brand', 'PUBLISHED', NOW(), NOW())
      ON CONFLICT (id) DO NOTHING;
    `;
    await pgSql`
      INSERT INTO categories (id, name, slug, display_order, status, created_at, updated_at)
      VALUES (${fixture.categoryId}, 'GP026 Category', 'gp026-category', 2600, 'PUBLISHED', NOW(), NOW())
      ON CONFLICT (id) DO NOTHING;
    `;
  });

  afterEach(async () => {
    await pgSql`DELETE FROM audit_events WHERE actor_id = ${fixture.actorId};`;
    await pgSql`DELETE FROM products WHERE brand_id = ${fixture.brandId};`;
    await pgSql`DELETE FROM media_assets WHERE object_key LIKE 'gp026-tests/%';`;
  });

  afterAll(async () => {
    await pgSql`DELETE FROM categories WHERE id = ${fixture.categoryId};`;
    await pgSql`DELETE FROM brands WHERE id = ${fixture.brandId};`;
    await pgSql`DELETE FROM auth.users WHERE id = ${fixture.actorId};`;
    await pgSql.end();
  });

  async function createProduct(options?: {
    status?: "DRAFT" | "PUBLISHED";
    slug?: string;
    activeVariant?: boolean;
  }): Promise<string> {
    const productId = randomUUID();
    const slug = options?.slug ?? `gp026-${productId}`;
    await pgSql`
      INSERT INTO products (
        id, brand_id, category_id, name, slug, status, is_featured, created_at, updated_at
      ) VALUES (
        ${productId}, ${fixture.brandId}, ${fixture.categoryId}, 'Producto Story', ${slug},
        ${options?.status ?? "DRAFT"}, false, NOW(), NOW()
      );
    `;
    if (options?.activeVariant) {
      await pgSql`
        INSERT INTO product_variants (
          id, product_id, sku, title, price_cents, status, display_order, created_at, updated_at
        ) VALUES (
          ${randomUUID()}, ${productId}, ${`GP026-${productId}`}, 'Estándar', 19990,
          'ACTIVE', 0, NOW(), NOW()
        );
      `;
    }
    return productId;
  }

  async function attachMedia(
    productId: string,
    options?: {
      securityClass?: "PUBLIC_MEDIA" | "PRIVATE_BACKUP";
      mediaType?: "IMAGE" | "VIDEO";
      mimeType?: string;
      variantProductId?: string;
    }
  ): Promise<string> {
    const mediaAssetId = randomUUID();
    const productMediaId = randomUUID();
    const mediaType = options?.mediaType ?? "IMAGE";
    const mimeType = options?.mimeType ?? (mediaType === "IMAGE" ? "image/webp" : "video/mp4");
    let variantId: string | null = null;
    if (options?.variantProductId) {
      variantId = randomUUID();
      await pgSql`
        INSERT INTO product_variants (
          id, product_id, sku, title, price_cents, status, display_order, created_at, updated_at
        ) VALUES (
          ${variantId}, ${options.variantProductId}, ${`GP026-M-${variantId}`}, 'Medio', 100,
          'ACTIVE', 0, NOW(), NOW()
        );
      `;
    }
    await pgSql`
      INSERT INTO media_assets (
        id, object_key, security_class, media_type, mime_type, file_size_bytes,
        width, height, alt_text, created_at
      ) VALUES (
        ${mediaAssetId}, ${`gp026-tests/${mediaAssetId}.${mediaType === "IMAGE" ? "webp" : "mp4"}`},
        ${options?.securityClass ?? "PUBLIC_MEDIA"}, ${mediaType}, ${mimeType}, 1024,
        ${mediaType === "IMAGE" ? 1200 : null}, ${mediaType === "IMAGE" ? 800 : null},
        'Medio de prueba', NOW()
      );
    `;
    await pgSql`
      INSERT INTO product_media (
        id, product_id, media_asset_id, variant_id, display_order, created_at
      ) VALUES (${productMediaId}, ${productId}, ${mediaAssetId}, ${variantId}, 0, NOW());
    `;
    return productMediaId;
  }

  function heroDocument(headline = "Historia principal") {
    return [{ blockId: "hero", type: "hero_media", payload: { headline } }];
  }

  async function firstDraft(productId: string, requestId = randomUUID()) {
    return saveProductStoryDraft(
      {
        productId,
        expectedDraftRevisionId: null,
        expectedPublishedRevisionId: null,
        document: heroDocument(),
        mutationRequestId: requestId,
      },
      { authContext: authorized }
    );
  }

  it("keeps editor reads side-effect free and returns a sanitized selectable-media DTO", async () => {
    const productId = await createProduct();
    const mediaId = await attachMedia(productId);

    const dto = await getAdminProductStory(productId, { authContext: manageOnly });
    const aggregateRows = await pgSql`
      SELECT COUNT(*)::int AS count FROM product_stories WHERE product_id = ${productId}
    `;

    expect(dto).toMatchObject({
      lifecycle: "NO_STORY",
      initialDocument: [],
      initialDocumentSource: "EMPTY",
      concurrency: { expectedDraftRevisionId: null, expectedPublishedRevisionId: null },
    });
    expect(dto.selectableMedia[0]).toMatchObject({
      productMediaId: mediaId,
      mediaType: "IMAGE",
      mimeType: "image/webp",
    });
    expect(dto.selectableMedia[0]?.publicUrl).toContain("gp026-tests/");
    expect(JSON.stringify(dto)).not.toContain("object_key");
    expect(aggregateRows[0]?.count).toBe(0);

    const draft = await saveProductStoryDraft(
      {
        productId,
        expectedDraftRevisionId: null,
        expectedPublishedRevisionId: null,
        document: [{ blockId: "image", type: "full_bleed_image", payload: { mediaId } }],
        mutationRequestId: randomUUID(),
      },
      { authContext: manageOnly }
    );
    const savedDto = await getAdminProductStory(productId, { authContext: manageOnly });
    expect(savedDto).toMatchObject({
      lifecycle: "DRAFT_ONLY",
      initialDocumentSource: "DRAFT",
      concurrency: { expectedDraftRevisionId: draft.revisionId },
      savedDraftDocument: [{ blockId: "image", type: "full_bleed_image", payload: { mediaId } }],
    });
    expect(JSON.stringify(savedDto.savedDraftDocument)).not.toContain("gp026-tests/");
    const revisionCount = await pgSql`
      SELECT COUNT(*)::int AS count FROM product_story_revisions WHERE product_id = ${productId}
    `;
    expect(revisionCount[0]?.count).toBe(1);
  });

  it("saves first and successive immutable drafts with contiguous server order", async () => {
    const productId = await createProduct();
    const first = await firstDraft(productId);
    const second = await saveProductStoryDraft(
      {
        productId,
        expectedDraftRevisionId: first.revisionId,
        expectedPublishedRevisionId: null,
        document: [
          { blockId: "second", type: "hero_media", payload: { headline: "Segundo" } },
          { blockId: "first", type: "hero_media", payload: { headline: "Primero" } },
        ],
        mutationRequestId: randomUUID(),
      },
      { authContext: authorized }
    );

    const rows = await pgSql`
      SELECT id, revision_number, status, blocks
      FROM product_story_revisions
      WHERE product_id = ${productId}
      ORDER BY revision_number
    `;
    const aggregate = await pgSql`
      SELECT draft_revision_id, published_revision_id FROM product_stories WHERE product_id = ${productId}
    `;
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ id: first.revisionId, revision_number: 1, status: "ARCHIVED" });
    expect(rows[1]).toMatchObject({ id: second.revisionId, revision_number: 2, status: "DRAFT" });
    expect(rows[1]?.blocks).toEqual([
      { block_id: "second", type: "hero_media", order: 1, payload: { headline: "Segundo" } },
      { block_id: "first", type: "hero_media", order: 2, payload: { headline: "Primero" } },
    ]);
    expect(aggregate[0]).toEqual({
      draft_revision_id: second.revisionId,
      published_revision_id: null,
    });
  });

  it("serializes concurrent first saves so one wins and one receives STORY_STALE_WRITE", async () => {
    const productId = await createProduct();
    const attempts = await Promise.allSettled([
      firstDraft(productId),
      saveProductStoryDraft(
        {
          productId,
          expectedDraftRevisionId: null,
          expectedPublishedRevisionId: null,
          document: heroDocument("Competidor"),
          mutationRequestId: randomUUID(),
        },
        { authContext: authorized }
      ),
    ]);
    const fulfilled = attempts.filter((attempt) => attempt.status === "fulfilled");
    const rejected = attempts.filter((attempt) => attempt.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(StoryStaleWriteError);
    const counts = await pgSql`
      SELECT
        (SELECT COUNT(*)::int FROM product_story_revisions WHERE product_id = ${productId}) AS revisions,
        (SELECT COUNT(*)::int FROM audit_events WHERE actor_id = ${fixture.actorId} AND action = 'catalog:story:draft_save') AS audits
    `;
    expect(counts[0]).toEqual({ revisions: 1, audits: 1 });
  });

  it("serializes concurrent later saves and retains exactly one active DRAFT", async () => {
    const productId = await createProduct();
    const initial = await firstDraft(productId);
    const input = (headline: string) => ({
      productId,
      expectedDraftRevisionId: initial.revisionId,
      expectedPublishedRevisionId: null,
      document: heroDocument(headline),
      mutationRequestId: randomUUID(),
    });
    const attempts = await Promise.allSettled([
      saveProductStoryDraft(input("Editor A"), { authContext: authorized }),
      saveProductStoryDraft(input("Editor B"), { authContext: authorized }),
    ]);
    expect(attempts.filter((attempt) => attempt.status === "fulfilled")).toHaveLength(1);
    expect(attempts.filter((attempt) => attempt.status === "rejected")).toHaveLength(1);
    const rows = await pgSql`
      SELECT status, COUNT(*)::int AS count
      FROM product_story_revisions WHERE product_id = ${productId}
      GROUP BY status ORDER BY status
    `;
    expect(rows.find((row) => row.status === "DRAFT")?.count).toBe(1);
    expect(rows.reduce((total, row) => total + row.count, 0)).toBe(2);
  });

  it("returns exact sequential and concurrent replay without duplicate revision or audit", async () => {
    const productId = await createProduct();
    const mutationRequestId = randomUUID();
    const input = {
      productId,
      expectedDraftRevisionId: null,
      expectedPublishedRevisionId: null,
      document: heroDocument(),
      mutationRequestId,
    };
    const first = await saveProductStoryDraft(input, { authContext: authorized });
    const sequentialReplay = await saveProductStoryDraft(input, { authContext: authorized });
    const concurrent = await Promise.all([
      saveProductStoryDraft(input, { authContext: authorized }),
      saveProductStoryDraft(input, { authContext: authorized }),
    ]);
    expect(sequentialReplay).toMatchObject({ revisionId: first.revisionId, replayed: true });
    expect(concurrent.every((result) => result.revisionId === first.revisionId)).toBe(true);
    const counts = await pgSql`
      SELECT
        (SELECT COUNT(*)::int FROM product_story_revisions WHERE product_id = ${productId}) AS revisions,
        (SELECT COUNT(*)::int FROM audit_events WHERE actor_id = ${fixture.actorId} AND action = 'catalog:story:draft_save') AS audits
    `;
    expect(counts[0]).toEqual({ revisions: 1, audits: 1 });
  });

  it("rejects same request ID with a different payload before stale validation", async () => {
    const productId = await createProduct();
    const mutationRequestId = randomUUID();
    await firstDraft(productId, mutationRequestId);

    await expect(
      saveProductStoryDraft(
        {
          productId,
          expectedDraftRevisionId: null,
          expectedPublishedRevisionId: null,
          document: heroDocument("Carga diferente"),
          mutationRequestId,
        },
        { authContext: authorized }
      )
    ).rejects.toBeInstanceOf(CatalogIdempotencyConflictError);
  });

  it("fails closed when durable replay target metadata is corrupted", async () => {
    const productId = await createProduct();
    const mutationRequestId = randomUUID();
    await firstDraft(productId, mutationRequestId);
    await pgSql`
      UPDATE audit_events
      SET target_id = ${randomUUID()}
      WHERE actor_id = ${fixture.actorId} AND action = 'catalog:story:draft_save'
    `;

    await expect(firstDraft(productId, mutationRequestId)).rejects.toBeInstanceOf(
      CatalogReplayIntegrityError
    );
  });

  it("persists one sanitized audit marker without raw request ID or Story payload", async () => {
    const productId = await createProduct();
    const mutationRequestId = randomUUID();
    const saved = await firstDraft(productId, mutationRequestId);
    const audit = await pgSql`
      SELECT target_type, target_id, request_id, metadata
      FROM audit_events
      WHERE actor_id = ${fixture.actorId} AND action = 'catalog:story:draft_save'
    `;
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({
      target_type: "product_story_revision",
      target_id: saved.revisionId,
      request_id: null,
      metadata: {
        product_id: productId,
        revision_id: saved.revisionId,
        revision_number: 1,
        block_count: 1,
      },
    });
    const serialized = JSON.stringify(audit[0]?.metadata);
    expect(serialized).not.toContain(mutationRequestId);
    expect(serialized).not.toContain("Historia principal");
    expect(audit[0]?.metadata.mutation_request_digest).toMatch(/^[0-9a-f]{64}$/);
    expect(audit[0]?.metadata.request_fingerprint).toMatch(/^[0-9a-f]{64}$/);
  });

  it.each([
    "after_draft_archive",
    "after_revision_insert",
    "after_pointer_update",
    "before_audit_insert",
  ] as const)("rolls back draft replacement at %s", async (faultPoint) => {
    const productId = await createProduct();
    const first = await firstDraft(productId);
    await expect(
      saveProductStoryDraft(
        {
          productId,
          expectedDraftRevisionId: first.revisionId,
          expectedPublishedRevisionId: null,
          document: heroDocument("No debe persistir"),
          mutationRequestId: randomUUID(),
        },
        {
          authContext: authorized,
          faultInjector: (point) => {
            if (point === faultPoint) {
              throw new Error("injected rollback");
            }
          },
        }
      )
    ).rejects.toThrow("injected rollback");

    const rows = await pgSql`
      SELECT id, status FROM product_story_revisions WHERE product_id = ${productId}
    `;
    const aggregate = await pgSql`
      SELECT draft_revision_id FROM product_stories WHERE product_id = ${productId}
    `;
    expect(rows).toEqual([{ id: first.revisionId, status: "DRAFT" }]);
    expect(aggregate[0]?.draft_revision_id).toBe(first.revisionId);
    const auditCount = await pgSql`
      SELECT COUNT(*)::int AS count FROM audit_events
      WHERE actor_id = ${fixture.actorId} AND action = 'catalog:story:draft_save'
    `;
    expect(auditCount[0]?.count).toBe(1);
  });

  it("validates ProductMedia ownership, security class, media type, MIME, and public resolution", async () => {
    const productId = await createProduct();
    const otherProductId = await createProduct();
    const validImage = await attachMedia(productId);
    const validVideo = await attachMedia(productId, { mediaType: "VIDEO" });
    const privateImage = await attachMedia(productId, { securityClass: "PRIVATE_BACKUP" });
    const wrongMimeVideo = await attachMedia(productId, {
      mediaType: "VIDEO",
      mimeType: "video/webm",
    });
    const crossProductImage = await attachMedia(otherProductId);
    const crossProductVariantImage = await attachMedia(productId, {
      variantProductId: otherProductId,
    });

    await expect(
      saveProductStoryDraft(
        {
          productId,
          expectedDraftRevisionId: null,
          expectedPublishedRevisionId: null,
          document: [
            {
              blockId: "video",
              type: "video",
              payload: { videoMediaId: validVideo, posterMediaId: validImage },
            },
          ],
          mutationRequestId: randomUUID(),
        },
        { authContext: authorized }
      )
    ).resolves.toMatchObject({ revisionNumber: 1 });

    for (const [mediaId, mediaType] of [
      [privateImage, "full_bleed_image"],
      [wrongMimeVideo, "video"],
      [crossProductImage, "full_bleed_image"],
      [crossProductVariantImage, "full_bleed_image"],
      [validImage, "video"],
      [validVideo, "full_bleed_image"],
      [randomUUID(), "full_bleed_image"],
    ] as const) {
      const payload = mediaType === "video" ? { videoMediaId: mediaId } : { mediaId };
      await expect(
        saveProductStoryDraft(
          {
            productId,
            expectedDraftRevisionId: (
              await pgSql`SELECT draft_revision_id FROM product_stories WHERE product_id = ${productId}`
            )[0]?.draft_revision_id,
            expectedPublishedRevisionId: null,
            document: [{ blockId: `invalid-${mediaId}`, type: mediaType, payload }],
            mutationRequestId: randomUUID(),
          },
          { authContext: authorized }
        )
      ).rejects.toBeInstanceOf(StoryValidationError);
    }
  });

  it("resolves related Product identity to canonical slug and enforces publication eligibility", async () => {
    const productId = await createProduct();
    const relatedId = await createProduct({
      status: "PUBLISHED",
      slug: `related-${randomUUID()}`,
      activeVariant: true,
    });
    const draftOnlyRelated = await createProduct({ slug: `draft-related-${randomUUID()}` });
    const draft = await saveProductStoryDraft(
      {
        productId,
        expectedDraftRevisionId: null,
        expectedPublishedRevisionId: null,
        document: [
          {
            blockId: "related",
            type: "related_products",
            payload: { productIds: [relatedId] },
          },
        ],
        mutationRequestId: randomUUID(),
      },
      { authContext: authorized }
    );
    const stored = await pgSql`
      SELECT blocks FROM product_story_revisions WHERE id = ${draft.revisionId}
    `;
    expect(stored[0]?.blocks[0].payload.productSlugs[0]).toContain("related-");
    await expect(
      publishProductStory(
        {
          productId,
          expectedDraftRevisionId: draft.revisionId,
          expectedPublishedRevisionId: null,
          mutationRequestId: randomUUID(),
        },
        { authContext: authorized }
      )
    ).resolves.toMatchObject({ publishedRevisionId: draft.revisionId });

    const secondProduct = await createProduct();
    const ineligibleDraft = await saveProductStoryDraft(
      {
        productId: secondProduct,
        expectedDraftRevisionId: null,
        expectedPublishedRevisionId: null,
        document: [
          {
            blockId: "related-draft",
            type: "related_products",
            payload: { productIds: [draftOnlyRelated] },
          },
        ],
        mutationRequestId: randomUUID(),
      },
      { authContext: authorized }
    );
    await expect(
      publishProductStory(
        {
          productId: secondProduct,
          expectedDraftRevisionId: ineligibleDraft.revisionId,
          expectedPublishedRevisionId: null,
          mutationRequestId: randomUUID(),
        },
        { authContext: authorized }
      )
    ).rejects.toBeInstanceOf(StoryValidationError);

    for (const relatedProductId of [secondProduct, randomUUID()]) {
      await expect(
        saveProductStoryDraft(
          {
            productId: secondProduct,
            expectedDraftRevisionId: ineligibleDraft.revisionId,
            expectedPublishedRevisionId: null,
            document: [
              {
                blockId: "invalid-related",
                type: "related_products",
                payload: { productIds: [relatedProductId] },
              },
            ],
            mutationRequestId: randomUUID(),
          },
          { authContext: authorized }
        )
      ).rejects.toBeInstanceOf(StoryValidationError);
    }
  });

  it("discards only the current draft and leaves the published pointer unchanged", async () => {
    const productId = await createProduct();
    const first = await firstDraft(productId);
    const published = await publishProductStory(
      {
        productId,
        expectedDraftRevisionId: first.revisionId,
        expectedPublishedRevisionId: null,
        mutationRequestId: randomUUID(),
      },
      { authContext: authorized }
    );
    const second = await saveProductStoryDraft(
      {
        productId,
        expectedDraftRevisionId: null,
        expectedPublishedRevisionId: published.revisionId,
        document: heroDocument("Nuevo borrador"),
        mutationRequestId: randomUUID(),
      },
      { authContext: authorized }
    );
    const discarded = await discardProductStoryDraft(
      {
        productId,
        expectedDraftRevisionId: second.revisionId,
        expectedPublishedRevisionId: published.revisionId,
        mutationRequestId: randomUUID(),
      },
      { authContext: authorized }
    );
    expect(discarded).toMatchObject({
      draftRevisionId: null,
      publishedRevisionId: published.revisionId,
    });
    const rows = await pgSql`
      SELECT status FROM product_story_revisions WHERE id = ${second.revisionId}
    `;
    expect(rows[0]?.status).toBe("ARCHIVED");
  });

  it("replays discard exactly and rejects a fresh stale discard", async () => {
    const productId = await createProduct();
    const draft = await firstDraft(productId);
    const input = {
      productId,
      expectedDraftRevisionId: draft.revisionId,
      expectedPublishedRevisionId: null,
      mutationRequestId: randomUUID(),
    };
    const discarded = await discardProductStoryDraft(input, { authContext: authorized });
    const replay = await discardProductStoryDraft(input, { authContext: authorized });
    expect(replay).toMatchObject({ revisionId: discarded.revisionId, replayed: true });

    const replacement = await firstDraft(productId);
    await expect(
      discardProductStoryDraft(
        { ...input, mutationRequestId: randomUUID() },
        { authContext: authorized }
      )
    ).rejects.toBeInstanceOf(StoryStaleWriteError);
    const counts = await pgSql`
      SELECT
        (SELECT COUNT(*)::int FROM product_story_revisions WHERE product_id = ${productId}) AS revisions,
        (SELECT COUNT(*)::int FROM audit_events WHERE actor_id = ${fixture.actorId}
          AND action = 'catalog:story:draft_discard') AS discard_audits
    `;
    expect(counts[0]).toEqual({ revisions: 2, discard_audits: 1 });
    expect(replacement.draftRevisionId).toBe(replacement.revisionId);
  });

  it.each(["after_discard_archive", "after_pointer_update", "before_audit_insert"] as const)(
    "rolls back discard at %s",
    async (faultPoint) => {
      const productId = await createProduct();
      const draft = await firstDraft(productId);
      await expect(
        discardProductStoryDraft(
          {
            productId,
            expectedDraftRevisionId: draft.revisionId,
            expectedPublishedRevisionId: null,
            mutationRequestId: randomUUID(),
          },
          {
            authContext: authorized,
            faultInjector: (point) => {
              if (point === faultPoint) throw new Error("discard rollback");
            },
          }
        )
      ).rejects.toThrow("discard rollback");
      const state = await pgSql`
        SELECT stories.draft_revision_id, revisions.status
        FROM product_stories AS stories
        INNER JOIN product_story_revisions AS revisions ON revisions.id = stories.draft_revision_id
        WHERE stories.product_id = ${productId}
      `;
      expect(state[0]).toEqual({ draft_revision_id: draft.revisionId, status: "DRAFT" });
    }
  );

  it("publishes exact current drafts, archives the prior publication, and replays safely", async () => {
    const productId = await createProduct();
    const first = await firstDraft(productId);
    const firstPublishRequestId = randomUUID();
    const firstPublishInput = {
      productId,
      expectedDraftRevisionId: first.revisionId,
      expectedPublishedRevisionId: null,
      mutationRequestId: firstPublishRequestId,
    };
    const firstPublished = await publishProductStory(firstPublishInput, {
      authContext: authorized,
    });
    const replay = await publishProductStory(firstPublishInput, { authContext: authorized });
    expect(replay).toMatchObject({ revisionId: first.revisionId, replayed: true });

    const second = await saveProductStoryDraft(
      {
        productId,
        expectedDraftRevisionId: null,
        expectedPublishedRevisionId: firstPublished.revisionId,
        document: heroDocument("Reemplazo publicado"),
        mutationRequestId: randomUUID(),
      },
      { authContext: authorized }
    );
    const secondPublished = await publishProductStory(
      {
        productId,
        expectedDraftRevisionId: second.revisionId,
        expectedPublishedRevisionId: firstPublished.revisionId,
        mutationRequestId: randomUUID(),
      },
      { authContext: authorized }
    );
    expect(secondPublished).toMatchObject({
      draftRevisionId: null,
      publishedRevisionId: second.revisionId,
    });
    expect(secondPublished.publishedAt).not.toBeNull();
    const rows = await pgSql`
      SELECT id, status, published_at FROM product_story_revisions
      WHERE product_id = ${productId} ORDER BY revision_number
    `;
    expect(rows[0]?.status).toBe("ARCHIVED");
    expect(rows[1]).toMatchObject({ id: second.revisionId, status: "PUBLISHED" });
    expect(rows.filter((row) => row.status === "PUBLISHED")).toHaveLength(1);
  });

  it("rejects empty and stale publication with zero lifecycle mutation", async () => {
    const productId = await createProduct();
    const empty = await saveProductStoryDraft(
      {
        productId,
        expectedDraftRevisionId: null,
        expectedPublishedRevisionId: null,
        document: [],
        mutationRequestId: randomUUID(),
      },
      { authContext: authorized }
    );
    await expect(
      publishProductStory(
        {
          productId,
          expectedDraftRevisionId: empty.revisionId,
          expectedPublishedRevisionId: null,
          mutationRequestId: randomUUID(),
        },
        { authContext: authorized }
      )
    ).rejects.toBeInstanceOf(StoryValidationError);

    const newer = await saveProductStoryDraft(
      {
        productId,
        expectedDraftRevisionId: empty.revisionId,
        expectedPublishedRevisionId: null,
        document: heroDocument("Publicable"),
        mutationRequestId: randomUUID(),
      },
      { authContext: authorized }
    );
    await expect(
      publishProductStory(
        {
          productId,
          expectedDraftRevisionId: empty.revisionId,
          expectedPublishedRevisionId: null,
          mutationRequestId: randomUUID(),
        },
        { authContext: authorized }
      )
    ).rejects.toBeInstanceOf(StoryStaleWriteError);
    const aggregate = await pgSql`
      SELECT draft_revision_id, published_revision_id FROM product_stories WHERE product_id = ${productId}
    `;
    expect(aggregate[0]).toEqual({
      draft_revision_id: newer.revisionId,
      published_revision_id: null,
    });
  });

  it("unpublishes atomically while preserving an independent current draft", async () => {
    const productId = await createProduct();
    const first = await firstDraft(productId);
    const published = await publishProductStory(
      {
        productId,
        expectedDraftRevisionId: first.revisionId,
        expectedPublishedRevisionId: null,
        mutationRequestId: randomUUID(),
      },
      { authContext: authorized }
    );
    const draft = await saveProductStoryDraft(
      {
        productId,
        expectedDraftRevisionId: null,
        expectedPublishedRevisionId: published.revisionId,
        document: heroDocument("Trabajo independiente"),
        mutationRequestId: randomUUID(),
      },
      { authContext: authorized }
    );
    const unpublished = await unpublishProductStory(
      {
        productId,
        expectedDraftRevisionId: draft.revisionId,
        expectedPublishedRevisionId: published.revisionId,
        mutationRequestId: randomUUID(),
      },
      { authContext: authorized }
    );
    expect(unpublished).toMatchObject({
      draftRevisionId: draft.revisionId,
      publishedRevisionId: null,
    });
    const aggregate = await pgSql`
      SELECT draft_revision_id, published_revision_id FROM product_stories WHERE product_id = ${productId}
    `;
    expect(aggregate[0]).toEqual({
      draft_revision_id: draft.revisionId,
      published_revision_id: null,
    });
  });

  it("replays unpublish exactly and rejects a fresh stale unpublish", async () => {
    const productId = await createProduct();
    const first = await firstDraft(productId);
    const published = await publishProductStory(
      {
        productId,
        expectedDraftRevisionId: first.revisionId,
        expectedPublishedRevisionId: null,
        mutationRequestId: randomUUID(),
      },
      { authContext: authorized }
    );
    const input = {
      productId,
      expectedDraftRevisionId: null,
      expectedPublishedRevisionId: published.revisionId,
      mutationRequestId: randomUUID(),
    };
    const firstResult = await unpublishProductStory(input, { authContext: authorized });
    const replay = await unpublishProductStory(input, { authContext: authorized });
    expect(replay).toMatchObject({ revisionId: firstResult.revisionId, replayed: true });

    const nextDraft = await firstDraft(productId);
    const nextPublished = await publishProductStory(
      {
        productId,
        expectedDraftRevisionId: nextDraft.revisionId,
        expectedPublishedRevisionId: null,
        mutationRequestId: randomUUID(),
      },
      { authContext: authorized }
    );
    await expect(
      unpublishProductStory(
        { ...input, mutationRequestId: randomUUID() },
        { authContext: authorized }
      )
    ).rejects.toBeInstanceOf(StoryStaleWriteError);
    expect(nextPublished.publishedRevisionId).toBe(nextDraft.revisionId);
  });

  it.each(["after_unpublish_archive", "after_pointer_update", "before_audit_insert"] as const)(
    "rolls back unpublish at %s",
    async (faultPoint) => {
      const productId = await createProduct();
      const draft = await firstDraft(productId);
      const published = await publishProductStory(
        {
          productId,
          expectedDraftRevisionId: draft.revisionId,
          expectedPublishedRevisionId: null,
          mutationRequestId: randomUUID(),
        },
        { authContext: authorized }
      );
      await expect(
        unpublishProductStory(
          {
            productId,
            expectedDraftRevisionId: null,
            expectedPublishedRevisionId: published.revisionId,
            mutationRequestId: randomUUID(),
          },
          {
            authContext: authorized,
            faultInjector: (point) => {
              if (point === faultPoint) throw new Error("unpublish rollback");
            },
          }
        )
      ).rejects.toThrow("unpublish rollback");
      const state = await pgSql`
        SELECT stories.published_revision_id, revisions.status
        FROM product_stories AS stories
        INNER JOIN product_story_revisions AS revisions
          ON revisions.id = stories.published_revision_id
        WHERE stories.product_id = ${productId}
      `;
      expect(state[0]).toEqual({
        published_revision_id: published.revisionId,
        status: "PUBLISHED",
      });
    }
  );

  it("enforces catalog:manage versus catalog:publish and rejects cross-Product pointer attempts", async () => {
    const productId = await createProduct();
    await expect(firstDraft(productId)).resolves.toMatchObject({ revisionNumber: 1 });
    const aggregate = await pgSql`
      SELECT draft_revision_id FROM product_stories WHERE product_id = ${productId}
    `;
    const revisionId = aggregate[0]?.draft_revision_id;

    await expect(
      saveProductStoryDraft(
        {
          productId,
          expectedDraftRevisionId: revisionId,
          expectedPublishedRevisionId: null,
          document: heroDocument(),
          mutationRequestId: randomUUID(),
        },
        { authContext: publishOnly }
      )
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      publishProductStory(
        {
          productId,
          expectedDraftRevisionId: revisionId,
          expectedPublishedRevisionId: null,
          mutationRequestId: randomUUID(),
        },
        { authContext: manageOnly }
      )
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      getAdminProductStory(productId, { authContext: noCatalogPermission })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    const otherProductId = await createProduct();
    const otherDraft = await firstDraft(otherProductId);
    await expect(
      discardProductStoryDraft(
        {
          productId,
          expectedDraftRevisionId: otherDraft.revisionId,
          expectedPublishedRevisionId: null,
          mutationRequestId: randomUUID(),
        },
        { authContext: authorized }
      )
    ).rejects.toBeInstanceOf(StoryStaleWriteError);
  });

  it.each([
    "after_published_archive",
    "after_publish_promotion",
    "after_pointer_update",
    "before_audit_insert",
  ] as const)("rolls back publication at %s", async (faultPoint) => {
    const productId = await createProduct();
    const firstDraftResult = await firstDraft(productId);
    const firstPublished = await publishProductStory(
      {
        productId,
        expectedDraftRevisionId: firstDraftResult.revisionId,
        expectedPublishedRevisionId: null,
        mutationRequestId: randomUUID(),
      },
      { authContext: authorized }
    );
    const draft = await saveProductStoryDraft(
      {
        productId,
        expectedDraftRevisionId: null,
        expectedPublishedRevisionId: firstPublished.revisionId,
        document: heroDocument("Reemplazo transaccional"),
        mutationRequestId: randomUUID(),
      },
      { authContext: authorized }
    );
    await expect(
      publishProductStory(
        {
          productId,
          expectedDraftRevisionId: draft.revisionId,
          expectedPublishedRevisionId: firstPublished.revisionId,
          mutationRequestId: randomUUID(),
        },
        {
          authContext: authorized,
          faultInjector: (point) => {
            if (point === faultPoint) {
              throw new Error("audit injection");
            }
          },
        }
      )
    ).rejects.toThrow("audit injection");
    const revisions = await pgSql`
      SELECT id, status, published_at FROM product_story_revisions
      WHERE id IN (${draft.revisionId}, ${firstPublished.revisionId}) ORDER BY id
    `;
    const aggregate = await pgSql`
      SELECT draft_revision_id, published_revision_id FROM product_stories WHERE product_id = ${productId}
    `;
    expect(revisions).toContainEqual({
      id: draft.revisionId,
      status: "DRAFT",
      published_at: null,
    });
    expect(revisions).toContainEqual(
      expect.objectContaining({ id: firstPublished.revisionId, status: "PUBLISHED" })
    );
    expect(aggregate[0]).toEqual({
      draft_revision_id: draft.revisionId,
      published_revision_id: firstPublished.revisionId,
    });
  });
});
