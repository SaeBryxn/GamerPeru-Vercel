import type { NavLink } from "@/components/navigation/types";
import type { MenuCatalogEntry } from "./menu-catalog";
import { parseDiscoveryUrl } from "@/lib/discovery-filters/url";

/** Group filtered destinations under their category without depending on names or type values. */
export function groupCatalogCollections(links: readonly NavLink[]): NavLink[] {
  const categoryPath = (href: string) => {
    if (!/^\/categorias\/[a-z0-9-]+\/?(?:\?|$)/.test(href)) return null;
    const url = new URL(href, "https://store.invalid");
    return { path: url.pathname.replace(/\/$/, ""), filtered: !!url.search };
  };
  const parents = new Map<string, NavLink>();
  for (const link of links) {
    const target = categoryPath(link.href);
    if (target && !target.filtered)
      parents.set(target.path, {
        ...link,
        ...(link.children ? { children: [...link.children] } : {}),
      });
  }
  const result: NavLink[] = [];
  for (const link of links) {
    const target = categoryPath(link.href);
    const parent = target ? parents.get(target.path) : undefined;
    if (target?.filtered && parent) (parent.children ??= []).push({ ...link });
    else result.push(parent ?? { ...link });
  }
  return result;
}

/** Hiding a category also hides its filtered types; hiding one type leaves the others alone. */
export function visibleCollectionLinks<T extends NavLink & { isVisible?: boolean }>(
  links: readonly T[]
): T[] {
  const hiddenCategories = new Set(
    links
      .filter((link) => link.isVisible === false && !link.href.includes("?"))
      .map((link) => link.href.replace(/\/$/, ""))
  );
  return links.filter(
    (link) =>
      link.isVisible !== false && !hiddenCategories.has(link.href.split("?")[0]!.replace(/\/$/, ""))
  );
}

export function flattenCatalogCollections(links: readonly NavLink[]): NavLink[] {
  return links.flatMap((link) => [link, ...flattenCatalogCollections(link.children ?? [])]);
}

/** Categories and represented accessory types; names and destinations come from the catalog. */
export function buildCatalogCollections(entries: MenuCatalogEntry[]): NavLink[] {
  const categories = new Map<string, MenuCatalogEntry[]>();
  for (const entry of entries)
    categories.set(entry.categorySlug, [...(categories.get(entry.categorySlug) ?? []), entry]);
  const groups = [...categories.values()].sort(
    (a, b) =>
      (a[0]!.categoryDisplayOrder ?? 0) - (b[0]!.categoryDisplayOrder ?? 0) ||
      a[0]!.categoryName.localeCompare(b[0]!.categoryName)
  );
  const result: NavLink[] = groups.map((items) => ({
    label: items[0]!.categoryName,
    href: `/categorias/${items[0]!.categorySlug}`,
  }));
  for (const items of groups) {
    const first = items[0]!;
    const field = first.specificationSchema?.fieldDefinitions.find(
      (f) => f.key === "accessory_type" && f.filterable && f.filterKind === "ENUM_MULTI"
    );
    if (!field) continue;
    for (const option of field.options ?? [])
      if (items.some((item) => item.specValues?.[field.key] === option.value))
        result.push({
          label: option.label,
          href: `/categorias/${first.categorySlug}?${new URLSearchParams({ [field.publicParam]: option.value })}`,
        });
  }
  return result;
}

/** Match the same schema-backed filters as the category page, never a category-only fallback. */
export function matchCollectionEntries(
  entries: MenuCatalogEntry[],
  href: string
): MenuCatalogEntry[] {
  if (!href.startsWith("/") || href.startsWith("//")) return [];
  let url: URL;
  try {
    url = new URL(href, "https://store.invalid");
  } catch {
    return [];
  }
  const category = /^\/categorias\/([a-z0-9-]+)\/?$/.exec(url.pathname)?.[1];
  if (!category) return [];
  const scoped = entries.filter((entry) => entry.categorySlug === category);
  if (!scoped.length) return [];
  const schema = scoped[0]!.specificationSchema ?? null;
  const allowed = new Set(["marca", "precio_min", "precio_max", "sort", "page"]);
  for (const field of schema?.fieldDefinitions ?? [])
    if (field.filterable) {
      if (field.filterKind === "NUMBER_RANGE") {
        allowed.add(`${field.publicParam}_min`);
        allowed.add(`${field.publicParam}_max`);
      } else allowed.add(field.publicParam);
    }
  if ([...url.searchParams.keys()].some((key) => !allowed.has(key))) return [];
  const raw = Object.fromEntries(
    [...new Set(url.searchParams.keys())].map((key) => {
      const values = url.searchParams.getAll(key);
      return [key, values.length === 1 ? values[0] : values];
    })
  );
  const filters = parseDiscoveryUrl(raw, "category", schema);
  // Invalid enum values must not turn a named collection into the unfiltered category.
  for (const field of schema?.fieldDefinitions ?? [])
    if (
      field.filterKind === "ENUM_MULTI" &&
      url.searchParams.has(field.publicParam) &&
      !filters.technical[field.key]
    )
      return [];
  const matched = scoped.flatMap((entry) => {
    if (filters.brands.length && !filters.brands.includes(entry.brandSlug)) return [];
    for (const [key, value] of Object.entries(filters.technical)) {
      const actual = entry.specValues?.[key];
      if (Array.isArray(value)) {
        if (typeof actual !== "string" || !value.includes(actual)) return [];
      } else if (typeof value === "boolean") {
        if (actual !== value) return [];
      } else if (
        typeof actual !== "number" ||
        (value.min !== undefined && actual < value.min) ||
        (value.max !== undefined && actual > value.max)
      )
        return [];
    }
    const prices = (entry.variantPrices ?? [entry.priceCents]).filter(
      (price) =>
        (filters.price.minCents === null || price >= filters.price.minCents) &&
        (filters.price.maxCents === null || price <= filters.price.maxCents)
    );
    if (!prices.length) return [];
    const priceCents = Math.min(...prices);
    return [
      {
        ...entry,
        priceCents,
        compareAtPriceCents: priceCents === entry.priceCents ? entry.compareAtPriceCents : null,
      },
    ];
  });
  if (filters.sort === "precio-menor") matched.sort((a, b) => a.priceCents - b.priceCents);
  if (filters.sort === "precio-mayor") matched.sort((a, b) => b.priceCents - a.priceCents);
  if (filters.sort === "nombre-asc") matched.sort((a, b) => a.name.localeCompare(b.name));
  if (filters.sort === "nombre-desc") matched.sort((a, b) => b.name.localeCompare(a.name));
  return matched;
}
