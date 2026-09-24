/**
 * Gamer Perú — Carga inicial del catálogo
 *
 * Inserta lo mínimo que la tienda y el panel necesitan para operar:
 * categorías, marcas, almacenes de inventario y el inventario real de la
 * tienda (productos + su variante), todo en estado BORRADOR.
 *
 * Es idempotente: se puede correr varias veces sin duplicar nada.
 *
 *   node scripts/seed-catalog.mjs            # muestra lo que haría
 *   node scripts/seed-catalog.mjs --apply    # escribe en la base
 */
import fs from "node:fs";
import path from "node:path";
import postgres from "postgres";

const APPLY = process.argv.includes("--apply");
const ROOT = process.cwd();

function readEnv(key) {
  const line = fs
    .readFileSync(path.join(ROOT, ".env.local"), "utf8")
    .split(/\r?\n/)
    .find((l) => l.startsWith(`${key}=`));
  if (!line) throw new Error(`Falta ${key} en .env.local`);
  let value = line.slice(key.length + 1).trim();
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }
  return value;
}

/** UUIDv7-shaped ids, estables entre corridas. */
const id = (suffix) => `018f0000-0000-7000-8000-${suffix.padStart(12, "0")}`;

const CATEGORIES = [
  { id: id("c01"), name: "Mouses Gaming", slug: "mouses", order: 1 },
  { id: id("c02"), name: "Teclados Gaming", slug: "teclados", order: 2 },
  { id: id("c03"), name: "Mousepads Gaming", slug: "mousepads", order: 3 },
  { id: id("c04"), name: "Audio Gaming", slug: "audio", order: 4 },
  { id: id("c05"), name: "Accesorios Gaming", slug: "accesorios", order: 5 },
];

const BRANDS = [
  { id: id("b01"), name: "ATK", slug: "atk" },
  { id: id("b02"), name: "Mchose", slug: "mchose" },
  { id: id("b03"), name: "JINMS", slug: "jinms" },
  { id: id("b04"), name: "X-Raypad", slug: "x-raypad" },
];

const LOCATIONS = [
  { id: id("a01"), name: "Almacén principal Lima", code: "LOC-LIM-01" },
  { id: id("a02"), name: "Cuarentena Lima", code: "LOC-LIM-QUARANTINE" },
];

/** Inventario real de la tienda: nombre, marca, categoría, color y precio. */
const PRODUCTS = [
  ["ATK A9 Plus 2.0 Black", "atk", "mouses", "Negro", 18900],
  ["ATK A9 Plus 2.0 White", "atk", "mouses", "Blanco", 19500],
  ["ATK A9 PRO MAX White", "atk", "mouses", "Blanco", 28900],
  ["Mchose A7 V3 Pro+ White", "mchose", "mouses", "Blanco", 35900],
  ["Mchose K7 v2 Ultra+ Black Gold", "mchose", "mouses", "Negro / Dorado", 39900],
  ["Mchose K7 v2 Ultra+ White Gold", "mchose", "mouses", "Blanco / Dorado", 39900],
  ["JINMS X7 Ultra Black", "jinms", "mouses", "Negro", 15900],
  ["ATK Anime Mouse Pad - Reverie Pink", "atk", "mousepads", "Rosado", 10900],
  ["ATK Sky Black (Large Size)", "atk", "mousepads", "Negro", 12900],
  ["ATK Sky Orange (Large Size)", "atk", "mousepads", "Naranja", 12900],
  ["ATK Sky Orange (Small Size)", "atk", "mousepads", "Naranja", 9900],
  ["ATK 99G Air Mouse Pad Green", "atk", "mousepads", "Verde", 11900],
  ["X-Raypad JADE AIR", "x-raypad", "accesorios", null, 5900],
  ["X-Raypad Obsidian Air Pro", "x-raypad", "accesorios", null, 6900],
];

