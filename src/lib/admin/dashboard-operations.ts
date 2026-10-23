import "server-only";

import { sql } from "drizzle-orm";
import { db } from "@/db";
import { homeSections, type HomeSectionType } from "@/db/schema";
import { HOME_CONTENT_SCHEMA_VERSION, parseHomeSectionContent } from "@/lib/home/section-schemas";
import type { HomeStatusResult, OrderQueueSnapshot } from "./dashboard-types";

export {
  buildCatalogHealth,
  fetchCatalogHealth,
  type CatalogHealthInputs,
} from "./catalog/catalog-health";

/**
 * Operational reads for the dashboard (GP-054): what needs attention now, the state of the
 * administrable home and per-product publish readiness. Every function issues a fixed number of
 * narrow queries, independent of catalog size, and they run concurrently with the metrics.
 */

/** Orders waiting on the store right now, independent of the selected period. */
export async function fetchOrderQueue(): Promise<OrderQueueSnapshot> {
  const rows = await db.execute<{
    status: string;
    total: string | number;
    oldest_at?: Date | string | null;
  }>(sql`
    SELECT stage AS status, COUNT(*) AS total, MIN(created_at) AS oldest_at FROM (
      SELECT o.created_at, CASE WHEN o.status = 'PENDING' THEN 'PENDING'
        WHEN EXISTS (SELECT 1 FROM shipments s WHERE s.order_id = o.id AND s.status = 'UNFULFILLED') THEN 'CONFIRMED'
        ELSE 'PROCESSING' END AS stage
      FROM orders o JOIN payments p ON p.order_id = o.id
      WHERE (o.status = 'PENDING' AND p.status = 'UNPAID')
        OR (o.status = 'CONFIRMED' AND p.status = 'PAID')
    ) queue GROUP BY stage
  `);
  const count = (status: string) => Number(rows.find((row) => row.status === status)?.total ?? 0);
  const oldest = (status: string) => {
    const value = rows.find((row) => row.status === status)?.oldest_at;
    return value ? new Date(value).toISOString() : null;
  };
  return {
    oldestAwaitingPaymentAt: oldest("PENDING"),
    oldestToPrepareAt: oldest("CONFIRMED"),
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
