import { spawn, execFileSync, type ChildProcess } from "node:child_process";
import { createServer } from "node:net";
import { mkdir, writeFile, open } from "node:fs/promises";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { chromium, expect, type Page } from "@playwright/test";
import postgres from "postgres";
import type * as FixtureTypes from "../../tests/e2e/helpers/admin-fixtures";
import type * as GuardTypes from "../../src/lib/admin/test-target-guard";
const fixturesUrl = pathToFileURL(resolve("tests/e2e/helpers/admin-fixtures.ts")).href;
const {
  ADMIN_E2E_PASSWORD,
  ADMIN_E2E_PRODUCT_FIXTURES,
  ADMIN_E2E_USERS,
  ADMIN_E2E_ORDER_FIXTURES,
} = (await import(fixturesUrl)) as typeof FixtureTypes;
const guardUrl = pathToFileURL(resolve("src/lib/admin/test-target-guard.ts")).href;
const { assertLocalDatabaseTarget, assertLocalSupabaseApiTarget } = (await import(
  guardUrl
)) as typeof GuardTypes;

const databaseUrl = assertLocalDatabaseTarget(process.env.DATABASE_URL);
assertLocalSupabaseApiTarget(process.env.NEXT_PUBLIC_SUPABASE_URL);
if (process.env.S3_ENDPOINT !== "http://127.0.0.1:9000") {
  throw new Error("S3_ENDPOINT debe apuntar al fixture local http://127.0.0.1:9000.");
}
if (!process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) {
  throw new Error("Configure las claves de Supabase local antes de generar capturas.");
}
const baseURL = "http://localhost:3001";
const output = resolve("docs/project/assets/screenshots");
const product = ADMIN_E2E_PRODUCT_FIXTURES.publishableProduct;
const records: { viewport: string; screen: string; status: string; detail: string }[] = [];
let server: ChildProcess | undefined;

async function assertPortFree() {
  const probe = createServer();
  await new Promise<void>((accept, reject) => {
    probe.once("error", reject);
    probe.listen(3001, () => probe.close(() => accept()));
  });
}

async function login(page: Page, email: string, target: string) {
  await page.context().clearCookies();
  await page.goto(`${baseURL}/auth/login?redirect=${encodeURIComponent(target)}`);
  await page.getByLabel("Correo electrónico").fill(email);
  await page.getByLabel("Contraseña", { exact: true }).fill(ADMIN_E2E_PASSWORD);
  await page.getByRole("button", { name: "Iniciar sesión", exact: true }).click();
  await page.waitForURL((url) => !url.pathname.includes("/auth/login"));
  await page.goto(`${baseURL}${target}`);
}

async function capture(page: Page, viewport: string, screen: string, action: () => Promise<void>) {
  try {
    await action();
    await page.locator("body").waitFor();
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({
      path: resolve(output, viewport, `${screen}.png`),
      animations: "disabled",
    });
    records.push({ viewport, screen, status: "OK", detail: new URL(page.url()).pathname });
    console.log(`${viewport}/${screen}: OK`);
  } catch (error) {
    // Keep failure messages free of request bodies, cookies and environment values.
    const detail =
      error instanceof Error
        ? (error.message.split("\n")[0] ?? "Error de captura")
        : "Error de captura";
    records.push({ viewport, screen, status: "PENDIENTE", detail });
    console.log(`${viewport}/${screen}: PENDIENTE`);
  }
}

async function visit(page: Page, path: string) {
  const response = await page.goto(`${baseURL}${path}`);
  if (!response || response.status() >= 400) throw new Error(`Ruta local no disponible: ${path}`);
  if (new URL(page.url()).pathname !== new URL(path, baseURL).pathname)
    throw new Error(`Redirección inesperada: ${path}`);
  await expect(page.locator("main").first()).toBeVisible();
}

