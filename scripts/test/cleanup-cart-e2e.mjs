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
    console.log("[Cart E2E Cleanup] Safely cleaning up Cart E2E rows from local PostgreSQL...");
    const variantIds = fixture.variants.map((v) => v.id);

    await sql.begin(async (tx) => {
      let capturedCartIds = [];
      if (variantIds.length > 0) {
        // 1. Capture DISTINCT cart_ids referencing fixture variants
        const cartRows = await tx`
          SELECT DISTINCT cart_id
          FROM cart_items
          WHERE variant_id = ANY(${variantIds})
        `;
        capturedCartIds = cartRows.map((r) => r.cart_id);

        // 2. Delete fixture cart_items
        await tx`
          DELETE FROM cart_items
          WHERE variant_id = ANY(${variantIds});
        `;

        // 3. For each captured cart, delete ONLY if it has zero remaining cart_items
        if (capturedCartIds.length > 0) {
          await tx`
            DELETE FROM carts
            WHERE id = ANY(${capturedCartIds})
              AND NOT EXISTS (
                SELECT 1 FROM cart_items WHERE cart_items.cart_id = carts.id
              );
          `;
        }
      }

      // 4. Delete fixture variants
      for (const v of fixture.variants) {
        await tx`
          DELETE FROM product_variants
          WHERE id = ${v.id};
        `;
      }

      // 5. Delete fixture product
      await tx`
        DELETE FROM products
        WHERE id = ${fixture.product.id};
      `;

      // 6. Delete fixture category
      await tx`
        DELETE FROM categories
        WHERE id = ${fixture.category.id};
      `;

      // 7. Delete fixture brand
      await tx`
        DELETE FROM brands
        WHERE id = ${fixture.brand.id};
      `;
    });

    console.log(
      "[Cart E2E Cleanup] Successfully cleaned up Cart E2E fixture rows and orphaned carts in transaction."
    );
  } finally {
    await sql.end();
  }
}

cleanup().catch((err) => {
  console.error("[Cart E2E Cleanup] Failed:", err);
  process.exit(1);
});
