import "server-only";
import { FixtureCatalogDiscoveryReader } from "./fixture-reader";
import { PostgresCatalogDiscoveryReader } from "./postgres-reader";
import type { CatalogDiscoveryReader } from "./reader";

/**
 * Server-only Catalog Discovery Reader Factory
 *
 * Security Guard:
 * Fixture reader can ONLY activate when E2E_CATALOG_FIXTURES === "1" AND
 * PLAYWRIGHT_TEST === "1" in a non-production environment.
 * If fixture mode is requested in production or outside Playwright, an error is thrown.
 */
let cachedPostgresReader: CatalogDiscoveryReader | null = null;

export function getCatalogReader(): CatalogDiscoveryReader {
  const wantsFixtures = process.env.E2E_CATALOG_FIXTURES === "1";

  if (wantsFixtures) {
    if (process.env.NODE_ENV === "production" || process.env.PLAYWRIGHT_TEST !== "1") {
      throw new Error(
        "Catalog E2E fixtures may only run inside the Playwright test web server in non-production environments."
      );
    }
    return new FixtureCatalogDiscoveryReader();
  }

  cachedPostgresReader ??= new PostgresCatalogDiscoveryReader();
  return cachedPostgresReader;
}
