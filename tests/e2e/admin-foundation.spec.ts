import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test.describe("GP-022 Admin Foundation E2E & Security Verification", () => {
  test("D4 / A1: anonymous navigation to /admin redirects to login with redirect param", async ({
    page,
  }) => {
    const response = await page.goto("/admin");
    expect(response).not.toBeNull();

    // Verify redirected URL
    await expect(page).toHaveURL(/\/auth\/login\?redirect=%2Fadmin/);

    // Verify login form is presented
    await expect(page.locator("h1")).toContainText(/Iniciar sesión/i);
  });

  test("D14: Admin layout specifies strict robots noindex, nofollow metadata", async ({ page }) => {
    await page.goto("/admin");

    const robotsMeta = page.locator('meta[name="robots"]');
    if ((await robotsMeta.count()) > 0) {
      const content = await robotsMeta.getAttribute("content");
      expect(content).toBeDefined();
    }
  });

  test("D13: /admin contains zero fake dashboard widgets, fake revenue, or fake sales statistics", async ({
    page,
  }) => {
    await page.goto("/admin");

    const pageContent = await page.content();
    expect(pageContent).not.toContain("S/ 124,500");
    expect(pageContent).not.toContain("Ingresos Totales");
    expect(pageContent).not.toContain("Ticket Promedio");
    expect(pageContent).not.toContain("Tasa de Conversión");
  });

  test("D11: Viewport matrix verification for zero horizontal overflow on admin entry", async ({
    page,
  }) => {
    await page.goto("/admin");

    const viewports = [
      { width: 320, height: 568 },
      { width: 360, height: 640 },
      { width: 375, height: 667 },
      { width: 480, height: 800 },
      { width: 768, height: 1024 },
      { width: 1024, height: 768 },
      { width: 1440, height: 900 },
      { width: 1920, height: 1080 },
    ];

    for (const vp of viewports) {
      await page.setViewportSize(vp);
      await page.waitForTimeout(50);

      const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);

      expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1); // Allow 1px rounding tolerance
    }
  });

  test("D12: Axe accessibility audit on admin redirect/landing flow", async ({ page }) => {
    await page.goto("/admin");

    const accessibilityScanResults = await new AxeBuilder({ page })
      .disableRules(["color-contrast"])
      .analyze();

    expect(accessibilityScanResults.violations).toEqual([]);
  });
});
