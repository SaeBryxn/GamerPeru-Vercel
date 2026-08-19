import "server-only";
import { DevCatalogPreviewReader } from "./dev-preview-reader";
import { FixtureCatalogDiscoveryReader } from "./fixture-reader";
import { PostgresCatalogDiscoveryReader } from "./postgres-reader";
import { PostgresProductDetailReader } from "./postgres-product-detail-reader";
import { PostgresStoryRelatedProductsReader } from "./postgres-story-related-products-reader";
import { FixtureStoryRelatedProductsReader } from "./fixture-story-related-products-reader";
import { DevPreviewStoryRelatedProductsReader } from "./dev-preview-story-related-products-reader";
import type { ProductDetailReader } from "./product-detail-reader";
import type { StoryRelatedProductsReader } from "./story-related-products-reader";
import type { CatalogDiscoveryReader } from "./reader";
import { resolveCatalogReaderMode } from "./resolve-reader-mode";

let cachedPostgresReader: CatalogDiscoveryReader | null = null;
let cachedPostgresDetailReader: ProductDetailReader | null = null;
let cachedPostgresStoryRelatedReader: StoryRelatedProductsReader | null = null;

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

export function getProductDetailReader(): ProductDetailReader {
  const mode = resolveCatalogReaderMode();

  switch (mode) {
    case "e2e-fixture":
      return new FixtureCatalogDiscoveryReader();
    case "dev-preview":
      return new DevCatalogPreviewReader();
    case "postgres":
    default:
      cachedPostgresDetailReader ??= new PostgresProductDetailReader();
      return cachedPostgresDetailReader;
  }
}

export function getStoryRelatedProductsReader(): StoryRelatedProductsReader {
  const mode = resolveCatalogReaderMode();

  switch (mode) {
    case "e2e-fixture":
      return new FixtureStoryRelatedProductsReader();
    case "dev-preview":
      return new DevPreviewStoryRelatedProductsReader();
    case "postgres":
    default:
      cachedPostgresStoryRelatedReader ??= new PostgresStoryRelatedProductsReader();
      return cachedPostgresStoryRelatedReader;
  }
}
