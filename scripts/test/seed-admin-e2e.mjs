import postgres from "postgres";
import { createClient } from "@supabase/supabase-js";

// 1. Strict Fail-Closed Database Target Guard
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl || typeof databaseUrl !== "string" || databaseUrl.trim().length === 0) {
  console.error(
    "[Admin E2E Seed] SECURITY VIOLATION: DATABASE_URL environment variable is required."
  );
  process.exit(1);
}

let parsedDb;
try {
  parsedDb = new URL(databaseUrl.trim());
} catch {
  console.error("[Admin E2E Seed] SECURITY VIOLATION: DATABASE_URL is malformed.");
  process.exit(1);
}

if (
  (parsedDb.protocol !== "postgres:" && parsedDb.protocol !== "postgresql:") ||
  parsedDb.hostname !== "127.0.0.1" ||
  parsedDb.port !== "54322" ||
  parsedDb.pathname !== "/postgres"
) {
  console.error(
    `[Admin E2E Seed] SECURITY VIOLATION: DATABASE_URL must target 127.0.0.1:54322/postgres. Refusing to run.`
  );
  process.exit(1);
}

// 2. Strict Fail-Closed Supabase API Target Guard
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "http://127.0.0.1:54321";
let parsedSb;
try {
  parsedSb = new URL(supabaseUrl.trim());
} catch {
  console.error("[Admin E2E Seed] SECURITY VIOLATION: NEXT_PUBLIC_SUPABASE_URL is malformed.");
  process.exit(1);
}

if (
  parsedSb.protocol !== "http:" ||
  parsedSb.hostname !== "127.0.0.1" ||
  parsedSb.port !== "54321"
) {
  console.error(
    `[Admin E2E Seed] SECURITY VIOLATION: NEXT_PUBLIC_SUPABASE_URL must target http://127.0.0.1:54321. Refusing to run.`
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

const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;

const sql = postgres(databaseUrl, { max: 1 });

async function seed() {
  try {
    console.log("[Admin E2E Seed] Seeding deterministic Admin test users into local Supabase...");

    if (serviceRoleKey) {
      console.log("[Admin E2E Seed] Using Supabase Admin Auth API with service role key...");
      const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      });

      for (const u of Object.values(ADMIN_E2E_USERS)) {
        try {
          await supabaseAdmin.auth.admin.deleteUser(u.id);
        } catch {
          // Ignored if user does not exist
        }

        const { error } = await supabaseAdmin.auth.admin.createUser({
          id: u.id,
          email: u.email,
          password: ADMIN_E2E_PASSWORD,
          email_confirm: true,
          user_metadata: { first_name: "Personal", last_name: "Staff" },
        });

        if (error) {
          console.warn(
            `[Admin E2E Seed] Warning creating user ${u.email} via admin API:`,
            error.message
          );
        }
      }
    } else {
      console.log("[Admin E2E Seed] Direct SQL seeding of auth.users and auth.identities...");
      await sql.begin(async (tx) => {
        for (const u of Object.values(ADMIN_E2E_USERS)) {
          await tx`
            INSERT INTO auth.users (
              instance_id,
              id,
              aud,
              role,
              email,
              encrypted_password,
              email_confirmed_at,
              raw_app_meta_data,
              raw_user_meta_data,
              is_super_admin,
              created_at,
              updated_at
            )
            VALUES (
              '00000000-0000-0000-0000-000000000000',
              ${u.id},
              'authenticated',
              'authenticated',
              ${u.email},
              crypt(${ADMIN_E2E_PASSWORD}, gen_salt('bf')),
              NOW(),
              '{"provider":"email","providers":["email"]}',
              '{}',
              false,
              NOW(),
              NOW()
            )
            ON CONFLICT (id) DO UPDATE SET
              email = EXCLUDED.email,
              encrypted_password = EXCLUDED.encrypted_password,
              email_confirmed_at = NOW(),
              updated_at = NOW();
          `;

          await tx`
            INSERT INTO auth.identities (
              id,
              user_id,
              identity_data,
              provider,
              provider_id,
              last_sign_in_at,
              created_at,
              updated_at
            )
            VALUES (
              ${u.id},
              ${u.id},
              ${JSON.stringify({ sub: u.id, email: u.email })},
              'email',
              ${u.id},
              NOW(),
              NOW(),
              NOW()
            )
            ON CONFLICT (provider, provider_id) DO UPDATE SET
              identity_data = EXCLUDED.identity_data,
              updated_at = NOW();
          `;
        }
      });
    }

    // Assign customer_profiles and user_roles in public schema
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

    console.log("[Admin E2E Seed] Successfully seeded Admin test users and role mappings.");
  } catch (err) {
    console.error("[Admin E2E Seed] Failed to seed:", err);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

seed();
