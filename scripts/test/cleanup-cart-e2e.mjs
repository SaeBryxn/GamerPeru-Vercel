import fs from "node:fs";
import path from "node:path";
import postgres from "postgres";

const fixturePath = path.resolve(process.cwd(), "tests/fixtures/cart-e2e-catalog.json");
const rawData = fs.readFileSync(fixturePath, "utf-8");
const fixture = JSON.parse(rawData);

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("[Cart E2E Cleanup] ERROR: DATABASE_URL environment variable is required.");
  process.exit(1);
}

const parsedUrl = new URL(databaseUrl);
if (
  parsedUrl.hostname !== "127.0.0.1" ||
  parsedUrl.port !== "54322" ||
  parsedUrl.pathname !== "/postgres"
) {
  console.error(
    `[Cart E2E Cleanup] SECURITY VIOLATION: DATABASE_URL must target 127.0.0.1:54322/postgres. Received: ${parsedUrl.hostname}:${parsedUrl.port}${parsedUrl.pathname}`
  );
  process.exit(1);
}

const sql = postgres(databaseUrl, { max: 1 });

async function cleanup() {
  try {
    console.log("[Cart E2E Cleanup] Cleaning up Cart E2E rows from local PostgreSQL...");
    const variantIds = fixture.variants.map((v) => v.id);

    // 1. Identify and delete cart_items referencing fixture variants
    if (variantIds.length > 0) {
      await sql`
        DELETE FROM cart_items
        WHERE variant_id = ANY(${variantIds});
      `;
    }

    // 2. Delete fixture variants
    for (const v of fixture.variants) {
      await sql`
        DELETE FROM product_variants
        WHERE id = ${v.id};
      `;
    }

    // 3. Delete fixture product
    await sql`
      DELETE FROM products
      WHERE id = ${fixture.product.id};
    `;

    // 4. Delete fixture category
    await sql`
      DELETE FROM categories
      WHERE id = ${fixture.category.id};
    `;

    // 5. Delete fixture brand
    await sql`
      DELETE FROM brands
      WHERE id = ${fixture.brand.id};
    `;

    console.log("[Cart E2E Cleanup] Successfully cleaned up Cart E2E fixture rows.");
  } finally {
    await sql.end();
  }
}

cleanup().catch((err) => {
  console.error("[Cart E2E Cleanup] Failed:", err);
  process.exit(1);
});
