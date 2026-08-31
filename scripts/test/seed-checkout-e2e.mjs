import fs from "node:fs";
import path from "node:path";
import postgres from "postgres";

const fixturePath = path.resolve(process.cwd(), "tests/fixtures/cart-e2e-catalog.json");
const rawData = fs.readFileSync(fixturePath, "utf-8");
const fixture = JSON.parse(rawData);

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("[Checkout E2E Seed] ERROR: DATABASE_URL environment variable is required.");
  process.exit(1);
}

const parsedUrl = new URL(databaseUrl);
if (
  parsedUrl.hostname !== "127.0.0.1" ||
  parsedUrl.port !== "54322" ||
  parsedUrl.pathname !== "/postgres"
) {
  console.error(
    `[Checkout E2E Seed] SECURITY VIOLATION: DATABASE_URL must target 127.0.0.1:54322/postgres. Received: ${parsedUrl.hostname}:${parsedUrl.port}${parsedUrl.pathname}`
  );
  process.exit(1);
}

const sql = postgres(databaseUrl, { max: 1 });

async function seed() {
  try {
    console.log(
      "[Checkout E2E Seed] Seeding deterministic Checkout E2E test fixtures into local PostgreSQL..."
    );

    await sql.begin(async (tx) => {
      // 1. Seed Brand
      await tx`
        INSERT INTO brands (id, name, slug, status)
        VALUES (${fixture.brand.id}, ${fixture.brand.name}, ${fixture.brand.slug}, ${fixture.brand.status})
        ON CONFLICT (id) DO UPDATE SET
          name = EXCLUDED.name,
          slug = EXCLUDED.slug,
          status = EXCLUDED.status,
          updated_at = NOW();
      `;

      // 2. Seed Category
      await tx`
        INSERT INTO categories (id, name, slug, status, display_order)
        VALUES (${fixture.category.id}, ${fixture.category.name}, ${fixture.category.slug}, ${fixture.category.status}, 1)
        ON CONFLICT (id) DO UPDATE SET
          name = EXCLUDED.name,
          slug = EXCLUDED.slug,
          status = EXCLUDED.status,
          updated_at = NOW();
      `;

      // 3. Seed Product
      await tx`
        INSERT INTO products (id, brand_id, category_id, name, slug, status)
        VALUES (${fixture.product.id}, ${fixture.brand.id}, ${fixture.category.id}, ${fixture.product.name}, ${fixture.product.slug}, ${fixture.product.status})
        ON CONFLICT (id) DO UPDATE SET
          name = EXCLUDED.name,
          slug = EXCLUDED.slug,
          status = EXCLUDED.status,
          updated_at = NOW();
      `;

      // 4. Seed Variants
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

      // 5. Seed Inventory Location
      const locationId = "018f0000-0000-7000-8000-00000000e004";
      await tx`
        INSERT INTO inventory_locations (id, code, name, is_active)
        VALUES (${locationId}, 'ALMACEN_CENTRAL_TEST', 'Almacén Central Test', true)
        ON CONFLICT (id) DO UPDATE SET
          name = EXCLUDED.name,
          is_active = EXCLUDED.is_active;
      `;

      // 6. Seed Inventory Items for Variants
      for (const v of fixture.variants) {
        await tx`
          INSERT INTO inventory_items (id, location_id, variant_id, quantity_on_hand, quantity_reserved, quantity_allocated, reorder_point)
          VALUES (
            gen_random_uuid(),
            ${locationId},
            ${v.id},
            50,
            0,
            0,
            0
          )
          ON CONFLICT (location_id, variant_id) DO UPDATE SET
            quantity_on_hand = 50,
            quantity_reserved = 0,
            quantity_allocated = 0,
            updated_at = NOW();
        `;
      }

      // 7. Seed Shipping Methods
      const shippingMethodId1 = "018f0000-0000-7000-8000-00000000e001";
      await tx`
        INSERT INTO shipping_methods (id, code, name, base_price_cents, estimated_days_min, estimated_days_max, is_active)
        VALUES (${shippingMethodId1}, 'LIMA_EXPRESS', 'Envío Express Lima', 1500, 1, 2, true)
        ON CONFLICT (id) DO UPDATE SET
          code = EXCLUDED.code,
          name = EXCLUDED.name,
          base_price_cents = EXCLUDED.base_price_cents,
          estimated_days_min = EXCLUDED.estimated_days_min,
          estimated_days_max = EXCLUDED.estimated_days_max,
          is_active = EXCLUDED.is_active;
      `;

      const shippingMethodId2 = "018f0000-0000-7000-8000-00000000e005";
      await tx`
        INSERT INTO shipping_methods (id, code, name, base_price_cents, estimated_days_min, estimated_days_max, is_active)
        VALUES (${shippingMethodId2}, 'PROVINCIA_REGULAR', 'Envío Regular Provincia', 2500, 3, 5, true)
        ON CONFLICT (id) DO UPDATE SET
          code = EXCLUDED.code,
          name = EXCLUDED.name,
          base_price_cents = EXCLUDED.base_price_cents,
          estimated_days_min = EXCLUDED.estimated_days_min,
          estimated_days_max = EXCLUDED.estimated_days_max,
          is_active = EXCLUDED.is_active;
      `;

      // 8. Seed Payment Method Configuration (initial without instruction version)
      const paymentMethodId = "018f0000-0000-7000-8000-00000000e002";
      const instructionVersionId = "018f0000-0000-7000-8000-00000000e003";

      await tx`
        INSERT INTO payment_method_configurations (id, code, name, method_type, is_active, display_order)
        VALUES (${paymentMethodId}, 'YAPE_MANUAL', 'Yape', 'MANUAL', true, 1)
        ON CONFLICT (id) DO UPDATE SET
          code = EXCLUDED.code,
          name = EXCLUDED.name,
          is_active = EXCLUDED.is_active,
          updated_at = NOW();
      `;

      await tx`
        INSERT INTO payment_instruction_versions (id, payment_method_code, version_number, recipient_name, account_identifier, instruction_text, is_active)
        VALUES (${instructionVersionId}, 'YAPE_MANUAL', 1, 'Test Storeholder', '999000111', 'Instrucciones sintéticas de prueba', true)
        ON CONFLICT (id) DO UPDATE SET
          instruction_text = EXCLUDED.instruction_text,
          account_identifier = EXCLUDED.account_identifier,
          recipient_name = EXCLUDED.recipient_name,
          is_active = EXCLUDED.is_active;
      `;

      await tx`
        UPDATE payment_method_configurations
        SET current_instruction_version_id = ${instructionVersionId}, updated_at = NOW()
        WHERE id = ${paymentMethodId};
      `;
    });

    console.log("[Checkout E2E Seed] Successfully seeded Checkout test fixtures.");
  } finally {
    await sql.end();
  }
}

seed().catch((err) => {
  console.error("[Checkout E2E Seed] Failed:", err);
  process.exit(1);
});
