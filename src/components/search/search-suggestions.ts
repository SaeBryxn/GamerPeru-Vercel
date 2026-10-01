import type { MegaMenuCategory, MegaMenuShelves } from "@/components/navigation/types";

export interface SearchSuggestionGroup {
  title: string;
  href: string;
  links: { label: string; href: string }[];
}

const MAX_GROUPS = 4;
const LINKS_PER_GROUP = 5;

/**
 * What the search panel shows before anything is typed: for each top-level menu collection with a
 * shelf, a few of its real products as plain links. Built on the server from the same shelves the
 * mega-menu renders, so it costs no extra query.
 */
export function buildSearchSuggestions(
  primaryNav: readonly MegaMenuCategory[],
  shelves: MegaMenuShelves | undefined
): SearchSuggestionGroup[] {
  if (!shelves) return [];
  const groups: SearchSuggestionGroup[] = [];
  for (const entry of primaryNav) {
    const shelf = shelves[entry.href];
    if (!shelf || shelf.products.length === 0) continue;
    groups.push({
      title: entry.label,
      href: entry.href,
      links: shelf.products.slice(0, LINKS_PER_GROUP).map((product) => ({
        label: product.name,
        href: `/productos/${product.slug}`,
      })),
    });
    if (groups.length === MAX_GROUPS) break;
  }
  return groups;
}
