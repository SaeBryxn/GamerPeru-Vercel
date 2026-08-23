import fs from "node:fs";
import path from "node:path";
import postgres from "postgres";

const fixturePath = path.resolve(process.cwd(), "tests/fixtures/cart-e2e-catalog.json");
const rawData = fs.readFileSync(fixturePath, "utf-8");
const fixture = JSON.parse(rawData);

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("[Cart E2E Seed] ERROR: DATABASE_URL environment variable is required.");
  process.exit(1);
}

const parsedUrl = new URL(databaseUrl);
if (
  parsedUrl.hostname !== "127.0.0.1" ||
  parsedUrl.port !== "54322" ||
  parsedUrl.pathname !== "/postgres"
) {
  console.error(
    `[Cart E2E Seed] SECURITY VIOLATION: DATABASE_URL must target 127.0.0.1:54322/postgres. Received: ${parsedUrl.hostname}:${parsedUrl.port}${parsedUrl.pathname}`
  );
  process.exit(1);
}

const sql = postgres(databaseUrl, { max: 1 });

async function seed() {
  try {
    console.log(
      "[Cart E2E Seed] Running collision preflight and seeding deterministic Cart E2E catalog rows into local PostgreSQL..."
    );

    await sql.begin(async (tx) => {
      // 1. Collision Preflight: Brand
      const existingBrands = await tx`
        SELECT id, slug FROM brands
        WHERE id = ${fixture.brand.id} OR slug = ${fixture.brand.slug}
      `;
      for (const row of existingBrands) {
        if (row.id !== fixture.brand.id || row.slug !== fixture.brand.slug) {
          throw new Error(
            `[Cart E2E Seed] COLLISION PREFLIGHT FAILED on brands: Found existing row (id=${row.id}, slug=${row.slug}) that does not match expected fixture (id=${fixture.brand.id}, slug=${fixture.brand.slug}).`
          );
        }
      }

      // 2. Collision Preflight: Category
      const existingCategories = await tx`
        SELECT id, slug FROM categories
        WHERE id = ${fixture.category.id} OR slug = ${fixture.category.slug}
      `;
      for (const row of existingCategories) {
        if (row.id !== fixture.category.id || row.slug !== fixture.category.slug) {
          throw new Error(
            `[Cart E2E Seed] COLLISION PREFLIGHT FAILED on categories: Found existing row (id=${row.id}, slug=${row.slug}) that does not match expected fixture (id=${fixture.category.id}, slug=${fixture.category.slug}).`
          );
        }
      }

      // 3. Collision Preflight: Product
      const existingProducts = await tx`
        SELECT id, slug FROM products
        WHERE id = ${fixture.product.id} OR slug = ${fixture.product.slug}
      `;
      for (const row of existingProducts) {
        if (row.id !== fixture.product.id || row.slug !== fixture.product.slug) {
          throw new Error(
            `[Cart E2E Seed] COLLISION PREFLIGHT FAILED on products: Found existing row (id=${row.id}, slug=${row.slug}) that does not match expected fixture (id=${fixture.product.id}, slug=${fixture.product.slug}).`
          );
        }
      }

      // 4. Collision Preflight: Variants
      const variantIds = fixture.variants.map((v) => v.id);
      const variantSkus = fixture.variants.map((v) => v.sku);
      const existingVariants = await tx`
        SELECT id, sku FROM product_variants
        WHERE id = ANY(${variantIds}) OR sku = ANY(${variantSkus})
      `;
      for (const row of existingVariants) {
        const expectedVariant = fixture.variants.find((v) => v.id === row.id || v.sku === row.sku);
        if (!expectedVariant || row.id !== expectedVariant.id || row.sku !== expectedVariant.sku) {
          throw new Error(
            `[Cart E2E Seed] COLLISION PREFLIGHT FAILED on product_variants: Found existing row (id=${row.id}, sku=${row.sku}) that does not match expected fixture.`
          );
        }
      }

      // 5. Seed Brand
      await tx`
        INSERT INTO brands (id, name, slug, status)
        VALUES (${fixture.brand.id}, ${fixture.brand.name}, ${fixture.brand.slug}, ${fixture.brand.status})
        ON CONFLICT (id) DO UPDATE SET
          name = EXCLUDED.name,
          slug = EXCLUDED.slug,
          status = EXCLUDED.status,
          updated_at = NOW();
      `;

      // 6. Seed Category
      await tx`
        INSERT INTO categories (id, name, slug, status, display_order)
        VALUES (${fixture.category.id}, ${fixture.category.name}, ${fixture.category.slug}, ${fixture.category.status}, 1)
        ON CONFLICT (id) DO UPDATE SET
          name = EXCLUDED.name,
          slug = EXCLUDED.slug,
          status = EXCLUDED.status,
          updated_at = NOW();
      `;

      // 7. Seed Product
      await tx`
        INSERT INTO products (id, brand_id, category_id, name, slug, status)
        VALUES (${fixture.product.id}, ${fixture.brand.id}, ${fixture.category.id}, ${fixture.product.name}, ${fixture.product.slug}, ${fixture.product.status})
        ON CONFLICT (id) DO UPDATE SET
          name = EXCLUDED.name,
          slug = EXCLUDED.slug,
          status = EXCLUDED.status,
          updated_at = NOW();
      `;

      // 8. Seed Variants
      for (const v of fixture.variants) {
        await tx`
          INSERT INTO product_variants (id, product_id, sku, title, price_cents, compare_at_price_cents, weight_grams, attributes, status, display_order)
          VALUES (
            ${v.id},
            ${v.productId},
            ${v.sku},
            ${v.title},
            ${v.priceCents},
            ${v.compareAtPriceCents ?? null},
            ${v.weightGrams ?? null},
            ${JSON.stringify(v.attributes)},
            ${v.status},
            ${v.displayOrder}
          )
          ON CONFLICT (id) DO UPDATE SET
            sku = EXCLUDED.sku,
            title = EXCLUDED.title,
            price_cents = EXCLUDED.price_cents,
            compare_at_price_cents = EXCLUDED.compare_at_price_cents,
            weight_grams = EXCLUDED.weight_grams,
            attributes = EXCLUDED.attributes,
            status = EXCLUDED.status,
            display_order = EXCLUDED.display_order,
            updated_at = NOW();
        `;
      }
    });

    console.log(
      "[Cart E2E Seed] Successfully validated collision preflight and seeded Cart E2E fixture data in transaction."
    );
  } finally {
    await sql.end();
  }
}

seed().catch((err) => {
  console.error("[Cart E2E Seed] Failed:", err);
  process.exit(1);
});
