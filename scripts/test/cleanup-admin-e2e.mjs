import postgres from "postgres";
import { createClient } from "@supabase/supabase-js";
import {
  assertLocalDatabaseTarget,
  assertLocalSupabaseApiTarget,
} from "../../src/lib/admin/test-target-guard.ts";

// 1. Strict Fail-Closed Database & Supabase API Target Guards
const databaseUrl = assertLocalDatabaseTarget(process.env.DATABASE_URL);
const supabaseUrl = assertLocalSupabaseApiTarget(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "http://127.0.0.1:54321"
);

// 2. Strict Service Role Key Requirement
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
if (!serviceRoleKey || typeof serviceRoleKey !== "string" || serviceRoleKey.trim().length === 0) {
  console.error(
    "[Admin E2E Cleanup] SECURITY VIOLATION: SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SECRET_KEY is required for local Admin E2E cleanup."
  );
  process.exit(1);
}

const sql = postgres(databaseUrl, { max: 1 });

export const ADMIN_E2E_USER_IDS = [
  "018f0000-0000-7000-8000-00000000ae01",
  "018f0000-0000-7000-8000-00000000ae02",
  "018f0000-0000-7000-8000-00000000ae03",
  "018f0000-0000-7000-8000-00000000ae04",
  "018f0000-0000-7000-8000-00000000ae05",
  "018f0000-0000-7000-8000-00000000ae06",
];