async function main() {
  await assertPortFree();
  await mkdir(output, { recursive: true });
  const seedUrl = pathToFileURL(resolve("scripts/test/seed-admin-e2e.mjs")).href;
  const seed = (await import(seedUrl)) as { seedAdminUsers: () => Promise<void> };
  await seed.seedAdminUsers();
  const sql = postgres(databaseUrl, { max: 1 });
  const [original] = await sql`SELECT status FROM products WHERE id = ${product.id}`;
  if (!original) throw new Error("Producto semilla ausente.");
  const log = await open(resolve(tmpdir(), "gamerperu-gp061-dev-server.log"), "w");
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  try {
    await sql`UPDATE products SET status = 'PUBLISHED' WHERE id = ${product.id}`;
    browser = await chromium.launch({ headless: true });
    server = spawn(
      process.execPath,
      [resolve("node_modules/next/dist/bin/next"), "dev", "--port", "3001"],
      {
        windowsHide: true,
        stdio: ["ignore", log.fd, log.fd],
        env: {
          ...process.env,
          NEXT_PUBLIC_SITE_URL: baseURL,
          NEXT_PUBLIC_CDN_URL: `${baseURL}/media`,
          R2_ACCESS_KEY_ID: "media-local-test",
          R2_SECRET_ACCESS_KEY: "media-local-fixture-secret",
          E2E_CATALOG_FIXTURES: "0",
          PLAYWRIGHT_TEST: "1",
          DEV_CATALOG_PREVIEW: "0",
          NEXT_TELEMETRY_DISABLED: "1",
          WRANGLER_SEND_METRICS: "false",
          INNGEST_DEV: "1",
          INNGEST_BASE_URL: "http://127.0.0.1:8288",
          CHECKOUT_HMAC_SECRET: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
          NEXT_PUBLIC_SENTRY_DSN: "",
          SENTRY_AUTH_TOKEN: "",
        },
      }
    );
    let ready = false;
    for (let attempt = 0; attempt < 120; attempt++) {
      if (server.exitCode !== null) throw new Error("El servidor local terminó antes de iniciar.");
      try {
        const response = await fetch(`${baseURL}/api/health`, {
          signal: AbortSignal.timeout(1500),
        });
        if (response.ok) {
          ready = true;
          break;
        }
      } catch {
        /* Startup polling is bounded and local. */
      }
      await delay(1000);
    }
    if (!ready) throw new Error("El servidor local no respondió en el plazo de arranque.");
    for (const [viewport, size] of Object.entries({
      desktop: { width: 1440, height: 900 },
      mobile: { width: 390, height: 844 },
    })) {
      await mkdir(resolve(output, viewport), { recursive: true });
      const context = await browser.newContext({ viewport: size, reducedMotion: "reduce" });
      await context.route("**/*", async (route) => {
        const request = route.request();
        const url = new URL(request.url());
        if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) {
          await route.abort("blockedbyclient");
        } else if (
          request.method() === "GET" &&
          (url.pathname.startsWith("/media/") || url.pathname === "/_next/image")
        ) {
          await route.fulfill({
            path: resolve("tests/fixtures/gp014-media/hero.png"),
            contentType: "image/png",
          });
        } else await route.continue();
      });
      const page = await context.newPage();
      page.setDefaultTimeout(12000);
      page.setDefaultNavigationTimeout(45000);
      for (const [screen, path] of [
        ["home", "/"],
        ["plp", `/categorias/${ADMIN_E2E_PRODUCT_FIXTURES.categoryA.slug}`],
        ["pdp", `/productos/${product.slug}`],
        ["busqueda", "/buscar?q=E2E"],
        ["login", "/auth/login"],
      ]) {
        await capture(page, viewport, screen ?? "ruta", () => visit(page, path ?? "/"));
      }
      await capture(page, viewport, "carrito", async () => {
        await visit(page, `/productos/${product.slug}`);
        await page.getByTestId("pdp-add-to-cart-button").click();
        await expect(page.getByTestId("cart-drawer")).toBeVisible();
      });
      await capture(page, viewport, "checkout", async () => {
        await page.getByTestId("cart-drawer-checkout-button").click();
        await expect(page.getByTestId("checkout-page")).toBeVisible();
      });
      await capture(page, viewport, "pago-manual", async () => {
        // Trying an existing fixture order avoids creating orders or sending notifications.
        await login(
          page,
          ADMIN_E2E_USERS.customer.email,
          `/checkout/confirmacion/${ADMIN_E2E_ORDER_FIXTURES.orderNumber(2)}`
        );
        await expect(page.getByTestId("manual-payment-card")).toBeVisible();
      });
      await capture(page, viewport, "cuenta", () => visit(page, "/cuenta"));
      await capture(page, viewport, "admin-dashboard", () =>
        login(page, ADMIN_E2E_USERS.superadmin.email, "/admin")
      );
      for (const [screen, path] of [
        ["admin-productos", "/admin/products"],
        ["admin-editor", `/admin/products/${product.id}`],
        ["admin-historia", `/admin/products/${product.id}/story`],
        ["admin-home", "/admin/home"],
        ["admin-pedidos", "/admin/orders"],
        ["admin-pagos", "/admin/pagos"],
        ["admin-equipo", "/admin/equipo"],
      ]) {
        await capture(page, viewport, screen ?? "admin", () => visit(page, path ?? "/admin"));
      }
      const putGate: { release?: () => void } = {};
      await capture(page, viewport, "admin-subida", async () => {
        await visit(page, `/admin/products/${product.id}`);
        await page.getByTestId("section-nav-imagenes").click();
        await page.route("http://127.0.0.1:9000/**", async (route) => {
          if (route.request().method() === "PUT") {
            await new Promise<void>((accept) => {
              putGate.release = accept;
            });
            await route.abort("aborted");
          } else await route.continue();
        });
        await page
          .getByTestId("input-media-file")
          .setInputFiles(resolve("tests/fixtures/gp014-media/hero.png"));
        await page.getByTestId("btn-upload-media").click();
        await expect(page.getByRole("progressbar", { name: "Progreso de subida" })).toBeVisible();
      });
      const cancel = page.getByRole("button", { name: "Cancelar subida", exact: true });
      if (await cancel.isVisible()) {
        await cancel.click();
        await expect(cancel)
          .toBeHidden()
          .catch(() => undefined);
      }
      putGate.release?.();
      await context.close();
    }
  } finally {
    try {
      await browser?.close();
      if (server?.pid && server.exitCode === null) {
        if (process.platform === "win32")
          execFileSync("taskkill", ["/PID", String(server.pid), "/T", "/F"], {
            windowsHide: true,
            stdio: "ignore",
          });
        else server.kill("SIGTERM");
      }
    } finally {
      await log.close();
      try {
        await sql`UPDATE products SET status = ${original.status} WHERE id = ${product.id}`;
      } finally {
        await sql.end();
        await writeFile(resolve(output, "manifest.json"), `${JSON.stringify(records, null, 2)}\n`);
      }
    }
  }
  if (!records.some((record) => record.status === "OK"))
    throw new Error("No se generó ninguna captura.");
  console.log(
    `Capturas: ${records.filter((record) => record.status === "OK").length}/${records.length}. Véase manifest.json.`
  );
}

await main();
