import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test.describe("GP-007 Application Foundation E2E & Contract Verification", () => {
  test("A: loads root page with valid title, heading, and foundation badge", async ({ page }) => {
    const response = await page.goto("/");
    expect(response?.status()).toBe(200);

    // Verify page title
    await expect(page).toHaveTitle(/Gamer Perú/);

    // Verify main h1 heading
    const heading = page.locator("h1");
    await expect(heading).toBeVisible();
    await expect(heading).toHaveText("Gamer Perú");

    // Verify foundation indicator badge
    const badge = page.getByText("Design System Initialized (GP-008)");
    await expect(badge).toBeVisible();
  });

  test("B: handles non-existent routes with real HTTP 404 and accessible not-found UI", async ({
    page,
  }) => {
    const response = await page.goto("/definitely-not-a-real-route-404");
    expect(response?.status()).toBe(404);

    // Verify accessible 404 heading
    const heading = page.locator("h1");
    await expect(heading).toBeVisible();
    await expect(heading).toHaveText("Página no encontrada");

    // Verify return home link
    const homeLink = page.getByRole("link", { name: "Volver al inicio" });
    await expect(homeLink).toBeVisible();
    await expect(homeLink).toHaveAttribute("href", "/");

    // Verify visible UI contains zero raw error dumps or call stacks
    const text = await page.locator("main").innerText();
    expect(text).not.toContain("Error:");
    expect(text).not.toContain("Call Stack");
    expect(text).not.toContain("Unhandled Runtime Error");
  });

  test("C: health endpoint returns 200 OK and clean JSON liveness payload", async ({ request }) => {
    const response = await request.get("/api/health");
    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body).toEqual({ status: "ok" });

    // Verify no sensitive keys or config leakage
    expect(body.DATABASE_URL).toBeUndefined();
    expect(body.SUPABASE_SECRET_KEY).toBeUndefined();
    expect(body.env).toBeUndefined();
  });

  test("D: verifies baseline HTTP security headers on application responses", async ({ page }) => {
    const response = await page.goto("/");
    expect(response).not.toBeNull();

    const headers = response!.headers();
    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    expect(headers["x-frame-options"]).toBe("SAMEORIGIN");
    expect(headers["permissions-policy"]).toContain("camera=()");
    expect(headers["permissions-policy"]).toContain("microphone=()");
    expect(headers["permissions-policy"]).toContain("geolocation=()");

    // Verify obsolete X-XSS-Protection header is NOT present
    expect(headers["x-xss-protection"]).toBeUndefined();
  });

  test("E: passes baseline automated accessibility audit on storefront home", async ({ page }) => {
    await page.goto("/");
    const accessibilityScanResults = await new AxeBuilder({ page }).analyze();
    expect(accessibilityScanResults.violations).toEqual([]);
  });

  test("F: passes baseline automated accessibility audit on 404 not-found surface", async ({
    page,
  }) => {
    await page.goto("/definitely-not-a-real-route-404");
    const accessibilityScanResults = await new AxeBuilder({ page }).analyze();
    expect(accessibilityScanResults.violations).toEqual([]);
  });
});
