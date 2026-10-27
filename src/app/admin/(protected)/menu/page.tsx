import { getEditableMenuLinks } from "@/lib/navigation/menu-content";
import { defaultMenuContent } from "@/lib/navigation/menu-content-schema";
import { NAVIGATION_CONFIG } from "@/components/navigation/navigation-data";
import { resolvePublicMediaUrl } from "@/lib/media/resolve-public-media-url";
import React from "react";
import type { Metadata } from "next";
import { getVerifiedAuthContext } from "@/lib/auth/rbac";
import { AdminForbidden } from "@/components/admin/admin-forbidden";
import { getMenuEntrySettings } from "@/lib/navigation/menu-settings";
import { getCategoryCatalogFacts } from "@/lib/navigation/catalog-facts";
import { getMenuCatalogEntries } from "@/lib/navigation/menu-catalog";
import { MenuWorkspace, type MenuEntryView } from "./menu-workspace";

export const metadata: Metadata = {
  title: "Menú de la tienda | Administración",
};

export const dynamic = "force-dynamic";

export default async function MenuPage() {
  const authContext = await getVerifiedAuthContext();

  if (authContext.status !== "READY" || !authContext.permissions.has("catalog:manage")) {
    return (
      <AdminForbidden email={authContext.status === "READY" ? authContext.email : undefined} />
    );
  }

  const [settings, facts] = await Promise.all([getMenuEntrySettings(), getCategoryCatalogFacts()]);

  const editableLinks = await getEditableMenuLinks();
  const entries: MenuEntryView[] = settings.map((entry) => ({
    id: entry.id,
    productSelection: entry.productSelection,
    label: entry.label ?? entry.adminLabel,
    layout: NAVIGATION_CONFIG.primaryNav.find((item) => item.id === entry.id)?.menuLayout,
    content: {
      ...defaultMenuContent(entry.id),
      label: entry.label ?? defaultMenuContent(entry.id).label,
      href: entry.href ?? defaultMenuContent(entry.id).href,
      display: entry.productSelection?.menuDisplay ?? defaultMenuContent(entry.id).display,
      links:
        entry.linksConfigured && editableLinks
          ? (editableLinks[entry.id] ?? [])
          : defaultMenuContent(entry.id).links,
    },
    description: entry.description,
    isVisible: entry.isVisible,
    categorySlug: entry.categorySlug ?? null,
    publishedProducts: entry.categorySlug
      ? (facts.get(entry.categorySlug)?.publishedProducts ?? 0)
      : null,
    missingDestinations: entry.missingDestinations ?? [],
  }));

  const products = (await getMenuCatalogEntries()).map((product) => ({
    id: product.productId,
    imageUrl: product.objectKey ? resolvePublicMediaUrl(product.objectKey) : null,
    brandName: product.brandName,
    brandSlug: product.brandSlug,
    slug: product.slug,
    name: product.name,
    categorySlug: product.categorySlug,
  }));
  return <MenuWorkspace entries={entries} products={products} />;
}
