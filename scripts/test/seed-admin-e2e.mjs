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

// 2. Strict Service Role Key Requirement (Zero Direct SQL Auth Fallback)
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
if (!serviceRoleKey || typeof serviceRoleKey !== "string" || serviceRoleKey.trim().length === 0) {
  console.error(
    "[Admin E2E Seed] SECURITY VIOLATION: SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SECRET_KEY is required for local Admin E2E seeding. Direct SQL Auth fallback is forbidden."
  );
  process.exit(1);
}

export const ADMIN_E2E_USERS = {
  superadmin: {
    id: "018f0000-0000-7000-8000-00000000ae01",
    email: "superadmin.e2e@gamerperu.pe",
    role: "SUPER_ADMIN",
  },
  catalog: {
    id: "018f0000-0000-7000-8000-00000000ae02",
    email: "catalog.e2e@gamerperu.pe",
    role: "ADMIN_CATALOG",
  },
  orders: {
    id: "018f0000-0000-7000-8000-00000000ae03",
    email: "orders.e2e@gamerperu.pe",
    role: "ADMIN_ORDERS",
  },
  support: {
    id: "018f0000-0000-7000-8000-00000000ae04",
    email: "support.e2e@gamerperu.pe",
    role: "ADMIN_SUPPORT",
  },
  customer: {
    id: "018f0000-0000-7000-8000-00000000ae05",
    email: "customer.e2e@gamerperu.pe",
    role: "CUSTOMER",
  },
  norole: {
    id: "018f0000-0000-7000-8000-00000000ae06",
    email: "norole.e2e@gamerperu.pe",
    role: null,
  },
};

export const ADMIN_E2E_PASSWORD = "AdminSecretPass2026!";

const sql = postgres(databaseUrl, { max: 1 });

