import postgres from "postgres";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl || typeof databaseUrl !== "string" || databaseUrl.trim().length === 0) {
  console.error(
    "[Admin E2E Cleanup] SECURITY VIOLATION: DATABASE_URL environment variable is required."
  );
  process.exit(1);
}

let parsedDb;
try {
  parsedDb = new URL(databaseUrl.trim());
} catch {
  console.error("[Admin E2E Cleanup] SECURITY VIOLATION: DATABASE_URL is malformed.");
  process.exit(1);
}

if (
  (parsedDb.protocol !== "postgres:" && parsedDb.protocol !== "postgresql:") ||
  parsedDb.hostname !== "127.0.0.1" ||
  parsedDb.port !== "54322" ||
  parsedDb.pathname !== "/postgres"
) {
  console.error(
    `[Admin E2E Cleanup] SECURITY VIOLATION: DATABASE_URL must target 127.0.0.1:54322/postgres. Refusing to run.`
  );
  process.exit(1);
}

const sql = postgres(databaseUrl, { max: 1 });

const ADMIN_E2E_USER_IDS = [
  "018f0000-0000-7000-8000-00000000ae01",
  "018f0000-0000-7000-8000-00000000ae02",
  "018f0000-0000-7000-8000-00000000ae03",
  "018f0000-0000-7000-8000-00000000ae04",
  "018f0000-0000-7000-8000-00000000ae05",
  "018f0000-0000-7000-8000-00000000ae06",
];

async function cleanup() {
  try {
    console.log("[Admin E2E Cleanup] Cleaning up Admin E2E test users from local Supabase...");

    await sql.begin(async (tx) => {
      await tx`DELETE FROM user_roles WHERE auth_user_id IN ${tx(ADMIN_E2E_USER_IDS)}`;
      await tx`DELETE FROM customer_profiles WHERE auth_user_id IN ${tx(ADMIN_E2E_USER_IDS)}`;
      await tx`DELETE FROM auth.identities WHERE user_id IN ${tx(ADMIN_E2E_USER_IDS)}`;
      await tx`DELETE FROM auth.users WHERE id IN ${tx(ADMIN_E2E_USER_IDS)}`;
    });

    console.log("[Admin E2E Cleanup] Cleaned up Admin E2E test users.");
  } catch (err) {
    console.error("[Admin E2E Cleanup] Failed to cleanup:", err);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

cleanup();
