export function compactProductName(name: string, category: string): string;
export function planProductNames<
  T extends { name: string; category_slug: string; imported?: boolean },
>(products: T[]): (T & { nextName: string })[];
