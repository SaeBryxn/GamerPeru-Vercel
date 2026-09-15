import "server-only";

import { sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { generateUuidV7 } from "@/db/utils/uuid";
import { validateStoryBlocks } from "@/lib/catalog/story-validation";
import { requirePermission, type VerifiedAuthContextReady } from "@/lib/auth/rbac";
import {
  computeMutationRequestDigest,
  computeRequestFingerprint,
  createCatalogAdvisoryLockKey,
} from "./crypto";
import {
  CatalogDomainError,
  CatalogIdempotencyConflictError,
  CatalogReplayIntegrityError,
} from "./types";
import {
  resolveAuthoringStoryDocument,
  validatePersistedStoryReferences,
} from "./story-references";
import {
  validateAuthoringStoryDocument,
  validatePersistedStoryDocument,
  type StrictPersistedStoryDocument,
} from "./story-validation";

export type StoryFaultPoint =
  | "after_draft_archive"
  | "after_revision_insert"
  | "after_pointer_update"
  | "after_discard_archive"
  | "after_published_archive"
  | "after_publish_promotion"
  | "after_unpublish_archive"
  | "before_audit_insert";

export interface StoryServiceOptions {
  authContext?: VerifiedAuthContextReady;
  faultInjector?: (point: StoryFaultPoint) => void | Promise<void>;
}

export interface SaveProductStoryDraftInput {
  productId: string;
  expectedDraftRevisionId: string | null;
  expectedPublishedRevisionId: string | null;
  document: unknown;
  mutationRequestId: string;
}

export interface StoryPointerMutationInput {
  productId: string;
  expectedDraftRevisionId: string | null;
  expectedPublishedRevisionId: string | null;
  mutationRequestId: string;
}

export interface PublishProductStoryInput extends StoryPointerMutationInput {
  expectedDraftRevisionId: string;
}

export interface StoryMutationResult {
  productId: string;
  productSlug: string;
  revisionId: string;
  revisionNumber: number;
  draftRevisionId: string | null;
  publishedRevisionId: string | null;
  publishedAt: string | null;
  replayed: boolean;
}

export class StoryStaleWriteError extends CatalogDomainError {
  readonly currentDraftRevisionId: string | null;
  readonly currentPublishedRevisionId: string | null;

  constructor(currentDraftRevisionId: string | null, currentPublishedRevisionId: string | null) {
    super(
      "La historia cambió desde que se abrió el editor. Recarga la versión actual antes de continuar.",
      "STORY_STALE_WRITE",
      409
    );
    this.name = "StoryStaleWriteError";
    this.currentDraftRevisionId = currentDraftRevisionId;
    this.currentPublishedRevisionId = currentPublishedRevisionId;
  }
}

export class StoryLifecycleIntegrityError extends CatalogDomainError {
  constructor() {
    super(
      "El estado interno de la historia no es consistente.",
      "STORY_LIFECYCLE_INTEGRITY_ERROR",
      500
    );
    this.name = "StoryLifecycleIntegrityError";
  }
}

interface ProductLockRow {
  id: string;
  slug: string;
}

interface StoryAggregateRow {
  product_id: string;
  draft_revision_id: string | null;
  published_revision_id: string | null;
  updated_at: Date | string;
}

interface StoryRevisionRow {
  id: string;
  product_id: string;
  revision_number: number;
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  blocks: unknown;
  published_at: Date | string | null;
}

interface ReplayAuditRow {
  target_type: string;
  target_id: string;
  metadata: unknown;
}

interface ReplayMetadata {
  mutation_request_digest: string;
  request_fingerprint: string;
  product_id: string;
  revision_id: string;
  revision_number: number;
  result_draft_revision_id: string | null;
  result_published_revision_id: string | null;
  result_published_at: string | null;
}

type StoryTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

const UuidSchema = z.string().uuid();
const NullableUuidSchema = UuidSchema.nullable();
const MutationRequestIdSchema = z.string().uuid();

const SaveDraftInputSchema = z
  .object({
    productId: UuidSchema,
    expectedDraftRevisionId: NullableUuidSchema,
    expectedPublishedRevisionId: NullableUuidSchema,
    document: z.unknown(),
    mutationRequestId: MutationRequestIdSchema,
  })
  .strict();

const PointerMutationInputSchema = z
  .object({
    productId: UuidSchema,
    expectedDraftRevisionId: NullableUuidSchema,
    expectedPublishedRevisionId: NullableUuidSchema,
    mutationRequestId: MutationRequestIdSchema,
  })
  .strict();

const PublishInputSchema = PointerMutationInputSchema.extend({
  expectedDraftRevisionId: UuidSchema,
}).strict();

const ReplayMetadataSchema = z
  .object({
    mutation_request_digest: z.string().regex(/^[0-9a-f]{64}$/),
    request_fingerprint: z.string().regex(/^[0-9a-f]{64}$/),
    product_id: UuidSchema,
    revision_id: UuidSchema,
    revision_number: z.number().int().positive(),
    result_draft_revision_id: NullableUuidSchema,
    result_published_revision_id: NullableUuidSchema,
    result_published_at: z.string().datetime({ offset: true }).nullable(),
  })
  .passthrough();

function invalidRequest(): CatalogDomainError {
  return new CatalogDomainError(
    "La solicitud de historia no tiene una estructura válida.",
    "STORY_INVALID_REQUEST",
    422
  );
}

function parseInput<TSchema extends z.ZodTypeAny>(
  schema: TSchema,
  input: unknown
): z.infer<TSchema> {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw invalidRequest();
  }
  return result.data;
}