function slugify(name) {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function sku(slug) {
  return slug.toUpperCase().slice(0, 40);
}

async function main() {
  const sql = postgres(readEnv("DATABASE_URL"), {
    prepare: false,
    max: 1,
    connect_timeout: 15,
  });

  try {
    const [{ n: existing }] = await sql`select count(*)::int as n from products`;
    console.log(`Productos actuales en la base: ${existing}`);

    if (!APPLY) {
      console.log("\nModo simulación. Se insertarían:");
      console.log(`  ${CATEGORIES.length} categorías, ${BRANDS.length} marcas`);
      console.log(`  ${LOCATIONS.length} almacenes de inventario`);
      console.log(`  ${PRODUCTS.length} productos con su variante inicial (estado BORRADOR)`);
      console.log("\nCorre con --apply para escribir.");
      return;
    }

    await sql.begin(async (tx) => {
      for (const c of CATEGORIES) {
        await tx`
          insert into categories (id, name, slug, display_order, status)
          values (${c.id}, ${c.name}, ${c.slug}, ${c.order}, 'PUBLISHED')
          on conflict (slug) do update set name = excluded.name, status = 'PUBLISHED'`;
      }

      for (const b of BRANDS) {
        await tx`
          insert into brands (id, name, slug, status)
          values (${b.id}, ${b.name}, ${b.slug}, 'PUBLISHED')
          on conflict (slug) do update set name = excluded.name, status = 'PUBLISHED'`;
      }

      for (const l of LOCATIONS) {
        await tx`
          insert into inventory_locations (id, name, code, is_active)
          values (${l.id}, ${l.name}, ${l.code}, true)
          on conflict (code) do update set name = excluded.name, is_active = true`;
      }

      let index = 0;
      for (const [name, brandSlug, categorySlug, color, priceCents] of PRODUCTS) {
        index += 1;
        const slug = slugify(name);
        const productId = id(`d${String(index).padStart(3, "0")}`);
        const variantId = id(`e${String(index).padStart(3, "0")}`);
        const brand = BRANDS.find((b) => b.slug === brandSlug);
        const category = CATEGORIES.find((c) => c.slug === categorySlug);

        // Draft on purpose: nothing reaches the storefront until it has photos
        // and stock and you publish it from the admin.
        await tx`
          insert into products (id, brand_id, category_id, name, slug, status, is_featured)
          values (${productId}, ${brand.id}, ${category.id}, ${name}, ${slug}, 'DRAFT', false)
          on conflict (slug) do update set
            brand_id = excluded.brand_id,
            category_id = excluded.category_id,
            name = excluded.name,
            updated_at = now()`;

        const [product] = await tx`select id from products where slug = ${slug}`;

        await tx`
          insert into product_variants (
            id, product_id, sku, title, price_cents, status, display_order, attributes
          )
          values (
            ${variantId}, ${product.id}, ${sku(slug)}, ${color ?? "Estándar"},
            ${priceCents}, 'ACTIVE', 1, ${color ? { color } : {}}
          )
          on conflict (sku) do update set
            title = excluded.title,
            price_cents = excluded.price_cents,
            updated_at = now()`;

        const [variant] = await tx`select id from product_variants where sku = ${sku(slug)}`;

        // Stock starts at zero: you load the real numbers from the admin.
        for (const location of LOCATIONS) {
          const [loc] = await tx`select id from inventory_locations where code = ${location.code}`;
          await tx`
            insert into inventory_items (id, variant_id, location_id, quantity_on_hand)
            values (gen_random_uuid(), ${variant.id}, ${loc.id}, 0)
            on conflict (variant_id, location_id) do nothing`;
        }
      }
    });

    const counts = await sql`
      select
        (select count(*)::int from categories) as categorias,
        (select count(*)::int from brands) as marcas,
        (select count(*)::int from inventory_locations) as almacenes,
        (select count(*)::int from products) as productos,
        (select count(*)::int from product_variants) as variantes,
        (select count(*)::int from inventory_items) as inventario`;
    console.log("\nListo:", counts[0]);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((error) => {
  console.error("Falló la carga:", error.message);
  process.exitCode = 1;
});
