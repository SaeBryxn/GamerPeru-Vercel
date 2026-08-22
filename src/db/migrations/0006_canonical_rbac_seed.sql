-- Canonical Gamer Perú RBAC Seed Data (v1)
-- Roles: SUPER_ADMIN, ADMIN_CATALOG, ADMIN_ORDERS, ADMIN_SUPPORT, CUSTOMER
-- Permissions: 10 canonical permissions
-- RolePermissions: 17 explicit mappings (Model A: Explicit Mapping)

-- 1. Insert Canonical Roles
INSERT INTO "roles" ("id", "name", "description") VALUES
  ('018f0000-0000-7000-8000-000000000011', 'SUPER_ADMIN', 'Full unrestricted platform access, staff role management, AI credential configuration, and audit log exports.'),
  ('018f0000-0000-7000-8000-000000000012', 'ADMIN_CATALOG', 'Catalog management, product creation, specifications, pricing, category/brand taxonomy, and AI research drafts.'),
  ('018f0000-0000-7000-8000-000000000013', 'ADMIN_ORDERS', 'Order status updates, fulfillment processing, shipment tracking, and manual Yape/Plin payment verification.'),
  ('018f0000-0000-7000-8000-000000000014', 'ADMIN_SUPPORT', 'Customer support inquiry management, communications, and return/RMA/warranty review.'),
  ('018f0000-0000-7000-8000-000000000015', 'CUSTOMER', 'Standard customer account access restricted strictly to owned records.')
ON CONFLICT ("name") DO UPDATE SET "description" = EXCLUDED."description";
--> statement-breakpoint

-- 2. Insert Canonical Permissions
INSERT INTO "permissions" ("id", "name") VALUES
  ('018f0000-0000-7000-8000-000000000021', 'staff:manage'),
  ('018f0000-0000-7000-8000-000000000022', 'ai:manage_credentials'),
  ('018f0000-0000-7000-8000-000000000023', 'audit:export'),
  ('018f0000-0000-7000-8000-000000000024', 'catalog:manage'),
  ('018f0000-0000-7000-8000-000000000025', 'catalog:publish'),
  ('018f0000-0000-7000-8000-000000000026', 'catalog:ai_research'),
  ('018f0000-0000-7000-8000-000000000027', 'orders:manage'),
  ('018f0000-0000-7000-8000-000000000028', 'orders:verify'),
  ('018f0000-0000-7000-8000-000000000029', 'support:manage'),
  ('018f0000-0000-7000-8000-00000000002a', 'support:review_rma')
ON CONFLICT ("name") DO NOTHING;
--> statement-breakpoint

-- 3. Insert Explicit Role-Permission Mappings (17 mappings)
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT r.id, p.id
FROM "roles" r, "permissions" p
WHERE (
  (r.name = 'SUPER_ADMIN' AND p.name IN (
    'staff:manage',
    'ai:manage_credentials',
    'audit:export',
    'catalog:manage',
    'catalog:publish',
    'catalog:ai_research',
    'orders:manage',
    'orders:verify',
    'support:manage',
    'support:review_rma'
  ))
  OR (r.name = 'ADMIN_CATALOG' AND p.name IN ('catalog:manage', 'catalog:publish', 'catalog:ai_research'))
  OR (r.name = 'ADMIN_ORDERS' AND p.name IN ('orders:manage', 'orders:verify'))
  OR (r.name = 'ADMIN_SUPPORT' AND p.name IN ('support:manage', 'support:review_rma'))
)
ON CONFLICT DO NOTHING;