async function resolveActor(
  permission: "catalog:manage" | "catalog:publish",
  options?: StoryServiceOptions
): Promise<VerifiedAuthContextReady> {
  if (options?.authContext) {
    if (!options.authContext.permissions.has(permission)) {
      throw new CatalogDomainError(
        "No tienes permisos para realizar esta operación de historia.",
        "FORBIDDEN",
        403
      );
    }
    return options.authContext;
  }
  return requirePermission(permission);
}

async function injectFault(options: StoryServiceOptions | undefined, point: StoryFaultPoint) {
  await options?.faultInjector?.(point);
}

function sqlUuidList(values: readonly string[]): SQL {
  return sql.join(
    values.map((value) => sql`${value}::uuid`),
    sql`, `
  );
}

async function acquireReplayLock(tx: StoryTransaction, digest: string): Promise<void> {
  const lockKey = createCatalogAdvisoryLockKey(digest);
  await tx.execute(sql`SELECT pg_advisory_xact_lock(${lockKey}::bigint)`);
}

async function lockProduct(tx: StoryTransaction, productId: string): Promise<ProductLockRow> {
  const rows = (await tx.execute(sql`
    SELECT id, slug
    FROM products
    WHERE id = ${productId}::uuid
    FOR UPDATE;
  `)) as unknown as ProductLockRow[];
  const product = rows[0];
  if (!product) {
    throw new CatalogDomainError("El producto solicitado no existe.", "PRODUCT_NOT_FOUND", 404);
  }
  return product;
}

async function lockStoryAggregate(
  tx: StoryTransaction,
  productId: string,
  createIfMissing: boolean
): Promise<StoryAggregateRow> {
  if (createIfMissing) {
    await tx.execute(sql`
      INSERT INTO product_stories (product_id, published_revision_id, draft_revision_id, updated_at)
      VALUES (${productId}::uuid, NULL, NULL, NOW())
      ON CONFLICT (product_id) DO NOTHING;
    `);
  }

  const rows = (await tx.execute(sql`
    SELECT product_id, draft_revision_id, published_revision_id, updated_at
    FROM product_stories
    WHERE product_id = ${productId}::uuid
    FOR UPDATE;
  `)) as unknown as StoryAggregateRow[];
  const aggregate = rows[0];
  if (!aggregate) {
    throw new CatalogDomainError(
      "El producto todavía no tiene una historia guardada.",
      "PRODUCT_STORY_NOT_FOUND",
      404
    );
  }
  return aggregate;
}

