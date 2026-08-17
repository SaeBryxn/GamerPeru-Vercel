import "server-only";

export type CatalogReaderMode = "e2e-fixture" | "dev-preview" | "postgres";

let devPreviewNoticeEmitted = false;

/**
 * Shared Reader Mode Selection Guard
 *
 * Enforces strict environment boundaries across Catalog Discovery and Search Readers:
 *
 * 1. E2E Fixture Mode:
 *    E2E_CATALOG_FIXTURES=1 AND PLAYWRIGHT_TEST=1 in non-production.
 *    -> "e2e-fixture"
 *
 * 2. Development Preview Mode:
 *    DEV_CATALOG_PREVIEW=1 AND NODE_ENV=development AND CI is NOT truthy.
 *    -> "dev-preview"
 *
 * 3. Authoritative Production / Runtime:
 *    -> "postgres"
 *
 * Strict invariants:
 * - Both flags simultaneously throws an ambiguity Error.
 * - E2E fixture mode in production or outside Playwright test server throws.
 * - DEV preview mode in non-development or in CI throws.
 * - Database outage NEVER triggers synthetic fallback.
 */
export function resolveCatalogReaderMode(): CatalogReaderMode {
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
    return "e2e-fixture";
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
    return "dev-preview";
  }

  // 3. Authoritative PostgreSQL
  return "postgres";
}
