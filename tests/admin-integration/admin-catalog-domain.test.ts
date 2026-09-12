import { describe, it, expect, beforeAll, afterAll } from "vitest";
import postgres from "postgres";
import { assertLocalDatabaseTarget } from "@/lib/admin/test-target-guard";
import {
  createProduct,
  createVariant,
  duplicateProduct,
  getAdminProductDetail,
  getAdminProductList,
  getCategorySpecificationSchema,
  getPublishedBrands,
  getPublishedCategories,
  transitionProductStatus,
  updateProduct,
  updateVariant,
} from "@/lib/admin/catalog";
import {
  CatalogDomainError,
  CatalogIdempotencyConflictError,
  CatalogReplayIntegrityError,
  SkuImmutableError,
  SpecificationSchemaIntegrityError,
  StaleWriteConflictError,
} from "@/lib/admin/catalog/types";
import { resolveAuthoritativeCategorySpecificationSchema } from "@/lib/admin/catalog/specifications";
import type { VerifiedAuthContextReady } from "@/lib/auth/rbac";
import type { SpecificationFieldDefinition } from "@/db/schema/catalog/category-specification-schemas";

describe("GP-024 / CHK1 — Admin Catalog Domain & Mutation Engine Live Integration", () => {
  const rawDatabaseUrl =
    process.env.DATABASE_URL ??
    process.env.DATABASE_MIGRATION_URL ??
    "postgres://postgres:postgres@127.0.0.1:54322/postgres";

  const databaseUrl = assertLocalDatabaseTarget(rawDatabaseUrl);
  let pgSql: postgres.Sql;

  // Dedicated prefix for test fixtures to guarantee zero collision and clean targeted teardown
  const PFX = "018f0024-0000-7000-8000-";

  const fixtureIds = {
    // Auth users
    superAdminUser: `${PFX}000000000001`,
    adminCatalogUser: `${PFX}000000000002`,
    adminOrdersUser: `${PFX}000000000003`,
    customerUser: `${PFX}000000000004`,
    adminSupportUser: `${PFX}000000000005`,
    aiResearchUser: `${PFX}000000000006`,

    // Brands
    brandPublished: `${PFX}000000000010`,
    brandDraft: `${PFX}000000000011`,

    // Categories
    catWithSchema: `${PFX}000000000020`,
    catNoSchema: `${PFX}000000000021`,
    catDraft: `${PFX}000000000022`,

    // Specification Schemas
    schemaForCat: `${PFX}000000000030`,

    // Media Assets
    mediaAssetPublic1: `${PFX}000000000040`,
    mediaAssetPublic2: `${PFX}000000000041`,

    // Pre-aggregated fan-out test product
    fanoutProduct: `${PFX}000000000050`,
    fanoutVariant: `${PFX}000000000051`,
  };

  // Auth Contexts for RBAC testing

  const authAdminCatalog: VerifiedAuthContextReady = {
    status: "READY",
    authUserId: fixtureIds.adminCatalogUser,
    email: "admincatalog.gp024@gamerperu.pe",
    roles: ["ADMIN_CATALOG"],
    permissions: new Set(["catalog:manage", "catalog:publish"]),
  };

  const authSuperAdmin: VerifiedAuthContextReady = {
    status: "READY",
    authUserId: fixtureIds.superAdminUser,
    email: "superadmin.gp024@gamerperu.pe",
    roles: ["SUPER_ADMIN"],
    permissions: new Set(["catalog:manage", "catalog:publish"]),
  };

  const authAdminManageOnly: VerifiedAuthContextReady = {
    status: "READY",
    authUserId: fixtureIds.adminCatalogUser,
    email: "manageonly.gp024@gamerperu.pe",
    roles: ["ADMIN_CATALOG"],
    permissions: new Set(["catalog:manage"]),
  };

  const authAdminOrders: VerifiedAuthContextReady = {
    status: "READY",
    authUserId: fixtureIds.adminOrdersUser,
    email: "adminorders.gp024@gamerperu.pe",
    roles: ["ADMIN_ORDERS"],
    permissions: new Set(["orders:manage"]),
  };

  const authCustomer: VerifiedAuthContextReady = {
    status: "READY",
    authUserId: fixtureIds.customerUser,
    email: "customer.gp024@gamerperu.pe",
    roles: ["CUSTOMER"],
    permissions: new Set([]),
  };

  const authAdminSupport: VerifiedAuthContextReady = {
    status: "READY",
    authUserId: fixtureIds.adminSupportUser,
    email: "adminsupport.gp024@gamerperu.pe",
    roles: ["ADMIN_SUPPORT"],
    permissions: new Set(["support:manage", "support:review_rma"]),
  };

  const authAiResearchOnly: VerifiedAuthContextReady = {
    status: "READY",
    authUserId: fixtureIds.aiResearchUser,
    email: "airesearch.gp024@gamerperu.pe",
    roles: ["ADMIN_CATALOG"],
    permissions: new Set(["catalog:ai_research"]),
  };

  const authAdminPublishOnly: VerifiedAuthContextReady = {
    status: "READY",
    authUserId: fixtureIds.adminCatalogUser,
    email: "publishonly.gp024@gamerperu.pe",
    roles: ["ADMIN_CATALOG"],
    permissions: new Set(["catalog:publish"]),
  };

  beforeAll(async () => {
    pgSql = postgres(databaseUrl, { max: 10 });

    // Seed test users & roles
    await pgSql.begin(async (tx) => {
      // 1. Auth Users
      const users = [
        { id: fixtureIds.superAdminUser, email: "superadmin.gp024@gamerperu.pe" },
        { id: fixtureIds.adminCatalogUser, email: "admincatalog.gp024@gamerperu.pe" },
        { id: fixtureIds.adminOrdersUser, email: "adminorders.gp024@gamerperu.pe" },
        { id: fixtureIds.customerUser, email: "customer.gp024@gamerperu.pe" },
        { id: fixtureIds.adminSupportUser, email: "adminsupport.gp024@gamerperu.pe" },
        { id: fixtureIds.aiResearchUser, email: "airesearch.gp024@gamerperu.pe" },
      ];
      for (const u of users) {
        await tx`
          INSERT INTO auth.users (id, email, raw_app_meta_data, raw_user_meta_data, is_super_admin, created_at, updated_at)
          VALUES (${u.id}, ${u.email}, '{"provider":"email","providers":["email"]}', '{}', false, NOW(), NOW())
          ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email;
        `;
      }

      // Assign user_roles
      await tx`
        INSERT INTO user_roles (auth_user_id, role_id)
        VALUES
          (${fixtureIds.superAdminUser}, (SELECT id FROM roles WHERE name = 'SUPER_ADMIN')),
          (${fixtureIds.adminCatalogUser}, (SELECT id FROM roles WHERE name = 'ADMIN_CATALOG')),
          (${fixtureIds.adminOrdersUser}, (SELECT id FROM roles WHERE name = 'ADMIN_ORDERS')),
          (${fixtureIds.customerUser}, (SELECT id FROM roles WHERE name = 'CUSTOMER')),
          (${fixtureIds.adminSupportUser}, (SELECT id FROM roles WHERE name = 'ADMIN_SUPPORT')),
          (${fixtureIds.aiResearchUser}, (SELECT id FROM roles WHERE name = 'ADMIN_CATALOG'))
        ON CONFLICT DO NOTHING;
      `;

      // 2. Brands
      await tx`
        INSERT INTO brands (id, name, slug, description, status, created_at, updated_at)
        VALUES
          (${fixtureIds.brandPublished}, 'WLmouse Test', 'wlmouse-test', 'WLmouse testing brand', 'PUBLISHED', NOW(), NOW()),
          (${fixtureIds.brandDraft}, 'Draft Brand Test', 'draft-brand-test', 'Draft brand testing', 'DRAFT', NOW(), NOW())
        ON CONFLICT (id) DO NOTHING;
      `;

      // 3. Categories (created first with current_spec_schema_id = NULL to satisfy FK)
      await tx`
        INSERT INTO categories (id, name, slug, current_spec_schema_id, display_order, status, created_at, updated_at)
        VALUES
          (${fixtureIds.catWithSchema}, 'Mice Specs Cat', 'mice-specs-cat', NULL, 1, 'PUBLISHED', NOW(), NOW()),
          (${fixtureIds.catNoSchema}, 'Accessories Cat', 'accessories-cat', NULL, 2, 'PUBLISHED', NOW(), NOW()),
          (${fixtureIds.catDraft}, 'Draft Category', 'draft-cat', NULL, 3, 'DRAFT', NOW(), NOW())
        ON CONFLICT (id) DO NOTHING;
      `;

      // 4. Category Specification Schema (v1)
      const fieldDefs: SpecificationFieldDefinition[] = [
        {
          key: "sensor",
          label: "Sensor Óptico",
          dataType: "enum",
          filterable: true,
          filterKind: "ENUM_MULTI",
          publicParam: "sensor",
          displayOrder: 1,
          options: [
            { value: "paw3395", label: "PAW3395" },
            { value: "paw3950", label: "PAW3950" },
          ],
        },
        {
          key: "polling_rate_hz",
          label: "Tasa de Sondeo",
          dataType: "number",
          filterable: true,
          filterKind: "NUMBER_RANGE",
          publicParam: "tasa",
          displayOrder: 2,
          min: 125,
          max: 8000,
          step: 125,
        },
        {
          key: "wireless",
          label: "Conexión Inalámbrica",
          dataType: "boolean",
          filterable: true,
          filterKind: "BOOLEAN",
          publicParam: "inalambrico",
          displayOrder: 3,
        },
      ];

      await tx`
        INSERT INTO category_specification_schemas (id, category_id, schema_version, field_definitions, is_active, created_at)
        VALUES (
          ${fixtureIds.schemaForCat},
          ${fixtureIds.catWithSchema},
          1,
          ${pgSql.json(fieldDefs as unknown as postgres.JSONValue)},
          TRUE,
          NOW()
        )
        ON CONFLICT (id) DO NOTHING;
      `;

      // Link category to schema
      await tx`
        UPDATE categories SET current_spec_schema_id = ${fixtureIds.schemaForCat} WHERE id = ${fixtureIds.catWithSchema};
      `;

      // 5. Media Assets
      await tx`
        INSERT INTO media_assets (
          id, object_key, security_class, media_type, mime_type, file_size_bytes, width, height, alt_text, checksum_sha256, created_at
        ) VALUES (
          ${fixtureIds.mediaAssetPublic1},
          'catalog/test-wlmouse-main.webp',
          'PUBLIC_MEDIA',
          'IMAGE',
          'image/webp',
          35000,
          1000,
          1000,
          'WLmouse Frontal',
          NULL,
          NOW()
        ), (
          ${fixtureIds.mediaAssetPublic2},
          'catalog/test-wlmouse-variant.webp',
          'PUBLIC_MEDIA',
          'IMAGE',
          'image/webp',
          28000,
          800,
          800,
          'WLmouse Variante',
          NULL,
          NOW()
        )
        ON CONFLICT (id) DO NOTHING;
      `;
    });
  });

  afterAll(async () => {
    if (pgSql) {
      await pgSql.begin(async (tx) => {
        // Clean up only rows owned by this test suite
        await tx`DELETE FROM audit_events WHERE actor_id IN (${fixtureIds.superAdminUser}, ${fixtureIds.adminCatalogUser}, ${fixtureIds.adminOrdersUser}, ${fixtureIds.customerUser}, ${fixtureIds.adminSupportUser}, ${fixtureIds.aiResearchUser});`;
        await tx`DELETE FROM order_items WHERE id = ${`${PFX}000000000091`};`;
        await tx`DELETE FROM orders WHERE id = ${`${PFX}000000000090`};`;
        await tx`DELETE FROM inventory_items WHERE id = ${`${PFX}000000000088`};`;
        await tx`DELETE FROM inventory_locations WHERE id = ${`${PFX}000000000087`};`;
        await tx`DELETE FROM inventory_items WHERE id IN (${`${PFX}000000000061`}, ${`${PFX}000000000062`}, ${`${PFX}000000000063`});`;
        await tx`DELETE FROM inventory_locations WHERE id IN (${`${PFX}000000000071`}, ${`${PFX}000000000072`}, ${`${PFX}000000000073`});`;
        await tx`DELETE FROM order_items WHERE variant_id IN (SELECT id FROM product_variants WHERE sku LIKE 'GP024-%' OR sku LIKE 'GP-TEST-%');`;
        await tx`DELETE FROM inventory_items WHERE variant_id IN (SELECT id FROM product_variants WHERE sku LIKE 'GP024-%' OR sku LIKE 'GP-TEST-%');`;
        await tx`DELETE FROM product_media WHERE product_id IN (SELECT id FROM products WHERE category_id IN (${fixtureIds.catWithSchema}, ${fixtureIds.catNoSchema}, ${fixtureIds.catDraft}) OR brand_id IN (${fixtureIds.brandPublished}, ${fixtureIds.brandDraft}) OR slug LIKE 'gp024-%' OR slug LIKE 'wlmouse-test-%');`;
        await tx`DELETE FROM product_specifications WHERE product_id IN (SELECT id FROM products WHERE category_id IN (${fixtureIds.catWithSchema}, ${fixtureIds.catNoSchema}, ${fixtureIds.catDraft}) OR brand_id IN (${fixtureIds.brandPublished}, ${fixtureIds.brandDraft}) OR slug LIKE 'gp024-%' OR slug LIKE 'wlmouse-test-%');`;
        await tx`DELETE FROM product_variants WHERE product_id IN (SELECT id FROM products WHERE category_id IN (${fixtureIds.catWithSchema}, ${fixtureIds.catNoSchema}, ${fixtureIds.catDraft}) OR brand_id IN (${fixtureIds.brandPublished}, ${fixtureIds.brandDraft}) OR slug LIKE 'gp024-%' OR slug LIKE 'wlmouse-test-%');`;
        await tx`DELETE FROM products WHERE category_id IN (${fixtureIds.catWithSchema}, ${fixtureIds.catNoSchema}, ${fixtureIds.catDraft}) OR brand_id IN (${fixtureIds.brandPublished}, ${fixtureIds.brandDraft}) OR slug LIKE 'gp024-%' OR slug LIKE 'wlmouse-test-%';`;

        await tx`UPDATE categories SET current_spec_schema_id = NULL WHERE id = ${fixtureIds.catWithSchema};`;
        await tx`DELETE FROM category_specification_schemas WHERE id = ${fixtureIds.schemaForCat};`;
        await tx`DELETE FROM categories WHERE id IN (${fixtureIds.catWithSchema}, ${fixtureIds.catNoSchema}, ${fixtureIds.catDraft});`;
        await tx`DELETE FROM brands WHERE id IN (${fixtureIds.brandPublished}, ${fixtureIds.brandDraft});`;
        await tx`DELETE FROM media_assets WHERE id IN (${fixtureIds.mediaAssetPublic1}, ${fixtureIds.mediaAssetPublic2});`;

        const userIds = [
          fixtureIds.superAdminUser,
          fixtureIds.adminCatalogUser,
          fixtureIds.adminOrdersUser,
          fixtureIds.customerUser,
          fixtureIds.adminSupportUser,
          fixtureIds.aiResearchUser,
        ];
        await tx`DELETE FROM user_roles WHERE auth_user_id IN ${tx(userIds)};`;
        await tx`DELETE FROM auth.users WHERE id IN ${tx(userIds)};`;
      });
      await pgSql.end();
    }
  });

  describe("Product List Query Fan-Out Regression & Filters", () => {
    beforeAll(async () => {
      // Seed 1 product with 1 ACTIVE variant and 3 inventory items across 3 locations
      await pgSql.begin(async (tx) => {
        await tx`
          INSERT INTO products (id, brand_id, category_id, name, slug, status, is_featured, created_at, updated_at)
          VALUES (
            ${fixtureIds.fanoutProduct},
            ${fixtureIds.brandPublished},
            ${fixtureIds.catWithSchema},
            'Fanout Test Mouse',
            'gp024-fanout-mouse',
            'PUBLISHED',
            false,
            NOW(),
            NOW()
          ) ON CONFLICT (id) DO NOTHING;
        `;

        await tx`
          INSERT INTO product_variants (
            id, product_id, sku, title, price_cents, status, display_order, created_at, updated_at
          ) VALUES (
            ${fixtureIds.fanoutVariant},
            ${fixtureIds.fanoutProduct},
            'GP024-FANOUT-01',
            'Standard Edition',
            45000,
            'ACTIVE',
            0,
            NOW(),
            NOW()
          ) ON CONFLICT (id) DO NOTHING;
        `;

        const loc1 = `${PFX}000000000071`;
        const loc2 = `${PFX}000000000072`;
        const loc3 = `${PFX}000000000073`;

        await tx`
          INSERT INTO inventory_locations (id, code, name, is_active, created_at)
          VALUES
            (${loc1}, 'LOC-LIMA-CENTRAL', 'Lima Central', true, NOW()),
            (${loc2}, 'LOC-MIRAFLORES', 'Miraflores', true, NOW()),
            (${loc3}, 'LOC-SAN-ISIDRO', 'San Isidro', true, NOW())
          ON CONFLICT (id) DO NOTHING;
        `;

        // 3 inventory items across 3 warehouse locations
        await tx`
          INSERT INTO inventory_items (id, variant_id, location_id, quantity_on_hand, quantity_reserved, quantity_allocated, updated_at)
          VALUES
            (${`${PFX}000000000061`}, ${fixtureIds.fanoutVariant}, ${loc1}, 10, 2, 0, NOW()),
            (${`${PFX}000000000062`}, ${fixtureIds.fanoutVariant}, ${loc2}, 25, 0, 0, NOW()),
            (${`${PFX}000000000063`}, ${fixtureIds.fanoutVariant}, ${loc3}, 15, 0, 5, NOW())
          ON CONFLICT (id) DO NOTHING;
        `;
      });
    });

    it("pre-aggregates variant and inventory CTEs with zero Cartesian fan-out", async () => {
      const result = await getAdminProductList(
        { search: "gp024-fanout-mouse" },
        { authContext: authAdminCatalog }
      );

      expect(result.items).toHaveLength(1);
      const item = result.items[0]!;

      // Exact assertion: totalVariants must be 1, activeVariants must be 1 (NOT 3!)
      expect(item.totalVariants).toBe(1);
      expect(item.activeVariants).toBe(1);

      // min and max active price cents
      expect(item.minActivePriceCents).toBe(45000);
      expect(item.maxActivePriceCents).toBe(45000);

      // activeVariantAts:
      // Loc 1: 10 - 2 - 0 = 8
      // Loc 2: 25 - 0 - 0 = 25
      // Loc 3: 15 - 0 - 5 = 10
      // Sum = 8 + 25 + 10 = 43
      expect(item.activeVariantAts).toBe(43);
    });

    it("enforces deterministic ordering p.updated_at DESC, p.id DESC", async () => {
      const result = await getAdminProductList({}, { authContext: authAdminCatalog });
      expect(result.items.length).toBeGreaterThan(0);

      for (let i = 0; i < result.items.length - 1; i++) {
        const a = result.items[i]!;
        const b = result.items[i + 1]!;
        if (a.updatedAt.getTime() === b.updatedAt.getTime()) {
          expect(a.id >= b.id).toBe(true);
        } else {
          expect(a.updatedAt.getTime() >= b.updatedAt.getTime()).toBe(true);
        }
      }
    });

    it("filters correctly by brand, category, status, and search", async () => {
      const byBrand = await getAdminProductList(
        { brandId: fixtureIds.brandPublished },
        { authContext: authAdminCatalog }
      );
      expect(byBrand.items.every((it) => it.brandId === fixtureIds.brandPublished)).toBe(true);

      const byCat = await getAdminProductList(
        { categoryId: fixtureIds.catWithSchema },
        { authContext: authAdminCatalog }
      );
      expect(byCat.items.every((it) => it.categoryId === fixtureIds.catWithSchema)).toBe(true);

      const byStatus = await getAdminProductList(
        { status: "PUBLISHED" },
        { authContext: authAdminCatalog }
      );
      expect(byStatus.items.every((it) => it.status === "PUBLISHED")).toBe(true);
    });
  });

  describe("Reference Selectors", () => {
    it("getPublishedBrands returns published brands and excludes draft brands", async () => {
      const brands = await getPublishedBrands({ authContext: authAdminCatalog });
      expect(brands.some((b) => b.id === fixtureIds.brandPublished)).toBe(true);
      expect(brands.some((b) => b.id === fixtureIds.brandDraft)).toBe(false);
    });

    it("getPublishedCategories returns published categories and currentSpecSchemaId", async () => {
      const cats = await getPublishedCategories({ authContext: authAdminCatalog });
      const targetCat = cats.find((c) => c.id === fixtureIds.catWithSchema);
      expect(targetCat).toBeDefined();
      expect(targetCat?.currentSpecSchemaId).toBe(fixtureIds.schemaForCat);
      expect(cats.some((c) => c.id === fixtureIds.catDraft)).toBe(false);
    });

    it("getCategorySpecificationSchema resolves validated schema via current_spec_schema_id", async () => {
      const schema = await getCategorySpecificationSchema(fixtureIds.catWithSchema, {
        authContext: authAdminCatalog,
      });
      expect(schema).toBeDefined();
      expect(schema?.id).toBe(fixtureIds.schemaForCat);
      expect(schema?.fieldDefinitions).toHaveLength(3);

      const noSchema = await getCategorySpecificationSchema(fixtureIds.catNoSchema, {
        authContext: authAdminCatalog,
      });
      expect(noSchema).toBeNull();
    });
  });

  describe("Product Mutations & Transactional Integrity", () => {
    let createdProdId: string;

    it("creates a product in DRAFT status with initial variant and AuditEvent", async () => {
      const prod = await createProduct(
        {
          name: "Nuevo Mouse Gamer",
          slug: "gp024-mouse-test-01",
          brandId: fixtureIds.brandPublished,
          categoryId: fixtureIds.catWithSchema,
          subtitle: "Ultraligero",
          description: "Descripción detallada del producto de prueba.",
          initialVariant: {
            sku: "GP024-TEST-V01",
            title: "Color Negro",
            priceCents: 29900,
            compareAtPriceCents: 34900,
            costCents: 18000,
            weightGrams: 42,
            attributes: { color: "Negro" },
          },
          mutationRequestId: "req-create-001",
        },
        { authContext: authAdminCatalog }
      );

      expect(prod.id).toBeDefined();
      expect(prod.status).toBe("DRAFT");
      createdProdId = prod.id;

      // Verify AuditEvent
      const auditRows = await pgSql`
        SELECT * FROM audit_events WHERE target_id = ${prod.id} AND action = 'catalog:product:create' LIMIT 1;
      `;
      expect(auditRows).toHaveLength(1);
      expect(auditRows[0]!.metadata.mutation_request_digest).toBeDefined();
      expect(auditRows[0]!.metadata.request_fingerprint).toBeDefined();
    });

    it("handles idempotency: retry with same mutationRequestId returns existing product", async () => {
      const replayedProd = await createProduct(
        {
          name: "Nuevo Mouse Gamer",
          slug: "gp024-mouse-test-01",
          brandId: fixtureIds.brandPublished,
          categoryId: fixtureIds.catWithSchema,
          subtitle: "Ultraligero",
          description: "Descripción detallada del producto de prueba.",
          initialVariant: {
            sku: "GP024-TEST-V01",
            title: "Color Negro",
            priceCents: 29900,
            compareAtPriceCents: 34900,
            costCents: 18000,
            weightGrams: 42,
            attributes: { color: "Negro" },
          },
          mutationRequestId: "req-create-001",
        },
        { authContext: authAdminCatalog }
      );

      expect(replayedProd.id).toBe(createdProdId);

      // Verify no duplicate AuditEvents
      const auditRows = await pgSql`
        SELECT COUNT(*)::int AS cnt FROM audit_events WHERE target_id = ${createdProdId} AND action = 'catalog:product:create';
      `;
      expect(auditRows[0]!.cnt).toBe(1);
    });

    it("detects idempotency conflict if same mutationRequestId has modified payload", async () => {
      await expect(
        createProduct(
          {
            name: "Nombre Diferente",
            slug: "gp024-mouse-test-conflict",
            brandId: fixtureIds.brandPublished,
            categoryId: fixtureIds.catWithSchema,
            mutationRequestId: "req-create-001",
          },
          { authContext: authAdminCatalog }
        )
      ).rejects.toThrow(CatalogIdempotencyConflictError);
    });

    it("proves known raw mutationRequestId does NOT appear in audit_events.request_id or metadata", async () => {
      const knownRawId = "SECRET-RAW-MUTATION-REQUEST-ID-GP024";
      const p = await createProduct(
        {
          name: "Audit Privacy Mouse",
          slug: "gp024-audit-privacy-mouse",
          brandId: fixtureIds.brandPublished,
          categoryId: fixtureIds.catWithSchema,
          mutationRequestId: knownRawId,
        },
        { authContext: authAdminCatalog }
      );

      const auditRows = await pgSql`
        SELECT * FROM audit_events WHERE target_id = ${p.id} AND action = 'catalog:product:create';
      `;
      expect(auditRows).toHaveLength(1);
      const audit = auditRows[0]!;
      expect(audit.request_id).toBeNull();
      expect(JSON.stringify(audit.metadata)).not.toContain(knownRawId);
      expect(audit.metadata.mutation_request_digest).toBeDefined();
      expect(audit.metadata.request_fingerprint).toBeDefined();
    });

    it("updates product with optimistic concurrency check", async () => {
      const detail = await getAdminProductDetail(createdProdId, { authContext: authAdminCatalog });
      expect(detail).toBeDefined();

      // Successful update
      const updated = await updateProduct(
        {
          productId: createdProdId,
          expectedUpdatedAt: detail!.product.updatedAt,
          name: "Nuevo Mouse Gamer Pro",
          specValues: {
            sensor: "paw3395",
            polling_rate_hz: 1000,
            wireless: true,
          },
        },
        { authContext: authAdminCatalog }
      );
      expect(updated.name).toBe("Nuevo Mouse Gamer Pro");

      // Stale update throws 409 conflict
      await expect(
        updateProduct(
          {
            productId: createdProdId,
            expectedUpdatedAt: new Date(new Date(detail!.product.updatedAt).getTime() - 10000), // explicitly stale timestamp
            name: "Stale update",
          },
          { authContext: authAdminCatalog }
        )
      ).rejects.toThrow(StaleWriteConflictError);
    });
  });

  describe("SKU Immutability Post-Inventory & Post-Orders", () => {
    let skuTestProdId: string;
    let skuTestVarId: string;

    beforeAll(async () => {
      const prod = await createProduct(
        {
          name: "SKU Immutability Test Product",
          slug: "gp024-sku-test-product",
          brandId: fixtureIds.brandPublished,
          categoryId: fixtureIds.catNoSchema,
          initialVariant: {
            sku: "GP-TEST-SKU-ORIGINAL",
            title: "Original SKU Variant",
            priceCents: 15000,
          },
        },
        { authContext: authAdminCatalog }
      );
      skuTestProdId = prod.id;

      const detail = await getAdminProductDetail(skuTestProdId, { authContext: authAdminCatalog });
      skuTestVarId = detail!.variants[0]!.id;
    });

    it("allows SKU modification while zero inventory and zero orders exist", async () => {
      const detail = await getAdminProductDetail(skuTestProdId, { authContext: authAdminCatalog });
      const currentVar = detail!.variants[0]!;

      const updated = await updateVariant(
        {
          variantId: skuTestVarId,
          expectedUpdatedAt: currentVar.updatedAt,
          sku: "GP-TEST-SKU-MODIFIED",
        },
        { authContext: authAdminCatalog }
      );

      expect(updated.sku).toBe("GP-TEST-SKU-MODIFIED");
    });

    it("strictly blocks SKU modification once inventory items exist", async () => {
      const locId = `${PFX}000000000087`;
      await pgSql`
        INSERT INTO inventory_locations (id, code, name, is_active, created_at)
        VALUES (${locId}, 'LOC-TEST-024', 'Almacén Central Test', true, NOW())
        ON CONFLICT (id) DO NOTHING;
      `;

      // Seed an inventory item for this variant
      const invItemId = `${PFX}000000000088`;
      await pgSql`
        INSERT INTO inventory_items (id, variant_id, location_id, quantity_on_hand, quantity_reserved, quantity_allocated, updated_at)
        VALUES (${invItemId}, ${skuTestVarId}, ${locId}, 5, 0, 0, NOW())
        ON CONFLICT (id) DO NOTHING;
      `;

      const detail = await getAdminProductDetail(skuTestProdId, { authContext: authAdminCatalog });
      const currentVar = detail!.variants[0]!;
      expect(currentVar.isSkuImmutable).toBe(true);

      // Attempt SKU change -> must throw SkuImmutableError
      await expect(
        updateVariant(
          {
            variantId: skuTestVarId,
            expectedUpdatedAt: currentVar.updatedAt,
            sku: "GP-TEST-SKU-BLOCKED",
          },
          { authContext: authAdminCatalog }
        )
      ).rejects.toThrow(SkuImmutableError);

      // Clean up inventory item and location
      await pgSql`DELETE FROM inventory_items WHERE id = ${invItemId};`;
      await pgSql`DELETE FROM inventory_locations WHERE id = ${locId};`;
    });

    it("strictly blocks SKU modification once order items exist and preserves sku_snapshot", async () => {
      const orderId = `${PFX}000000000090`;
      const orderItemId = `${PFX}000000000091`;

      // Seed order and order item referencing variant
      await pgSql.begin(async (tx) => {
        await tx`
          INSERT INTO orders (
            id, order_number, customer_id, customer_email, customer_phone, status,
            subtotal_cents, discount_cents, shipping_cents, total_cents,
            currency, created_at, updated_at
          ) VALUES (
            ${orderId}, 'ORD-TEST-024', NULL, 'testbuyer@example.com', '999888777', 'PENDING',
            15000, 0, 0, 15000,
            'PEN', NOW(), NOW()
          ) ON CONFLICT (id) DO NOTHING;
        `;

        await tx`
          INSERT INTO order_items (
            id, order_id, variant_id, sku_snapshot, product_name_snapshot, variant_title_snapshot,
            unit_price_cents_snapshot, quantity, line_total_cents, created_at
          ) VALUES (
            ${orderItemId}, ${orderId}, ${skuTestVarId}, 'GP-TEST-SKU-MODIFIED', 'SKU Immutability Test Product', 'Default Variant',
            15000, 1, 15000, NOW()
          ) ON CONFLICT (id) DO NOTHING;
        `;
      });

      const detail = await getAdminProductDetail(skuTestProdId, { authContext: authAdminCatalog });
      const currentVar = detail!.variants[0]!;
      expect(currentVar.isSkuImmutable).toBe(true);

      // Attempt to modify SKU
      await expect(
        updateVariant(
          {
            variantId: skuTestVarId,
            expectedUpdatedAt: currentVar.updatedAt,
            sku: "GP-TEST-SKU-CANNOT-CHANGE",
          },
          { authContext: authAdminCatalog }
        )
      ).rejects.toThrow(SkuImmutableError);

      // Verify order item snapshot remains intact
      const orderItem =
        await pgSql`SELECT sku_snapshot FROM order_items WHERE id = ${orderItemId} LIMIT 1;`;
      expect(orderItem[0]!.sku_snapshot).toBe("GP-TEST-SKU-MODIFIED");

      // Clean up order
      await pgSql`DELETE FROM order_items WHERE id = ${orderItemId};`;
      await pgSql`DELETE FROM orders WHERE id = ${orderId};`;
    });
  });

  describe("Category Change Specification Reconciliation", () => {
    it("deletes specifications when moving to a category with no schema", async () => {
      const prod = await createProduct(
        {
          name: "Category Change Mouse",
          slug: "gp024-cat-change-mouse",
          brandId: fixtureIds.brandPublished,
          categoryId: fixtureIds.catWithSchema,
        },
        { authContext: authAdminCatalog }
      );

      // Seed specs
      const detail = await getAdminProductDetail(prod.id, { authContext: authAdminCatalog });
      await updateProduct(
        {
          productId: prod.id,
          expectedUpdatedAt: detail!.product.updatedAt,
          specValues: { sensor: "paw3395", polling_rate_hz: 1000, wireless: true },
        },
        { authContext: authAdminCatalog }
      );

      const withSpecs = await getAdminProductDetail(prod.id, { authContext: authAdminCatalog });
      expect(withSpecs!.specifications).toBeDefined();

      // Change category to catNoSchema
      const updated = await updateProduct(
        {
          productId: prod.id,
          expectedUpdatedAt: withSpecs!.product.updatedAt,
          categoryId: fixtureIds.catNoSchema,
        },
        { authContext: authAdminCatalog }
      );
      expect(updated.categoryId).toBe(fixtureIds.catNoSchema);

      const afterChange = await getAdminProductDetail(prod.id, { authContext: authAdminCatalog });
      expect(afterChange!.specifications).toBeNull();
    });

    it("rejects when Category.current_spec_schema_id points to schema of another category", async () => {
      const foreignCatId = `${PFX}000000000025`;
      const foreignSchemaId = `${PFX}000000000035`;
      await pgSql.begin(async (tx) => {
        await tx`
          INSERT INTO categories (id, name, slug, current_spec_schema_id, display_order, status, created_at, updated_at)
          VALUES (${foreignCatId}, 'Foreign Cat', 'foreign-cat-test', NULL, 10, 'PUBLISHED', NOW(), NOW())
          ON CONFLICT (id) DO NOTHING;
        `;
        await tx`
          INSERT INTO category_specification_schemas (id, category_id, schema_version, field_definitions, is_active, created_at)
          VALUES (${foreignSchemaId}, ${foreignCatId}, 1, '[]'::jsonb, TRUE, NOW())
          ON CONFLICT (id) DO NOTHING;
        `;
        await tx`
          UPDATE categories SET current_spec_schema_id = ${foreignSchemaId} WHERE id = ${fixtureIds.catNoSchema};
        `;
      });

      try {
        await expect(
          getCategorySpecificationSchema(fixtureIds.catNoSchema, { authContext: authAdminCatalog })
        ).rejects.toThrow(SpecificationSchemaIntegrityError);
      } finally {
        await pgSql`UPDATE categories SET current_spec_schema_id = NULL WHERE id = ${fixtureIds.catNoSchema};`;
        await pgSql`DELETE FROM category_specification_schemas WHERE id = ${foreignSchemaId};`;
        await pgSql`DELETE FROM categories WHERE id = ${foreignCatId};`;
      }
    });

    it("rejects when Category.current_spec_schema_id points to an inactive schema", async () => {
      const inactiveSchemaId = `${PFX}000000000036`;
      await pgSql.begin(async (tx) => {
        await tx`
          INSERT INTO category_specification_schemas (id, category_id, schema_version, field_definitions, is_active, created_at)
          VALUES (${inactiveSchemaId}, ${fixtureIds.catWithSchema}, 2, '[]'::jsonb, FALSE, NOW())
          ON CONFLICT (id) DO NOTHING;
        `;
        await tx`
          UPDATE categories SET current_spec_schema_id = ${inactiveSchemaId} WHERE id = ${fixtureIds.catWithSchema};
        `;
      });

      try {
        await expect(
          getCategorySpecificationSchema(fixtureIds.catWithSchema, {
            authContext: authAdminCatalog,
          })
        ).rejects.toThrow(SpecificationSchemaIntegrityError);
      } finally {
        await pgSql`UPDATE categories SET current_spec_schema_id = ${fixtureIds.schemaForCat} WHERE id = ${fixtureIds.catWithSchema};`;
        await pgSql`DELETE FROM category_specification_schemas WHERE id = ${inactiveSchemaId};`;
      }
    });

    it("rejects when schema_version <= 0", async () => {
      let callCount = 0;
      const stubExecutor = {
        execute: async () => {
          callCount++;
          if (callCount === 1) {
            return [
              { id: fixtureIds.catWithSchema, current_spec_schema_id: fixtureIds.schemaForCat },
            ];
          }
          return [
            {
              id: fixtureIds.schemaForCat,
              category_id: fixtureIds.catWithSchema,
              schema_version: 0,
              field_definitions: [],
              is_active: true,
              created_at: new Date(),
            },
          ];
        },
      };

      await expect(
        resolveAuthoritativeCategorySpecificationSchema(
          fixtureIds.catWithSchema,
          stubExecutor as unknown as Parameters<
            typeof resolveAuthoritativeCategorySpecificationSchema
          >[1]
        )
      ).rejects.toThrow(SpecificationSchemaIntegrityError);
    });

    it("rejects when field_definitions is malformed", async () => {
      const malformedSchemaId = `${PFX}000000000038`;
      await pgSql.begin(async (tx) => {
        await tx`
          INSERT INTO category_specification_schemas (id, category_id, schema_version, field_definitions, is_active, created_at)
          VALUES (${malformedSchemaId}, ${fixtureIds.catWithSchema}, 99, '[{"invalid":"field"}]'::jsonb, TRUE, NOW())
          ON CONFLICT (id) DO NOTHING;
        `;
        await tx`
          UPDATE categories SET current_spec_schema_id = ${malformedSchemaId} WHERE id = ${fixtureIds.catWithSchema};
        `;
      });

      try {
        await expect(
          getCategorySpecificationSchema(fixtureIds.catWithSchema, {
            authContext: authAdminCatalog,
          })
        ).rejects.toThrow(SpecificationSchemaIntegrityError);
      } finally {
        await pgSql`UPDATE categories SET current_spec_schema_id = ${fixtureIds.schemaForCat} WHERE id = ${fixtureIds.catWithSchema};`;
        await pgSql`DELETE FROM category_specification_schemas WHERE id = ${malformedSchemaId};`;
      }
    });

    it("rolls back Product category update transaction when target category has corrupt schema", async () => {
      const corruptCatId = `${PFX}000000000029`;
      const corruptSchemaId = `${PFX}000000000039`;

      await pgSql.begin(async (tx) => {
        await tx`
          INSERT INTO categories (id, name, slug, current_spec_schema_id, display_order, status, created_at, updated_at)
          VALUES (${corruptCatId}, 'Corrupt Cat', 'corrupt-cat', NULL, 99, 'PUBLISHED', NOW(), NOW())
          ON CONFLICT (id) DO NOTHING;
        `;
        await tx`
          INSERT INTO category_specification_schemas (id, category_id, schema_version, field_definitions, is_active, created_at)
          VALUES (${corruptSchemaId}, ${corruptCatId}, 1, '[{"invalid":"corrupt"}]'::jsonb, TRUE, NOW())
          ON CONFLICT (id) DO NOTHING;
        `;
        await tx`UPDATE categories SET current_spec_schema_id = ${corruptSchemaId} WHERE id = ${corruptCatId};`;
      });

      const prod = await createProduct(
        {
          name: "Rollback Test Mouse",
          slug: "gp024-rollback-mouse",
          brandId: fixtureIds.brandPublished,
          categoryId: fixtureIds.catWithSchema,
        },
        { authContext: authAdminCatalog }
      );

      const detail = await getAdminProductDetail(prod.id, { authContext: authAdminCatalog });
      await updateProduct(
        {
          productId: prod.id,
          expectedUpdatedAt: detail!.product.updatedAt,
          specValues: { sensor: "paw3395", polling_rate_hz: 1000, wireless: true },
        },
        { authContext: authAdminCatalog }
      );

      const beforeUpdate = await getAdminProductDetail(prod.id, { authContext: authAdminCatalog });

      // Attempt updating to corrupt category -> throws SpecificationSchemaIntegrityError
      await expect(
        updateProduct(
          {
            productId: prod.id,
            expectedUpdatedAt: beforeUpdate!.product.updatedAt,
            categoryId: corruptCatId,
          },
          { authContext: authAdminCatalog }
        )
      ).rejects.toThrow(SpecificationSchemaIntegrityError);

      // Verify transaction rolled back: original category and specifications remain intact
      const afterFailedUpdate = await getAdminProductDetail(prod.id, {
        authContext: authAdminCatalog,
      });
      expect(afterFailedUpdate!.product.categoryId).toBe(fixtureIds.catWithSchema);
      expect(afterFailedUpdate!.specifications).toBeDefined();
      expect(afterFailedUpdate!.specifications?.schemaId).toBe(fixtureIds.schemaForCat);

      // Cleanup
      await pgSql`UPDATE categories SET current_spec_schema_id = NULL WHERE id = ${corruptCatId};`;
      await pgSql`DELETE FROM category_specification_schemas WHERE id = ${corruptSchemaId};`;
      await pgSql`DELETE FROM categories WHERE id = ${corruptCatId};`;
    });
  });

  describe("Duplicate Product Transaction", () => {
    it("duplicates product with variants, specs, and remapped media with zero inventory/orders", async () => {
      // 1. Create source product with specs, variants, media
      const sourceProd = await createProduct(
        {
          name: "Master Source Product",
          slug: "gp024-master-source",
          brandId: fixtureIds.brandPublished,
          categoryId: fixtureIds.catWithSchema,
          subtitle: "Subtítulo de origen",
          description: "Descripción completa de origen.",
          initialVariant: {
            sku: "GP024-SOURCE-V1",
            title: "Edición Blanca",
            priceCents: 39900,
          },
        },
        { authContext: authAdminCatalog }
      );

      const detail1 = await getAdminProductDetail(sourceProd.id, { authContext: authAdminCatalog });
      const v1Id = detail1!.variants[0]!.id;

      // Add second variant
      await createVariant(
        {
          productId: sourceProd.id,
          sku: "GP024-SOURCE-V2",
          title: "Edición Negra",
          priceCents: 41900,
        },
        { authContext: authAdminCatalog }
      );

      // Add specs
      await updateProduct(
        {
          productId: sourceProd.id,
          expectedUpdatedAt: detail1!.product.updatedAt,
          specValues: { sensor: "paw3950", polling_rate_hz: 8000, wireless: true },
        },
        { authContext: authAdminCatalog }
      );

      // Attach global media and variant media
      await pgSql`
        INSERT INTO product_media (id, product_id, media_asset_id, variant_id, display_order, created_at)
        VALUES
          (${`${PFX}000000000101`}, ${sourceProd.id}, ${fixtureIds.mediaAssetPublic1}, NULL, 0, NOW()),
          (${`${PFX}000000000102`}, ${sourceProd.id}, ${fixtureIds.mediaAssetPublic2}, ${v1Id}, 1, NOW())
        ON CONFLICT (id) DO NOTHING;
      `;

      // Set global media as primary
      await pgSql`
        UPDATE products SET primary_media_id = ${fixtureIds.mediaAssetPublic1} WHERE id = ${sourceProd.id};
      `;

      // 2. Duplicate product
      const duplicated = await duplicateProduct(
        {
          sourceProductId: sourceProd.id,
          mutationRequestId: "req-dup-001",
        },
        { authContext: authAdminCatalog }
      );

      expect(duplicated.id).not.toBe(sourceProd.id);
      expect(duplicated.name).toBe("Master Source Product (Copia)");
      expect(duplicated.status).toBe("DRAFT");
      expect(duplicated.isFeatured).toBe(false);

      // Verify cloned detail
      const dupDetail = await getAdminProductDetail(duplicated.id, {
        authContext: authAdminCatalog,
      });
      expect(dupDetail).toBeDefined();

      // Variants
      expect(dupDetail!.variants).toHaveLength(2);
      expect(dupDetail!.variants[0]!.sku).toBe("GP024-SOURCE-V1-COPY");
      expect(dupDetail!.variants[1]!.sku).toBe("GP024-SOURCE-V2-COPY");

      // Specifications
      expect(dupDetail!.specifications).toBeDefined();
      expect(dupDetail!.specifications?.specValues).toEqual({
        sensor: "paw3950",
        polling_rate_hz: 8000,
        wireless: true,
      });

      // Media attachments & remapping
      expect(dupDetail!.media).toHaveLength(2);
      const globalMedia = dupDetail!.media.find((m) => m.variantId === null);
      const variantMedia = dupDetail!.media.find((m) => m.variantId !== null);

      expect(globalMedia).toBeDefined();
      expect(globalMedia?.mediaAssetId).toBe(fixtureIds.mediaAssetPublic1);
      expect(dupDetail!.product.primaryMediaId).toBe(fixtureIds.mediaAssetPublic1);

      // Variant media must be mapped to NEW variant ID (not source V1 ID!)
      const clonedV1 = dupDetail!.variants.find((v) => v.title === "Edición Blanca");
      expect(variantMedia?.variantId).toBe(clonedV1?.id);
      expect(variantMedia?.variantId).not.toBe(v1Id);

      // Zero inventory items on new variants
      const invCount = await pgSql`
        SELECT COUNT(*)::int AS cnt FROM inventory_items WHERE variant_id IN (${dupDetail!.variants[0]!.id}, ${dupDetail!.variants[1]!.id});
      `;
      expect(invCount[0]!.cnt).toBe(0);

      // Replay returns same clone without cascading copies
      const replayedDup = await duplicateProduct(
        {
          sourceProductId: sourceProd.id,
          mutationRequestId: "req-dup-001",
        },
        { authContext: authAdminCatalog }
      );
      expect(replayedDup.id).toBe(duplicated.id);
    });
  });

  describe("Status Lifecycle, Publish Readiness & Hard Delete Prevention", () => {
    let lifecycleProdId: string;

    beforeAll(async () => {
      const prod = await createProduct(
        {
          name: "Lifecycle Product Test",
          slug: "gp024-lifecycle-test",
          brandId: fixtureIds.brandPublished,
          categoryId: fixtureIds.catWithSchema,
        },
        { authContext: authAdminCatalog }
      );
      lifecycleProdId = prod.id;
    });

    it("blocks publish if product does not meet publish readiness", async () => {
      const detail = await getAdminProductDetail(lifecycleProdId, {
        authContext: authAdminCatalog,
      });

      // Missing active variant and media
      await expect(
        transitionProductStatus(
          {
            productId: lifecycleProdId,
            expectedUpdatedAt: detail!.product.updatedAt,
            targetStatus: "PUBLISHED",
          },
          { authContext: authAdminCatalog }
        )
      ).rejects.toThrow(CatalogDomainError);
    });

    it("publishes successfully once all blockers are resolved", async () => {
      // 1. Add active variant
      await createVariant(
        {
          productId: lifecycleProdId,
          sku: "GP024-LIFE-V1",
          title: "Versión Final",
          priceCents: 59900,
        },
        { authContext: authAdminCatalog }
      );

      // 2. Add specs
      const detail1 = await getAdminProductDetail(lifecycleProdId, {
        authContext: authAdminCatalog,
      });
      await updateProduct(
        {
          productId: lifecycleProdId,
          expectedUpdatedAt: detail1!.product.updatedAt,
          specValues: { sensor: "paw3395", polling_rate_hz: 1000, wireless: true },
        },
        { authContext: authAdminCatalog }
      );

      // 3. Attach global media
      await pgSql`
        INSERT INTO product_media (id, product_id, media_asset_id, variant_id, display_order, created_at)
        VALUES (${`${PFX}000000000199`}, ${lifecycleProdId}, ${fixtureIds.mediaAssetPublic1}, NULL, 0, NOW())
        ON CONFLICT (id) DO NOTHING;
      `;
      await pgSql`
        UPDATE products SET primary_media_id = ${fixtureIds.mediaAssetPublic1} WHERE id = ${lifecycleProdId};
      `;

      // 4. Now attempt publish
      const detailReady = await getAdminProductDetail(lifecycleProdId, {
        authContext: authAdminCatalog,
      });
      expect(detailReady!.publishReadiness.isPublishable).toBe(true);

      const published = await transitionProductStatus(
        {
          productId: lifecycleProdId,
          expectedUpdatedAt: detailReady!.product.updatedAt,
          targetStatus: "PUBLISHED",
        },
        { authContext: authAdminCatalog }
      );

      expect(published.status).toBe("PUBLISHED");

      // Verify AuditEvent
      const audit = await pgSql`
        SELECT * FROM audit_events WHERE target_id = ${lifecycleProdId} AND action = 'catalog:product:publish' LIMIT 1;
      `;
      expect(audit).toHaveLength(1);
    });

    it("unpublishes to DRAFT and archives with zero hard delete", async () => {
      const detail1 = await getAdminProductDetail(lifecycleProdId, {
        authContext: authAdminCatalog,
      });

      // Unpublish to DRAFT
      const unpublished = await transitionProductStatus(
        {
          productId: lifecycleProdId,
          expectedUpdatedAt: detail1!.product.updatedAt,
          targetStatus: "DRAFT",
        },
        { authContext: authAdminCatalog }
      );
      expect(unpublished.status).toBe("DRAFT");

      // Archive
      const detail2 = await getAdminProductDetail(lifecycleProdId, {
        authContext: authAdminCatalog,
      });
      const archived = await transitionProductStatus(
        {
          productId: lifecycleProdId,
          expectedUpdatedAt: detail2!.product.updatedAt,
          targetStatus: "ARCHIVED",
        },
        { authContext: authAdminCatalog }
      );
      expect(archived.status).toBe("ARCHIVED");

      // Product still exists physically in PostgreSQL (Zero hard delete)
      const physicalCheck =
        await pgSql`SELECT id, status FROM products WHERE id = ${lifecycleProdId} LIMIT 1;`;
      expect(physicalCheck[0]!.status).toBe("ARCHIVED");
    });
  });

  describe("RBAC Enforcement", () => {
    it("rejects unauthorized roles (CUSTOMER, ADMIN_ORDERS)", async () => {
      // CUSTOMER rejected
      await expect(
        createProduct(
          {
            name: "Customer Mouse",
            slug: "gp024-cust-mouse",
            brandId: fixtureIds.brandPublished,
            categoryId: fixtureIds.catNoSchema,
          },
          { authContext: authCustomer }
        )
      ).rejects.toThrow("No tienes permisos suficientes");

      // ADMIN_ORDERS rejected
      await expect(
        createProduct(
          {
            name: "Orders Mouse",
            slug: "gp024-orders-mouse",
            brandId: fixtureIds.brandPublished,
            categoryId: fixtureIds.catNoSchema,
          },
          { authContext: authAdminOrders }
        )
      ).rejects.toThrow("No tienes permisos suficientes");
    });

    it("requires catalog:publish permission to transition to PUBLISHED", async () => {
      const prod = await createProduct(
        {
          name: "Publish Perm Mouse",
          slug: "gp024-pub-perm-mouse",
          brandId: fixtureIds.brandPublished,
          categoryId: fixtureIds.catNoSchema,
        },
        { authContext: authAdminCatalog }
      );

      const detail = await getAdminProductDetail(prod.id, { authContext: authAdminCatalog });

      // Caller with only catalog:manage (missing catalog:publish) is rejected
      await expect(
        transitionProductStatus(
          {
            productId: prod.id,
            expectedUpdatedAt: detail!.product.updatedAt,
            targetStatus: "PUBLISHED",
          },
          { authContext: authAdminManageOnly }
        )
      ).rejects.toThrow("No tienes permisos suficientes");
    });

    it("ADMIN_SUPPORT without catalog permissions is rejected with FORBIDDEN (403)", async () => {
      try {
        await createProduct(
          {
            name: "Support Mouse",
            slug: "gp024-support-mouse",
            brandId: fixtureIds.brandPublished,
            categoryId: fixtureIds.catNoSchema,
          },
          { authContext: authAdminSupport }
        );
        expect.unreachable("Should have thrown");
      } catch (err: unknown) {
        expect(err).toBeInstanceOf(CatalogDomainError);
        const cErr = err as CatalogDomainError;
        expect(cErr.code).toBe("FORBIDDEN");
        expect(cErr.httpStatus).toBe(403);
      }
    });

    it("catalog:ai_research ONLY is rejected with FORBIDDEN (403) on catalog:manage operations", async () => {
      try {
        await createProduct(
          {
            name: "AI Research Mouse",
            slug: "gp024-ai-mouse",
            brandId: fixtureIds.brandPublished,
            categoryId: fixtureIds.catNoSchema,
          },
          { authContext: authAiResearchOnly }
        );
        expect.unreachable("Should have thrown");
      } catch (err: unknown) {
        expect(err).toBeInstanceOf(CatalogDomainError);
        const cErr = err as CatalogDomainError;
        expect(cErr.code).toBe("FORBIDDEN");
        expect(cErr.httpStatus).toBe(403);
      }
    });
  });

  describe("Exact Optimistic Concurrency Invariants", () => {
    let concProdId: string;
    let concVarId: string;

    beforeAll(async () => {
      const p = await createProduct(
        {
          name: "Exact Concurrency Mouse",
          slug: "gp024-exact-conc-mouse",
          brandId: fixtureIds.brandPublished,
          categoryId: fixtureIds.catNoSchema,
          initialVariant: {
            sku: "GP024-EXACT-CONC-V1",
            title: "Conc Variant",
            priceCents: 10000,
          },
        },
        { authContext: authAdminCatalog }
      );
      concProdId = p.id;
      const detail = await getAdminProductDetail(p.id, { authContext: authAdminCatalog });
      concVarId = detail!.variants[0]!.id;
    });

    it("1. Product edit: actual - 1 ms throws STALE_WRITE_CONFLICT", async () => {
      const detail = await getAdminProductDetail(concProdId, { authContext: authAdminCatalog });
      const actualTime = new Date(detail!.product.updatedAt).getTime();
      await expect(
        updateProduct(
          {
            productId: concProdId,
            expectedUpdatedAt: new Date(actualTime - 1),
            name: "Should Fail 1ms",
          },
          { authContext: authAdminCatalog }
        )
      ).rejects.toThrow(StaleWriteConflictError);
    });

    it("2. Product edit: actual - 500 ms throws STALE_WRITE_CONFLICT", async () => {
      const detail = await getAdminProductDetail(concProdId, { authContext: authAdminCatalog });
      const actualTime = new Date(detail!.product.updatedAt).getTime();
      await expect(
        updateProduct(
          {
            productId: concProdId,
            expectedUpdatedAt: new Date(actualTime - 500),
            name: "Should Fail 500ms",
          },
          { authContext: authAdminCatalog }
        )
      ).rejects.toThrow(StaleWriteConflictError);
    });

    it("3. Variant edit: actual - 1 ms throws STALE_WRITE_CONFLICT", async () => {
      const detail = await getAdminProductDetail(concProdId, { authContext: authAdminCatalog });
      const actualTime = new Date(detail!.variants[0]!.updatedAt).getTime();
      await expect(
        updateVariant(
          {
            variantId: concVarId,
            expectedUpdatedAt: new Date(actualTime - 1),
            title: "Should Fail Variant 1ms",
          },
          { authContext: authAdminCatalog }
        )
      ).rejects.toThrow(StaleWriteConflictError);
    });

    it("4. Status transition: actual - 1 ms throws STALE_WRITE_CONFLICT", async () => {
      const detail = await getAdminProductDetail(concProdId, { authContext: authAdminCatalog });
      const actualTime = new Date(detail!.product.updatedAt).getTime();
      await expect(
        transitionProductStatus(
          {
            productId: concProdId,
            expectedUpdatedAt: new Date(actualTime - 1),
            targetStatus: "ARCHIVED",
          },
          { authContext: authAdminCatalog }
        )
      ).rejects.toThrow(StaleWriteConflictError);
    });

    it("5. Exact timestamp succeeds", async () => {
      const detail = await getAdminProductDetail(concProdId, { authContext: authAdminCatalog });
      const updated = await updateProduct(
        {
          productId: concProdId,
          expectedUpdatedAt: detail!.product.updatedAt,
          name: "Exact Time Update Success",
        },
        { authContext: authAdminCatalog }
      );
      expect(updated.name).toBe("Exact Time Update Success");
    });
  });

  describe("Status Transition TOCTOU & Authorization Invariants", () => {
    it("TOCTOU race: true concurrent PostgreSQL row lock race catches concurrent status publish", async () => {
      // 1. Create a DRAFT product
      const p = await createProduct(
        {
          name: "Real TOCTOU Race Mouse",
          slug: "gp024-real-toctou-mouse",
          brandId: fixtureIds.brandPublished,
          categoryId: fixtureIds.catNoSchema,
        },
        { authContext: authAdminCatalog }
      );

      const clientA = postgres(databaseUrl, { max: 1 });
      try {
        let lockAcquiredResolve!: () => void;
        const lockAcquiredPromise = new Promise<void>((r) => {
          lockAcquiredResolve = r;
        });

        let resumeTxAResolve!: () => void;
        const resumeTxAPromise = new Promise<void>((r) => {
          resumeTxAResolve = r;
        });

        // 2 & 3. Transaction A selects product FOR UPDATE while status is DRAFT
        const txAPromise = clientA.begin(async (txA) => {
          const [lockedRow] = (await txA`
            SELECT id, status, updated_at FROM products WHERE id = ${p.id}::uuid FOR UPDATE;
          `) as { id: string; status: string; updated_at: Date }[];

          expect(lockedRow!.status).toBe("DRAFT");
          lockAcquiredResolve();

          // Wait until transitionProductStatus is started and waiting on lock
          await resumeTxAPromise;

          // 6. Still inside transaction A: update status to PUBLISHED
          await txA`
            UPDATE products SET status = 'PUBLISHED', updated_at = NOW() WHERE id = ${p.id}::uuid;
          `;
        });

        // Wait for txA to acquire row lock
        await lockAcquiredPromise;

        // 4. While A still owns row lock, start transitionProductStatus from actor M with ONLY catalog:manage
        const transitionPromise = transitionProductStatus(
          {
            productId: p.id,
            expectedUpdatedAt: p.updatedAt,
            targetStatus: "ARCHIVED",
          },
          { authContext: authAdminManageOnly }
        );

        // 5. Confirm transition promise is waiting on row lock
        let isWaiting = false;
        for (let i = 0; i < 40; i++) {
          const lockWaiters = (await pgSql`
            SELECT COUNT(*)::int AS cnt
            FROM pg_locks
            WHERE granted = false;
          `) as { cnt: number }[];

          if (lockWaiters[0] && lockWaiters[0].cnt > 0) {
            isWaiting = true;
            break;
          }
          await new Promise((r) => setTimeout(r, 25));
        }
        expect(isWaiting).toBe(true);

        // 7. COMMIT transaction A
        resumeTxAResolve();
        await txAPromise;

        // 8 & 9. The waiting transition now acquires row lock, observes PUBLISHED, requires catalog:publish, fails with 403
        await expect(transitionPromise).rejects.toThrow("No tienes permisos suficientes");

        // 10. Final Product remains PUBLISHED
        const [finalProd] = (await pgSql`
          SELECT status FROM products WHERE id = ${p.id}::uuid;
        `) as { status: string }[];
        expect(finalProd!.status).toBe("PUBLISHED");
      } finally {
        await clientA.end();
      }
    });

    it("same-target PUBLISHED transition requires catalog:publish permission", async () => {
      const p = await createProduct(
        {
          name: "Same Target Publish Mouse",
          slug: "gp024-same-pub-mouse",
          brandId: fixtureIds.brandPublished,
          categoryId: fixtureIds.catNoSchema,
        },
        { authContext: authAdminCatalog }
      );

      // Manually set to PUBLISHED
      await pgSql`UPDATE products SET status = 'PUBLISHED', updated_at = NOW() WHERE id = ${p.id};`;
      const [freshProd] = await pgSql`SELECT updated_at FROM products WHERE id = ${p.id};`;

      // Manage-only caller calling transitionProductStatus(PUBLISHED) on already PUBLISHED product
      await expect(
        transitionProductStatus(
          {
            productId: p.id,
            expectedUpdatedAt: freshProd!.updated_at,
            targetStatus: "PUBLISHED",
          },
          { authContext: authAdminManageOnly }
        )
      ).rejects.toThrow("No tienes permisos suficientes");
    });
  });

  describe("Concurrent Mutations, Replay & Error Mapping", () => {
    it("A. Concurrent same-request Create Product: exactly 1 Product, 1 AuditEvent, both resolve same ID", async () => {
      const sharedReqId = "concurrent-create-req-001";
      const payload = {
        name: "Concurrent Test Mouse",
        slug: "gp024-concurrent-create-mouse",
        brandId: fixtureIds.brandPublished,
        categoryId: fixtureIds.catNoSchema,
        mutationRequestId: sharedReqId,
      };

      const [res1, res2] = await Promise.all([
        createProduct(payload, { authContext: authAdminCatalog }),
        createProduct(payload, { authContext: authAdminCatalog }),
      ]);

      expect(res1.id).toBe(res2.id);

      const prodCount = await pgSql`
        SELECT COUNT(*)::int AS cnt FROM products WHERE slug = 'gp024-concurrent-create-mouse';
      `;
      expect(prodCount[0]!.cnt).toBe(1);

      const auditCount = await pgSql`
        SELECT COUNT(*)::int AS cnt FROM audit_events WHERE target_id = ${res1.id} AND action = 'catalog:product:create';
      `;
      expect(auditCount[0]!.cnt).toBe(1);
    });

    it("B. Concurrent changed-payload same idempotency key: 1 commits, 1 gets CATALOG_IDEMPOTENCY_CONFLICT", async () => {
      const sharedReqId = "concurrent-conflict-req-002";
      const payloadA = {
        name: "Conflict Mouse A",
        slug: "gp024-conflict-mouse-a",
        brandId: fixtureIds.brandPublished,
        categoryId: fixtureIds.catNoSchema,
        mutationRequestId: sharedReqId,
      };
      const payloadB = {
        name: "Conflict Mouse B",
        slug: "gp024-conflict-mouse-b",
        brandId: fixtureIds.brandPublished,
        categoryId: fixtureIds.catNoSchema,
        mutationRequestId: sharedReqId,
      };

      const results = await Promise.allSettled([
        createProduct(payloadA, { authContext: authAdminCatalog }),
        createProduct(payloadB, { authContext: authAdminCatalog }),
      ]);

      const fulfilled = results.filter((r) => r.status === "fulfilled");
      const rejected = results.filter((r) => r.status === "rejected");

      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      const rejectedReason = (rejected[0] as PromiseRejectedResult).reason;
      expect(rejectedReason).toBeInstanceOf(CatalogIdempotencyConflictError);
    });

    it("C. Create Variant replay returns existing without duplicate rows or audit events", async () => {
      const p = await createProduct(
        {
          name: "Variant Replay Mouse",
          slug: "gp024-var-replay-mouse",
          brandId: fixtureIds.brandPublished,
          categoryId: fixtureIds.catNoSchema,
        },
        { authContext: authAdminCatalog }
      );

      const vPayload = {
        productId: p.id,
        sku: "GP024-VREPLAY-01",
        title: "Replay Variant",
        priceCents: 20000,
        mutationRequestId: "var-replay-req-001",
      };

      const v1 = await createVariant(vPayload, { authContext: authAdminCatalog });
      const v2 = await createVariant(vPayload, { authContext: authAdminCatalog });

      expect(v1.id).toBe(v2.id);

      const vCount = await pgSql`
        SELECT COUNT(*)::int AS cnt FROM product_variants WHERE id = ${v1.id};
      `;
      expect(vCount[0]!.cnt).toBe(1);

      const auditCount = await pgSql`
        SELECT COUNT(*)::int AS cnt FROM audit_events WHERE target_id = ${v1.id} AND action = 'catalog:variant:create';
      `;
      expect(auditCount[0]!.cnt).toBe(1);
    });

    it("D_seq1. Sequential unique slug conflict maps to SLUG_CONFLICT (409) not raw 23505", async () => {
      await createProduct(
        {
          name: "Slug Race Base",
          slug: "gp024-slug-race",
          brandId: fixtureIds.brandPublished,
          categoryId: fixtureIds.catNoSchema,
        },
        { authContext: authAdminCatalog }
      );

      try {
        await createProduct(
          {
            name: "Slug Race Conflict",
            slug: "gp024-slug-race",
            brandId: fixtureIds.brandPublished,
            categoryId: fixtureIds.catNoSchema,
          },
          { authContext: authAdminCatalog }
        );
        expect.unreachable("Should have thrown");
      } catch (err: unknown) {
        expect(err).toBeInstanceOf(CatalogDomainError);
        const cErr = err as CatalogDomainError;
        expect(cErr.code).toBe("SLUG_CONFLICT");
        expect(cErr.httpStatus).toBe(409);
        expect(cErr.message).not.toContain("23505");
        expect(cErr.message).not.toContain("products_slug_unique");
      }
    });

    it("D_seq2. Sequential unique SKU conflict maps to SKU_CONFLICT (409) not raw 23505", async () => {
      const p = await createProduct(
        {
          name: "SKU Race Base",
          slug: "gp024-sku-race-prod",
          brandId: fixtureIds.brandPublished,
          categoryId: fixtureIds.catNoSchema,
          initialVariant: {
            sku: "GP024-SKU-RACE-01",
            title: "SKU Race V1",
            priceCents: 10000,
          },
        },
        { authContext: authAdminCatalog }
      );

      try {
        await createVariant(
          {
            productId: p.id,
            sku: "GP024-SKU-RACE-01",
            title: "SKU Race Duplicate",
            priceCents: 12000,
          },
          { authContext: authAdminCatalog }
        );
        expect.unreachable("Should have thrown");
      } catch (err: unknown) {
        expect(err).toBeInstanceOf(CatalogDomainError);
        const cErr = err as CatalogDomainError;
        expect(cErr.code).toBe("SKU_CONFLICT");
        expect(cErr.httpStatus).toBe(409);
        expect(cErr.message).not.toContain("23505");
        expect(cErr.message).not.toContain("product_variants_sku_unique");
      }
    });

    it("D_conc1. True concurrent Slug collision race: 1 commits, 1 receives sanitized SLUG_CONFLICT (409), count = 1", async () => {
      const contestedSlug = "gp024-concurrent-slug-race";
      const payloadA = {
        name: "Contender Slug Alpha",
        slug: contestedSlug,
        brandId: fixtureIds.brandPublished,
        categoryId: fixtureIds.catNoSchema,
        mutationRequestId: "slug-race-alpha-req",
      };
      const payloadB = {
        name: "Contender Slug Beta",
        slug: contestedSlug,
        brandId: fixtureIds.brandPublished,
        categoryId: fixtureIds.catNoSchema,
        mutationRequestId: "slug-race-beta-req",
      };

      const results = await Promise.allSettled([
        createProduct(payloadA, { authContext: authAdminCatalog }),
        createProduct(payloadB, { authContext: authAdminCatalog }),
      ]);

      const fulfilled = results.filter((r) => r.status === "fulfilled");
      const rejected = results.filter((r) => r.status === "rejected");

      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);

      const rejReason = (rejected[0] as PromiseRejectedResult).reason;
      expect(rejReason).toBeInstanceOf(CatalogDomainError);
      expect((rejReason as CatalogDomainError).code).toBe("SLUG_CONFLICT");
      expect((rejReason as CatalogDomainError).httpStatus).toBe(409);
      expect((rejReason as Error).message).not.toContain("23505");
      expect((rejReason as Error).message).not.toContain("products_slug_unique");

      const count = await pgSql`
        SELECT COUNT(*)::int AS cnt FROM products WHERE slug = ${contestedSlug};
      `;
      expect(count[0]!.cnt).toBe(1);
    });

    it("D_conc2. True concurrent SKU collision race: 1 commits, 1 receives sanitized SKU_CONFLICT (409), count = 1", async () => {
      const p = await createProduct(
        {
          name: "SKU True Race Host",
          slug: "gp024-sku-true-race-host",
          brandId: fixtureIds.brandPublished,
          categoryId: fixtureIds.catNoSchema,
        },
        { authContext: authAdminCatalog }
      );

      const contestedSku = "GP024-SKU-CONC-RACE";
      const vPayloadA = {
        productId: p.id,
        sku: contestedSku,
        title: "Variant Alpha",
        priceCents: 15000,
        mutationRequestId: "sku-race-alpha-req",
      };
      const vPayloadB = {
        productId: p.id,
        sku: contestedSku,
        title: "Variant Beta",
        priceCents: 18000,
        mutationRequestId: "sku-race-beta-req",
      };

      const results = await Promise.allSettled([
        createVariant(vPayloadA, { authContext: authAdminCatalog }),
        createVariant(vPayloadB, { authContext: authAdminCatalog }),
      ]);

      const fulfilled = results.filter((r) => r.status === "fulfilled");
      const rejected = results.filter((r) => r.status === "rejected");

      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);

      const rejReason = (rejected[0] as PromiseRejectedResult).reason;
      expect(rejReason).toBeInstanceOf(CatalogDomainError);
      expect((rejReason as CatalogDomainError).code).toBe("SKU_CONFLICT");
      expect((rejReason as CatalogDomainError).httpStatus).toBe(409);
      expect((rejReason as Error).message).not.toContain("23505");
      expect((rejReason as Error).message).not.toContain("product_variants_sku_unique");

      const count = await pgSql`
        SELECT COUNT(*)::int AS cnt FROM product_variants WHERE sku = ${contestedSku};
      `;
      expect(count[0]!.cnt).toBe(1);
    });

    it("E. Status replay: does not insert duplicate AuditEvents", async () => {
      const p = await createProduct(
        {
          name: "Status Replay Mouse",
          slug: "gp024-status-replay-mouse",
          brandId: fixtureIds.brandPublished,
          categoryId: fixtureIds.catNoSchema,
        },
        { authContext: authAdminCatalog }
      );

      const detail = await getAdminProductDetail(p.id, { authContext: authAdminCatalog });

      const transitionInput = {
        productId: p.id,
        expectedUpdatedAt: detail!.product.updatedAt,
        targetStatus: "ARCHIVED" as const,
        mutationRequestId: "status-replay-req-001",
      };

      const res1 = await transitionProductStatus(transitionInput, {
        authContext: authAdminCatalog,
      });
      expect(res1.status).toBe("ARCHIVED");

      // Replay with exact same mutationRequestId and targetStatus
      const res2 = await transitionProductStatus(transitionInput, {
        authContext: authAdminCatalog,
      });
      expect(res2.status).toBe("ARCHIVED");

      const auditCount = await pgSql`
        SELECT COUNT(*)::int AS cnt FROM audit_events WHERE target_id = ${p.id} AND action = 'catalog:product:archive';
      `;
      expect(auditCount[0]!.cnt).toBe(1);
    });

    it("F. Normalization-equivalent Create Replay: raw whitespace in initial fields returns SAME product with 0 conflict", async () => {
      const sharedReqId = "norm-create-req-001";
      const rawPayload = {
        name: "Normalized Product Test",
        slug: "gp024-norm-product-test",
        subtitle: "  Ultraligero  ",
        description: "  Texto normalizado  ",
        brandId: fixtureIds.brandPublished,
        categoryId: fixtureIds.catNoSchema,
        initialVariant: {
          sku: "  GP024-NORM-01  ",
          title: "  Negro  ",
          priceCents: 10000,
        },
        mutationRequestId: sharedReqId,
      };

      const p1 = await createProduct(rawPayload, { authContext: authAdminCatalog });

      // Retry with same mutationRequestId and same normalized values already trimmed
      const trimmedPayload = {
        name: "Normalized Product Test",
        slug: "gp024-norm-product-test",
        subtitle: "Ultraligero",
        description: "Texto normalizado",
        brandId: fixtureIds.brandPublished,
        categoryId: fixtureIds.catNoSchema,
        initialVariant: {
          sku: "GP024-NORM-01",
          title: "Negro",
          priceCents: 10000,
        },
        mutationRequestId: sharedReqId,
      };

      const p2 = await createProduct(trimmedPayload, { authContext: authAdminCatalog });

      expect(p1.id).toBe(p2.id);

      const prodCount = await pgSql`
        SELECT COUNT(*)::int AS cnt FROM products WHERE slug = 'gp024-norm-product-test';
      `;
      expect(prodCount[0]!.cnt).toBe(1);

      const auditCount = await pgSql`
        SELECT COUNT(*)::int AS cnt FROM audit_events WHERE target_id = ${p1.id} AND action = 'catalog:product:create';
      `;
      expect(auditCount[0]!.cnt).toBe(1);

      // Genuinely changed normalized payload must still produce CATALOG_IDEMPOTENCY_CONFLICT (409)
      const changedPayload = {
        ...trimmedPayload,
        description: "Texto modificado diferente",
      };
      await expect(
        createProduct(changedPayload, { authContext: authAdminCatalog })
      ).rejects.toThrow(CatalogIdempotencyConflictError);
    });

    it("G. Normalization-equivalent Duplicate Replay: whitespace/case in custom options resolves to same duplicate", async () => {
      const source = await createProduct(
        {
          name: "Duplicate Source Base",
          slug: "gp024-dup-norm-source",
          brandId: fixtureIds.brandPublished,
          categoryId: fixtureIds.catNoSchema,
        },
        { authContext: authAdminCatalog }
      );

      const sharedReqId = "dup-norm-req-001";
      const rawOptions = {
        customName: "  Clon Normalizado  ",
        customSlug: "  GP024-CLON-NORMALIZADO-SLUG  ",
      };

      const d1 = await duplicateProduct(
        {
          sourceProductId: source.id,
          options: rawOptions,
          mutationRequestId: sharedReqId,
        },
        { authContext: authAdminCatalog }
      );

      // Retry with same mutationRequestId and already normalized options
      const normalizedOptions = {
        customName: "Clon Normalizado",
        customSlug: "gp024-clon-normalizado-slug",
      };

      const d2 = await duplicateProduct(
        {
          sourceProductId: source.id,
          options: normalizedOptions,
          mutationRequestId: sharedReqId,
        },
        { authContext: authAdminCatalog }
      );

      expect(d1.id).toBe(d2.id);

      // Genuinely different normalized duplicate options returns CATALOG_IDEMPOTENCY_CONFLICT
      await expect(
        duplicateProduct(
          {
            sourceProductId: source.id,
            options: { customName: "Clon Totalmente Diferente" },
            mutationRequestId: sharedReqId,
          },
          { authContext: authAdminCatalog }
        )
      ).rejects.toThrow(CatalogIdempotencyConflictError);
    });
  });

  describe("Publish-Only Permission Isolation (Defect B)", () => {
    it("actor with catalog:publish ONLY can publish a ready product, but cannot manage or view admin catalog", async () => {
      // 1. Build a fully publish-ready product using authorized adminCatalog
      const readyProd = await createProduct(
        {
          name: "Publish Only Test Mouse",
          slug: "gp024-pub-only-mouse",
          brandId: fixtureIds.brandPublished,
          categoryId: fixtureIds.catWithSchema,
          initialVariant: {
            sku: "GP024-PUB-ONLY-01",
            title: "Edición Publicable",
            priceCents: 25000,
          },
        },
        { authContext: authAdminCatalog }
      );

      // Add valid specs
      await updateProduct(
        {
          productId: readyProd.id,
          expectedUpdatedAt: readyProd.updatedAt,
          specValues: { sensor: "paw3950", polling_rate_hz: 8000, wireless: true },
        },
        { authContext: authAdminCatalog }
      );

      // Add public approved media
      await pgSql`
        INSERT INTO product_media (id, product_id, media_asset_id, variant_id, display_order, created_at)
        VALUES (${`${PFX}000000000301`}, ${readyProd.id}, ${fixtureIds.mediaAssetPublic1}, NULL, 0, NOW())
        ON CONFLICT (id) DO NOTHING;
      `;
      await pgSql`
        UPDATE products SET primary_media_id = ${fixtureIds.mediaAssetPublic1} WHERE id = ${readyProd.id};
      `;

      const [freshProd] = await pgSql`
        SELECT updated_at FROM products WHERE id = ${readyProd.id};
      `;

      // 2. Call transitionProductStatus to PUBLISHED with publish-only context
      const published = await transitionProductStatus(
        {
          productId: readyProd.id,
          expectedUpdatedAt: freshProd!.updated_at,
          targetStatus: "PUBLISHED",
        },
        { authContext: authAdminPublishOnly }
      );

      expect(published.status).toBe("PUBLISHED");

      // Verify canonical publish AuditEvent exists
      const pubAudit = await pgSql`
        SELECT COUNT(*)::int AS cnt FROM audit_events
        WHERE target_id = ${readyProd.id} AND action = 'catalog:product:publish';
      `;
      expect(pubAudit[0]!.cnt).toBe(1);

      // 3. Prove same publish-only context CANNOT call getAdminProductList
      await expect(getAdminProductList({}, { authContext: authAdminPublishOnly })).rejects.toThrow(
        "No tienes permisos para ver el catálogo administrativo."
      );

      // 4. Prove same publish-only context CANNOT call getAdminProductDetail
      await expect(
        getAdminProductDetail(readyProd.id, { authContext: authAdminPublishOnly })
      ).rejects.toThrow("No tienes permisos para ver el catálogo administrativo.");

      // 5. Prove same publish-only context CANNOT perform ordinary authoring (createProduct)
      await expect(
        createProduct(
          {
            name: "Unauthorized Authoring Mouse",
            slug: "gp024-unauth-authoring-mouse",
            brandId: fixtureIds.brandPublished,
            categoryId: fixtureIds.catNoSchema,
          },
          { authContext: authAdminPublishOnly }
        )
      ).rejects.toThrow("No tienes permisos suficientes");
    });
  });

  describe("Audit & Replay Target Integrity", () => {
    it("throws CatalogReplayIntegrityError if replay lookup target_type does not match canonical entity type", async () => {
      const reqId = "corrupt-replay-req-001";
      const p = await createProduct(
        {
          name: "Replay Target Integrity Mouse",
          slug: "gp024-replay-target-mouse",
          brandId: fixtureIds.brandPublished,
          categoryId: fixtureIds.catNoSchema,
          mutationRequestId: reqId,
        },
        { authContext: authAdminCatalog }
      );

      // Corrupt the audit event target_type to something unexpected
      await pgSql`
        UPDATE audit_events SET target_type = 'order' WHERE target_id = ${p.id} AND action = 'catalog:product:create';
      `;

      // Replay should now detect mismatch and fail closed with CatalogReplayIntegrityError
      await expect(
        createProduct(
          {
            name: "Replay Target Integrity Mouse",
            slug: "gp024-replay-target-mouse",
            brandId: fixtureIds.brandPublished,
            categoryId: fixtureIds.catNoSchema,
            mutationRequestId: reqId,
          },
          { authContext: authAdminCatalog }
        )
      ).rejects.toThrow(CatalogReplayIntegrityError);
    });
  });

  describe("Publish Readiness Persisted Attributes Fail-Closed (Defect B / BR3)", () => {
    it("fails closed with VARIANT_ATTRIBUTES_INVALID when stored JSONB attributes are malformed", async () => {
      // 1. Create an owned DRAFT Product through normal GP-024 services
      const p = await createProduct(
        {
          name: "Publish Stored Corrupt Mouse",
          slug: "gp024-stored-corrupt-mouse",
          brandId: fixtureIds.brandPublished,
          categoryId: fixtureIds.catWithSchema,
          initialVariant: {
            sku: "GP024-CORRUPT-ATTR-01",
            title: "Corrupt Attributes V1",
            priceCents: 19900,
          },
        },
        { authContext: authAdminCatalog }
      );

      // 2. Make it otherwise publish-ready:
      // - valid specifications
      await updateProduct(
        {
          productId: p.id,
          expectedUpdatedAt: p.updatedAt,
          specValues: { sensor: "paw3950", polling_rate_hz: 8000, wireless: true },
        },
        { authContext: authAdminCatalog }
      );

      // - valid same-Product global PUBLIC_MEDIA image
      const mediaId = `${PFX}000000000302`;
      await pgSql`
        INSERT INTO product_media (id, product_id, media_asset_id, variant_id, display_order, created_at)
        VALUES (${mediaId}, ${p.id}, ${fixtureIds.mediaAssetPublic1}, NULL, 0, NOW())
        ON CONFLICT (id) DO NOTHING;
      `;
      await pgSql`
        UPDATE products SET primary_media_id = ${fixtureIds.mediaAssetPublic1} WHERE id = ${p.id};
      `;

      // 3. Using scoped TEST-ONLY SQL, deliberately corrupt the owned ACTIVE Variant JSONB attributes to: {"color": 123}
      const [variantRow] = (await pgSql`
        SELECT id FROM product_variants WHERE product_id = ${p.id} LIMIT 1;
      `) as { id: string }[];
      expect(variantRow).toBeDefined();

      await pgSql`
        UPDATE product_variants
        SET attributes = '{"color": 123}'::jsonb
        WHERE id = ${variantRow!.id}::uuid;
      `;

      const [freshProd] = (await pgSql`
        SELECT updated_at FROM products WHERE id = ${p.id};
      `) as { updated_at: Date }[];

      // 4. Attempt transitionProductStatus(targetStatus: "PUBLISHED") using proper catalog:publish authority
      try {
        await transitionProductStatus(
          {
            productId: p.id,
            expectedUpdatedAt: freshProd!.updated_at,
            targetStatus: "PUBLISHED",
          },
          { authContext: authAdminCatalog }
        );
        expect.unreachable(
          "Publication should have been rejected due to malformed persisted attributes"
        );
      } catch (err: unknown) {
        expect(err).toBeInstanceOf(CatalogDomainError);
        const domainErr = err as CatalogDomainError;
        expect(domainErr.code).toBe("VARIANT_ATTRIBUTES_INVALID");
        expect(domainErr.httpStatus).toBe(422);
        expect(domainErr.message).not.toContain("123");
        expect(domainErr.message).not.toContain("jsonb");
        expect(domainErr.message).not.toContain("SELECT");
      }

      // 5. Verify Product remains DRAFT
      const [finalProduct] = (await pgSql`
        SELECT status FROM products WHERE id = ${p.id};
      `) as { status: string }[];
      expect(finalProduct!.status).toBe("DRAFT");
    });
  });

  describe("GP-025 / CHK3-A — updateProduct Durable Idempotency", () => {
    let productSequence = 0;

    async function createUpdateReplayProduct(label: string) {
      productSequence += 1;
      return await createProduct(
        {
          name: `${label} ${productSequence}`,
          slug: `gp024-update-replay-${productSequence}`,
          brandId: fixtureIds.brandPublished,
          categoryId: fixtureIds.catWithSchema,
        },
        { authContext: authAdminCatalog }
      );
    }

    async function commitReplayFixture(label: string) {
      const product = await createUpdateReplayProduct(label);
      const mutationRequestId = `gp025-update-${label}-${productSequence}`;
      const input = {
        productId: product.id,
        expectedUpdatedAt: product.updatedAt,
        name: `${label} committed`,
        mutationRequestId,
      };
      const updated = await updateProduct(input, { authContext: authAdminCatalog });
      return { input, mutationRequestId, product, updated };
    }

    async function seedSpecifications(productId: string) {
      await pgSql`
        INSERT INTO product_specifications (
          product_id, schema_id, schema_version, spec_values, updated_at
        ) VALUES (
          ${productId},
          ${fixtureIds.schemaForCat},
          1,
          ${pgSql.json({
            sensor: "paw3395",
            polling_rate_hz: 1000,
            wireless: true,
          })},
          NOW() - INTERVAL '1 minute'
        )
        ON CONFLICT (product_id) DO UPDATE SET
          schema_id = EXCLUDED.schema_id,
          schema_version = EXCLUDED.schema_version,
          spec_values = EXCLUDED.spec_values,
          updated_at = EXCLUDED.updated_at;
      `;
    }

    async function readSpecifications(productId: string) {
      const [row] = (await pgSql`
        SELECT schema_id, schema_version, spec_values, updated_at
        FROM product_specifications
        WHERE product_id = ${productId};
      `) as {
        schema_id: string;
        schema_version: number;
        spec_values: Record<string, unknown>;
        updated_at: Date;
      }[];
      return row;
    }

    it("preserves omitted-ID specValues:null as a specification no-op", async () => {
      const product = await createUpdateReplayProduct("Legacy null omitted ID");
      await seedSpecifications(product.id);
      const before = await readSpecifications(product.id);
      if (!before) throw new Error("Expected seeded Product specifications.");

      const updated = await updateProduct(
        {
          productId: product.id,
          expectedUpdatedAt: product.updatedAt,
          name: "Legacy null omitted ID updated",
          specValues: null,
        },
        { authContext: authAdminCatalog }
      );
      const after = await readSpecifications(product.id);

      expect(updated.name).toBe("Legacy null omitted ID updated");
      expect(after?.schema_id).toBe(before.schema_id);
      expect(after?.schema_version).toBe(before.schema_version);
      expect(after?.spec_values).toEqual(before.spec_values);
      expect(after?.updated_at.getTime()).toBe(before.updated_at.getTime());
    });

    it("preserves blank-ID specValues:null as a specification no-op", async () => {
      const product = await createUpdateReplayProduct("Legacy null blank ID");
      await seedSpecifications(product.id);
      const before = await readSpecifications(product.id);
      if (!before) throw new Error("Expected seeded Product specifications.");

      const updated = await updateProduct(
        {
          productId: product.id,
          expectedUpdatedAt: product.updatedAt,
          description: "Legacy blank-ID null update",
          specValues: null,
          mutationRequestId: "   ",
        },
        { authContext: authAdminCatalog }
      );
      const after = await readSpecifications(product.id);

      expect(updated.description).toBe("Legacy blank-ID null update");
      expect(after?.spec_values).toEqual(before.spec_values);
      expect(after?.updated_at.getTime()).toBe(before.updated_at.getTime());
    });

    it("normalizes idempotent specValues:null and omission to the same no-op intent", async () => {
      const product = await createUpdateReplayProduct("Idempotent null specs");
      await seedSpecifications(product.id);
      const before = await readSpecifications(product.id);
      if (!before) throw new Error("Expected seeded Product specifications.");
      const mutationRequestId = `gp025-null-spec-replay-${productSequence}`;

      const first = await updateProduct(
        {
          productId: product.id,
          expectedUpdatedAt: product.updatedAt,
          name: "Idempotent null specs updated",
          specValues: null,
          mutationRequestId,
        },
        { authContext: authAdminCatalog }
      );
      const replay = await updateProduct(
        {
          productId: product.id,
          expectedUpdatedAt: product.updatedAt,
          name: "Idempotent null specs updated",
          mutationRequestId,
        },
        { authContext: authAdminCatalog }
      );
      const after = await readSpecifications(product.id);

      expect(replay.id).toBe(first.id);
      expect(replay.updatedAt.getTime()).toBe(first.updatedAt.getTime());
      expect(after?.spec_values).toEqual(before.spec_values);
      expect(after?.updated_at.getTime()).toBe(before.updated_at.getTime());
      const [auditCount] = (await pgSql`
        SELECT COUNT(*)::int AS count
        FROM audit_events
        WHERE target_id = ${product.id}
          AND action = 'catalog:product:update'
          AND metadata ? 'mutation_request_digest';
      `) as { count: number }[];
      expect(auditCount?.count).toBe(1);
    });

    it("keeps specValues:{} distinct when it performs a specification update", async () => {
      const product = await createUpdateReplayProduct("Empty specification object");
      await seedSpecifications(product.id);
      const mutationRequestId = `gp025-null-vs-empty-spec-${productSequence}`;
      const first = await updateProduct(
        {
          productId: product.id,
          expectedUpdatedAt: product.updatedAt,
          name: "Empty specification object updated",
          specValues: null,
          mutationRequestId,
        },
        { authContext: authAdminCatalog }
      );

      await expect(
        updateProduct(
          {
            productId: product.id,
            expectedUpdatedAt: product.updatedAt,
            name: "Empty specification object updated",
            specValues: {},
            mutationRequestId,
          },
          { authContext: authAdminCatalog }
        )
      ).rejects.toThrow(CatalogIdempotencyConflictError);

      await updateProduct(
        {
          productId: product.id,
          expectedUpdatedAt: first.updatedAt,
          specValues: {},
          mutationRequestId: `gp025-empty-spec-commit-${productSequence}`,
        },
        { authContext: authAdminCatalog }
      );
      const after = await readSpecifications(product.id);
      expect(after?.spec_values).toEqual({});
    });

    it("preserves category-change reconciliation when specValues is null", async () => {
      const product = await createUpdateReplayProduct("Category change null specs");
      await seedSpecifications(product.id);
      const updated = await updateProduct(
        {
          productId: product.id,
          expectedUpdatedAt: product.updatedAt,
          categoryId: fixtureIds.catNoSchema,
          specValues: null,
          mutationRequestId: `gp025-category-change-null-${productSequence}`,
        },
        { authContext: authAdminCatalog }
      );

      expect(updated.categoryId).toBe(fixtureIds.catNoSchema);
      expect(await readSpecifications(product.id)).toBeUndefined();
    });

    it("preserves category-change reconciliation when specValues is omitted", async () => {
      const product = await createUpdateReplayProduct("Category change omitted specs");
      await seedSpecifications(product.id);
      const updated = await updateProduct(
        {
          productId: product.id,
          expectedUpdatedAt: product.updatedAt,
          categoryId: fixtureIds.catNoSchema,
          mutationRequestId: `gp025-category-change-omitted-${productSequence}`,
        },
        { authContext: authAdminCatalog }
      );

      expect(updated.categoryId).toBe(fixtureIds.catNoSchema);
      expect(await readSpecifications(product.id)).toBeUndefined();
    });

    it("preserves legacy behavior when mutationRequestId is omitted", async () => {
      const product = await createUpdateReplayProduct("Legacy omitted");
      const updated = await updateProduct(
        {
          productId: product.id,
          expectedUpdatedAt: product.updatedAt,
          name: "Legacy omitted updated",
        },
        { authContext: authAdminCatalog }
      );

      const [audit] = (await pgSql`
        SELECT metadata, request_id
        FROM audit_events
        WHERE target_id = ${product.id} AND action = 'catalog:product:update';
      `) as { metadata: Record<string, unknown>; request_id: string | null }[];
      expect(audit?.request_id).toBeNull();
      expect(audit?.metadata).not.toHaveProperty("mutation_request_digest");
      expect(audit?.metadata).not.toHaveProperty("request_fingerprint");

      await expect(
        updateProduct(
          {
            productId: product.id,
            expectedUpdatedAt: new Date(updated.updatedAt.getTime() - 1),
            name: "Legacy stale update",
          },
          { authContext: authAdminCatalog }
        )
      ).rejects.toThrow(StaleWriteConflictError);
    });

    it("treats blank mutationRequestId as the legacy path", async () => {
      const product = await createUpdateReplayProduct("Legacy blank");
      const updated = await updateProduct(
        {
          productId: product.id,
          expectedUpdatedAt: product.updatedAt,
          description: "Legacy blank update",
          mutationRequestId: "   ",
        },
        { authContext: authAdminCatalog }
      );

      const [audit] = (await pgSql`
        SELECT metadata
        FROM audit_events
        WHERE target_id = ${product.id} AND action = 'catalog:product:update';
      `) as { metadata: Record<string, unknown> }[];
      expect(audit?.metadata).not.toHaveProperty("mutation_request_digest");
      expect(audit?.metadata).not.toHaveProperty("request_fingerprint");

      await expect(
        updateProduct(
          {
            productId: product.id,
            expectedUpdatedAt: new Date(updated.updatedAt.getTime() - 1),
            description: "Legacy blank retry",
            mutationRequestId: "\t",
          },
          { authContext: authAdminCatalog }
        )
      ).rejects.toThrow(StaleWriteConflictError);
    });

    it("replays normalized equivalent intent before stale validation and persists no raw ID", async () => {
      const product = await createUpdateReplayProduct("Normalized replay");
      const rawMutationRequestId = "GP025-RAW-UPDATE-REPLAY-001";
      await pgSql`
        UPDATE products SET updated_at = NOW() - INTERVAL '1 minute' WHERE id = ${product.id};
      `;
      const [baseline] = (await pgSql`
        SELECT updated_at FROM products WHERE id = ${product.id};
      `) as { updated_at: Date }[];
      if (!baseline) throw new Error("Expected update replay baseline Product.");
      const expectedWithOffset = baseline.updated_at.toISOString().replace("Z", "+00:00");
      const first = await updateProduct(
        {
          productId: product.id.toUpperCase(),
          expectedUpdatedAt: expectedWithOffset,
          name: "  Normalized Product Name  ",
          slug: `  GP024-UPDATE-NORMALIZED-${productSequence}  `,
          brandId: fixtureIds.brandPublished.toUpperCase(),
          categoryId: fixtureIds.catWithSchema.toUpperCase(),
          subtitle: "  Normalized subtitle  ",
          description: null,
          isFeatured: true,
          specValues: {
            wireless: true,
            ignored_unset: null,
            polling_rate_hz: 1000,
            sensor: "paw3395",
          },
          mutationRequestId: `  ${rawMutationRequestId}  `,
        },
        { authContext: authAdminCatalog }
      );

      const replay = await updateProduct(
        {
          productId: product.id,
          expectedUpdatedAt: baseline.updated_at,
          name: "Normalized Product Name",
          slug: `gp024-update-normalized-${productSequence}`,
          brandId: fixtureIds.brandPublished,
          categoryId: fixtureIds.catWithSchema,
          subtitle: "Normalized subtitle",
          description: null,
          isFeatured: true,
          specValues: {
            sensor: "paw3395",
            polling_rate_hz: 1000,
            wireless: true,
          },
          mutationRequestId: rawMutationRequestId,
        },
        { authContext: authAdminCatalog }
      );

      expect(first.updatedAt.getTime()).toBeGreaterThan(baseline.updated_at.getTime());
      expect(replay.id).toBe(first.id);
      expect(replay.updatedAt.getTime()).toBe(first.updatedAt.getTime());
      const auditRows = (await pgSql`
        SELECT metadata, request_id
        FROM audit_events
        WHERE target_id = ${product.id}
          AND action = 'catalog:product:update'
          AND metadata ? 'mutation_request_digest';
      `) as { metadata: Record<string, unknown>; request_id: string | null }[];
      expect(auditRows).toHaveLength(1);
      expect(auditRows[0]?.metadata.mutation_request_digest).toMatch(/^[0-9a-f]{64}$/);
      expect(auditRows[0]?.metadata.request_fingerprint).toMatch(/^[0-9a-f]{64}$/);
      expect(auditRows[0]?.request_id).toBeNull();
      expect(JSON.stringify(auditRows[0]?.metadata)).not.toContain(rawMutationRequestId);
    });

    it("keeps omitted and explicit-null optional fields semantically distinct", async () => {
      const product = await createUpdateReplayProduct("Null distinction");
      const mutationRequestId = `gp025-null-distinction-${productSequence}`;
      await updateProduct(
        {
          productId: product.id,
          expectedUpdatedAt: product.updatedAt,
          description: null,
          mutationRequestId,
        },
        { authContext: authAdminCatalog }
      );

      await expect(
        updateProduct(
          {
            productId: product.id,
            expectedUpdatedAt: product.updatedAt,
            mutationRequestId,
          },
          { authContext: authAdminCatalog }
        )
      ).rejects.toThrow(CatalogIdempotencyConflictError);
    });

    it("serializes concurrent identical requests into one mutation and one audit", async () => {
      const product = await createUpdateReplayProduct("Concurrent identical");
      const payload = {
        productId: product.id,
        expectedUpdatedAt: product.updatedAt,
        name: "Concurrent identical committed",
        mutationRequestId: `gp025-concurrent-identical-${productSequence}`,
      };

      const [first, second] = await Promise.all([
        updateProduct(payload, { authContext: authAdminCatalog }),
        updateProduct(payload, { authContext: authAdminCatalog }),
      ]);
      expect(first.id).toBe(second.id);
      expect(first.updatedAt.getTime()).toBe(second.updatedAt.getTime());

      const [auditCount] = (await pgSql`
        SELECT COUNT(*)::int AS count
        FROM audit_events
        WHERE target_id = ${product.id}
          AND action = 'catalog:product:update'
          AND metadata ? 'mutation_request_digest';
      `) as { count: number }[];
      expect(auditCount?.count).toBe(1);
    });

    it("serializes concurrent changed payloads and rejects the incompatible request", async () => {
      const product = await createUpdateReplayProduct("Concurrent conflict");
      const mutationRequestId = `gp025-concurrent-conflict-${productSequence}`;
      const results = await Promise.allSettled([
        updateProduct(
          {
            productId: product.id,
            expectedUpdatedAt: product.updatedAt,
            name: "Concurrent conflict A",
            mutationRequestId,
          },
          { authContext: authAdminCatalog }
        ),
        updateProduct(
          {
            productId: product.id,
            expectedUpdatedAt: product.updatedAt,
            name: "Concurrent conflict B",
            mutationRequestId,
          },
          { authContext: authAdminCatalog }
        ),
      ]);

      const fulfilled = results.filter((result) => result.status === "fulfilled");
      const rejected = results.filter((result) => result.status === "rejected");
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect(rejected[0]?.reason).toBeInstanceOf(CatalogIdempotencyConflictError);

      const [auditCount] = (await pgSql`
        SELECT COUNT(*)::int AS count
        FROM audit_events
        WHERE target_id = ${product.id}
          AND action = 'catalog:product:update'
          AND metadata ? 'mutation_request_digest';
      `) as { count: number }[];
      expect(auditCount?.count).toBe(1);
    });

    it("isolates the same raw mutation ID across actor namespaces", async () => {
      const product = await createUpdateReplayProduct("Actor namespace");
      const mutationRequestId = `gp025-shared-actor-id-${productSequence}`;
      const first = await updateProduct(
        {
          productId: product.id,
          expectedUpdatedAt: product.updatedAt,
          name: "Actor one update",
          mutationRequestId,
        },
        { authContext: authAdminCatalog }
      );
      const second = await updateProduct(
        {
          productId: product.id,
          expectedUpdatedAt: first.updatedAt,
          name: "Actor two update",
          mutationRequestId,
        },
        { authContext: authSuperAdmin }
      );
      expect(second.name).toBe("Actor two update");

      const auditRows = (await pgSql`
        SELECT actor_id, metadata->>'mutation_request_digest' AS digest
        FROM audit_events
        WHERE target_id = ${product.id}
          AND action = 'catalog:product:update'
          AND metadata ? 'mutation_request_digest'
        ORDER BY timestamp;
      `) as { actor_id: string; digest: string }[];
      expect(auditRows).toHaveLength(2);
      expect(new Set(auditRows.map((row) => row.actor_id))).toEqual(
        new Set([fixtureIds.adminCatalogUser, fixtureIds.superAdminUser])
      );
      expect(new Set(auditRows.map((row) => row.digest)).size).toBe(2);
    });

    it("returns the durable current Product when replayed after an unrelated later edit", async () => {
      const fixture = await commitReplayFixture("Later edit");
      const later = await updateProduct(
        {
          productId: fixture.product.id,
          expectedUpdatedAt: fixture.updated.updatedAt,
          name: "Later unrelated product edit",
        },
        { authContext: authAdminCatalog }
      );

      const replay = await updateProduct(fixture.input, { authContext: authAdminCatalog });
      expect(replay.name).toBe(later.name);
      expect(replay.updatedAt.getTime()).toBe(later.updatedAt.getTime());
    });

    it("keeps a new idempotent request subject to stale-write validation", async () => {
      const product = await createUpdateReplayProduct("New stale request");
      await expect(
        updateProduct(
          {
            productId: product.id,
            expectedUpdatedAt: new Date(product.updatedAt.getTime() - 1),
            name: "Must remain stale",
            mutationRequestId: `gp025-new-stale-${productSequence}`,
          },
          { authContext: authAdminCatalog }
        )
      ).rejects.toThrow(StaleWriteConflictError);
    });

    it("fails replay closed when target_type is corrupted", async () => {
      const fixture = await commitReplayFixture("Wrong target type");
      await pgSql`
        UPDATE audit_events
        SET target_type = 'order'
        WHERE target_id = ${fixture.product.id}
          AND action = 'catalog:product:update'
          AND metadata ? 'mutation_request_digest';
      `;
      await expect(updateProduct(fixture.input, { authContext: authAdminCatalog })).rejects.toThrow(
        CatalogReplayIntegrityError
      );
    });

    it("fails replay closed when target_id differs from the request", async () => {
      const fixture = await commitReplayFixture("Wrong target id");
      const otherProduct = await createUpdateReplayProduct("Wrong target id other");
      await pgSql`
        UPDATE audit_events
        SET target_id = ${otherProduct.id}
        WHERE target_id = ${fixture.product.id}
          AND action = 'catalog:product:update'
          AND metadata ? 'mutation_request_digest';
      `;
      await expect(updateProduct(fixture.input, { authContext: authAdminCatalog })).rejects.toThrow(
        CatalogReplayIntegrityError
      );
    });

    it("fails replay closed when the durable Product target is missing", async () => {
      const fixture = await commitReplayFixture("Missing target");
      await pgSql`DELETE FROM products WHERE id = ${fixture.product.id};`;
      await expect(updateProduct(fixture.input, { authContext: authAdminCatalog })).rejects.toThrow(
        CatalogReplayIntegrityError
      );
    });

    it("fails replay closed when request_fingerprint is missing or malformed", async () => {
      const missing = await commitReplayFixture("Missing fingerprint");
      await pgSql`
        UPDATE audit_events
        SET metadata = metadata - 'request_fingerprint'
        WHERE target_id = ${missing.product.id}
          AND action = 'catalog:product:update'
          AND metadata ? 'mutation_request_digest';
      `;
      await expect(updateProduct(missing.input, { authContext: authAdminCatalog })).rejects.toThrow(
        CatalogReplayIntegrityError
      );

      const malformed = await commitReplayFixture("Malformed fingerprint");
      await pgSql`
        UPDATE audit_events
        SET metadata = jsonb_set(metadata, '{request_fingerprint}', '"bad"'::jsonb)
        WHERE target_id = ${malformed.product.id}
          AND action = 'catalog:product:update'
          AND metadata ? 'mutation_request_digest';
      `;
      await expect(
        updateProduct(malformed.input, { authContext: authAdminCatalog })
      ).rejects.toThrow(CatalogReplayIntegrityError);
    });

    it("preserves category, specification, slug, and reference validation", async () => {
      const product = await createUpdateReplayProduct("Domain regression");
      await expect(
        updateProduct(
          {
            productId: product.id,
            expectedUpdatedAt: product.updatedAt,
            specValues: [] as unknown as Record<string, unknown>,
            mutationRequestId: `gp025-invalid-spec-shape-${productSequence}`,
          },
          { authContext: authAdminCatalog }
        )
      ).rejects.toMatchObject({ code: "INVALID_SPEC_VALUES_TYPE" });

      await expect(
        updateProduct(
          {
            productId: product.id,
            expectedUpdatedAt: product.updatedAt,
            specValues: { unknown_key: "invalid" },
            mutationRequestId: `gp025-invalid-spec-${productSequence}`,
          },
          { authContext: authAdminCatalog }
        )
      ).rejects.toMatchObject({ code: "UNKNOWN_SPECIFICATION_KEY" });

      await expect(
        updateProduct(
          {
            productId: product.id,
            expectedUpdatedAt: product.updatedAt,
            brandId: fixtureIds.brandDraft,
            mutationRequestId: `gp025-invalid-brand-${productSequence}`,
          },
          { authContext: authAdminCatalog }
        )
      ).rejects.toMatchObject({ code: "INVALID_BRAND" });

      await expect(
        updateProduct(
          {
            productId: product.id,
            expectedUpdatedAt: product.updatedAt,
            categoryId: fixtureIds.catDraft,
            mutationRequestId: `gp025-invalid-category-${productSequence}`,
          },
          { authContext: authAdminCatalog }
        )
      ).rejects.toMatchObject({ code: "INVALID_CATEGORY" });

      const conflictingProduct = await createUpdateReplayProduct("Slug conflict target");
      await expect(
        updateProduct(
          {
            productId: product.id,
            expectedUpdatedAt: product.updatedAt,
            slug: conflictingProduct.slug,
            mutationRequestId: `gp025-slug-conflict-${productSequence}`,
          },
          { authContext: authAdminCatalog }
        )
      ).rejects.toMatchObject({ code: "SLUG_CONFLICT" });
    });

    it("preserves catalog:manage authorization on the idempotent path", async () => {
      const product = await createUpdateReplayProduct("Authorization");
      await expect(
        updateProduct(
          {
            productId: product.id,
            expectedUpdatedAt: product.updatedAt,
            name: "Unauthorized update",
            mutationRequestId: `gp025-unauthorized-${productSequence}`,
          },
          { authContext: authAiResearchOnly }
        )
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    });
  });
});
