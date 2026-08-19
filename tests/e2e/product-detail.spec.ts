import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test.describe("GP-014 DB3B — Product Detail Storefront E2E Suite", () => {
  test("A: navigates from category discovery grid to product detail page", async ({ page }) => {
    // 1. Visit category page
    await page.goto("/categorias/mouses");
    const firstCard = page.getByTestId("product-card").first();
    await expect(firstCard).toBeVisible();

    // 2. Click title link to navigate to PDP
    const titleLink = firstCard.getByRole("link", { name: "Mouse Pro Mod 01" });
    await titleLink.click();

    // 3. Verify URL and Page H1
    await expect(page).toHaveURL(/\/productos\/mouse-pro-mod-01$/);
    const h1 = page.locator("h1");
    await expect(h1).toHaveCount(1);
    await expect(h1).toHaveText("Mouse Pro Mod 01");
  });

  test("B: renders product detail hero with gallery, default price, SKU, and specifications", async ({
    page,
  }) => {
    const response = await page.goto("/productos/mouse-pro-mod-01");
    expect(response?.status()).toBe(200);

    // Breadcrumbs
    const breadcrumbs = page.locator('nav[aria-label="Breadcrumb"]');
    await expect(breadcrumbs).toBeVisible();
    await expect(breadcrumbs).toContainText("Inicio");
    await expect(breadcrumbs).toContainText("Mouses Gaming");
    await expect(breadcrumbs).toContainText("Mouse Pro Mod 01");

    // Brand link
    const brandLink = page.getByRole("link", { name: "Marca QA" });
    await expect(brandLink).toBeVisible();
    await expect(brandLink).toHaveAttribute("href", "/marcas/marca-qa");

    // Default price and SKU (Variant 1: Negro Mate / 8K, S/ 129.90)
    const sellingPrice = page.getByTestId("selling-price");
    await expect(sellingPrice).toHaveText("S/ 129.90");

    const skuTag = page.getByTestId("variant-sku");
    await expect(skuTag).toContainText("SKU-MOUSE-PRO-MOD-01-BLK");

    // Gallery main stage
    const galleryStage = page.getByTestId("gallery-main-stage");
    await expect(galleryStage).toBeVisible();

    // Hardware specifications table
    const specsSection = page.getByTestId("hardware-specifications");
    await expect(specsSection).toBeVisible();
    await expect(specsSection).toContainText("Especificaciones Técnicas");

    // Static Payment Trust Box
    const trustBox = page.getByTestId("payment-trust-box");
    await expect(trustBox).toBeVisible();
    await expect(trustBox).toContainText("Yape");
    await expect(trustBox).toContainText("Plin");

    // Omission invariants: No stock badge, No cart mutation button, No cost data
    await expect(page.locator("body")).not.toContainText("En stock");
    await expect(page.locator("body")).not.toContainText("Sin stock");
    await expect(page.locator("body")).not.toContainText("costCents");
    await expect(page.locator("body")).not.toContainText("cost_cents");
  });

  test("C: updates price, SKU, and gallery focus on variant selection without DATA network requests", async ({
    page,
  }) => {
    await page.goto("/productos/mouse-pro-mod-01");

    // Verify initial variant (Negro)
    await expect(page.getByTestId("selling-price")).toHaveText("S/ 129.90");
    await expect(page.getByTestId("variant-sku")).toContainText("SKU-MOUSE-PRO-MOD-01-BLK");

    // Verify initial gallery main image shows black variant
    const mainImg = page.getByTestId("gallery-main-stage").locator("img");
    await expect(mainImg).toHaveAttribute("src", /variant-black/);

    // Track network requests during variant selection
    const apiRequests: string[] = [];
    page.on("request", (req) => {
      const url = req.url();
      // Filter data/api requests (exclude static assets / images / css)
      if (
        url.includes("/api/") ||
        url.includes("/_next/data") ||
        (req.resourceType() === "fetch" && !url.includes("/media/"))
      ) {
        apiRequests.push(url);
      }
    });

    // Click Blanco swatch
    const whiteSwatch = page.getByTestId("swatch-option-Blanco");
    await expect(whiteSwatch).toBeVisible();
    await whiteSwatch.click();

    // Synchronous state update: Price becomes S/ 139.90, SKU becomes -WHT
    await expect(page.getByTestId("selling-price")).toHaveText("S/ 139.90");
    await expect(page.getByTestId("variant-sku")).toContainText("SKU-MOUSE-PRO-MOD-01-WHT");

    // Verify main gallery image changes to white variant
    await expect(mainImg).toHaveAttribute("src", /variant-white/);

    // Zero data/API network requests made
    expect(apiRequests).toHaveLength(0);
  });

  test("D: handles keyboard navigation across gallery thumbnails", async ({ page }) => {
    await page.goto("/productos/mouse-pro-mod-01");

    const thumbnails = page.getByTestId("gallery-thumbnails");
    if ((await thumbnails.count()) > 0) {
      const buttons = thumbnails.locator("button");
      await buttons.first().focus();
      await expect(buttons.first()).toBeFocused();

      // Press ArrowRight to focus next thumbnail
      await page.keyboard.press("ArrowRight");
      await expect(buttons.nth(1)).toBeFocused();
    }
  });

  test("E: returns 404 not-found for non-existent product slug", async ({ page }) => {
    const response = await page.goto("/productos/producto-inexistente-invalido-xyz");
    expect(response?.status()).toBe(404);
  });

  test("F: responsive mobile layout does not overflow horizontally", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    await page.goto("/productos/mouse-pro-mod-01");

    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1); // Allow subpixel rounding
  });

  test("G: WCAG 2.1 AA accessibility audit passes with zero violations", async ({ page }) => {
    await page.goto("/productos/mouse-pro-mod-01");

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();

    expect(results.violations).toEqual([]);
  });

  test("H: operates normally under prefers-reduced-motion: reduce", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/productos/mouse-pro-mod-01");

    // Verify initial variant state
    await expect(page.getByTestId("selling-price")).toHaveText("S/ 129.90");

    // Select White swatch and verify reactive update under reduced motion
    const whiteSwatch = page.getByTestId("swatch-option-Blanco");
    await whiteSwatch.click();
    await expect(page.getByTestId("selling-price")).toHaveText("S/ 139.90");
    await expect(page.getByTestId("variant-sku")).toContainText("SKU-MOUSE-PRO-MOD-01-WHT");

    // Verify gallery update
    const mainImg = page.getByTestId("gallery-main-stage").locator("img");
    await expect(mainImg).toHaveAttribute("src", /variant-white/);

    // Verify accessibility audit remains clean under reduced motion
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    expect(results.violations).toEqual([]);
  });
});
