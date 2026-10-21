import "server-only";
import { revalidatePath, revalidateTag, unstable_cache } from "next/cache";

/** Every cross-request storefront catalog entry carries this tag, so one call invalidates all. */
export const CATALOG_CACHE_TAG = "storefront-catalog";

/**
 * Upper bound on how stale public catalog data may be when no admin write invalidates it. Prices
 * shown here are informational: checkout re-reads prices and stock from the database.
 */
export const CATALOG_REVALIDATE_SECONDS = 300;

/** Only production caches: development and the E2E suites (on `next dev`) must see writes at once. */
export function isCatalogCacheEnabled(): boolean {
  return process.env.NODE_ENV === "production";
}

/**
 * Shares a catalog query's result across requests and instances through the Next.js data cache.
 *
 * The query must throw on failure rather than return a fallback, because a rejected promise is
 * never stored while an empty fallback would be served for the whole window. Results must be
 * JSON-serializable (no Map, Set or Date).
 */
export function cacheCatalogQuery<Args extends unknown[], Result>(
  key: string,
  query: (...args: Args) => Promise<Result>
): (...args: Args) => Promise<Result> {
  if (!isCatalogCacheEnabled()) {
    return query;
  }

  return unstable_cache(query, ["storefront-catalog", key], {
    tags: [CATALOG_CACHE_TAG],
    revalidate: CATALOG_REVALIDATE_SECONDS,
  });
}

/**
 * Makes a catalog write visible on the storefront: expires the cached queries at once, so the
 * next request reads the database, and drops every prerendered storefront page built from them.
 */
export function revalidateStorefrontCatalog(): void {
  revalidateStorefrontCatalogData();
  revalidatePath("/", "layout");
}

export function revalidateStorefrontCatalogData(): void {
  revalidateTag(CATALOG_CACHE_TAG, { expire: 0 });
}

/**
 * Catalog invalidation for Server Actions. Any immediate expiry (`revalidatePath`, or a tag with
 * `expire: 0`) makes Next.js render the current admin page again inside the action's response,
 * on top of the write, and on the Workers CPU limit that request ends in Error 1102. Marking the
 * tag stale with a one-second expiry skips that render; ISR pages carry the tags of the cached
 * queries they read, so they are invalidated too. Admin pages are dynamic and the editors call
 * `router.refresh()` themselves.
 */
export function markStorefrontCatalogStale(): void {
  revalidateTag(CATALOG_CACHE_TAG, { expire: 1 });
}