async function lockReferencedRevisions(
  tx: StoryTransaction,
  aggregate: StoryAggregateRow
): Promise<Map<string, StoryRevisionRow>> {
  const ids = [aggregate.draft_revision_id, aggregate.published_revision_id].filter(
    (value): value is string => value !== null
  );
  if (ids.length === 0) {
    return new Map();
  }

  const rows = (await tx.execute(sql`
    SELECT id, product_id, revision_number, status, blocks, published_at
    FROM product_story_revisions
    WHERE id IN (${sqlUuidList(ids)})
    ORDER BY id
    FOR UPDATE;
  `)) as unknown as StoryRevisionRow[];
  return new Map(rows.map((row) => [row.id, row]));
}

function assertAggregateIntegrity(
  aggregate: StoryAggregateRow,
  revisions: ReadonlyMap<string, StoryRevisionRow>
): void {
  if (aggregate.draft_revision_id !== null) {
    const draft = revisions.get(aggregate.draft_revision_id);
    if (!draft || draft.product_id !== aggregate.product_id || draft.status !== "DRAFT") {
      throw new StoryLifecycleIntegrityError();
    }
  }
  if (aggregate.published_revision_id !== null) {
    const published = revisions.get(aggregate.published_revision_id);
    if (
      !published ||
      published.product_id !== aggregate.product_id ||
      published.status !== "PUBLISHED" ||
      published.published_at === null
    ) {
      throw new StoryLifecycleIntegrityError();
    }
  }
  if (
    aggregate.draft_revision_id !== null &&
    aggregate.draft_revision_id === aggregate.published_revision_id
  ) {
    throw new StoryLifecycleIntegrityError();
  }
}

function assertExpectedPointers(
  aggregate: StoryAggregateRow,
  expectedDraftRevisionId: string | null,
  expectedPublishedRevisionId: string | null
): void {
  if (
    aggregate.draft_revision_id !== expectedDraftRevisionId ||
    aggregate.published_revision_id !== expectedPublishedRevisionId
  ) {
    throw new StoryStaleWriteError(aggregate.draft_revision_id, aggregate.published_revision_id);
  }
}

async function assertPublishedRevisionAuthority(
  tx: StoryTransaction,
  aggregate: StoryAggregateRow
): Promise<void> {
  const publishedRows = (await tx.execute(sql`
    SELECT id
    FROM product_story_revisions
    WHERE product_id = ${aggregate.product_id}::uuid
      AND status = 'PUBLISHED'
    ORDER BY id
    FOR UPDATE;
  `)) as unknown as { id: string }[];

  const authoritativePublishedId = aggregate.published_revision_id;
  if (
    (authoritativePublishedId === null && publishedRows.length !== 0) ||
    (authoritativePublishedId !== null &&
      (publishedRows.length !== 1 || publishedRows[0]?.id !== authoritativePublishedId))
  ) {
    throw new StoryLifecycleIntegrityError();
  }
}

function parseReplayMetadata(metadata: unknown): ReplayMetadata {
  const result = ReplayMetadataSchema.safeParse(metadata);
  if (!result.success) {
    throw new CatalogReplayIntegrityError();
  }
  return result.data;
}

function assertReplayResultShape(action: string, metadata: ReplayMetadata): void {
  const publicationFieldsAgree =
    (metadata.result_published_revision_id === null) === (metadata.result_published_at === null);
  if (!publicationFieldsAgree) {
    throw new CatalogReplayIntegrityError();
  }

  switch (action) {
    case "catalog:story:draft_save":
      if (metadata.result_draft_revision_id !== metadata.revision_id) {
        throw new CatalogReplayIntegrityError();
      }
      return;
    case "catalog:story:draft_discard":
      if (metadata.result_draft_revision_id !== null) {
        throw new CatalogReplayIntegrityError();
      }
      return;
    case "catalog:story:publish":
      if (
        metadata.result_draft_revision_id !== null ||
        metadata.result_published_revision_id !== metadata.revision_id ||
        metadata.result_published_at === null
      ) {
        throw new CatalogReplayIntegrityError();
      }
      return;
    case "catalog:story:unpublish":
      if (metadata.result_published_revision_id !== null || metadata.result_published_at !== null) {
        throw new CatalogReplayIntegrityError();
      }
      return;
    default:
      throw new CatalogReplayIntegrityError();
  }
}

