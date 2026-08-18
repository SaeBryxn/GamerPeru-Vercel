import "server-only";
import type { ProductDetailEntity } from "./product-detail-types";

export interface ProductDetailReader {
  getPublishedProductBySlug(slug: string): Promise<ProductDetailEntity | null>;
}
