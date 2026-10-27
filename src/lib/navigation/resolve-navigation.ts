import "server-only";
import { getEditableMenuLinks } from "./menu-content";
import { selectProducts } from "@/lib/catalog/curated-products";
import { NAVIGATION_CONFIG } from "@/components/navigation/navigation-data";
import type {
  FooterColumn,
  MegaMenuCategory,
  MegaMenuSection,
  NavigationConfig,
  NavLink,
} from "@/components/navigation/types";
import { getCatalogNavigationFacts } from "./catalog-facts";
import { getMenuEntrySettings, type MenuEntrySetting } from "./menu-settings";
import {
  buildCatalogCollections,
  groupCatalogCollections,
  visibleCollectionLinks,
} from "./menu-collections";
import { resolveCatalogReaderMode } from "@/lib/catalog/resolve-reader-mode";
import {
  buildBrandColumns,
  buildFooterProductColumns,
  buildMenuShelves,
  buildProductTiles,
  buildPromoCards,
  getMenuCatalogEntries,
} from "./menu-catalog";

function buildHiddenMatcher(settings: MenuEntrySetting[]): (href: string) => boolean {
  const hiddenPaths = settings
    .filter((entry) => !entry.isVisible && entry.categorySlug)
    .map((entry) => `/categorias/${entry.categorySlug as string}`);

  return (href: string) => hiddenPaths.some((path) => href === path || href.startsWith(`${path}?`));
}

function filterSections(
  sections: MegaMenuSection[] | undefined,
  isHidden: (href: string) => boolean
): MegaMenuSection[] {
  if (!sections) return [];
  return sections
    .map((section) => ({ ...section, items: section.items.filter((i) => !isHidden(i.href)) }))
    .filter((section) => section.items.length > 0);
}

const FOOTER_BRAND_LIMIT = 8;

/**
 * Footer order: catalog products first, then explore, published brands and account. Catalog
 * columns simply drop out when the catalog cannot be read, so the footer degrades to its static
 * columns instead of listing products or brands that may not exist.
 */
function buildFooterColumns(
  staticColumns: FooterColumn[],
  catalog: {
    productColumns: FooterColumn[];
    brands: NavLink[];
    isHidden: (href: string) => boolean;
  }
): FooterColumn[] {
  const [explore, ...rest] = staticColumns;
  const brandColumn: FooterColumn = {
    title: "Marcas",
    links: catalog.brands.slice(0, FOOTER_BRAND_LIMIT),
  };

  return [...catalog.productColumns, ...(explore ? [explore] : []), brandColumn, ...rest]
    .map((column) => ({
      ...column,
      links: column.links.filter((link) => !catalog.isHidden(link.href)),
    }))
    .filter((column) => column.links.length > 0);
}

/**
 * Builds the storefront navigation from configuration plus live catalog state.
 *
 * Three things are resolved here rather than hardcoded:
 * 1. Which top-level entries the operator currently shows, and in what order.
 * 2. Brand lists, which must name brands that exist in the catalog; a declared brand without a
 *    page renders a link straight into a 404 and implies a relationship the store does not have.
 * 3. Links pointing at a hidden category, wherever they appear, so hiding a section removes it
 *    from every menu, tile and footer column at once.
 */
