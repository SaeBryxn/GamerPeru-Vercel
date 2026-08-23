import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: ["**/cart-storefront.spec.ts"],
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: process.env.PLAYWRIGHT_TEST_BASE_URL ?? "http://localhost:3000",
    trace: "on-first-retry",
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
    env: {
      ...process.env,
      CART_E2E_FIXTURES: "1",
      E2E_CATALOG_FIXTURES: "1",
      PLAYWRIGHT_TEST: "1",
      DEV_CATALOG_PREVIEW: "0",
      DATABASE_URL:
        process.env.DATABASE_URL ?? "postgres://postgres:postgres@127.0.0.1:54322/postgres",
      NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321",
      SESSION_COOKIE_SECRET:
        process.env.SESSION_COOKIE_SECRET ?? "gamer-peru-session-cookie-secret-min-32-chars-long",
    },
  },
});
