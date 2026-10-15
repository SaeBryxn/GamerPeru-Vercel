import "server-only";

import { eq, inArray, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  brands,
  categories,
  categorySpecificationSchemas,
  homeSections,
  mediaAssets,
  productMedia,
  products,
  productSpecifications,
  productStories,
  productVariants,
  type Brand,
  type Category,
  type CategorySpecificationSchema,
  type HomeSectionType,
  type MediaAsset,
  type Product,
  type ProductMedia,
  type ProductSpecification,
  type ProductVariant,
} from "@/db/schema";
import { evaluatePublishReadiness } from "./catalog/publish-readiness";
import { getReadinessGuidance, type ProductEditorSection } from "./catalog/readiness-guidance";
import { HOME_CONTENT_SCHEMA_VERSION, parseHomeSectionContent } from "@/lib/home/section-schemas";
import type {
  CatalogHealthIssue,
  CatalogHealthItem,
  CatalogHealthResult,
  HomeStatusResult,
  OrderQueueSnapshot,
} from "./dashboard-types";

/**
 * Operational reads for the dashboard (GP-054): what needs attention now, the state of the
 * administrable home and per-product publish readiness. Every function issues a fixed number of
 * narrow queries, independent of catalog size, and they run concurrently with the metrics.
 */

/** Orders waiting on the store right now, independent of the selected period. */
export async function fetchOrderQueue(): Promise<OrderQueueSnapshot> {
  const rows = await db.execute<{ status: string; total: string | number }>(sql`
    SELECT status, COUNT(*) AS total
    FROM orders
    WHERE status IN ('PENDING', 'CONFIRMED', 'PROCESSING')
    GROUP BY status
  `);
  const count = (status: string) => Number(rows.find((row) => row.status === status)?.total ?? 0);
  return {
    awaitingPayment: count("PENDING"),
    toPrepare: count("CONFIRMED"),
    inProgress: count("PROCESSING"),
  };
}

interface HomeSectionRowLite {
  sectionType: HomeSectionType;
  isVisible: boolean;
  version: number;
  content: unknown;
  contentSchemaVersion: number;
}

/** Image slots (`{ mediaAssetId, alt }`) still waiting for an upload, anywhere in a payload. */
function countEmptyImageSlots(value: unknown): number {
  if (Array.isArray(value))
    return value.reduce<number>((n, item) => n + countEmptyImageSlots(item), 0);
  if (value === null || typeof value !== "object") return 0;
  const record = value as Record<string, unknown>;
  if ("mediaAssetId" in record && "alt" in record) return record.mediaAssetId === null ? 1 : 0;
  return Object.values(record).reduce<number>((n, item) => n + countEmptyImageSlots(item), 0);
}

export function summarizeHomeSections(rows: readonly HomeSectionRowLite[]): HomeStatusResult {
  let visible = 0;
  let neverEdited = 0;
  let emptyImageSlots = 0;
  let invalid = 0;

  for (const row of rows) {
    if (row.isVisible) visible += 1;
    if (row.version === 1) neverEdited += 1;
    const valid =
      row.contentSchemaVersion === HOME_CONTENT_SCHEMA_VERSION &&
      parseHomeSectionContent(row.sectionType, row.content).success;
    if (!valid) invalid += 1;
    else if (row.isVisible) emptyImageSlots += countEmptyImageSlots(row.content);
  }

  return {
    status: "READY",
    data: {
      total: rows.length,
      visible,
      hidden: rows.length - visible,
      neverEdited,
      emptyImageSlots,
      invalid,
    },
  };
}

export async function fetchHomeStatus(): Promise<HomeStatusResult> {
  try {
    const rows = await db
      .select({
        sectionType: homeSections.sectionType,
        isVisible: homeSections.isVisible,
        version: homeSections.version,
        content: homeSections.content,
        contentSchemaVersion: homeSections.contentSchemaVersion,
      })
      .from(homeSections);
    return summarizeHomeSections(rows);
  } catch {
    return { status: "UNAVAILABLE" };
  }
}

export interface CatalogHealthInputs {
  products: Product[];
  brands: Brand[];
  categories: Category[];
  schemas: CategorySpecificationSchema[];
  specifications: ProductSpecification[];
  variants: ProductVariant[];
  galleryMedia: (ProductMedia & { mediaAsset: MediaAsset })[];
  primaryAssets: MediaAsset[];
  /** Products whose story has a published revision. */
  publishedStoryProductIds: ReadonlySet<string>;
}

const SEVERITY_RANK: Record<CatalogHealthIssue["severity"], number> = {
  blocker: 0,
  warning: 1,
  suggestion: 2,
};

function groupBy<T>(items: readonly T[], key: (item: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const list = map.get(key(item)) ?? [];
    list.push(item);
    map.set(key(item), list);
  }
  return map;
}

