export interface OfficialFact {
  label: string;
  value: string;
  note: string;
}
export function stableId(key: string): string;
export function slugify(value: string): string;
export function categoryFor(title: string): string;
export function extractFacts(html: string, webText?: string): OfficialFact[];
export function suggestPrice(
  usdCents: number,
  category: string,
  marketCents?: number | null
): { cents: number; basis: string; provisional: boolean };
export function buildSupplierPlan(input: {
  products: readonly unknown[];
  existing: readonly { name: string }[];
  webTexts?: Record<string, string>;
  market?: readonly unknown[];
}): { products: unknown[]; stockPolicy: string; excluded: unknown[] };
export function storyForProduct(product: unknown, media: unknown): unknown;
export function structuredSpecs(product: unknown): Record<string, string | number>;