export async function getStorefrontNavigation(): Promise<NavigationConfig> {
  const [settings, facts, catalogEntries, editableLinks] = await Promise.all([
    getMenuEntrySettings(),
    getCatalogNavigationFacts(),
    getMenuCatalogEntries(),
    getEditableMenuLinks(),
  ]);

  const isHidden = buildHiddenMatcher(settings);
  // Sorted here rather than trusting the caller, so the rendered order never depends on how the
  // settings happened to come back from storage.
  const visible = settings
    .filter((entry) => entry.isVisible)
    .sort((a, b) => a.displayOrder - b.displayOrder || a.adminLabel.localeCompare(b.adminLabel));
  const orderById = new Map(visible.map((entry, index) => [entry.id, index]));
  const settingById = new Map<string, MenuEntrySetting>(settings.map((entry) => [entry.id, entry]));

  const resolveBrands = (categorySlug: string | undefined): NavLink[] | undefined => {
    const scoped = categorySlug ? facts.byCategory.get(categorySlug)?.brands : undefined;
    if (scoped && scoped.length > 0) return scoped;
    return facts.allBrands.length > 0 ? facts.allBrands : undefined;
  };

  const primaryNav: MegaMenuCategory[] = NAVIGATION_CONFIG.primaryNav
    .filter((item) => orderById.has(item.id))
    .sort((a, b) => (orderById.get(a.id) ?? 0) - (orderById.get(b.id) ?? 0))
    .map((item) => {
      const categorySlug = settingById.get(item.id)?.categorySlug;
      const selection = settingById.get(item.id)?.productSelection;
      const selectedEntries = selectProducts(
        catalogEntries.filter((entry) => entry.categorySlug === categorySlug),
        selection
      );
      const resolved: MegaMenuCategory = {
        ...item,
        label: settingById.get(item.id)?.label ?? item.label,
        href: settingById.get(item.id)?.href ?? item.href,
        sections: filterSections(item.sections, isHidden),
      };

      // Declared series and promo cards described product lines the store does not carry. Where the
      // catalog can answer, it replaces them with real brands and real products; where it cannot,
      // the block is dropped rather than shipping placeholder names and a stock photo.
      if (item.series) {
        const brandColumns = categorySlug
          ? buildBrandColumns(
              selectedEntries,
              categorySlug,
              selection?.mode === "manual",
              selection?.menuDisplay
            )
          : [];
        if (brandColumns.length > 0) resolved.series = brandColumns;
        else delete resolved.series;
      }

      if (item.promos) {
        const promoCards = categorySlug
          ? buildPromoCards(selectedEntries, categorySlug, 2, selection?.menuDisplay)
          : [];
        if (promoCards.length > 0) resolved.promos = promoCards;
        else delete resolved.promos;
      }

      // Tiles are showcase art for a category's filters until that category has published
      // products of its own; then the real photos take over.
      if (item.tiles) {
        const productTiles = categorySlug ? buildProductTiles(selectedEntries, categorySlug) : [];
        resolved.tiles =
          productTiles.length > 0
            ? productTiles
            : selection?.mode === "manual"
              ? []
              : item.tiles.filter((t) => !isHidden(t.href));
      }
      if (item.previews) resolved.previews = item.previews.filter((p) => !isHidden(p.href));

      if (item.brands) {
        const liveBrands = resolveBrands(categorySlug);
        if (liveBrands) resolved.brands = liveBrands;
        else delete resolved.brands;
      }

      if (
        item.menuLayout === "products" &&
        !settingById.get(item.id)?.linksConfigured &&
        resolveCatalogReaderMode() !== "e2e-fixture"
      ) {
        resolved.sections = [
          {
            title: "Colecciones",
            items: buildCatalogCollections(catalogEntries).filter((link) => !isHidden(link.href)),
          },
        ];
      }

      if (settingById.get(item.id)?.linksConfigured && editableLinks) {
        const links = (
          item.menuLayout === "products"
            ? visibleCollectionLinks(editableLinks[item.id] ?? [])
            : (editableLinks[item.id] ?? [])
        ).filter((link) => link.isVisible && !isHidden(link.href));
        const groups = new Map<string, NavLink[]>();
        for (const link of links.filter((link) => link.placement === "section")) {
          groups.set(link.sectionTitle, [
            ...(groups.get(link.sectionTitle) ?? []),
            { label: link.label, href: link.href },
          ]);
        }
        resolved.sections = [...groups].map(([title, items]) => ({ title, items }));
        if (item.tiles)
          resolved.tiles = links
            .filter((link) => link.placement === "tile")
            .map((link) => ({ title: link.label, href: link.href, icon: link.icon ?? undefined }));
      }
      if (item.menuLayout === "products") {
        const links = groupCatalogCollections(
          resolved.sections.flatMap((section) => section.items)
        );
        resolved.sections = resolved.sections.length
          ? [{ title: resolved.sections[0]!.title, items: links }]
          : [];
      }
      return resolved;
    });

  // The collection tabs use the same editable links as the Productos editor and mobile menu.
  const productTypes = (primaryNav.find((item) => item.menuLayout === "products")?.sections ?? [])
    .flatMap((section) => section.items)
    .filter((link) => !isHidden(link.href));

  return {
    ...NAVIGATION_CONFIG,
    primaryNav,
    shelves: buildMenuShelves(
      [
        ...settings
          .filter((setting) => setting.categorySlug)
          .flatMap((setting) =>
            selectProducts(
              catalogEntries.filter((entry) => entry.categorySlug === setting.categorySlug),
              setting.productSelection
            )
          ),
        ...catalogEntries.filter(
          (entry) => !settings.some((setting) => setting.categorySlug === entry.categorySlug)
        ),
      ],
      productTypes
    ),
    productTypes,
    footerColumns: buildFooterColumns(NAVIGATION_CONFIG.footerColumns, {
      productColumns: buildFooterProductColumns(catalogEntries, (slug) =>
        isHidden(`/categorias/${slug}`)
      ),
      brands: facts.allBrands,
      isHidden,
    }),
  };
}