async function resolveReplay(
  tx: StoryTransaction,
  input: {
    actorId: string;
    action: string;
    digest: string;
    fingerprint: string;
    product: ProductLockRow;
  }
): Promise<StoryMutationResult | null> {
  const auditRows = (await tx.execute(sql`
    SELECT target_type, target_id, metadata
    FROM audit_events
    WHERE actor_id = ${input.actorId}
      AND action = ${input.action}
      AND metadata->>'mutation_request_digest' = ${input.digest}
    ORDER BY timestamp DESC, id DESC
    LIMIT 2;
  `)) as unknown as ReplayAuditRow[];

  if (auditRows.length > 1) {
    throw new CatalogReplayIntegrityError();
  }
  const audit = auditRows[0];
  if (!audit) {
    return null;
  }
  const metadata = parseReplayMetadata(audit.metadata);
  if (metadata.request_fingerprint !== input.fingerprint) {
    throw new CatalogIdempotencyConflictError();
  }
  assertReplayResultShape(input.action, metadata);
  if (
    audit.target_type !== "product_story_revision" ||
    audit.target_id !== metadata.revision_id ||
    metadata.product_id !== input.product.id ||
    metadata.mutation_request_digest !== input.digest
  ) {
    throw new CatalogReplayIntegrityError();
  }

  const targetRows = (await tx.execute(sql`
    SELECT id, product_id, revision_number
    FROM product_story_revisions
    WHERE id = ${metadata.revision_id}::uuid
    FOR SHARE;
  `)) as unknown as { id: string; product_id: string; revision_number: number }[];
  const target = targetRows[0];
  if (
    !target ||
    target.product_id !== input.product.id ||
    Number(target.revision_number) !== metadata.revision_number
  ) {
    throw new CatalogReplayIntegrityError();
  }

  return {
    productId: input.product.id,
    productSlug: input.product.slug,
    revisionId: metadata.revision_id,
    revisionNumber: metadata.revision_number,
    draftRevisionId: metadata.result_draft_revision_id,
    publishedRevisionId: metadata.result_published_revision_id,
    publishedAt: metadata.result_published_at,
    replayed: true,
  };
}

async function insertAuditMarker(
  tx: StoryTransaction,
  input: {
    actorId: string;
    action: string;
    digest: string;
    fingerprint: string;
    productId: string;
    revisionId: string;
    revisionNumber: number;
    draftRevisionId: string | null;
    publishedRevisionId: string | null;
    publishedAt: string | null;
    priorDraftRevisionId: string | null;
    priorPublishedRevisionId: string | null;
    blockCount: number;
    fromStatus: string | null;
    toStatus: string;
  }
): Promise<void> {
  const metadata: ReplayMetadata & Record<string, unknown> = {
    mutation_request_digest: input.digest,
    request_fingerprint: input.fingerprint,
    product_id: input.productId,
    revision_id: input.revisionId,
    revision_number: input.revisionNumber,
    result_draft_revision_id: input.draftRevisionId,
    result_published_revision_id: input.publishedRevisionId,
    result_published_at: input.publishedAt,
    prior_draft_revision_id: input.priorDraftRevisionId,
    prior_published_revision_id: input.priorPublishedRevisionId,
    block_count: input.blockCount,
    from_status: input.fromStatus,
    to_status: input.toStatus,
  };

  await tx.execute(sql`
    INSERT INTO audit_events (
      id, timestamp, actor_type, actor_id, action, target_type, target_id, metadata, request_id
    ) VALUES (
      ${generateUuidV7()}::uuid,
      NOW(),
      'ADMIN',
      ${input.actorId},
      ${input.action},
      'product_story_revision',
      ${input.revisionId},
      ${JSON.stringify(metadata)}::jsonb,
      NULL
    );
  `);
}

function publishedAtIso(value: Date | string | null): string | null {
  if (value === null) {
    return null;
  }
  return new Date(value).toISOString();
}

