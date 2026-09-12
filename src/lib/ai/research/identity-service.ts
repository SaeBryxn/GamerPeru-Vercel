import "server-only";

import { isIP } from "node:net";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { brands, products } from "@/db/schema";
import type { ClaimedResearchItem } from "./lease-service";

export interface LocalIdentityContext {
  canonicalBrandHostname?: string;
  deterministicStatus?: "EXACT_MATCH";
  targetProductId: string | null;
}

function websiteHostname(websiteUrl: string | null): string | undefined {
  if (!websiteUrl) return undefined;
  try {
    const url = new URL(websiteUrl);
    const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
    return (url.protocol === "https:" || url.protocol === "http:") &&
      !isIP(hostname) &&
      hostname.includes(".")
      ? hostname
      : undefined;
  } catch {
    return undefined;
  }
}

export async function resolveLocalIdentityContext(
  item: ClaimedResearchItem
): Promise<LocalIdentityContext> {
  if (item.mode === "ENRICH" && item.targetProductId) {
    const [target] = await db
      .select({ websiteUrl: brands.websiteUrl })
      .from(products)
      .innerJoin(brands, eq(products.brandId, brands.id))
      .where(eq(products.id, item.targetProductId))
      .limit(1);
    if (!target) throw new Error("TARGET_PRODUCT_NOT_FOUND");
    return {
      canonicalBrandHostname: websiteHostname(target.websiteUrl),
      deterministicStatus: "EXACT_MATCH",
      targetProductId: item.targetProductId,
    };
  }

  const [brand] = await db
    .select({ websiteUrl: brands.websiteUrl })
    .from(brands)
    .where(
      and(
        eq(brands.status, "PUBLISHED"),
        sql`(${item.query.toLowerCase()} LIKE '%' || lower(${brands.name}) || '%'
          OR ${item.query.toLowerCase()} LIKE '%' || lower(${brands.slug}) || '%')`
      )
    )
    .limit(1);
  return {
    canonicalBrandHostname: websiteHostname(brand?.websiteUrl ?? null),
    targetProductId: null,
  };
}