export async function cleanupAdminUsers() {
  try {
    console.log("[Admin E2E Cleanup] Cleaning up Admin E2E test users from local Supabase...");

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey.trim(), {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // 1. Clean GamerPeru-owned public schema tables
    await sql.begin(async (tx) => {
      await tx`DELETE FROM user_roles WHERE auth_user_id IN ${tx(ADMIN_E2E_USER_IDS)}`;
      await tx`DELETE FROM customer_profiles WHERE auth_user_id IN ${tx(ADMIN_E2E_USER_IDS)}`;
    });

    // 2. Clean up deterministic Product Manager test fixtures
    await cleanupAdminProductFixtures(sql);

    // 3. Delete Auth users exclusively via Supabase Admin Auth API
    for (const id of ADMIN_E2E_USER_IDS) {
      const { error } = await supabaseAdmin.auth.admin.deleteUser(id);
      if (
        error &&
        !error.message.toLowerCase().includes("user not found") &&
        !error.message.toLowerCase().includes("not found") &&
        error.status !== 404
      ) {
        throw new Error(
          `[Admin E2E Cleanup] Failed deleting Auth user ${id} via Admin Auth API: ${error.message}`
        );
      }
    }

    console.log("[Admin E2E Cleanup] Cleaned up Admin E2E test users and product fixtures.");
  } catch (err) {
    console.error(
      "[Admin E2E Cleanup] Failed to cleanup:",
      err instanceof Error ? err.message : err
    );
    process.exit(1);
  } finally {
    await sql.end();
  }
}

export async function cleanupAdminProductFixtures(clientSql) {
  console.log("[Admin E2E Cleanup] Cleaning up deterministic Product Manager fixtures...");

  await clientSql.begin(async (tx) => {
    // 1. Inventory Items
    await tx`
      DELETE FROM inventory_items
      WHERE id = '018f0000-0000-7000-8000-000000004a03'
         OR variant_id IN (
           SELECT id FROM product_variants WHERE product_id IN (
             SELECT id FROM products WHERE category_id IN ('018f0000-0000-7000-8000-00000000ca01', '018f0000-0000-7000-8000-00000000ca02') OR brand_id = '018f0000-0000-7000-8000-00000000ba01'
           )
         );
    `;

    // 2. Product Specifications (scoped to owned test categories / products)
    await tx`
      DELETE FROM product_specifications
      WHERE product_id IN (
        SELECT id FROM products WHERE category_id IN ('018f0000-0000-7000-8000-00000000ca01', '018f0000-0000-7000-8000-00000000ca02') OR brand_id = '018f0000-0000-7000-8000-00000000ba01' OR id IN ('018f0000-0000-7000-8000-000000001a01', '018f0000-0000-7000-8000-000000001a02', '018f0000-0000-7000-8000-000000001a03', '018f0000-0000-7000-8000-000000001a04')
      ) OR schema_id IN ('018f0000-0000-7000-8000-000000005a01', '018f0000-0000-7000-8000-000000005b01');
    `;

    // 3. Product Media
    await tx`
      DELETE FROM product_media
      WHERE product_id IN (
        SELECT id FROM products WHERE category_id IN ('018f0000-0000-7000-8000-00000000ca01', '018f0000-0000-7000-8000-00000000ca02') OR brand_id = '018f0000-0000-7000-8000-00000000ba01' OR id IN ('018f0000-0000-7000-8000-000000001a01', '018f0000-0000-7000-8000-000000001a02', '018f0000-0000-7000-8000-000000001a03', '018f0000-0000-7000-8000-000000001a04')
      ) OR media_asset_id IN ('018f0000-0000-7000-8000-000000006a01', '018f0000-0000-7000-8000-000000006a02');
    `;

    // 4. Media Assets
    await tx`
      DELETE FROM media_assets
      WHERE id IN (
        '018f0000-0000-7000-8000-000000006a01',
        '018f0000-0000-7000-8000-000000006a02'
      );
    `;

    // 5. Product Variants (scoped)
    await tx`
      DELETE FROM product_variants
      WHERE product_id IN (
        SELECT id FROM products WHERE category_id IN ('018f0000-0000-7000-8000-00000000ca01', '018f0000-0000-7000-8000-00000000ca02') OR brand_id = '018f0000-0000-7000-8000-00000000ba01' OR id IN ('018f0000-0000-7000-8000-000000001a01', '018f0000-0000-7000-8000-000000001a02', '018f0000-0000-7000-8000-000000001a03', '018f0000-0000-7000-8000-000000001a04')
      );
    `;

    // 6. Products (scoped strictly to owned categories, brand, or fixed test IDs)
    await tx`
      DELETE FROM products
      WHERE category_id IN ('018f0000-0000-7000-8000-00000000ca01', '018f0000-0000-7000-8000-00000000ca02')
         OR brand_id = '018f0000-0000-7000-8000-00000000ba01'
         OR id IN ('018f0000-0000-7000-8000-000000001a01', '018f0000-0000-7000-8000-000000001a02', '018f0000-0000-7000-8000-000000001a03', '018f0000-0000-7000-8000-000000001a04')
         OR slug LIKE 'e2e-%' OR slug LIKE 'mouse-gamer-e2e-%' OR slug LIKE 'prod-e2e-%' OR slug LIKE 'mouse-pro-wireless-%';
    `;

    // 7. Clear Category Schemas Pointer & Delete Schemas & Categories
    await tx`
      UPDATE categories
      SET current_spec_schema_id = NULL
      WHERE id IN (
        '018f0000-0000-7000-8000-00000000ca01',
        '018f0000-0000-7000-8000-00000000ca02'
      );
    `;

    await tx`
      DELETE FROM category_specification_schemas
      WHERE id IN (
        '018f0000-0000-7000-8000-000000005a01',
        '018f0000-0000-7000-8000-000000005b01'
      ) OR category_id IN (
        '018f0000-0000-7000-8000-00000000ca01',
        '018f0000-0000-7000-8000-00000000ca02'
      );
    `;

    await tx`
      DELETE FROM categories
      WHERE id IN (
        '018f0000-0000-7000-8000-00000000ca01',
        '018f0000-0000-7000-8000-00000000ca02'
      );
    `;

    // 8. Test Brand
    await tx`
      DELETE FROM brands
      WHERE id = '018f0000-0000-7000-8000-00000000ba01';
    `;
  });

  console.log("[Admin E2E Cleanup] Successfully cleaned up Product Manager fixtures.");
}

// Execute cleanup if invoked directly
if (
  process.argv[1] &&
  (import.meta.url === `file://${process.argv[1]}`.replace(/\\/g, "/") ||
    import.meta.url === `file:///${process.argv[1]}`.replace(/\\/g, "/"))
) {
  cleanupAdminUsers();
}
