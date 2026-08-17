import "server-only";
import { resolveCatalogReaderMode } from "@/lib/catalog/resolve-reader-mode";
import { DevCatalogSearchReader } from "./dev-preview-reader";
import { FixtureCatalogSearchReader } from "./fixture-reader";
import { PostgresCatalogSearchReader } from "./postgres-reader";
import type { CatalogSearchReader } from "./reader";

let cachedPostgresSearchReader: CatalogSearchReader | null = null;

/**
 * Server-only Catalog Search Reader Factory
 *
 * Utilizes the shared reader mode resolver to ensure identical security and environment
 * boundaries across catalog discovery and search operations.
 */
export function getSearchReader(): CatalogSearchReader {
  const mode = resolveCatalogReaderMode();

  switch (mode) {
    case "e2e-fixture":
      return new FixtureCatalogSearchReader();
    case "dev-preview":
      return new DevCatalogSearchReader();
    case "postgres":
    default:
      cachedPostgresSearchReader ??= new PostgresCatalogSearchReader();
      return cachedPostgresSearchReader;
  }
}