async function nextRevisionNumber(tx: StoryTransaction, productId: string): Promise<number> {
  const rows = (await tx.execute(sql`
    SELECT COALESCE(MAX(revision_number), 0) + 1 AS next_revision_number
    FROM product_story_revisions
    WHERE product_id = ${productId}::uuid;
  `)) as unknown as { next_revision_number: number | string }[];
  const next = Number(rows[0]?.next_revision_number);
  if (!Number.isInteger(next) || next < 1) {
    throw new StoryLifecycleIntegrityError();
  }
  return next;
}

function buildResult(
  product: ProductLockRow,
  revision: StoryRevisionRow,
  draftRevisionId: string | null,
  publishedRevisionId: string | null,
  publishedAt: Date | string | null
): StoryMutationResult {
  return {
    productId: product.id,
    productSlug: product.slug,
    revisionId: revision.id,
    revisionNumber: Number(revision.revision_number),
    draftRevisionId,
    publishedRevisionId,
    publishedAt: publishedAtIso(publishedAt),
    replayed: false,
  };
}

export async function saveProductStoryDraft(
  rawInput: SaveProductStoryDraftInput,
  options?: StoryServiceOptions
): Promise<StoryMutationResult> {
  const actor = await resolveActor("catalog:manage", options);
  const input = parseInput(SaveDraftInputSchema, rawInput);
  const normalizedDocument = validateAuthoringStoryDocument(input.document, { allowEmpty: true });
  const action = "catalog:story:draft_save";
  const digest = computeMutationRequestDigest(actor.authUserId, action, input.mutationRequestId);
  const fingerprint = computeRequestFingerprint({
    productId: input.productId,
    expectedDraftRevisionId: input.expectedDraftRevisionId,
    expectedPublishedRevisionId: input.expectedPublishedRevisionId,
    document: normalizedDocument,
  });

  return db.transaction(async (tx) => {
    await acquireReplayLock(tx, digest);
    const product = await lockProduct(tx, input.productId);
    const aggregate = await lockStoryAggregate(tx, input.productId, true);
    const currentRevisions = await lockReferencedRevisions(tx, aggregate);
    assertAggregateIntegrity(aggregate, currentRevisions);

    const replay = await resolveReplay(tx, {
      actorId: actor.authUserId,
      action,
      digest,
      fingerprint,
      product,
    });
    if (replay) {
      return replay;
    }

    assertExpectedPointers(
      aggregate,
      input.expectedDraftRevisionId,
      input.expectedPublishedRevisionId
    );
    const strictDocument = validateAuthoringStoryDocument(input.document, { allowEmpty: true });
    const persistedDocument = await resolveAuthoringStoryDocument(
      tx,
      input.productId,
      strictDocument,
      { requirePublicRelatedProducts: false }
    );
    const revisionNumber = await nextRevisionNumber(tx, input.productId);

    if (aggregate.draft_revision_id !== null) {
      const archivedRows = (await tx.execute(sql`
        UPDATE product_story_revisions
        SET status = 'ARCHIVED'
        WHERE id = ${aggregate.draft_revision_id}::uuid
          AND product_id = ${input.productId}::uuid
          AND status = 'DRAFT'
        RETURNING id;
      `)) as unknown as { id: string }[];
      if (archivedRows.length !== 1) {
        throw new StoryLifecycleIntegrityError();
      }
      await injectFault(options, "after_draft_archive");
    }

    const revisionId = generateUuidV7();
    const insertedRows = (await tx.execute(sql`
      INSERT INTO product_story_revisions (
        id, product_id, revision_number, status, blocks, published_at,
        created_by_auth_user_id, created_at
      ) VALUES (
        ${revisionId}::uuid,
        ${input.productId}::uuid,
        ${revisionNumber},
        'DRAFT',
        ${JSON.stringify(persistedDocument)}::jsonb,
        NULL,
        ${actor.authUserId}::uuid,
        NOW()
      )
      RETURNING id, product_id, revision_number, status, blocks, published_at;
    `)) as unknown as StoryRevisionRow[];
    const inserted = insertedRows[0];
    if (!inserted) {
      throw new StoryLifecycleIntegrityError();
    }
    await injectFault(options, "after_revision_insert");

    const updatedRows = (await tx.execute(sql`
      UPDATE product_stories
      SET draft_revision_id = ${revisionId}::uuid, updated_at = NOW()
      WHERE product_id = ${input.productId}::uuid
      RETURNING product_id;
    `)) as unknown as { product_id: string }[];
    if (updatedRows.length !== 1) {
      throw new StoryLifecycleIntegrityError();
    }
    await injectFault(options, "after_pointer_update");
    await injectFault(options, "before_audit_insert");

    await insertAuditMarker(tx, {
      actorId: actor.authUserId,
      action,
      digest,
      fingerprint,
      productId: input.productId,
      revisionId,
      revisionNumber,
      draftRevisionId: revisionId,
      publishedRevisionId: aggregate.published_revision_id,
      publishedAt:
        aggregate.published_revision_id === null
          ? null
          : publishedAtIso(
              currentRevisions.get(aggregate.published_revision_id)?.published_at ?? null
            ),
      priorDraftRevisionId: aggregate.draft_revision_id,
      priorPublishedRevisionId: aggregate.published_revision_id,
      blockCount: persistedDocument.length,
      fromStatus: aggregate.draft_revision_id === null ? null : "DRAFT",
      toStatus: "DRAFT",
    });

    return buildResult(
      product,
      inserted,
      revisionId,
      aggregate.published_revision_id,
      aggregate.published_revision_id === null
        ? null
        : (currentRevisions.get(aggregate.published_revision_id)?.published_at ?? null)
    );
  });
}

