import "server-only";
import { DevCatalogPreviewReader } from "./dev-preview-reader";
import { FixtureCatalogDiscoveryReader } from "./fixture-reader";
import { PostgresCatalogDiscoveryReader } from "./postgres-reader";
import type { CatalogDiscoveryReader } from "./reader";
import { resolveCatalogReaderMode } from "./resolve-reader-mode";

let cachedPostgresReader: CatalogDiscoveryReader | null = null;

export function getCatalogReader(): CatalogDiscoveryReader {
  const mode = resolveCatalogReaderMode();

  switch (mode) {
    case "e2e-fixture":
      return new FixtureCatalogDiscoveryReader();
    case "dev-preview":
      return new DevCatalogPreviewReader();
    case "postgres":
    default:
      cachedPostgresReader ??= new PostgresCatalogDiscoveryReader();
      return cachedPostgresReader;
  }
}
