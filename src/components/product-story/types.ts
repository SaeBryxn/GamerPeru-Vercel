import type { ProductStoryDetail } from "@/lib/catalog/product-detail-types";
import type { ProductDiscoveryItem } from "@/lib/catalog/types";

export interface ProductStoryRendererProps {
  story: ProductStoryDetail;
  currentProductId: string;
  productName: string;
  relatedProductsMap?: ReadonlyMap<string, ProductDiscoveryItem>;
}
