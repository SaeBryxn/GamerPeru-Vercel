import React from "react";
import type { Metadata } from "next";
import { getVerifiedAuthContext } from "@/lib/auth/rbac";
import { AdminForbidden } from "@/components/admin/admin-forbidden";
import { getMenuEntrySettings } from "@/lib/navigation/menu-settings";
import { getCategoryCatalogFacts } from "@/lib/navigation/catalog-facts";
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

  const entries: MenuEntryView[] = settings.map((entry) => ({
    id: entry.id,
    label: entry.adminLabel,
    description: entry.description,
    isVisible: entry.isVisible,
    categorySlug: entry.categorySlug ?? null,
    publishedProducts: entry.categorySlug
      ? (facts.get(entry.categorySlug)?.publishedProducts ?? 0)
      : null,
    missingDestinations: entry.missingDestinations ?? [],
  }));

  return <MenuWorkspace entries={entries} />;
}
