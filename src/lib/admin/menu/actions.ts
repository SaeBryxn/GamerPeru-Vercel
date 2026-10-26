"use server";

import { writeFeaturedProducts } from "@/lib/catalog/featured-product-storage";
import { CatalogDomainError } from "@/lib/admin/catalog/types";
import { MenuContentSchema } from "@/lib/navigation/menu-content-schema";
import { ProductSelectionSchema } from "@/lib/catalog/curated-products";

import { revalidateStorefrontCatalog } from "@/lib/catalog/catalog-cache";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { auditEvents, storefrontMenuEntries, storefrontMenuLinks } from "@/db/schema";
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
  revalidateStorefrontCatalog();
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
  if (known.length !== MENU_ENTRY_DESCRIPTORS.length || new Set(known).size !== known.length) {
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

export async function setMenuProductSelectionAction(
  entryId: string,
  input: unknown
): Promise<ActionResult> {
  const denied = await requireCatalogManager();
  if (denied) return denied;
  const descriptor = getMenuEntryDescriptor(entryId);
  const parsed = ProductSelectionSchema.safeParse(input);
  if (!descriptor?.categorySlug || !parsed.success)
    return { success: false, error: "Revisa los productos elegidos.", code: "INVALID_INPUT" };
  try {
    await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('storefront_menu'))`);
      await tx
        .insert(storefrontMenuEntries)
        .values({
          entryId,
          isVisible: descriptor.defaultVisible,
          displayOrder: descriptor.defaultOrder,
        })
        .onConflictDoNothing();
      const selection = await writeFeaturedProducts(
        tx,
        { entryId },
        parsed.data,
        descriptor.categorySlug
      );
      await tx
        .update(storefrontMenuEntries)
        .set({ productSelection: selection, updatedAt: sql`now()` })
        .where(eq(storefrontMenuEntries.entryId, entryId));
    });
    revalidateStorefrontMenu();
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof CatalogDomainError
          ? error.message
          : "No se pudo guardar la selección. Comprueba que la migración del menú esté aplicada.",
      code: "SYSTEM_ERROR",
    };
  }
}

/** Replaces the editable links atomically; an empty list is an explicit editorial decision. */
export async function updateMenuContentAction(input: unknown): Promise<ActionResult> {
  const denied = await requireCatalogManager();
  if (denied) return denied;
  const parsed = MenuContentSchema.safeParse(input);
  if (!parsed.success)
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Revisa los enlaces.",
      code: "INVALID_INPUT",
    };
  const descriptor = getMenuEntryDescriptor(parsed.data.entryId);
  if (!descriptor) return { success: false, error: "La sección no existe.", code: "NOT_FOUND" };
  const auth = await getVerifiedAuthContext();
  if (auth.status !== "READY")
    return { success: false, error: "Inicia sesión de nuevo.", code: "AUTHENTICATION_REQUIRED" };
  try {
    await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('storefront_menu'))`);
      const { entryId, label, href, links } = parsed.data;
      await tx
        .insert(storefrontMenuEntries)
        .values({
          entryId,
          label,
          href,
          linksConfigured: true,
          isVisible: descriptor.defaultVisible,
          displayOrder: descriptor.defaultOrder,
        })
        .onConflictDoUpdate({
          target: storefrontMenuEntries.entryId,
          set: { label, href, linksConfigured: true, updatedAt: sql`now()` },
        });
      await tx.delete(storefrontMenuLinks).where(eq(storefrontMenuLinks.entryId, entryId));
      if (links.length)
        await tx
          .insert(storefrontMenuLinks)
          .values(links.map((link, displayOrder) => ({ ...link, entryId, displayOrder })));
      await tx.insert(auditEvents).values({
        actorType: "ADMIN",
        actorId: auth.authUserId,
        action: "storefront:menu:content",
        targetType: "storefront_menu",
        targetId: entryId,
        metadata: { link_count: links.length },
      });
    });
    revalidateStorefrontMenu();
    return { success: true };
  } catch {
    return {
      success: false,
      error: "No se pudieron guardar los enlaces. Comprueba que la migración 0027 esté aplicada.",
      code: "SYSTEM_ERROR",
    };
  }
}