/**
 * Runs the authoritative publish validator for every non-archived product and adds the checks
 * the validator does not make (a published story). Published products with blockers come first:
 * they are live and broken; then drafts that cannot be published; then warnings.
 */
export function buildCatalogHealth(
  inputs: CatalogHealthInputs,
  limit = 8
): Extract<CatalogHealthResult, { status: "READY" }>["data"] {
  const brandById = new Map(inputs.brands.map((brand) => [brand.id, brand]));
  const categoryById = new Map(inputs.categories.map((category) => [category.id, category]));
  const schemaById = new Map(inputs.schemas.map((schema) => [schema.id, schema]));
  const specsByProduct = new Map(inputs.specifications.map((spec) => [spec.productId, spec]));
  const variantsByProduct = groupBy(inputs.variants, (variant) => variant.productId);
  const mediaByProduct = groupBy(inputs.galleryMedia, (media) => media.productId);
  const assetById = new Map(inputs.primaryAssets.map((asset) => [asset.id, asset]));

  const items: CatalogHealthItem[] = [];
  for (const product of inputs.products) {
    const category = categoryById.get(product.categoryId) ?? null;
    const readiness = evaluatePublishReadiness({
      product,
      brand: brandById.get(product.brandId) ?? null,
      category,
      currentSpecSchema: category?.currentSpecSchemaId
        ? (schemaById.get(category.currentSpecSchemaId) ?? null)
        : null,
      specifications: specsByProduct.get(product.id) ?? null,
      variants: variantsByProduct.get(product.id) ?? [],
      media: mediaByProduct.get(product.id) ?? [],
      primaryMediaAsset: product.primaryMediaId
        ? (assetById.get(product.primaryMediaId) ?? null)
        : null,
    });

    const issues: CatalogHealthIssue[] = [
      ...readiness.blockers.map((issue) => ({ code: issue.code, severity: "blocker" as const })),
      ...readiness.warnings.map((issue) => ({ code: issue.code, severity: "warning" as const })),
    ].map((issue) => ({ ...issue, ...getReadinessGuidance(issue.code) }));

    if (!inputs.publishedStoryProductIds.has(product.id)) {
      issues.push({
        code: "STORY_NOT_PUBLISHED",
        severity: "suggestion",
        section: "historia",
        action: "Publica la historia del producto",
      });
    }
    if (issues.length === 0) continue;

    issues.sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);
    const first: ProductEditorSection = issues[0]!.section;
    items.push({
      productId: product.id,
      name: product.name,
      status: product.status,
      blockers: readiness.blockers.length,
      warnings: readiness.warnings.length,
      storyPublished: inputs.publishedStoryProductIds.has(product.id),
      issues: issues.slice(0, 3),
      href: `/admin/products/${product.id}#${first}`,
    });
  }

  const rank = (item: CatalogHealthItem) =>
    item.blockers > 0 ? (item.status === "PUBLISHED" ? 0 : 1) : item.warnings > 0 ? 2 : 3;
  items.sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name, "es"));

  return {
    evaluatedProducts: inputs.products.length,
    productsWithIssues: items.length,
    productsWithBlockers: items.filter((item) => item.blockers > 0).length,
    items: items.slice(0, limit),
  };
}

export async function fetchCatalogHealth(): Promise<CatalogHealthResult> {
  const [
    productRows,
    brandRows,
    categoryRows,
    schemaRows,
    specificationRows,
    variantRows,
    galleryRows,
    primaryAssetRows,
    storyRows,
  ] = await Promise.all([
    db.select().from(products).where(ne(products.status, "ARCHIVED")),
    db.select().from(brands),
    db.select().from(categories),
    db.select().from(categorySpecificationSchemas),
    db.select().from(productSpecifications),
    db.select().from(productVariants),
    db
      .select({ media: productMedia, mediaAsset: mediaAssets })
      .from(productMedia)
      .innerJoin(mediaAssets, eq(mediaAssets.id, productMedia.mediaAssetId))
      .where(eq(productMedia.placement, "GALLERY")),
    db
      .select({ asset: mediaAssets })
      .from(mediaAssets)
      .where(
        inArray(
          mediaAssets.id,
          db
            .select({ id: products.primaryMediaId })
            .from(products)
            .where(sql`${products.primaryMediaId} IS NOT NULL`)
        )
      ),
    db
      .select({ productId: productStories.productId })
      .from(productStories)
      .where(sql`${productStories.publishedRevisionId} IS NOT NULL`),
  ]);

  return {
    status: "READY",
    data: buildCatalogHealth({
      products: productRows,
      brands: brandRows,
      categories: categoryRows,
      schemas: schemaRows,
      specifications: specificationRows,
      variants: variantRows,
      galleryMedia: galleryRows.map((row) => ({ ...row.media, mediaAsset: row.mediaAsset })),
      primaryAssets: primaryAssetRows.map((row) => row.asset),
      publishedStoryProductIds: new Set(storyRows.map((row) => row.productId)),
    }),
  };
}
