export interface SourcePrice {
  currency: "USD" | "PEN";
  cents: number;
}
export interface SourceProduct {
  source: string;
  sourceId: string | undefined;
  sourceUrl: string;
  brand: string;
  category: string;
  name: string;
  originalName: string;
  description: string;
  specifications: { label: string; value: string; note?: string }[];
  images: string[];
  galleryImages?: string[];
  storyImages?: string[];
  variants: {
    sourceId?: string;
    sku: string;
    name: string;
    price: SourcePrice | null;
    options: { name: string; value: string }[];
    image: string | null;
  }[];
  stock: number;
}
export function sourceProductLinks(html: string, base: string, pattern: RegExp): string[];
export function sourcePrice(amount: unknown, currency: unknown): SourcePrice | null;
export function normalizeAttackProduct(
  product: unknown,
  category: string,
  currency: string
): SourceProduct | null;
export function parseJinmsProduct(html: string, sourceUrl: string): SourceProduct;
export function parseMemoryProduct(html: string, sourceUrl: string): SourceProduct;
export function enrichAttackProduct(product: SourceProduct, html: string): SourceProduct;
