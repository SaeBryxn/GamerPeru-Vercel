import React from "react";
import type { Metadata } from "next";
import { getMenuCatalogEntries } from "@/lib/navigation/menu-catalog";
import { asc } from "drizzle-orm";
import { db } from "@/db";
import { categories } from "@/db/schema";
import { AdminForbidden } from "@/components/admin/admin-forbidden";
import { getVerifiedAuthContext } from "@/lib/auth/rbac";
import { logger } from "@/lib/logger";
import { getAdminHomeState, type AdminHomeState } from "@/lib/home/home-sections-service";
import { HomeEditor } from "./home-editor";

export const metadata: Metadata = {
  title: "Home de la tienda | Administración",
};

export const dynamic = "force-dynamic";

export default async function AdminHomePage() {
  const authContext = await getVerifiedAuthContext();
  if (authContext.status !== "READY" || !authContext.permissions.has("catalog:manage")) {
    return (
      <AdminForbidden email={authContext.status === "READY" ? authContext.email : undefined} />
    );
  }

  let state: AdminHomeState | null = null;
  try {
    state = await getAdminHomeState({ authContext });
  } catch {
    // Before migration 0021 is applied the table does not exist; the editor explains it.
    logger.warn({ event: "admin_home_sections_unavailable" });
  }

  const categoryOptions = await db
    .select({ slug: categories.slug, name: categories.name })
    .from(categories)
    .orderBy(asc(categories.displayOrder), asc(categories.name));

  const products = (await getMenuCatalogEntries()).map((product) => ({
    slug: product.slug,
    name: product.name,
    categorySlug: product.categorySlug,
  }));
  return <HomeEditor initialState={state} categories={categoryOptions} products={products} />;
}
