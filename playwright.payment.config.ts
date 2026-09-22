import { defineConfig, devices } from "@playwright/test";

// Fail-closed environment validation
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("playwright.payment.config.ts requires DATABASE_URL to be set.");
}

const dbParsed = new URL(databaseUrl);
if (
  dbParsed.hostname !== "127.0.0.1" ||
  dbParsed.port !== "54322" ||
  dbParsed.pathname !== "/postgres"
) {
  throw new Error(
    `playwright.payment.config.ts requires DATABASE_URL to point strictly to 127.0.0.1:54322/postgres. Received: ${dbParsed.origin}${dbParsed.pathname}`
  );
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
if (!supabaseUrl) {
  throw new Error("playwright.payment.config.ts requires NEXT_PUBLIC_SUPABASE_URL to be set.");
}

const sbParsed = new URL(supabaseUrl);
if (sbParsed.hostname !== "127.0.0.1" || sbParsed.port !== "54321") {
  throw new Error(
    `playwright.payment.config.ts requires NEXT_PUBLIC_SUPABASE_URL to point strictly to 127.0.0.1:54321. Received: ${sbParsed.origin}`
  );
}

const supabasePublishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
if (!supabasePublishableKey) {
  throw new Error(
    "playwright.payment.config.ts requires NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY to be set with a real local Supabase anon key."
  );
}

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: ["**/payment-storefront.spec.ts"],
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: "list",
  expect: {
    timeout: 15000,
  },
  use: {
    baseURL: process.env.PLAYWRIGHT_TEST_BASE_URL ?? "http://localhost:3000",
    trace: "on-first-retry",
    actionTimeout: 15000,
    navigationTimeout: 30000,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "pnpm dev",
    url: "http://localhost:3000",
    reuseExistingServer: false,
    timeout: 120000,
    stdout: "pipe",
    stderr: "pipe",
    env: {
      ...process.env,
      CART_E2E_FIXTURES: "1",
      CHECKOUT_E2E_FIXTURES: "1",
      E2E_CATALOG_FIXTURES: "1",
      PLAYWRIGHT_TEST: "1",
      DEV_CATALOG_PREVIEW: "0",
      DATABASE_URL: databaseUrl,
      NEXT_PUBLIC_SUPABASE_URL: supabaseUrl,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: supabasePublishableKey,
      SESSION_COOKIE_SECRET:
        process.env.SESSION_COOKIE_SECRET ?? "gamer-peru-session-cookie-secret-min-32-chars-long",
      CHECKOUT_HMAC_SECRET:
        process.env.CHECKOUT_HMAC_SECRET ?? "gamer-peru-checkout-hmac-secret-min-32-chars-for-test",
      CHECKOUT_PRIMARY_INVENTORY_LOCATION_CODE:
        process.env.CHECKOUT_PRIMARY_INVENTORY_LOCATION_CODE ?? "ALMACEN_CENTRAL_TEST",
      CHECKOUT_RESERVATION_TTL_MINUTES: process.env.CHECKOUT_RESERVATION_TTL_MINUTES ?? "30",
      CHECKOUT_IDEMPOTENCY_TTL_MINUTES: process.env.CHECKOUT_IDEMPOTENCY_TTL_MINUTES ?? "60",
      PAYMENT_SUBMISSION_IDEMPOTENCY_TTL_MINUTES:
        process.env.PAYMENT_SUBMISSION_IDEMPOTENCY_TTL_MINUTES ?? "60",
      ORDER_MANAGEMENT_IDEMPOTENCY_TTL_MINUTES:
        process.env.ORDER_MANAGEMENT_IDEMPOTENCY_TTL_MINUTES ?? "60",
      R2_ACCOUNT_ID: process.env.R2_ACCOUNT_ID ?? "0123456789abcdef0123456789abcdef",
      R2_ACCESS_KEY_ID: process.env.R2_ACCESS_KEY_ID ?? "test-r2-access-key-id-12345",
      R2_SECRET_ACCESS_KEY: process.env.R2_SECRET_ACCESS_KEY ?? "test-r2-secret-access-key-67890",
    },
  },
});
