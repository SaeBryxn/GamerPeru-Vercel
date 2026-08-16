import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test.describe("GP-005 E2E Bootstrap Smoke", () => {
  test("loads root page with valid title and heading", async ({ page }) => {
    await page.goto("/");

    // Verify page title
    await expect(page).toHaveTitle(/Gamer Perú/);

    // Verify main h1 heading
    const heading = page.locator("h1");
    await expect(heading).toBeVisible();
    await expect(heading).toHaveText("Gamer Perú");

    // Verify bootstrap indicator
    const badge = page.getByText("Bootstrap Initialized (GP-005)");
    await expect(badge).toBeVisible();
  });

  test("passes baseline automated accessibility audit", async ({ page }) => {
    await page.goto("/");
    const accessibilityScanResults = await new AxeBuilder({ page }).analyze();
    expect(accessibilityScanResults.violations).toEqual([]);
  });
});
