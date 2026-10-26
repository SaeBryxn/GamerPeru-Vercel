import "server-only";
import {
  featuredSlugsByOwner,
  hydrateHomeSelection,
  readHomeFeaturedProducts,
  writeFeaturedProducts,
} from "@/lib/catalog/featured-product-storage";

import { asc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  auditEvents,
  homeSectionMedia,
  homeSectionProducts,
  homeSections,
  mediaAssets,
  type HomeSectionType,
} from "@/db/schema";
import { requirePermission, type VerifiedAuthContextReady } from "@/lib/auth/rbac";
import { CatalogDomainError } from "@/lib/admin/catalog/types";
import { resolvePublicMediaUrl } from "@/lib/media/resolve-public-media-url";
import {
  HOME_CONTENT_SCHEMA_VERSION,
  homeSlotMediaType,
  listHomeSectionMediaSlots,
  parseHomeSectionContent,
  type HomeSection,
} from "./section-schemas";

/**
 * Operator writes to the home (ADR-012). Every write runs under one advisory lock, checks the
 * version the operator last read, validates the payload for its type, keeps
 * `home_section_media` equal to the media the payload references, and records the previous
 * state in the audit event so a change can be restored by hand.
 */

export interface HomeSectionsServiceOptions {
  authContext?: VerifiedAuthContextReady;
  database?: typeof db;
}

export interface AdminHomeSection {
  id: string;
  type: HomeSectionType;
  displayOrder: number;
  isVisible: boolean;
  version: number;
  /** Stored content; `contentValid` is false when it no longer matches the schema. */
  content: Record<string, unknown>;
  contentValid: boolean;
  updatedAt: string;
}

export interface AdminHomeMedia {
  url: string | null;
  mediaType: "IMAGE" | "VIDEO" | "DOCUMENT";
  mimeType: string;
  width: number | null;
  height: number | null;
}

export interface AdminHomeState {
  sections: AdminHomeSection[];
  media: Record<string, AdminHomeMedia>;
}

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Adds the editable brand strip without changing any existing home section. */
export async function createHomeSection(
  input: { type: "brand_strip"; expectedOrder: string[] },
  options?: HomeSectionsServiceOptions
): Promise<AdminHomeSection> {
  const actorId = await authorize(options);
  return (options?.database ?? db).transaction(async (tx) => {
    await lockHome(tx);
    const rows = await tx
      .select()
      .from(homeSections)
      .orderBy(asc(homeSections.displayOrder), asc(homeSections.id));
    if (
      rows.length !== input.expectedOrder.length ||
      rows.some((row, index) => row.id !== input.expectedOrder[index])
    )
      throw conflict();
    if (rows.some((row) => row.sectionType === "brand_strip")) throw conflict();
    const [row] = await tx
      .insert(homeSections)
      .values({
        sectionType: "brand_strip",
        displayOrder: Math.max(-1, ...rows.map((row) => row.displayOrder)) + 1,
        content: { title: "Nuestras marcas", items: [] },
        updatedByAuthUserId: actorId,
      })
      .returning();
    if (!row) throw new Error("No se pudo crear la secciÃ³n.");
    await tx.insert(auditEvents).values({
      actorType: "ADMIN",
      actorId,
      action: "home:section:create",
      targetType: "home_section",
      targetId: row.id,
      metadata: { section_type: row.sectionType },
    });
    return {
      id: row.id,
      type: row.sectionType,
      displayOrder: row.displayOrder,
      isVisible: row.isVisible,
      version: row.version,
      content: row.content,
      contentValid: true,
      updatedAt: row.updatedAt.toISOString(),
    };
  });
}

async function authorize(options?: HomeSectionsServiceOptions): Promise<string> {
  if (options?.authContext) {
    if (!options.authContext.permissions.has("catalog:manage")) {
      throw new CatalogDomainError(
        "No tienes permisos suficientes para realizar esta acciÃ³n.",
        "FORBIDDEN",
        403
      );
    }
    return options.authContext.authUserId;
  }
  return (await requirePermission("catalog:manage")).authUserId;
}

