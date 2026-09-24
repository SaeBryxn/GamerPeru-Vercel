import "server-only";
import { asc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { brands, categories } from "@/db/schema";

export type TaxonomyKind = "category" | "brand";
export type TaxonomyStatus = "DRAFT" | "PUBLISHED" | "ARCHIVED";

export interface TaxonomyRow {
  id: string;
  name: string;
  slug: string;
  status: TaxonomyStatus;
  displayOrder: number | null;
  /** Products attached, so nothing is archived blindly. */
  productCount: number;
}

export interface TaxonomyInput {
  name: string;
  slug: string;
  status: TaxonomyStatus;
  displayOrder?: number | null;
}

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function normalizeTaxonomyInput(
  input: TaxonomyInput
): { valid: true; value: Required<TaxonomyInput> } | { valid: false; error: string } {
  const name = input.name.trim();
  const slug = input.slug.trim().toLowerCase();

  if (name.length < 2 || name.length > 120) {
    return { valid: false, error: "El nombre debe tener entre 2 y 120 caracteres." };
  }
  if (!SLUG_PATTERN.test(slug) || slug.length > 120) {
    return {
      valid: false,
      error: "La URL solo admite minúsculas, números y guiones (ej. mouses-gaming).",
    };
  }
  if (!["DRAFT", "PUBLISHED", "ARCHIVED"].includes(input.status)) {
    return { valid: false, error: "Estado inválido." };
  }

  return {
    valid: true,
    value: {
      name,
      slug,
      status: input.status,
      displayOrder: input.displayOrder ?? 0,
    },
  };
}

/**
 * Correlated product counts are written as literal SQL: interpolating Drizzle columns inside a
 * raw subquery renders them unqualified, so the correlation silently resolves against the inner
 * table and always counts zero.
 */
const PRODUCT_COUNT_BY_CATEGORY = sql<number>`(select count(*)::int from products where products.category_id = categories.id)`;
const PRODUCT_COUNT_BY_BRAND = sql<number>`(select count(*)::int from products where products.brand_id = brands.id)`;

export async function listTaxonomy(kind: TaxonomyKind): Promise<TaxonomyRow[]> {
  if (kind === "category") {
    const rows = await db
      .select({
        id: categories.id,
        name: categories.name,
        slug: categories.slug,
        status: categories.status,
        displayOrder: categories.displayOrder,
        productCount: PRODUCT_COUNT_BY_CATEGORY,
      })
      .from(categories)
      .orderBy(asc(categories.displayOrder), asc(categories.name));
    return rows;
  }

  const rows = await db
    .select({
      id: brands.id,
      name: brands.name,
      slug: brands.slug,
      status: brands.status,
      displayOrder: sql<number | null>`null`,
      productCount: PRODUCT_COUNT_BY_BRAND,
    })
    .from(brands)
    .orderBy(asc(brands.name));
  return rows;
}

async function slugTaken(kind: TaxonomyKind, slug: string, excludeId?: string): Promise<boolean> {
  const table = kind === "category" ? categories : brands;
  const rows = await db.select({ id: table.id }).from(table).where(eq(table.slug, slug)).limit(2);
  return rows.some((row) => row.id !== excludeId);
}

export async function createTaxonomy(
  kind: TaxonomyKind,
  input: TaxonomyInput
): Promise<{ success: true; id: string } | { success: false; error: string }> {
  const normalized = normalizeTaxonomyInput(input);
  if (!normalized.valid) return { success: false, error: normalized.error };

  if (await slugTaken(kind, normalized.value.slug)) {
    return { success: false, error: "Ya existe un registro con esa URL." };
  }

  if (kind === "category") {
    const [row] = await db
      .insert(categories)
      .values({
        name: normalized.value.name,
        slug: normalized.value.slug,
        status: normalized.value.status,
        displayOrder: normalized.value.displayOrder ?? 0,
      })
      .returning({ id: categories.id });
    return { success: true, id: row!.id };
  }

  const [row] = await db
    .insert(brands)
    .values({
      name: normalized.value.name,
      slug: normalized.value.slug,
      status: normalized.value.status,
    })
    .returning({ id: brands.id });
  return { success: true, id: row!.id };
}

export async function updateTaxonomy(
  kind: TaxonomyKind,
  id: string,
  input: TaxonomyInput
): Promise<{ success: true } | { success: false; error: string }> {
  const normalized = normalizeTaxonomyInput(input);
  if (!normalized.valid) return { success: false, error: normalized.error };

  if (await slugTaken(kind, normalized.value.slug, id)) {
    return { success: false, error: "Ya existe otro registro con esa URL." };
  }

  // Archiving something still in use would hide products without warning.
  if (normalized.value.status === "ARCHIVED") {
    const rows = await listTaxonomy(kind);
    const current = rows.find((row) => row.id === id);
    if (current && current.productCount > 0) {
      return {
        success: false,
        error: `No se puede archivar: tiene ${current.productCount} producto(s) asociado(s).`,
      };
    }
  }

  if (kind === "category") {
    await db
      .update(categories)
      .set({
        name: normalized.value.name,
        slug: normalized.value.slug,
        status: normalized.value.status,
        displayOrder: normalized.value.displayOrder ?? 0,
        updatedAt: new Date(),
      })
      .where(eq(categories.id, id));
    return { success: true };
  }

  await db
    .update(brands)
    .set({
      name: normalized.value.name,
      slug: normalized.value.slug,
      status: normalized.value.status,
      updatedAt: new Date(),
    })
    .where(eq(brands.id, id));
  return { success: true };
}
