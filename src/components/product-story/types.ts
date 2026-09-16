import type { ValidatedStoryBlock } from "@/lib/catalog/story-validation";
import type { ProductDiscoveryItem } from "@/lib/catalog/types";

export interface RenderableProductStory {
  blocks: ValidatedStoryBlock[];
  productId?: string;
  publishedRevisionId?: string | null;
  revisionNumber?: number | null;
  publishedAt?: string | null;
}

export interface ProductStoryRendererProps {
  story: RenderableProductStory;
  currentProductId: string;
  productName: string;
  relatedProductsMap?: ReadonlyMap<string, ProductDiscoveryItem>;
}