async function lockHome(tx: Transaction): Promise<void> {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('home_sections'))`);
}

function conflict(): CatalogDomainError {
  return new CatalogDomainError(
    "Otra persona cambiÃ³ el home mientras editabas. Recarga para ver la versiÃ³n actual.",
    "HOME_SECTION_CONFLICT",
    409
  );
}

async function lockedSection(tx: Transaction, sectionId: string, expectedVersion: number) {
  const [row] = await tx.select().from(homeSections).where(eq(homeSections.id, sectionId));
  if (!row) {
    throw new CatalogDomainError("La secciÃ³n no existe.", "HOME_SECTION_NOT_FOUND", 404);
  }
  if (row.version !== expectedVersion) throw conflict();
  return row;
}

/** Everything the editor shows, including hidden sections and the media they reference. */
export async function getAdminHomeState(
  options?: HomeSectionsServiceOptions
): Promise<AdminHomeState> {
  await authorize(options);
  const database = options?.database ?? db;

  const rows = await database
    .select()
    .from(homeSections)
    .orderBy(asc(homeSections.displayOrder), asc(homeSections.id));

  let featured = new Map<string, string[]>();
  try {
    featured = featuredSlugsByOwner(
      await readHomeFeaturedProducts(
        rows.map((row) => row.id),
        database
      )
    );
  } catch {
    /* Legacy payload until migration 0027. */
  }
  const sections: AdminHomeSection[] = rows.map((row) => ({
    id: row.id,
    type: row.sectionType,
    displayOrder: row.displayOrder,
    isVisible: row.isVisible,
    version: row.version,
    content: hydrateHomeSelection(row.content, featured.get(row.id)),
    contentValid:
      row.contentSchemaVersion === HOME_CONTENT_SCHEMA_VERSION &&
      parseHomeSectionContent(row.sectionType, row.content).success,
    updatedAt: row.updatedAt.toISOString(),
  }));

  const mediaRows =
    rows.length === 0
      ? []
      : await database
          .select({
            id: mediaAssets.id,
            objectKey: mediaAssets.objectKey,
            mediaType: mediaAssets.mediaType,
            mimeType: mediaAssets.mimeType,
            width: mediaAssets.width,
            height: mediaAssets.height,
          })
          .from(homeSectionMedia)
          .innerJoin(mediaAssets, eq(mediaAssets.id, homeSectionMedia.mediaAssetId))
          .where(
            inArray(
              homeSectionMedia.sectionId,
              rows.map((row) => row.id)
            )
          );

  const media: Record<string, AdminHomeMedia> = {};
  for (const asset of mediaRows) {
    media[asset.id] = {
      url: resolvePublicMediaUrl(asset.objectKey),
      mediaType: asset.mediaType,
      mimeType: asset.mimeType,
      width: asset.width,
      height: asset.height,
    };
  }
  return { sections, media };
}

/** Replaces a section's content after validating it and every media asset it references. */
export async function updateHomeSectionContent(
  input: { sectionId: string; expectedVersion: number; content: unknown },
  options?: HomeSectionsServiceOptions
): Promise<{ version: number }> {
  const actorId = await authorize(options);
  const database = options?.database ?? db;

  return database.transaction(async (tx) => {
    await lockHome(tx);
    const row = await lockedSection(tx, input.sectionId, input.expectedVersion);

    const parsed = parseHomeSectionContent(row.sectionType, input.content);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const where = issue?.path.length ? ` (${issue.path.join(".")})` : "";
      throw new CatalogDomainError(
        `El contenido no es vÃ¡lido${where}: ${issue?.message ?? "revisa los campos."}`,
        "HOME_SECTION_INVALID",
        422
      );
    }

    const section = { id: row.id, type: row.sectionType, content: parsed.data } as HomeSection;
    const slots = listHomeSectionMediaSlots(section);
    const assetIds = [...new Set(slots.values())];
    const assets =
      assetIds.length === 0
        ? []
        : await tx
            .select({
              id: mediaAssets.id,
              mediaType: mediaAssets.mediaType,
              securityClass: mediaAssets.securityClass,
            })
            .from(mediaAssets)
            .where(inArray(mediaAssets.id, assetIds));
    const byId = new Map(assets.map((asset) => [asset.id, asset]));
    for (const [slot, assetId] of slots) {
      const asset = byId.get(assetId);
      if (
        !asset ||
        asset.securityClass !== "PUBLIC_MEDIA" ||
        asset.mediaType !== homeSlotMediaType(slot)
      ) {
        throw new CatalogDomainError(
          "Uno de los archivos elegidos no existe o no es del tipo correcto.",
          "HOME_SECTION_MEDIA_INVALID",
          422
        );
      }
    }

    let storedContent = parsed.data;
    let previousFeaturedProducts: { productId: string; displayOrder: number }[] = [];
    if (
      (section.type === "product_carousel" || section.type === "catalog_rail") &&
      section.content.selection
    ) {
      const categorySlug =
        section.type === "catalog_rail"
          ? section.content.categorySlug
          : section.content.source.kind === "category"
            ? section.content.source.categorySlug
            : undefined;
      previousFeaturedProducts = await tx
        .select({
          productId: homeSectionProducts.productId,
          displayOrder: homeSectionProducts.displayOrder,
        })
        .from(homeSectionProducts)
        .where(eq(homeSectionProducts.sectionId, row.id))
        .orderBy(asc(homeSectionProducts.displayOrder));
      const selection = await writeFeaturedProducts(
        tx,
        { sectionId: row.id },
        section.content.selection,
        categorySlug
      );
      storedContent = { ...parsed.data, selection };
    }
    const version = row.version + 1;
    await tx
      .update(homeSections)
      .set({
        content: storedContent,
        contentSchemaVersion: HOME_CONTENT_SCHEMA_VERSION,
        version,
        updatedByAuthUserId: actorId,
        updatedAt: new Date(),
      })
      .where(eq(homeSections.id, row.id));

    await tx.delete(homeSectionMedia).where(eq(homeSectionMedia.sectionId, row.id));
    if (slots.size > 0) {
      await tx
        .insert(homeSectionMedia)
        .values(
          [...slots].map(([slot, mediaAssetId]) => ({ sectionId: row.id, slot, mediaAssetId }))
        );
    }

    await tx.insert(auditEvents).values({
      actorType: "ADMIN",
      actorId,
      action: "home:section:update",
      targetType: "home_section",
      targetId: row.id,
      metadata: {
        section_type: row.sectionType,
        previous_version: row.version,
        previous_content: row.content,
        previous_featured_products: previousFeaturedProducts,
      },
    });

    return { version };
  });
}

export async function setHomeSectionVisibility(
  input: { sectionId: string; expectedVersion: number; isVisible: boolean },
  options?: HomeSectionsServiceOptions
): Promise<{ version: number }> {
  const actorId = await authorize(options);
  const database = options?.database ?? db;

  return database.transaction(async (tx) => {
    await lockHome(tx);
    const row = await lockedSection(tx, input.sectionId, input.expectedVersion);
    if (row.isVisible === input.isVisible) return { version: row.version };

    const version = row.version + 1;
    await tx
      .update(homeSections)
      .set({
        isVisible: input.isVisible,
        version,
        updatedByAuthUserId: actorId,
        updatedAt: new Date(),
      })
      .where(eq(homeSections.id, row.id));

    await tx.insert(auditEvents).values({
      actorType: "ADMIN",
      actorId,
      action: input.isVisible ? "home:section:show" : "home:section:hide",
      targetType: "home_section",
      targetId: row.id,
      metadata: { section_type: row.sectionType, previous_version: row.version },
    });
    return { version };
  });
}

/**
 * Applies a new order. `expectedOrder` is the order the operator was looking at; if the stored
 * order changed since, the request is a conflict. The hero, when present, stays first.
 */
export async function reorderHomeSections(
  input: { orderedIds: string[]; expectedOrder: string[] },
  options?: HomeSectionsServiceOptions
): Promise<{ versions: Record<string, number> }> {
  const actorId = await authorize(options);
  const database = options?.database ?? db;

  return database.transaction(async (tx) => {
    await lockHome(tx);
    const rows = await tx
      .select({
        id: homeSections.id,
        sectionType: homeSections.sectionType,
        displayOrder: homeSections.displayOrder,
        version: homeSections.version,
      })
      .from(homeSections)
      .orderBy(asc(homeSections.displayOrder), asc(homeSections.id));

    const currentOrder = rows.map((row) => row.id);
    if (
      currentOrder.length !== input.expectedOrder.length ||
      currentOrder.some((id, index) => input.expectedOrder[index] !== id)
    ) {
      throw conflict();
    }

    const known = new Set(currentOrder);
    if (
      input.orderedIds.length !== currentOrder.length ||
      new Set(input.orderedIds).size !== input.orderedIds.length ||
      input.orderedIds.some((id) => !known.has(id))
    ) {
      throw new CatalogDomainError(
        "El orden enviado no incluye todas las secciones.",
        "HOME_SECTION_ORDER_INVALID",
        400
      );
    }

    const hero = rows.find((row) => row.sectionType === "video_hero");
    if (hero && input.orderedIds[0] !== hero.id) {
      throw new CatalogDomainError(
        "La portada con video siempre va primero.",
        "HOME_SECTION_HERO_FIRST",
        400
      );
    }

    const byId = new Map(rows.map((row) => [row.id, row]));
    const versions: Record<string, number> = {};
    for (const [index, id] of input.orderedIds.entries()) {
      const row = byId.get(id)!;
      versions[id] = row.version;
      if (row.displayOrder === index) continue;
      versions[id] = row.version + 1;
      await tx
        .update(homeSections)
        .set({
          displayOrder: index,
          version: row.version + 1,
          updatedByAuthUserId: actorId,
          updatedAt: new Date(),
        })
        .where(eq(homeSections.id, id));
    }

    await tx.insert(auditEvents).values({
      actorType: "ADMIN",
      actorId,
      action: "home:section:reorder",
      targetType: "home",
      targetId: "storefront",
      metadata: { previous_order: currentOrder, order: input.orderedIds },
    });
    return { versions };
  });
}
