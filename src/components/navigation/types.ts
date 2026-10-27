import type { ProductDiscoveryItem } from "@/lib/catalog/types";

/**
 * Gamer Perú — Global Navigation Types
 *
 * Defines the presentation data contract for Storefront global navigation,
 * mega-menus, drawers, utility links, and footer directories.
 *
 * NOTE: This is presentation seed configuration for the shell; it is NOT
 * database catalog authority.
 */

export interface NavLink {
  label: string;
  href: string;
  badge?: string;
  description?: string;
}

export interface MegaMenuShelf {
  /** How many published products the collection holds, shown in the "All …" link. */
  totalCount: number;
  /** The same shape the category grid renders, so one card component serves both surfaces. */
  products: readonly ProductDiscoveryItem[];
}

/** Shelves keyed by the collection href they belong to. */
export type MegaMenuShelves = Readonly<Record<string, MegaMenuShelf>>;

export interface MegaMenuSection {
  title: string;
  items: NavLink[];
  more?: NavLink;
}

export interface MegaMenuPreview {
  title: string;
  subtitle: string;
  href: string;
}

export interface MegaMenuPromo {
  title: string;
  href: string;
  image: string;
  badge?: string;
}

/** Glyphs a tile can show instead of a photo; names, so the config stays serializable. */
export type MegaMenuTileIcon = "mouse" | "keyboard" | "usb" | "cpu";

export interface MegaMenuTile {
  title: string;
  href: string;
  /** Product photo; tiles without one show their icon. */
  image?: string;
  icon?: MegaMenuTileIcon;
  /** `feature` renders the tile on the indigo highlight surface. */
  tone?: "feature";
}

/**
 * Desktop mega-menu composition. Categories without a layout render as a plain
 * link in the desktop bar (the mobile drawer still lists them).
 * - `products`: collections tabs + popular product cards.
 * - `series`: multi-column series lists + guide link + large promo cards.
 * - `grid`: one row of square tiles.
 * - `links`: one row of large text links taken from `sections`.
 */
export type MegaMenuLayout = "products" | "series" | "grid" | "links";

export interface MegaMenuCategory {
  id: string;
  label: string;
  href: string;
  menuLayout?: MegaMenuLayout;
  sections: MegaMenuSection[];
  series?: MegaMenuSection[];
  guide?: NavLink;
  promos?: MegaMenuPromo[];
  tiles?: MegaMenuTile[];
  brands?: NavLink[];
  previews?: MegaMenuPreview[];
  spotlight?: {
    title: string;
    description: string;
    href: string;
    ctaLabel: string;
  };
}

export interface FooterColumn {
  title: string;
  links: NavLink[];
}

export interface NavigationConfig {
  /** Live product shelves for the "products" mega-menu, resolved from the catalog. */
  shelves?: MegaMenuShelves;
  brandMark: {
    label: string;
    href: string;
  };
  primaryNav: MegaMenuCategory[];
  /** Cross-category product types listed at the top of every mega-menu. */
  productTypes: NavLink[];
  utilityLinks: {
    search: { label: string; href: string };
    account: { label: string; href: string };
    cart: { label: string; href: string };
  };
  footerColumns: FooterColumn[];
}
