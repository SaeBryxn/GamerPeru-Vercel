import React from "react";
import type { Metadata } from "next";
import { getVerifiedAuthContext } from "@/lib/auth/rbac";
import { AdminForbidden } from "@/components/admin/admin-forbidden";
import { listTaxonomy } from "@/lib/admin/taxonomy/service";
import { TaxonomyWorkspace } from "./taxonomy-workspace";

export const metadata: Metadata = {
  title: "Categorías y marcas | Administración",
};

export const dynamic = "force-dynamic";

export default async function TaxonomyPage() {
  const authContext = await getVerifiedAuthContext();

  if (authContext.status !== "READY" || !authContext.permissions.has("catalog:manage")) {
    return (
      <AdminForbidden email={authContext.status === "READY" ? authContext.email : undefined} />
    );
  }

  const [categories, brands] = await Promise.all([listTaxonomy("category"), listTaxonomy("brand")]);

  return <TaxonomyWorkspace categories={categories} brands={brands} />;
}
