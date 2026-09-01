-- Canonical Gamer Perú RBAC Seed Data Extension (GP-022)
-- Adds canonical permission: inventory:manage
-- Explicitly maps to: SUPER_ADMIN

INSERT INTO "permissions" ("id", "name") VALUES
  ('018f0000-0000-7000-8000-00000000002b', 'inventory:manage')
ON CONFLICT ("name") DO NOTHING;
--> statement-breakpoint

INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT r.id, p.id
FROM "roles" r, "permissions" p
WHERE r.name = 'SUPER_ADMIN' AND p.name = 'inventory:manage'
ON CONFLICT DO NOTHING;
