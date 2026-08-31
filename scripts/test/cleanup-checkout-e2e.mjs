import postgres from "postgres";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("[Checkout E2E Cleanup] ERROR: DATABASE_URL environment variable is required.");
  process.exit(1);
}

const parsedUrl = new URL(databaseUrl);
if (
  parsedUrl.hostname !== "127.0.0.1" ||
  parsedUrl.port !== "54322" ||
  parsedUrl.pathname !== "/postgres"
) {
  console.error(
    `[Checkout E2E Cleanup] SECURITY VIOLATION: DATABASE_URL must target 127.0.0.1:54322/postgres.`
  );
  process.exit(1);
}

const sql = postgres(databaseUrl, { max: 1 });

async function cleanup() {
  try {
    console.log("[Checkout E2E Cleanup] Cleaning up Checkout E2E test data from local DB...");
    await sql.begin(async (tx) => {
      await tx`DELETE FROM outbox_events WHERE aggregate_type = 'Order' AND payload->>'customerEmail' LIKE '%@testchk6.pe'`;
      await tx`DELETE FROM inventory_ledger_entries WHERE reference_id IN (SELECT id::text FROM orders WHERE customer_email LIKE '%@testchk6.pe') OR reference_id IN (SELECT id::text FROM inventory_reservations WHERE order_id IN (SELECT id FROM orders WHERE customer_email LIKE '%@testchk6.pe'))`;
      await tx`DELETE FROM inventory_reservations WHERE order_id IN (SELECT id FROM orders WHERE customer_email LIKE '%@testchk6.pe')`;
      await tx`DELETE FROM payments WHERE order_id IN (SELECT id FROM orders WHERE customer_email LIKE '%@testchk6.pe')`;
      await tx`DELETE FROM shipments WHERE order_id IN (SELECT id FROM orders WHERE customer_email LIKE '%@testchk6.pe')`;
      await tx`DELETE FROM order_address_snapshots WHERE order_id IN (SELECT id FROM orders WHERE customer_email LIKE '%@testchk6.pe')`;
      await tx`DELETE FROM order_pricing_snapshots WHERE order_id IN (SELECT id FROM orders WHERE customer_email LIKE '%@testchk6.pe')`;
      await tx`DELETE FROM order_items WHERE order_id IN (SELECT id FROM orders WHERE customer_email LIKE '%@testchk6.pe')`;
      await tx`DELETE FROM idempotency_keys WHERE operation_type = 'ORDER_CREATION' AND (request_fingerprint LIKE '%testchk6%' OR response_payload->>'orderNumber' IN (SELECT order_number FROM orders WHERE customer_email LIKE '%@testchk6.pe'))`;
      await tx`DELETE FROM orders WHERE customer_email LIKE '%@testchk6.pe'`;
    });
    console.log("[Checkout E2E Cleanup] Cleanup complete.");
  } finally {
    await sql.end();
  }
}

cleanup().catch((err) => {
  console.error("[Checkout E2E Cleanup] Failed:", err);
  process.exit(1);
});