export async function discardProductStoryDraft(
  rawInput: StoryPointerMutationInput,
  options?: StoryServiceOptions
): Promise<StoryMutationResult> {
  const actor = await resolveActor("catalog:manage", options);
  const input = parseInput(PointerMutationInputSchema, rawInput);
  const action = "catalog:story:draft_discard";
  const digest = computeMutationRequestDigest(actor.authUserId, action, input.mutationRequestId);
  const fingerprint = computeRequestFingerprint({
    productId: input.productId,
    expectedDraftRevisionId: input.expectedDraftRevisionId,
    expectedPublishedRevisionId: input.expectedPublishedRevisionId,
  });

  return db.transaction(async (tx) => {
    await acquireReplayLock(tx, digest);
    const product = await lockProduct(tx, input.productId);
    const aggregate = await lockStoryAggregate(tx, input.productId, false);
    const currentRevisions = await lockReferencedRevisions(tx, aggregate);
    assertAggregateIntegrity(aggregate, currentRevisions);
    const replay = await resolveReplay(tx, {
      actorId: actor.authUserId,
      action,
      digest,
      fingerprint,
      product,
    });
    if (replay) {
      return replay;
    }
    assertExpectedPointers(
      aggregate,
      input.expectedDraftRevisionId,
      input.expectedPublishedRevisionId
    );

    if (aggregate.draft_revision_id === null) {
      throw new CatalogDomainError(
        "No existe un borrador activo para descartar.",
        "STORY_DRAFT_NOT_FOUND",
        404
      );
    }
    const draft = currentRevisions.get(aggregate.draft_revision_id);
    if (!draft) {
      throw new StoryLifecycleIntegrityError();
    }

    const archivedRows = (await tx.execute(sql`
      UPDATE product_story_revisions
      SET status = 'ARCHIVED'
      WHERE id = ${draft.id}::uuid
        AND product_id = ${input.productId}::uuid
        AND status = 'DRAFT'
      RETURNING id, product_id, revision_number, status, blocks, published_at;
    `)) as unknown as StoryRevisionRow[];
    const archived = archivedRows[0];
    if (!archived) {
      throw new StoryLifecycleIntegrityError();
    }
    await injectFault(options, "after_discard_archive");

    await tx.execute(sql`
      UPDATE product_stories
      SET draft_revision_id = NULL, updated_at = NOW()
      WHERE product_id = ${input.productId}::uuid;
    `);
    await injectFault(options, "after_pointer_update");
    await injectFault(options, "before_audit_insert");
    const publishedAt =
      aggregate.published_revision_id === null
        ? null
        : (currentRevisions.get(aggregate.published_revision_id)?.published_at ?? null);
    await insertAuditMarker(tx, {
      actorId: actor.authUserId,
      action,
      digest,
      fingerprint,
      productId: input.productId,
      revisionId: draft.id,
      revisionNumber: Number(draft.revision_number),
      draftRevisionId: null,
      publishedRevisionId: aggregate.published_revision_id,
      publishedAt: publishedAtIso(publishedAt),
      priorDraftRevisionId: draft.id,
      priorPublishedRevisionId: aggregate.published_revision_id,
      blockCount: Array.isArray(draft.blocks) ? draft.blocks.length : 0,
      fromStatus: "DRAFT",
      toStatus: "ARCHIVED",
    });

    return buildResult(product, archived, null, aggregate.published_revision_id, publishedAt);
  });
}

