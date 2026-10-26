import "server-only";
import {
  readHomeFeaturedProducts,
  isMissingFeaturedRelation,
  featuredSlugsByOwner,
  hydrateHomeSelection,
} from "@/lib/catalog/featured-product-storage";
import { asc, eq, inArray } from "drizzle-orm";
import { revalidateTag, unstable_cache } from "next/cache";
import { db } from "@/db";
import { homeSectionMedia, homeSections, mediaAssets, type HomeSectionType } from "@/db/schema";
import {
  CATALOG_CACHE_TAG,
  CATALOG_REVALIDATE_SECONDS,
  isCatalogCacheEnabled,
} from "@/lib/catalog/catalog-cache";
import { resolveCatalogReaderMode } from "@/lib/catalog/resolve-reader-mode";
import { logger } from "@/lib/logger";
import { resolvePublicMediaUrl } from "@/lib/media/resolve-public-media-url";
import { DEFAULT_HOME_SECTIONS } from "./default-sections";
import {
  HOME_CONTENT_SCHEMA_VERSION,
  listHomeSectionMediaSlots,
  parseHomeSectionContent,
  type HomeSection,
} from "./section-schemas";

export const HOME_CACHE_TAG = "storefront-home";

/**
 * Makes an operator change visible: the sections, and the home page built from them, are marked
 * stale and regenerate in the background (see `revalidateStorefrontCatalog` for why they are not
 * expired at once).
 */
export function revalidateStorefrontHome(): void {
  revalidateTag(HOME_CACHE_TAG, "max");
}

export interface StorefrontHome {
  hasBrandSection?: boolean;
  /** Visible sections in render order; the hero, when present, is first. */
  sections: HomeSection[];
  /** Public URL of every image the sections reference, keyed by media asset id. */
  mediaUrls: Record<string, string>;
}

export interface StoredHome {
  rows: {
    id: string;
    sectionType: HomeSectionType;
    displayOrder: number;
    isVisible: boolean;
    content: unknown;
    contentSchemaVersion: number;
  }[];
  media: { sectionId: string; slot: string; mediaAssetId: string; objectKey: string }[];
}

async function queryStoredHome(): Promise<StoredHome> {
  const rows = await db
    .select({
      id: homeSections.id,
      sectionType: homeSections.sectionType,
      displayOrder: homeSections.displayOrder,
      isVisible: homeSections.isVisible,
      content: homeSections.content,
      contentSchemaVersion: homeSections.contentSchemaVersion,
    })
    .from(homeSections)
    .orderBy(asc(homeSections.displayOrder), asc(homeSections.id));

  if (rows.length === 0) return { rows, media: [] };

  const media = await db
    .select({
      sectionId: homeSectionMedia.sectionId,
      slot: homeSectionMedia.slot,
      mediaAssetId: homeSectionMedia.mediaAssetId,
      objectKey: mediaAssets.objectKey,
    })
    .from(homeSectionMedia)
    .innerJoin(mediaAssets, eq(mediaAssets.id, homeSectionMedia.mediaAssetId))
    .where(
      inArray(
        homeSectionMedia.sectionId,
        rows.map((row) => row.id)
      )
    );

  try {
    const featured = featuredSlugsByOwner(
      await readHomeFeaturedProducts(rows.map((row) => row.id))
    );
    return {
      rows: rows.map((row) => ({
        ...row,
        content: hydrateHomeSelection(row.content, featured.get(row.id)),
      })),
      media,
    };
  } catch (error) {
    if (isMissingFeaturedRelation(error)) return { rows, media };
    throw error;
  }
}

// Throws on failure so a database outage is never cached as an empty home.
const readStoredHome = isCatalogCacheEnabled()
  ? unstable_cache(queryStoredHome, ["storefront-home", "sections"], {
      tags: [HOME_CACHE_TAG, CATALOG_CACHE_TAG],
      revalidate: CATALOG_REVALIDATE_SECONDS,
    })
  : queryStoredHome;

function defaultHome(): StorefrontHome {
  return { sections: DEFAULT_HOME_SECTIONS.filter((s) => s.isVisible), mediaUrls: {} };
}

/**
 * Turns stored rows into the visible sections to render. A row whose content does not validate is skipped
 * and logged rather than failing the page, and an image only resolves when the slot it fills is
 * registered in `home_section_media` for that section.
 */
export function buildStorefrontHome(stored: StoredHome): StorefrontHome | null {
  const valid: HomeSection[] = [];

  for (const row of stored.rows) {
    if (row.contentSchemaVersion !== HOME_CONTENT_SCHEMA_VERSION) {
      logger.warn({
        event: "home_section_schema_version_unsupported",
        sectionId: row.id,
        contentSchemaVersion: row.contentSchemaVersion,
      });
      continue;
    }
    const parsed = parseHomeSectionContent(row.sectionType, row.content);
    if (!parsed.success) {
      logger.warn({
        event: "home_section_content_invalid",
        sectionId: row.id,
        sectionType: row.sectionType,
        firstIssue: parsed.error.issues[0]?.message,
      });
      continue;
    }
    valid.push({
      id: row.id,
      type: row.sectionType,
      displayOrder: row.displayOrder,
      isVisible: row.isVisible,
      content: parsed.data,
    } as HomeSection);
  }

  // Every row invalid is a broken table, not an operator decision: the caller falls back.
  if (valid.length === 0) return null;

  const sections = valid.filter((section) => section.isVisible);
  const heroIndex = sections.findIndex((section) => section.type === "video_hero");
  if (heroIndex > 0) sections.unshift(...sections.splice(heroIndex, 1));

  const registered = new Map(
    stored.media.map((entry) => [`${entry.sectionId}:${entry.slot}`, entry] as const)
  );
  const mediaUrls: Record<string, string> = {};
  for (const section of sections) {
    for (const [slot, assetId] of listHomeSectionMediaSlots(section)) {
      const entry = registered.get(`${section.id}:${slot}`);
      if (!entry || entry.mediaAssetId !== assetId) continue;
      const url = resolvePublicMediaUrl(entry.objectKey);
      if (url) mediaUrls[assetId] = url;
    }
  }

  return {
    sections,
    mediaUrls,
    hasBrandSection: valid.some((section) => section.type === "brand_strip"),
  };
}

/**
 * The home to render. Falls back to the declared defaults when no section is stored, when the
 * database cannot be read, and in E2E fixture runs, which never read the connected database.
 */
export async function getStorefrontHome(): Promise<StorefrontHome> {
  if (resolveCatalogReaderMode() === "e2e-fixture") return defaultHome();

  let stored: StoredHome;
  try {
    stored = await readStoredHome();
  } catch {
    logger.warn({ event: "home_sections_unavailable" });
    return defaultHome();
  }

  if (stored.rows.length === 0) return defaultHome();
  // Hiding every section is a valid operator choice and renders an empty home.
  return buildStorefrontHome(stored) ?? defaultHome();
}
