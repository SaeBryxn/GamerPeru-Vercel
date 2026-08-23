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
      "[Cart E2E Seed] Seeding deterministic Cart E2E catalog rows into local PostgreSQL..."
    );

    // 1. Brand
    await sql`
      INSERT INTO brands (id, name, slug, status)
      VALUES (${fixture.brand.id}, ${fixture.brand.name}, ${fixture.brand.slug}, ${fixture.brand.status})
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        slug = EXCLUDED.slug,
        status = EXCLUDED.status,
        updated_at = NOW();
    `;

    // 2. Category
    await sql`
      INSERT INTO categories (id, name, slug, status, display_order)
      VALUES (${fixture.category.id}, ${fixture.category.name}, ${fixture.category.slug}, ${fixture.category.status}, 1)
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        slug = EXCLUDED.slug,
        status = EXCLUDED.status,
        updated_at = NOW();
    `;

    // 3. Product
    await sql`
      INSERT INTO products (id, brand_id, category_id, name, slug, status)
      VALUES (${fixture.product.id}, ${fixture.brand.id}, ${fixture.category.id}, ${fixture.product.name}, ${fixture.product.slug}, ${fixture.product.status})
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        slug = EXCLUDED.slug,
        status = EXCLUDED.status,
        updated_at = NOW();
    `;

    // 4. Variants
    for (const v of fixture.variants) {
      await sql`
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

    console.log(
      "[Cart E2E Seed] Successfully seeded Cart E2E brand, category, product, and 2 variants."
    );
  } finally {
    await sql.end();
  }
}

seed().catch((err) => {
  console.error("[Cart E2E Seed] Failed:", err);
  process.exit(1);
});
