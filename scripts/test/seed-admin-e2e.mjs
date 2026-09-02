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
  } catch (err) {
    console.error("[Admin E2E Seed] Failed to seed:", err instanceof Error ? err.message : err);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

// Execute seed if invoked directly
if (
  process.argv[1] &&
  (import.meta.url === `file://${process.argv[1]}`.replace(/\\/g, "/") ||
    import.meta.url === `file:///${process.argv[1]}`.replace(/\\/g, "/"))
) {
  seedAdminUsers();
}
