"use server";

import { revalidatePath } from "next/cache";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { storefrontMenuEntries } from "@/db/schema";
import { getVerifiedAuthContext } from "@/lib/auth/rbac";
import type { ActionResult } from "@/lib/admin/catalog/actions";
import { getMenuEntryDescriptor, MENU_ENTRY_DESCRIPTORS } from "@/lib/navigation/menu-entries";

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

/** The menu is part of the root layout, so every storefront route has to be refreshed. */
function revalidateStorefrontMenu() {
  revalidatePath("/admin/menu");
  revalidatePath("/", "layout");
}

export async function setMenuEntryVisibilityAction(
  entryId: string,
  isVisible: boolean
): Promise<ActionResult> {
  const denied = await requireCatalogManager();
  if (denied) return denied;

  const descriptor = getMenuEntryDescriptor(entryId);
  if (!descriptor) {
    return { success: false, error: "Esa sección del menú no existe.", code: "NOT_FOUND" };
  }

  await db
    .insert(storefrontMenuEntries)
    .values({ entryId, isVisible, displayOrder: descriptor.defaultOrder })
    .onConflictDoUpdate({
      target: storefrontMenuEntries.entryId,
      set: { isVisible, updatedAt: sql`now()` },
    });

  revalidateStorefrontMenu();
  return { success: true };
}

export async function reorderMenuEntriesAction(orderedIds: string[]): Promise<ActionResult> {
  const denied = await requireCatalogManager();
  if (denied) return denied;

  const known = orderedIds.filter((id) => getMenuEntryDescriptor(id));
  if (known.length !== MENU_ENTRY_DESCRIPTORS.length) {
    return {
      success: false,
      error: "El orden enviado no incluye todas las secciones.",
      code: "INVALID_INPUT",
    };
  }

  await db.transaction(async (tx) => {
    for (const [index, entryId] of known.entries()) {
      const descriptor = getMenuEntryDescriptor(entryId);
      await tx
        .insert(storefrontMenuEntries)
        .values({
          entryId,
          isVisible: descriptor?.defaultVisible ?? true,
          displayOrder: index,
        })
        .onConflictDoUpdate({
          target: storefrontMenuEntries.entryId,
          set: { displayOrder: index, updatedAt: sql`now()` },
        });
    }
  });

  revalidateStorefrontMenu();
  return { success: true };
}
