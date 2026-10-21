"use server";

import { revalidatePath } from "next/cache";
import { revalidateStorefrontCatalog } from "@/lib/catalog/catalog-cache";
import { getVerifiedAuthContext } from "@/lib/auth/rbac";
import type { ActionResult } from "@/lib/admin/catalog/actions";
import { createTaxonomy, updateTaxonomy, type TaxonomyInput, type TaxonomyKind } from "./service";

async function requireCatalogManager<T>(): Promise<ActionResult<T> | null> {
  const authContext = await getVerifiedAuthContext();
  if (authContext.status !== "READY") {
    return {
      success: false,
      error: "Debes iniciar sesión con una cuenta de personal autorizada.",
      code: "AUTHENTICATION_REQUIRED",
    };
  }
  if (!authContext.permissions.has("catalog:manage")) {
    return {
      success: false,
      error: "No tienes permisos de gestión de catálogo (catalog:manage).",
      code: "FORBIDDEN",
    };
  }
  return null;
}

/** Admin screens that list taxonomy and the storefront catalog, refreshed after every change. */
function revalidateTaxonomy() {
  revalidatePath("/admin/taxonomia");
  revalidatePath("/admin/products/new");
  revalidateStorefrontCatalog();
}

export async function createTaxonomyAction(
  kind: TaxonomyKind,
  input: TaxonomyInput
): Promise<ActionResult<{ id: string }>> {
  const denied = await requireCatalogManager<{ id: string }>();
  if (denied) return denied;

  const result = await createTaxonomy(kind, input);
  if (!result.success) return { success: false, error: result.error, code: "INVALID_INPUT" };

  revalidateTaxonomy();
  return { success: true, data: { id: result.id } };
}

export async function updateTaxonomyAction(
  kind: TaxonomyKind,
  id: string,
  input: TaxonomyInput
): Promise<ActionResult> {
  const denied = await requireCatalogManager();
  if (denied) return denied;

  const result = await updateTaxonomy(kind, id, input);
  if (!result.success) return { success: false, error: result.error, code: "INVALID_INPUT" };

  revalidateTaxonomy();
  return { success: true };
}
