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

export interface MegaMenuSection {
  title: string;
  items: NavLink[];
}

export interface MegaMenuPreview {
  title: string;
  subtitle: string;
  href: string;
}

export interface MegaMenuCategory {
  id: string;
  label: string;
  href: string;
  sections: MegaMenuSection[];
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
  announcement?: {
    message: string;
    href?: string;
  };
  brandMark: {
    label: string;
    href: string;
  };
  primaryNav: MegaMenuCategory[];
  utilityLinks: {
    search: { label: string; href: string };
    account: { label: string; href: string };
    wishlist: { label: string; href: string };
    cart: { label: string; href: string };
  };
  footerColumns: FooterColumn[];
}
