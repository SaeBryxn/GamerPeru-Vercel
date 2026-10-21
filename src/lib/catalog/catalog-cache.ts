import "server-only";
import { revalidateTag, unstable_cache } from "next/cache";

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
 * Makes a catalog write visible on the storefront. The tag is marked stale rather than expired:
 * visitors keep receiving the cached page while it regenerates once in the background. An
 * immediate expiry made every concurrent visitor render the page inside their own request, which
 * on the Workers CPU limit ends in Error 1102, and inside a Server Action it also re-rendered the
 * current admin page. ISR pages carry the tags of the cached queries they read (the navigation
 * included), so they are refreshed too.
 */
export function revalidateStorefrontCatalog(): void {
  revalidateTag(CATALOG_CACHE_TAG, "max");
}
