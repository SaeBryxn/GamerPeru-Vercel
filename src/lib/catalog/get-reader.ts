import "server-only";
import { DevCatalogPreviewReader } from "./dev-preview-reader";
import { FixtureCatalogDiscoveryReader } from "./fixture-reader";
import { PostgresCatalogDiscoveryReader } from "./postgres-reader";
import type { CatalogDiscoveryReader } from "./reader";

/**
 * Server-only Catalog Discovery Reader Factory
 *
 * Reader selection precedence (explicit, non-ambiguous):
 *
 * 1. E2E Fixture Mode:
 *    E2E_CATALOG_FIXTURES=1 AND PLAYWRIGHT_TEST=1 in non-production.
 *    -> FixtureCatalogDiscoveryReader
 *
 * 2. Development Preview Mode:
 *    DEV_CATALOG_PREVIEW=1 AND NODE_ENV=development AND CI is NOT truthy.
 *    -> DevCatalogPreviewReader
 *
 * 3. Normal runtime:
 *    -> PostgresCatalogDiscoveryReader
 *
 * Ambiguity guard: If both E2E_CATALOG_FIXTURES and DEV_CATALOG_PREVIEW
 * are enabled simultaneously, an error is thrown. Do not guess precedence.
 *
 * Database failure NEVER triggers automatic fallback to preview/fixture readers.
 */
let cachedPostgresReader: CatalogDiscoveryReader | null = null;

/** One-time development console notice (server process lifetime). */
let devPreviewNoticeEmitted = false;

export function getCatalogReader(): CatalogDiscoveryReader {
  const wantsFixtures = process.env.E2E_CATALOG_FIXTURES === "1";
  const wantsPreview = process.env.DEV_CATALOG_PREVIEW === "1";

  // Ambiguity guard: both flags simultaneously is a configuration error.
  if (wantsFixtures && wantsPreview) {
    throw new Error(
      "Ambiguous catalog reader configuration: E2E_CATALOG_FIXTURES and DEV_CATALOG_PREVIEW cannot both be enabled. Use one or the other."
    );
  }

  // 1. Playwright E2E Fixture Mode
  if (wantsFixtures) {
    if (process.env.NODE_ENV === "production" || process.env.PLAYWRIGHT_TEST !== "1") {
      throw new Error(
        "Catalog E2E fixtures may only run inside the Playwright test web server in non-production environments."
      );
    }
    return new FixtureCatalogDiscoveryReader();
  }

  // 2. Development Preview Mode
  if (wantsPreview) {
    if (process.env.NODE_ENV !== "development") {
      throw new Error(
        "DEV_CATALOG_PREVIEW=1 is only allowed in development (NODE_ENV=development). It must NEVER be enabled in production or test environments."
      );
    }
    if (process.env.CI) {
      throw new Error(
        "DEV_CATALOG_PREVIEW=1 must NEVER be enabled in CI. Remove this flag from the CI environment."
      );
    }
    if (!devPreviewNoticeEmitted) {
      console.log(
        "[Gamer Perú] Development Catalog Preview enabled — synthetic data only; PostgreSQL catalog is not being used for discovery."
      );
      devPreviewNoticeEmitted = true;
    }
    return new DevCatalogPreviewReader();
  }

  // 3. Normal production/development runtime: authoritative PostgreSQL.
  cachedPostgresReader ??= new PostgresCatalogDiscoveryReader();
  return cachedPostgresReader;
}