function assertRenderableDocument(document: StrictPersistedStoryDocument): void {
  const publicProjection = validateStoryBlocks(document);
  if (!publicProjection || publicProjection.length !== document.length) {
    throw new CatalogDomainError(
      "La historia no puede renderizarse completamente con el contrato público actual.",
      "STORY_NOT_RENDERABLE",
      422
    );
  }
}

export async function publishProductStory(
  rawInput: PublishProductStoryInput,
  options?: StoryServiceOptions
): Promise<StoryMutationResult> {
  const actor = await resolveActor("catalog:publish", options);
  const input = parseInput(PublishInputSchema, rawInput);
  const action = "catalog:story:publish";
  const digest = computeMutationRequestDigest(actor.authUserId, action, input.mutationRequestId);
  const fingerprint = computeRequestFingerprint({
    productId: input.productId,
    expectedDraftRevisionId: input.expectedDraftRevisionId,
    expectedPublishedRevisionId: input.expectedPublishedRevisionId,
  });

  return db.transaction(async (tx) => {
    await acquireReplayLock(tx, digest);
    const product = await lockProduct(tx, input.productId);
    const aggregate = await lockStoryAggregate(tx, input.productId, false);
    const currentRevisions = await lockReferencedRevisions(tx, aggregate);
    assertAggregateIntegrity(aggregate, currentRevisions);
    const replay = await resolveReplay(tx, {
      actorId: actor.authUserId,
      action,
      digest,
      fingerprint,
      product,
    });
    if (replay) {
      return replay;
    }
    await assertPublishedRevisionAuthority(tx, aggregate);
    assertExpectedPointers(
      aggregate,
      input.expectedDraftRevisionId,
      input.expectedPublishedRevisionId
    );

    const draft = currentRevisions.get(input.expectedDraftRevisionId);
    if (
      !draft ||
      draft.id !== aggregate.draft_revision_id ||
      draft.product_id !== input.productId ||
      draft.status !== "DRAFT"
    ) {
      throw new StoryLifecycleIntegrityError();
    }
    const strictDocument = validatePersistedStoryDocument(draft.blocks, { allowEmpty: false });
    await validatePersistedStoryReferences(tx, input.productId, strictDocument, {
      requirePublicRelatedProducts: true,
    });
    assertRenderableDocument(strictDocument);

    if (aggregate.published_revision_id !== null) {
      const archivedRows = (await tx.execute(sql`
        UPDATE product_story_revisions
        SET status = 'ARCHIVED'
        WHERE id = ${aggregate.published_revision_id}::uuid
          AND product_id = ${input.productId}::uuid
          AND status = 'PUBLISHED'
        RETURNING id;
      `)) as unknown as { id: string }[];
      if (archivedRows.length !== 1) {
        throw new StoryLifecycleIntegrityError();
      }
      await injectFault(options, "after_published_archive");
    }

    const publishedRows = (await tx.execute(sql`
      UPDATE product_story_revisions
      SET status = 'PUBLISHED', published_at = NOW()
      WHERE id = ${draft.id}::uuid
        AND product_id = ${input.productId}::uuid
        AND status = 'DRAFT'
      RETURNING id, product_id, revision_number, status, blocks, published_at;
    `)) as unknown as StoryRevisionRow[];
    const published = publishedRows[0];
    if (!published || published.published_at === null) {
      throw new StoryLifecycleIntegrityError();
    }
    await injectFault(options, "after_publish_promotion");

    await tx.execute(sql`
      UPDATE product_stories
      SET published_revision_id = ${draft.id}::uuid,
          draft_revision_id = NULL,
          updated_at = NOW()
      WHERE product_id = ${input.productId}::uuid;
    `);
    await injectFault(options, "after_pointer_update");
    await injectFault(options, "before_audit_insert");
    const publishedAt = publishedAtIso(published.published_at);
    await insertAuditMarker(tx, {
      actorId: actor.authUserId,
      action,
      digest,
      fingerprint,
      productId: input.productId,
      revisionId: draft.id,
      revisionNumber: Number(draft.revision_number),
      draftRevisionId: null,
      publishedRevisionId: draft.id,
      publishedAt,
      priorDraftRevisionId: draft.id,
      priorPublishedRevisionId: aggregate.published_revision_id,
      blockCount: strictDocument.length,
      fromStatus: "DRAFT",
      toStatus: "PUBLISHED",
    });

    return buildResult(product, published, null, draft.id, published.published_at);
  });
}

