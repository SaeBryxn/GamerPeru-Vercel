import postgres from "postgres";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("[Admin E2E Seed] ERROR: DATABASE_URL environment variable is required.");
  process.exit(1);
}

const parsedUrl = new URL(databaseUrl);
if (
  parsedUrl.hostname !== "127.0.0.1" ||
  parsedUrl.port !== "54322" ||
  parsedUrl.pathname !== "/postgres"
) {
  console.error(
    `[Admin E2E Seed] SECURITY VIOLATION: DATABASE_URL must target 127.0.0.1:54322/postgres. Received: ${parsedUrl.hostname}:${parsedUrl.port}${parsedUrl.pathname}`
  );
  process.exit(1);
}

const sql = postgres(databaseUrl, { max: 1 });

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

async function seed() {
  try {
    console.log("[Admin E2E Seed] Seeding deterministic Admin test users into local Supabase...");

    await sql.begin(async (tx) => {
      // 1. Insert auth.users with encrypted password and confirmed email
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

        // 2. Insert customer_profiles
        await tx`
          INSERT INTO customer_profiles (id, auth_user_id, first_name, last_name, phone, created_at, updated_at)
          VALUES (${u.id}, ${u.id}, 'Personal', 'Staff', '999888777', NOW(), NOW())
          ON CONFLICT (id) DO NOTHING;
        `;
      }

      // 3. Clear and re-assign user_roles for deterministic state
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

    console.log("[Admin E2E Seed] Successfully seeded Admin test users.");
  } catch (err) {
    console.error("[Admin E2E Seed] Failed to seed:", err);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

seed();