export async function seedAdminUsers() {
  try {
    console.log("[Admin E2E Seed] Seeding deterministic Admin test users into local Supabase...");
    console.log("[Admin E2E Seed] Using Supabase Admin Auth API with service role key...");

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey.trim(), {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // 1. Create deterministic Auth users exclusively via Supabase Admin Auth API
    for (const u of Object.values(ADMIN_E2E_USERS)) {
      const { error: delError } = await supabaseAdmin.auth.admin.deleteUser(u.id);
      if (
        delError &&
        !delError.message.toLowerCase().includes("user not found") &&
        !delError.message.toLowerCase().includes("not found") &&
        delError.status !== 404
      ) {
        throw new Error(
          `[Admin E2E Seed] Unexpected failure deleting pre-existing user ${u.email} (${u.id}): ${delError.message}`
        );
      }

      const { data: createData, error: createError } = await supabaseAdmin.auth.admin.createUser({
        id: u.id,
        email: u.email,
        password: ADMIN_E2E_PASSWORD,
        email_confirm: true,
        user_metadata: { first_name: "Personal", last_name: "Staff" },
      });

      if (createError || !createData?.user) {
        throw new Error(
          `[Admin E2E Seed] Failed creating user ${u.email} (${u.id}) via Admin Auth API: ${createError?.message || "unknown error"}`
        );
      }
    }

    // 2. Assign customer_profiles and user_roles in public PostgreSQL schema
    await sql.begin(async (tx) => {
      for (const u of Object.values(ADMIN_E2E_USERS)) {
        await tx`
          INSERT INTO customer_profiles (id, auth_user_id, first_name, last_name, phone, created_at, updated_at)
          VALUES (${u.id}, ${u.id}, 'Personal', 'Staff', '999888777', NOW(), NOW())
          ON CONFLICT (id) DO NOTHING;
        `;
      }

      const userIds = Object.values(ADMIN_E2E_USERS).map((u) => u.id);
      await tx`DELETE FROM user_roles WHERE auth_user_id IN ${tx(userIds)}`;

      for (const u of Object.values(ADMIN_E2E_USERS)) {
        if (u.role) {
          await tx`
            INSERT INTO user_roles (auth_user_id, role_id)
            VALUES (${u.id}, (SELECT id FROM roles WHERE name = ${u.role}))
            ON CONFLICT DO NOTHING;
          `;
        }
      }
    });

    // 3. Physical Post-Seed Validation
    for (const u of Object.values(ADMIN_E2E_USERS)) {
      const { data: verifyAuth, error: verifyAuthError } =
        await supabaseAdmin.auth.admin.getUserById(u.id);
      if (verifyAuthError || !verifyAuth?.user) {
        throw new Error(
          `[Admin E2E Seed] Physical validation failed: Auth user ${u.email} (${u.id}) does not exist after creation: ${verifyAuthError?.message || "missing user record"}`
        );
      }
      if (verifyAuth.user.email?.toLowerCase() !== u.email.toLowerCase()) {
        throw new Error(
          `[Admin E2E Seed] Physical validation failed: Email mismatch for ${u.id} (expected ${u.email}, found ${verifyAuth.user.email})`
        );
      }

      const roleRows = await sql`
        SELECT r.name AS role_name
        FROM user_roles ur
        JOIN roles r ON ur.role_id = r.id
        WHERE ur.auth_user_id = ${u.id};
      `;

      if (u.role) {
        if (roleRows.length !== 1 || roleRows[0].role_name !== u.role) {
          throw new Error(
            `[Admin E2E Seed] Physical validation failed: Expected role '${u.role}' for ${u.email}, found: ${JSON.stringify(roleRows)}`
          );
        }
      } else {
        if (roleRows.length !== 0) {
          throw new Error(
            `[Admin E2E Seed] Physical validation failed: Expected 0 role mappings for ${u.email}, found: ${JSON.stringify(roleRows)}`
          );
        }
      }
    }

    // 4. Real local authentication check for SUPER_ADMIN
    const anonKey =
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      serviceRoleKey.trim();
    const publicClient = createClient(supabaseUrl, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: authData, error: authError } = await publicClient.auth.signInWithPassword({
      email: ADMIN_E2E_USERS.superadmin.email,
      password: ADMIN_E2E_PASSWORD,
    });

    if (authError || !authData?.user || !authData?.session) {
      throw new Error(
        `[Admin E2E Seed] Physical login verification failed for ${ADMIN_E2E_USERS.superadmin.email}: ${authError?.message || "missing session"}`
      );
    }

    console.log("[Admin E2E Seed] Successfully seeded Admin test users and role mappings.");

    // 5. Seed deterministic CHK2 Product Manager test fixtures
    await seedAdminProductFixtures(sql);
    await seedAdminOrderFixtures(sql);
  } catch (err) {
    console.error("[Admin E2E Seed] Failed to seed:", err instanceof Error ? err.message : err);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

export const ADMIN_E2E_PRODUCT_FIXTURES = {
  brand: {
    id: "018f0000-0000-7000-8000-00000000ba01",
    name: "Marca E2E",
    slug: "test-brand-e2e",
  },
  categoryA: {
    id: "018f0000-0000-7000-8000-00000000ca01",
    name: "Categoría E2E A (Mouses)",
    slug: "test-cat-e2e-a",
    schemaId: "018f0000-0000-7000-8000-000000005a01",
  },
  categoryB: {
    id: "018f0000-0000-7000-8000-00000000ca02",
    name: "Categoría E2E B (Teclados)",
    slug: "test-cat-e2e-b",
    schemaId: "018f0000-0000-7000-8000-000000005b01",
  },
  publishableProduct: {
    id: "018f0000-0000-7000-8000-000000001a01",
    name: "Producto E2E Listo Publicar",
    slug: "prod-e2e-ready-publish",
    sku: "E2E-PUB-SKU-001",
    variantId: "018f0000-0000-7000-8000-000000007a01",
    mediaAssetId: "018f0000-0000-7000-8000-000000006a01",
    mediaAsset2Id: "018f0000-0000-7000-8000-000000006a03",
    mediaAsset3Id: "018f0000-0000-7000-8000-000000006a04",
    productMediaId1: "018f0000-0000-7000-8000-000000002a01",
    productMediaId2: "018f0000-0000-7000-8000-000000002a03",
    productMediaId3: "018f0000-0000-7000-8000-000000002a04",
  },
  sentinelProduct: {
    id: "018f0000-0000-7000-8000-000000001a02",
    name: "Producto E2E Sentinel Privado",
    slug: "prod-e2e-private-sentinel",
    sku: "E2E-SENT-SKU-002",
    sentinelKey: "sentinel_private_key_do_not_expose_987654321",
    mediaAssetId: "018f0000-0000-7000-8000-000000006a02",
  },
  immutableProduct: {
    id: "018f0000-0000-7000-8000-000000001a03",
    name: "Producto E2E SKU Inmutable",
    slug: "prod-e2e-sku-immutable",
    sku: "E2E-IMMUTABLE-SKU-003",
    inventoryItemId: "018f0000-0000-7000-8000-000000004a03",
  },
  inventoryLocation: {
    id: "018f0000-0000-7000-8000-00000000e0a1",
    code: "ADMIN_E2E_LOCATION",
    name: "Almacén Admin E2E",
  },
  relatedProductA: {
    id: "018f0000-0000-7000-8000-000000001a11",
    name: "Gamer Mouse Pro",
    slug: "gamer-mouse-pro-admin-e2e",
    variantId: "018f0000-0000-7000-8000-000000007a11",
    sku: "E2E-RELATED-PRO-001",
  },
  relatedProductB: {
    id: "018f0000-0000-7000-8000-000000001a12",
    name: "Gamer Mouse Ultra",
    slug: "gamer-mouse-ultra-admin-e2e",
    variantId: "018f0000-0000-7000-8000-000000007a12",
    sku: "E2E-RELATED-ULTRA-002",
  },
  catChangeProduct: {
    id: "018f0000-0000-7000-8000-000000001a04",
    name: "Producto E2E Cambio Categoria",
    slug: "prod-e2e-cat-change",
    sku: "E2E-CAT-CHANGE-SKU",
  },
};

export async function seedAdminProductFixtures(clientSql) {
  console.log("[Admin E2E Seed] Seeding deterministic Product Manager test fixtures...");

  await clientSql.begin(async (tx) => {
    // Brand
    await tx`
      INSERT INTO brands (id, name, slug, status, created_at, updated_at)
      VALUES (${ADMIN_E2E_PRODUCT_FIXTURES.brand.id}, ${ADMIN_E2E_PRODUCT_FIXTURES.brand.name}, ${ADMIN_E2E_PRODUCT_FIXTURES.brand.slug}, 'PUBLISHED', NOW(), NOW())
      ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, status = 'PUBLISHED';
    `;

    // Category A & Schema A
    await tx`
      INSERT INTO categories (id, name, slug, status, created_at, updated_at)
      VALUES (${ADMIN_E2E_PRODUCT_FIXTURES.categoryA.id}, ${ADMIN_E2E_PRODUCT_FIXTURES.categoryA.name}, ${ADMIN_E2E_PRODUCT_FIXTURES.categoryA.slug}, 'PUBLISHED', NOW(), NOW())
      ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, status = 'PUBLISHED';
    `;

    const schemaAFields = [
      {
        key: "sensor",
        label: "Sensor Óptico",
        dataType: "string",
        filterable: false,
        displayOrder: 1,
      },
      {
        key: "dpi_max",
        label: "DPI Máximo",
        dataType: "number",
        unit: "DPI",
        filterable: true,
        filterKind: "NUMBER_RANGE",
        publicParam: "dpi",
        displayOrder: 2,
        min: 100,
        max: 30000,
        step: 100,
      },
      {
        key: "connection_type",
        label: "Tipo de Conexión",
        dataType: "enum",
        filterable: true,
        filterKind: "ENUM_MULTI",
        publicParam: "conn",
        displayOrder: 3,
        options: [
          { value: "wired", label: "Cableado" },
          { value: "wireless", label: "Inalámbrico" },
          { value: "bluetooth", label: "Bluetooth" },
        ],
      },
    ];

    // Ensure fresh schemas for Category A and Category B
    await tx`
      DELETE FROM product_specifications
      WHERE schema_id IN (${ADMIN_E2E_PRODUCT_FIXTURES.categoryA.schemaId}, ${ADMIN_E2E_PRODUCT_FIXTURES.categoryB.schemaId});
    `;
    await tx`
      UPDATE categories
      SET current_spec_schema_id = NULL
      WHERE id IN (${ADMIN_E2E_PRODUCT_FIXTURES.categoryA.id}, ${ADMIN_E2E_PRODUCT_FIXTURES.categoryB.id});
    `;
    await tx`
      DELETE FROM category_specification_schemas
      WHERE category_id IN (${ADMIN_E2E_PRODUCT_FIXTURES.categoryA.id}, ${ADMIN_E2E_PRODUCT_FIXTURES.categoryB.id});
    `;

    await tx`
      INSERT INTO category_specification_schemas (id, category_id, schema_version, is_active, field_definitions, created_at)
      VALUES (
        ${ADMIN_E2E_PRODUCT_FIXTURES.categoryA.schemaId},
        ${ADMIN_E2E_PRODUCT_FIXTURES.categoryA.id},
        1,
        true,
        ${clientSql.json(schemaAFields)},
        NOW()
      )
      ON CONFLICT (id) DO UPDATE SET is_active = true, field_definitions = EXCLUDED.field_definitions;
    `;

    await tx`
      UPDATE categories
      SET current_spec_schema_id = ${ADMIN_E2E_PRODUCT_FIXTURES.categoryA.schemaId}
      WHERE id = ${ADMIN_E2E_PRODUCT_FIXTURES.categoryA.id};
    `;

    // Category B & Schema B
    await tx`
      INSERT INTO categories (id, name, slug, status, created_at, updated_at)
      VALUES (${ADMIN_E2E_PRODUCT_FIXTURES.categoryB.id}, ${ADMIN_E2E_PRODUCT_FIXTURES.categoryB.name}, ${ADMIN_E2E_PRODUCT_FIXTURES.categoryB.slug}, 'PUBLISHED', NOW(), NOW())
      ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, status = 'PUBLISHED';
    `;

    const schemaBFields = [
      {
        key: "switch_type",
        label: "Tipo de Switch",
        dataType: "enum",
        filterable: false,
        displayOrder: 1,
        options: [
          { value: "red", label: "Lineal Red" },
          { value: "blue", label: "Clicky Blue" },
          { value: "brown", label: "Táctil Brown" },
        ],
      },
      {
        key: "layout",
        label: "Distribución de Teclas",
        dataType: "string",
        filterable: false,
        displayOrder: 2,
      },
      {
        key: "rgb_lighting",
        label: "Iluminación RGB",
        dataType: "boolean",
        filterable: true,
        filterKind: "BOOLEAN",
        publicParam: "rgb",
        displayOrder: 3,
      },
    ];

    await tx`
      INSERT INTO category_specification_schemas (id, category_id, schema_version, is_active, field_definitions, created_at)
      VALUES (
        ${ADMIN_E2E_PRODUCT_FIXTURES.categoryB.schemaId},
        ${ADMIN_E2E_PRODUCT_FIXTURES.categoryB.id},
        1,
        true,
        ${clientSql.json(schemaBFields)},
        NOW()
      )
      ON CONFLICT (id) DO UPDATE SET is_active = true, field_definitions = EXCLUDED.field_definitions;
    `;

    await tx`
      UPDATE categories
      SET current_spec_schema_id = ${ADMIN_E2E_PRODUCT_FIXTURES.categoryB.schemaId}
      WHERE id = ${ADMIN_E2E_PRODUCT_FIXTURES.categoryB.id};
    `;

    await tx`
      INSERT INTO inventory_locations (id, code, name, is_active, created_at)
      VALUES (
        ${ADMIN_E2E_PRODUCT_FIXTURES.inventoryLocation.id},
        ${ADMIN_E2E_PRODUCT_FIXTURES.inventoryLocation.code},
        ${ADMIN_E2E_PRODUCT_FIXTURES.inventoryLocation.name},
        true,
        NOW()
      )
      ON CONFLICT (id) DO UPDATE SET
        code = EXCLUDED.code,
        name = EXCLUDED.name,
        is_active = true;
    `;

    await tx`
      INSERT INTO products (id, name, slug, brand_id, category_id, status, primary_media_id, created_at, updated_at)
      VALUES
        (
          ${ADMIN_E2E_PRODUCT_FIXTURES.relatedProductA.id},
          ${ADMIN_E2E_PRODUCT_FIXTURES.relatedProductA.name},
          ${ADMIN_E2E_PRODUCT_FIXTURES.relatedProductA.slug},
          ${ADMIN_E2E_PRODUCT_FIXTURES.brand.id},
          ${ADMIN_E2E_PRODUCT_FIXTURES.categoryA.id},
          'PUBLISHED',
          NULL,
          NOW(),
          NOW()
        ),
        (
          ${ADMIN_E2E_PRODUCT_FIXTURES.relatedProductB.id},
          ${ADMIN_E2E_PRODUCT_FIXTURES.relatedProductB.name},
          ${ADMIN_E2E_PRODUCT_FIXTURES.relatedProductB.slug},
          ${ADMIN_E2E_PRODUCT_FIXTURES.brand.id},
          ${ADMIN_E2E_PRODUCT_FIXTURES.categoryA.id},
          'PUBLISHED',
          NULL,
          NOW(),
          NOW()
        )
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        slug = EXCLUDED.slug,
        status = 'PUBLISHED',
        updated_at = NOW();
    `;

    await tx`
      INSERT INTO product_variants (id, product_id, sku, title, price_cents, cost_cents, weight_grams, status, display_order, created_at, updated_at)
      VALUES
        (
          ${ADMIN_E2E_PRODUCT_FIXTURES.relatedProductA.variantId},
          ${ADMIN_E2E_PRODUCT_FIXTURES.relatedProductA.id},
          ${ADMIN_E2E_PRODUCT_FIXTURES.relatedProductA.sku},
          'Variante Pro',
          14990,
          7000,
          58,
          'ACTIVE',
          0,
          NOW(),
          NOW()
        ),
        (
          ${ADMIN_E2E_PRODUCT_FIXTURES.relatedProductB.variantId},
          ${ADMIN_E2E_PRODUCT_FIXTURES.relatedProductB.id},
          ${ADMIN_E2E_PRODUCT_FIXTURES.relatedProductB.sku},
          'Variante Ultra',
          19990,
          9500,
          52,
          'ACTIVE',
          0,
          NOW(),
          NOW()
        )
      ON CONFLICT (id) DO UPDATE SET
        sku = EXCLUDED.sku,
        price_cents = EXCLUDED.price_cents,
        status = 'ACTIVE',
        updated_at = NOW();
    `;

    // Public Media Assets for Publishable Product
    await tx`
      INSERT INTO media_assets (id, object_key, security_class, media_type, mime_type, file_size_bytes, width, height, checksum_sha256, alt_text, created_at)
      VALUES
        (
          ${ADMIN_E2E_PRODUCT_FIXTURES.publishableProduct.mediaAssetId},
          'products/test-e2e-public-asset.webp',
          'PUBLIC_MEDIA',
          'IMAGE',
          'image/webp',
          10240,
          800,
          800,
          '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
          'Mouse Blanco Principal',
          NOW()
        ),
        (
          ${ADMIN_E2E_PRODUCT_FIXTURES.publishableProduct.mediaAsset2Id},
          'products/test-e2e-public-asset-2.webp',
          'PUBLIC_MEDIA',
          'IMAGE',
          'image/webp',
          12288,
          800,
          800,
          '123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef0',
          'Mouse Blanco Lateral',
          NOW()
        ),
        (
          ${ADMIN_E2E_PRODUCT_FIXTURES.publishableProduct.mediaAsset3Id},
          'products/test-e2e-public-asset-3.webp',
          'PUBLIC_MEDIA',
          'IMAGE',
          'image/webp',
          14336,
          800,
          800,
          '23456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef01',
          'Mouse Blanco Sensor',
          NOW()
        )
      ON CONFLICT (id) DO UPDATE SET
        security_class = 'PUBLIC_MEDIA',
        object_key = EXCLUDED.object_key,
        alt_text = EXCLUDED.alt_text;
    `;

    // Sentinel Private Media Asset
    await tx`
      INSERT INTO media_assets (id, object_key, security_class, media_type, mime_type, file_size_bytes, width, height, checksum_sha256, created_at)
      VALUES (
        ${ADMIN_E2E_PRODUCT_FIXTURES.sentinelProduct.mediaAssetId},
        ${"internal/" + ADMIN_E2E_PRODUCT_FIXTURES.sentinelProduct.sentinelKey + ".webp"},
        'PRIVATE_BACKUP',
        'IMAGE',
        'image/webp',
        20480,
        800,
        800,
        'fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210',
        NOW()
      )
      ON CONFLICT (id) DO UPDATE SET security_class = 'PRIVATE_BACKUP', object_key = EXCLUDED.object_key;
    `;

    // Product 1: Publishable Product
    await tx`
      INSERT INTO products (id, name, slug, brand_id, category_id, status, primary_media_id, created_at, updated_at)
      VALUES (
        ${ADMIN_E2E_PRODUCT_FIXTURES.publishableProduct.id},
        ${ADMIN_E2E_PRODUCT_FIXTURES.publishableProduct.name},
        ${ADMIN_E2E_PRODUCT_FIXTURES.publishableProduct.slug},
        ${ADMIN_E2E_PRODUCT_FIXTURES.brand.id},
        ${ADMIN_E2E_PRODUCT_FIXTURES.categoryA.id},
        'DRAFT',
        ${ADMIN_E2E_PRODUCT_FIXTURES.publishableProduct.mediaAssetId},
        NOW(),
        NOW()
      )
      ON CONFLICT (id) DO UPDATE SET status = 'DRAFT', primary_media_id = EXCLUDED.primary_media_id, updated_at = NOW();
    `;

    await tx`
      INSERT INTO product_variants (id, product_id, sku, title, price_cents, cost_cents, weight_grams, status, display_order, created_at, updated_at)
      VALUES (
        '018f0000-0000-7000-8000-000000007a01',
        ${ADMIN_E2E_PRODUCT_FIXTURES.publishableProduct.id},
        ${ADMIN_E2E_PRODUCT_FIXTURES.publishableProduct.sku},
        'Variante Publicable',
        15990,
        8000,
        50,
        'ACTIVE',
        0,
        NOW(),
        NOW()
      )
      ON CONFLICT (id) DO UPDATE SET sku = EXCLUDED.sku, price_cents = EXCLUDED.price_cents, status = 'ACTIVE';
    `;

    // Clean any prior product_media rows for publishableProduct to ensure deterministic display order
    await tx`
      DELETE FROM product_media
      WHERE product_id = ${ADMIN_E2E_PRODUCT_FIXTURES.publishableProduct.id};
    `;

    await tx`
      INSERT INTO product_media (id, product_id, media_asset_id, variant_id, display_order, created_at)
      VALUES
        (
          ${ADMIN_E2E_PRODUCT_FIXTURES.publishableProduct.productMediaId1},
          ${ADMIN_E2E_PRODUCT_FIXTURES.publishableProduct.id},
          ${ADMIN_E2E_PRODUCT_FIXTURES.publishableProduct.mediaAssetId},
          NULL,
          0,
          NOW()
        ),
        (
          ${ADMIN_E2E_PRODUCT_FIXTURES.publishableProduct.productMediaId2},
          ${ADMIN_E2E_PRODUCT_FIXTURES.publishableProduct.id},
          ${ADMIN_E2E_PRODUCT_FIXTURES.publishableProduct.mediaAsset2Id},
          NULL,
          1,
          NOW()
        ),
        (
          ${ADMIN_E2E_PRODUCT_FIXTURES.publishableProduct.productMediaId3},
          ${ADMIN_E2E_PRODUCT_FIXTURES.publishableProduct.id},
          ${ADMIN_E2E_PRODUCT_FIXTURES.publishableProduct.mediaAsset3Id},
          ${ADMIN_E2E_PRODUCT_FIXTURES.publishableProduct.variantId},
          2,
          NOW()
        );
    `;

    await tx`
      INSERT INTO product_specifications (product_id, schema_id, schema_version, spec_values, updated_at)
      VALUES (
        ${ADMIN_E2E_PRODUCT_FIXTURES.publishableProduct.id},
        ${ADMIN_E2E_PRODUCT_FIXTURES.categoryA.schemaId},
        1,
        ${clientSql.json({ sensor: "PAW3395", dpi_max: 26000, connection_type: "wireless" })},
        NOW()
      )
      ON CONFLICT (product_id) DO UPDATE SET schema_id = EXCLUDED.schema_id, spec_values = EXCLUDED.spec_values;
    `;

    // Product 2: Sentinel Product
    await tx`
      INSERT INTO products (id, name, slug, brand_id, category_id, status, primary_media_id, created_at, updated_at)
      VALUES (
        ${ADMIN_E2E_PRODUCT_FIXTURES.sentinelProduct.id},
        ${ADMIN_E2E_PRODUCT_FIXTURES.sentinelProduct.name},
        ${ADMIN_E2E_PRODUCT_FIXTURES.sentinelProduct.slug},
        ${ADMIN_E2E_PRODUCT_FIXTURES.brand.id},
        ${ADMIN_E2E_PRODUCT_FIXTURES.categoryA.id},
        'DRAFT',
        NULL,
        NOW(),
        NOW()
      )
      ON CONFLICT (id) DO UPDATE SET status = 'DRAFT', updated_at = NOW();
    `;

    await tx`
      INSERT INTO product_variants (id, product_id, sku, title, price_cents, cost_cents, weight_grams, status, display_order, created_at, updated_at)
      VALUES (
        '018f0000-0000-7000-8000-000000007a02',
        ${ADMIN_E2E_PRODUCT_FIXTURES.sentinelProduct.id},
        ${ADMIN_E2E_PRODUCT_FIXTURES.sentinelProduct.sku},
        'Variante Sentinel',
        9900,
        5000,
        60,
        'ACTIVE',
        0,
        NOW(),
        NOW()
      )
      ON CONFLICT (id) DO UPDATE SET sku = EXCLUDED.sku, status = 'ACTIVE';
    `;

    await tx`
      INSERT INTO product_media (id, product_id, media_asset_id, variant_id, display_order, created_at)
      VALUES (
        '018f0000-0000-7000-8000-000000002a02',
        ${ADMIN_E2E_PRODUCT_FIXTURES.sentinelProduct.id},
        ${ADMIN_E2E_PRODUCT_FIXTURES.sentinelProduct.mediaAssetId},
        NULL,
        0,
        NOW()
      )
      ON CONFLICT (id) DO NOTHING;
    `;

    // Product 3: Immutable SKU Product
    await tx`
      INSERT INTO products (id, name, slug, brand_id, category_id, status, primary_media_id, created_at, updated_at)
      VALUES (
        ${ADMIN_E2E_PRODUCT_FIXTURES.immutableProduct.id},
        ${ADMIN_E2E_PRODUCT_FIXTURES.immutableProduct.name},
        ${ADMIN_E2E_PRODUCT_FIXTURES.immutableProduct.slug},
        ${ADMIN_E2E_PRODUCT_FIXTURES.brand.id},
        ${ADMIN_E2E_PRODUCT_FIXTURES.categoryA.id},
        'DRAFT',
        NULL,
        NOW(),
        NOW()
      )
      ON CONFLICT (id) DO UPDATE SET status = 'DRAFT', updated_at = NOW();
    `;

    await tx`
      INSERT INTO product_variants (id, product_id, sku, title, price_cents, cost_cents, weight_grams, status, display_order, created_at, updated_at)
      VALUES (
        '018f0000-0000-7000-8000-000000007a03',
        ${ADMIN_E2E_PRODUCT_FIXTURES.immutableProduct.id},
        ${ADMIN_E2E_PRODUCT_FIXTURES.immutableProduct.sku},
        'Variante con Stock',
        12000,
        6000,
        55,
        'ACTIVE',
        0,
        NOW(),
        NOW()
      )
      ON CONFLICT (id) DO UPDATE SET sku = EXCLUDED.sku, status = 'ACTIVE';
    `;

    await tx`
      INSERT INTO inventory_items (id, variant_id, location_id, quantity_on_hand, quantity_reserved, quantity_allocated, reorder_point, updated_at)
      VALUES (
        ${ADMIN_E2E_PRODUCT_FIXTURES.immutableProduct.inventoryItemId},
        '018f0000-0000-7000-8000-000000007a03',
        ${ADMIN_E2E_PRODUCT_FIXTURES.inventoryLocation.id},
        10,
        0,
        0,
        2,
        NOW()
      )
      ON CONFLICT (id) DO UPDATE SET quantity_on_hand = 10;
    `;

    // Product 4: Category Change Product
    await tx`
      INSERT INTO products (id, name, slug, brand_id, category_id, status, primary_media_id, created_at, updated_at)
      VALUES (
        ${ADMIN_E2E_PRODUCT_FIXTURES.catChangeProduct.id},
        ${ADMIN_E2E_PRODUCT_FIXTURES.catChangeProduct.name},
        ${ADMIN_E2E_PRODUCT_FIXTURES.catChangeProduct.slug},
        ${ADMIN_E2E_PRODUCT_FIXTURES.brand.id},
        ${ADMIN_E2E_PRODUCT_FIXTURES.categoryA.id},
        'DRAFT',
        NULL,
        NOW(),
        NOW()
      )
      ON CONFLICT (id) DO UPDATE SET category_id = ${ADMIN_E2E_PRODUCT_FIXTURES.categoryA.id}, status = 'DRAFT', updated_at = NOW();
    `;

    await tx`
      INSERT INTO product_variants (id, product_id, sku, title, price_cents, cost_cents, weight_grams, status, display_order, created_at, updated_at)
      VALUES (
        '018f0000-0000-7000-8000-000000007a04',
        ${ADMIN_E2E_PRODUCT_FIXTURES.catChangeProduct.id},
        ${ADMIN_E2E_PRODUCT_FIXTURES.catChangeProduct.sku},
        'Variante Base',
        8000,
        4000,
        40,
        'ACTIVE',
        0,
        NOW(),
        NOW()
      )
      ON CONFLICT (id) DO UPDATE SET sku = EXCLUDED.sku, status = 'ACTIVE';
    `;

    await tx`
      INSERT INTO product_specifications (product_id, schema_id, schema_version, spec_values, updated_at)
      VALUES (
        ${ADMIN_E2E_PRODUCT_FIXTURES.catChangeProduct.id},
        ${ADMIN_E2E_PRODUCT_FIXTURES.categoryA.schemaId},
        1,
        ${clientSql.json({ sensor: "Optical 3395", dpi_max: 20000 })},
        NOW()
      )
      ON CONFLICT (product_id) DO UPDATE SET schema_id = EXCLUDED.schema_id, spec_values = EXCLUDED.spec_values;
    `;
  });

  console.log("[Admin E2E Seed] Successfully seeded Product Manager test fixtures.");
}

const ADMIN_ORDER_COUNT = 30;
const ADMIN_ORDER_PAYMENT_METHOD_ID = "018f0000-0000-7000-8000-00000000e101";
const ADMIN_ORDER_INSTRUCTION_ID = "018f0000-0000-7000-8000-00000000e102";
const ADMIN_ORDER_SHIPPING_METHOD_ID = "018f0000-0000-7000-8000-00000000e103";

function adminOrderId(segment, index) {
  return `018f0000-0000-7000-8000-${(segment + index).toString(16).padStart(12, "0")}`;
}

export async function seedAdminOrderFixtures(clientSql) {
  console.log("[Admin E2E Seed] Seeding deterministic Orders list fixtures...");

  await clientSql.begin(async (tx) => {
    await tx`
      INSERT INTO payment_method_configurations
        (id, code, name, method_type, is_active, display_order)
      VALUES
        (${ADMIN_ORDER_PAYMENT_METHOD_ID}, 'ADMIN_E2E_YAPE', 'Yape E2E', 'MANUAL', true, 90)
      ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, is_active = true;
    `;
    await tx`
      INSERT INTO payment_instruction_versions
        (id, payment_method_code, version_number, recipient_name, account_identifier, instruction_text, is_active)
      VALUES
        (${ADMIN_ORDER_INSTRUCTION_ID}, 'ADMIN_E2E_YAPE', 1, 'Tienda E2E', '999000111', 'Instrucciones sintéticas', true)
      ON CONFLICT (id) DO UPDATE SET instruction_text = EXCLUDED.instruction_text;
    `;
    await tx`
      UPDATE payment_method_configurations
      SET current_instruction_version_id = ${ADMIN_ORDER_INSTRUCTION_ID}
      WHERE id = ${ADMIN_ORDER_PAYMENT_METHOD_ID};
    `;
    await tx`
      INSERT INTO shipping_methods
        (id, code, name, base_price_cents, estimated_days_min, estimated_days_max, is_active)
      VALUES
        (${ADMIN_ORDER_SHIPPING_METHOD_ID}, 'ADMIN_E2E_DELIVERY', 'Envío E2E', 0, 1, 2, true)
      ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, is_active = true;
    `;

    for (let index = 1; index <= ADMIN_ORDER_COUNT + 2; index += 1) {
      const orderId = adminOrderId(0xd100, index);
      const orderNumber =
        index <= ADMIN_ORDER_COUNT
          ? `GP-AD${String(index).padStart(6, "0")}`
          : `GP-CK${String(index - ADMIN_ORDER_COUNT).padStart(6, "0")}`;
      const createdAt = new Date(
        Date.UTC(2026, 8, index <= 27 ? 19 : index <= 30 ? 18 : 17, 20, 0) -
          (index <= 27 ? index - 1 : index - 28) * 60_000
      ).toISOString();
      const paymentAt = new Date(Date.parse(createdAt) + 10 * 60_000).toISOString();
      const shipmentAt = new Date(Date.parse(createdAt) + 20 * 60_000).toISOString();
      const orderStatus =
        index === 2 || index === 32
          ? "CONFIRMED"
          : index === 3
            ? "CANCELLED"
            : index === 4
              ? "REFUNDED"
              : "PENDING";
      const customerEmail = index === 1 ? "MiXeD.Order@Example.com" : `buyer${index}@example.com`;

      await tx`
        INSERT INTO orders
          (id, order_number, customer_id, customer_email, customer_phone, status,
           subtotal_cents, discount_cents, shipping_cents, total_cents, currency,
           cancelled_at, cancel_reason, created_at, updated_at)
        VALUES
          (${orderId}, ${orderNumber}, ${index === 1 ? ADMIN_E2E_USERS.customer.id : null},
           ${customerEmail}, '999111222', ${orderStatus},
           15990, 0, 0, 15990, 'PEN',
           ${index === 3 ? createdAt : null}, ${index === 3 ? "Cancelación E2E" : null},
           ${createdAt}, ${createdAt})
        ON CONFLICT (id) DO UPDATE SET
          customer_email = EXCLUDED.customer_email,
          customer_id = EXCLUDED.customer_id,
          status = EXCLUDED.status,
          created_at = EXCLUDED.created_at,
          updated_at = EXCLUDED.updated_at;
      `;
      await tx`
        INSERT INTO order_items
          (id, order_id, variant_id, sku_snapshot, product_name_snapshot, variant_title_snapshot,
           unit_price_cents_snapshot, quantity, line_total_cents, created_at)
        VALUES
          (${adminOrderId(0xd200, index)}, ${orderId},
           ${ADMIN_E2E_PRODUCT_FIXTURES.publishableProduct.variantId},
           'E2E-PUB-SKU-001', 'Producto E2E Listo Publicar', 'Variante E2E',
           7995, 2, 15990, ${createdAt})
        ON CONFLICT (id) DO UPDATE SET quantity = 2, line_total_cents = 15990;
      `;
      await tx`
        INSERT INTO order_pricing_snapshots
          (id, order_id, subtotal_cents, discount_cents, shipping_cents, total_cents, currency, created_at)
        VALUES
          (${adminOrderId(0xd300, index)}, ${orderId}, 15990, 0, 0, 15990, 'PEN', ${createdAt})
        ON CONFLICT (id) DO UPDATE SET total_cents = 15990, currency = 'PEN';
      `;
      await tx`
        INSERT INTO order_address_snapshots
          (id, order_id, recipient_name, phone, street_address, department, province, district, created_at)
        VALUES
          (${adminOrderId(0xd400, index)}, ${orderId}, 'Persona E2E Privada',
           '999111222', 'Calle Privada E2E 123', 'Lima', 'Lima', 'Miraflores', ${createdAt})
        ON CONFLICT (id) DO UPDATE SET street_address = EXCLUDED.street_address;
      `;

      if (index !== 5) {
        const paymentStatus =
          index === 2 || index === 6 || index === 7 || index === 32
            ? "PAID"
            : index === 4
              ? "REFUNDED"
              : "UNPAID";
        await tx`
          INSERT INTO payments
            (id, order_id, payment_method_code, instruction_version_id, amount_cents,
             refunded_amount_cents, currency, status, created_at, updated_at)
          VALUES
            (${adminOrderId(0xd500, index)}, ${orderId}, 'ADMIN_E2E_YAPE',
             ${ADMIN_ORDER_INSTRUCTION_ID}, 15990, ${index === 4 ? 15990 : 0},
             'PEN', ${paymentStatus}, ${createdAt}, ${paymentAt})
          ON CONFLICT (id) DO UPDATE SET
            status = EXCLUDED.status, refunded_amount_cents = EXCLUDED.refunded_amount_cents,
            updated_at = EXCLUDED.updated_at;
        `;
      }

      if (index !== 5 && index !== 6) {
        const shipmentStatus = index === 2 ? "SHIPPED" : index === 4 ? "DELIVERED" : "UNFULFILLED";
        await tx`
          INSERT INTO shipments
            (id, order_id, shipping_method_id, status, courier_name, tracking_number, tracking_url,
             shipped_at, delivered_at, created_at, updated_at)
          VALUES
            (${adminOrderId(0xd600, index)}, ${orderId}, ${ADMIN_ORDER_SHIPPING_METHOD_ID},
             ${shipmentStatus}, ${index === 2 ? "Envíos E2E" : null},
             ${index === 2 ? "TRACK-E2E-2" : null},
             ${index === 2 ? "https://tracking.example.com/GP-AD000002" : index === 3 ? "javascript:alert(1)" : null},
             ${index === 2 || index === 4 ? shipmentAt : null},
             ${index === 4 ? shipmentAt : null}, ${createdAt}, ${shipmentAt})
          ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status,
            courier_name = EXCLUDED.courier_name, tracking_number = EXCLUDED.tracking_number,
            tracking_url = EXCLUDED.tracking_url, updated_at = EXCLUDED.updated_at;
        `;
      }
      if (index === 7) {
        await tx`
          INSERT INTO shipments
            (id, order_id, shipping_method_id, status, shipped_at, delivered_at, created_at, updated_at)
          VALUES
            (${adminOrderId(0xd700, index)}, ${orderId}, ${ADMIN_ORDER_SHIPPING_METHOD_ID},
             'DELIVERED', ${shipmentAt}, ${shipmentAt}, ${createdAt}, ${shipmentAt})
          ON CONFLICT (id) DO UPDATE SET status = 'DELIVERED', updated_at = EXCLUDED.updated_at;
        `;
      }
    }

    await tx`DELETE FROM order_address_snapshots WHERE order_id = ${adminOrderId(0xd100, 8)}`;
    await tx`DELETE FROM order_pricing_snapshots WHERE order_id = ${adminOrderId(0xd100, 9)}`;

    for (let index = 1; index <= 55; index += 1) {
      const createdAt = new Date(Date.UTC(2026, 8, 19, 21, index)).toISOString();
      await tx`
        INSERT INTO order_notes
          (id, order_id, author_auth_user_id, body, created_at,
           mutation_request_id, intent_fingerprint, actor_binding_digest)
        VALUES
          (${adminOrderId(0xe000, index)}, ${adminOrderId(0xd100, 10)},
           ${ADMIN_E2E_USERS.orders.id}, ${`Nota histórica ${index}`}, ${createdAt},
           ${adminOrderId(0xe100, index)}, ${"a".repeat(64)}, ${"b".repeat(64)})
        ON CONFLICT (id) DO UPDATE SET body = EXCLUDED.body, created_at = EXCLUDED.created_at;
      `;
    }

    await tx`
      INSERT INTO payment_submissions
        (id, payment_id, attempt_number, operation_code, submitted_at, created_at)
      VALUES
        (${adminOrderId(0xd900, 2)}, ${adminOrderId(0xd500, 2)}, 1,
         'OPERACION-E2E-PRIVADA', '2026-09-19T20:06:00Z', '2026-09-19T20:06:00Z')
      ON CONFLICT (id) DO UPDATE SET operation_code = EXCLUDED.operation_code;
    `;
    await tx`
      INSERT INTO refunds
        (id, order_id, payment_id, amount_cents, reason, created_at)
      VALUES
        (${adminOrderId(0xd800, 4)}, ${adminOrderId(0xd100, 4)},
         ${adminOrderId(0xd500, 4)}, 15990, 'Reembolso E2E', '2026-09-19T20:30:00Z')
      ON CONFLICT (id) DO UPDATE SET amount_cents = 15990;
    `;
  });

  console.log(`[Admin E2E Seed] Seeded ${ADMIN_ORDER_COUNT} list Orders and 2 CHK3 action Orders.`);
}

// Execute seed if invoked directly
if (
  process.argv[1] &&
  (import.meta.url === `file://${process.argv[1]}`.replace(/\\/g, "/") ||
    import.meta.url === `file:///${process.argv[1]}`.replace(/\\/g, "/"))
) {
  seedAdminUsers();
}