export async function unpublishProductStory(
  rawInput: StoryPointerMutationInput,
  options?: StoryServiceOptions
): Promise<StoryMutationResult> {
  const actor = await resolveActor("catalog:publish", options);
  const input = parseInput(PointerMutationInputSchema, rawInput);
  const action = "catalog:story:unpublish";
  const digest = computeMutationRequestDigest(actor.authUserId, action, input.mutationRequestId);
  const fingerprint = computeRequestFingerprint({
    productId: input.productId,
    expectedDraftRevisionId: input.expectedDraftRevisionId,
    expectedPublishedRevisionId: input.expectedPublishedRevisionId,
  });

  return db.transaction(async (tx) => {
    await acquireReplayLock(tx, digest);
    const product = await lockProduct(tx, input.productId);
    const aggregate = await lockStoryAggregate(tx, input.productId, false);
    const currentRevisions = await lockReferencedRevisions(tx, aggregate);
    assertAggregateIntegrity(aggregate, currentRevisions);
    const replay = await resolveReplay(tx, {
      actorId: actor.authUserId,
      action,
      digest,
      fingerprint,
      product,
    });
    if (replay) {
      return replay;
    }
    assertExpectedPointers(
      aggregate,
      input.expectedDraftRevisionId,
      input.expectedPublishedRevisionId
    );

    if (aggregate.published_revision_id === null) {
      throw new CatalogDomainError(
        "No existe una revisión publicada para retirar.",
        "STORY_PUBLISHED_REVISION_NOT_FOUND",
        404
      );
    }
    const published = currentRevisions.get(aggregate.published_revision_id);
    if (!published) {
      throw new StoryLifecycleIntegrityError();
    }

    const archivedRows = (await tx.execute(sql`
      UPDATE product_story_revisions
      SET status = 'ARCHIVED'
      WHERE id = ${published.id}::uuid
        AND product_id = ${input.productId}::uuid
        AND status = 'PUBLISHED'
      RETURNING id, product_id, revision_number, status, blocks, published_at;
    `)) as unknown as StoryRevisionRow[];
    const archived = archivedRows[0];
    if (!archived) {
      throw new StoryLifecycleIntegrityError();
    }
    await injectFault(options, "after_unpublish_archive");

    await tx.execute(sql`
      UPDATE product_stories
      SET published_revision_id = NULL, updated_at = NOW()
      WHERE product_id = ${input.productId}::uuid;
    `);
    await injectFault(options, "after_pointer_update");
    await injectFault(options, "before_audit_insert");
    await insertAuditMarker(tx, {
      actorId: actor.authUserId,
      action,
      digest,
      fingerprint,
      productId: input.productId,
      revisionId: published.id,
      revisionNumber: Number(published.revision_number),
      draftRevisionId: aggregate.draft_revision_id,
      publishedRevisionId: null,
      publishedAt: null,
      priorDraftRevisionId: aggregate.draft_revision_id,
      priorPublishedRevisionId: published.id,
      blockCount: Array.isArray(published.blocks) ? published.blocks.length : 0,
      fromStatus: "PUBLISHED",
      toStatus: "ARCHIVED",
    });

    return buildResult(product, archived, aggregate.draft_revision_id, null, null);
  });
}
