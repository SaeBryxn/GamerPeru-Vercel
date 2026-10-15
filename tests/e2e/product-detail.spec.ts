import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { installGp014MediaFixtures } from "./helpers/gp014-media-fixtures";

// The stage cross-slides between images, so two <img> coexist mid-transition; only a lone image
// is a settled stage.
function settledStageSrc(page: Page): Promise<string | null> {
  return page
    .getByTestId("gallery-main-stage")
    .locator("img")
    .evaluateAll(([img, ...rest]) => (img && rest.length === 0 ? img.getAttribute("src") : null));
}

test.describe("GP-014 DB3B — Product Detail Storefront E2E Suite", () => {
  test.beforeEach(async ({ page }) => {
    await installGp014MediaFixtures(page);
  });

  test("A: navigates from category discovery grid to product detail page", async ({ page }) => {
    // 1. Visit category page
    await page.goto("/categorias/mouses");
    const firstCard = page.getByTestId("product-card").first();
    await expect(firstCard).toBeVisible();

    // 2. Click title link to navigate to PDP
    const titleLink = firstCard.getByRole("link", { name: "Mouse Pro Mod 01", exact: true });
    await titleLink.click();

    // 3. Verify URL and Page H1
    await expect(page).toHaveURL(/\/productos\/mouse-pro-mod-01$/, { timeout: 15000 });
    const h1 = page.locator("h1");
    await expect(h1).toHaveCount(1);
    await expect(h1).toHaveText("Mouse Pro Mod 01");
  });

  test("B: renders product detail hero with gallery, default price, SKU, and specifications", async ({
    page,
  }) => {
    const response = await page.goto("/productos/mouse-pro-mod-01");
    expect(response?.status()).toBe(200);

    // No visible breadcrumb trail (BreadcrumbList lives in JSON-LD, see test J)
    await expect(page.locator('nav[aria-label="Breadcrumb"]')).toHaveCount(0);

    // Brand link
    const brandLink = page
      .getByTestId("product-commerce-panel")
      .getByRole("link", { name: "Marca QA" });
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

    // Specs highlights grid, plus the full table inside the "Especificaciones" accordion
    await expect(page.getByTestId("pdp-spec-grid")).toBeVisible();
    await page.getByTestId("pdp-accordion-especificaciones").click();
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
    await expect.poll(() => settledStageSrc(page)).toMatch(/variant-black/);

    // Track network requests during variant selection
    const apiRequests: string[] = [];
    page.on("request", (req) => {
      const url = req.url();
      // Filter data/api requests (exclude static assets / images / css)
      if (
        url.includes("/api/") ||
        url.includes("/_next/data") ||
        (req.resourceType() === "fetch" &&
          !url.includes("/media/") &&
          !req.headers()["next-action"])
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
    await expect.poll(() => settledStageSrc(page)).toMatch(/variant-white/);

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
    await expect.poll(() => settledStageSrc(page)).toMatch(/variant-white/);

    // Verify accessibility audit remains clean under reduced motion
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    expect(results.violations).toEqual([]);
  });

  test("I: renders accurate metadata, canonical link, and OpenGraph tags", async ({ page }) => {
    await page.goto("/productos/mouse-pro-mod-01");

    // Title: "${product.name} — ${product.brand.name} | Gamer Perú"
    await expect(page).toHaveTitle("Mouse Pro Mod 01 — Marca QA | Gamer Perú");

    // Canonical link: strictly production canonical origin
    const canonicalLink = page.locator('link[rel="canonical"]');
    await expect(canonicalLink).toHaveAttribute(
      "href",
      "https://gamerperu.com/productos/mouse-pro-mod-01"
    );

    // Description meta
    const metaDescription = page.locator('meta[name="description"]');
    await expect(metaDescription).toHaveAttribute("content", "Edición de Rendimiento QA 01");

    // OpenGraph meta tags
    const ogTitle = page.locator('meta[property="og:title"]');
    await expect(ogTitle).toHaveAttribute("content", "Mouse Pro Mod 01 — Marca QA | Gamer Perú");

    const ogUrl = page.locator('meta[property="og:url"]');
    await expect(ogUrl).toHaveAttribute(
      "content",
      "https://gamerperu.com/productos/mouse-pro-mod-01"
    );

    const ogSiteName = page.locator('meta[property="og:site_name"]');
    await expect(ogSiteName).toHaveAttribute("content", "Gamer Perú");

    const ogLocale = page.locator('meta[property="og:locale"]');
    await expect(ogLocale).toHaveAttribute("content", "es_PE");
  });

  test("J: renders valid Schema.org JSON-LD @graph with Product, BreadcrumbList, and FAQPage", async ({
    page,
  }) => {
    await page.goto("/productos/mouse-pro-mod-01");

    // Extract application/ld+json script
    const jsonLdScript = page.locator('script[type="application/ld+json"]');
    await expect(jsonLdScript).toHaveCount(1);

    const content = await jsonLdScript.textContent();
    expect(content).toBeTruthy();

    const parsed = JSON.parse(content ?? "{}");
    expect(parsed["@context"]).toBe("https://schema.org");

    const graph = parsed["@graph"] as Array<Record<string, unknown>>;
    expect(Array.isArray(graph)).toBe(true);

    // 1. Product Node
    const productNode = graph.find((n) => n["@type"] === "Product");
    expect(productNode).toBeDefined();
    expect(productNode?.name).toBe("Mouse Pro Mod 01");
    expect(productNode?.url).toBe("https://gamerperu.com/productos/mouse-pro-mod-01");
    expect(productNode?.brand).toEqual({ "@type": "Brand", name: "Marca QA" });
    expect(productNode?.category).toBe("Mouses Gaming");

    // Variable prices in fixture (S/ 129.90 and S/ 139.90) -> offers is omitted
    expect(productNode?.offers).toBeUndefined();

    // 2. BreadcrumbList Node
    const breadcrumbNode = graph.find((n) => n["@type"] === "BreadcrumbList");
    expect(breadcrumbNode).toBeDefined();
    const items = breadcrumbNode?.itemListElement as Array<Record<string, unknown>>;
    expect(items).toHaveLength(3);
    expect(items[0]).toEqual({
      "@type": "ListItem",
      position: 1,
      name: "Inicio",
      item: "https://gamerperu.com/",
    });
    expect(items[1]).toEqual({
      "@type": "ListItem",
      position: 2,
      name: "Mouses Gaming",
      item: "https://gamerperu.com/categorias/mouses",
    });
    expect(items[2]).toEqual({
      "@type": "ListItem",
      position: 3,
      name: "Mouse Pro Mod 01",
      item: "https://gamerperu.com/productos/mouse-pro-mod-01",
    });

    // 3. FAQPage Node
    const faqNode = graph.find((n) => n["@type"] === "FAQPage");
    expect(faqNode).toBeDefined();
    const mainEntity = faqNode?.mainEntity as Array<Record<string, unknown>>;
    expect(Array.isArray(mainEntity)).toBe(true);
    expect(mainEntity.length).toBeGreaterThanOrEqual(1);

    // Omission invariants: No ratings, reviews, inventory, or shipping promises in JSON-LD
    expect(productNode?.aggregateRating).toBeUndefined();
    expect(productNode?.review).toBeUndefined();
    expect(productNode?.shippingDetails).toBeUndefined();
    expect(productNode?.availability).toBeUndefined();
  });

  test("K: handles pointer swipe gestures on image stage while isolating vertical and sub-threshold gestures", async ({
    page,
  }) => {
    await page.goto("/productos/mouse-pro-mod-01");

    const stage = page.getByTestId("gallery-main-stage");
    await expect(stage).toBeVisible();

    const box = await stage.boundingBox();
    expect(box).toBeTruthy();
    if (!box) return;

    const startX = box.x + box.width * 0.7;
    const startY = box.y + box.height * 0.5;

    // 1. Horizontal dominant swipe left (deltaX = -80px, deltaY = 0px) -> navigates to next image
    let initialSrc: string | null = null;
    await expect.poll(async () => (initialSrc = await settledStageSrc(page))).not.toBeNull();

    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX - 80, startY, { steps: 5 });
    await page.mouse.up();

    // Verify stage image changed
    let currentSrc: string | null = null;
    await expect
      .poll(async () => {
        currentSrc = await settledStageSrc(page);
        return currentSrc !== null && currentSrc !== initialSrc;
      })
      .toBe(true);

    // 2. Vertical dominant gesture (deltaX = 10px, deltaY = 60px) -> no navigation
    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX + 10, startY + 60, { steps: 5 });
    await page.mouse.up();
    await expect.poll(() => settledStageSrc(page)).toBe(currentSrc);

    // 3. Sub-threshold horizontal gesture (deltaX = 15px < 40px) -> no navigation
    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX - 15, startY, { steps: 5 });
    await page.mouse.up();
    await expect.poll(() => settledStageSrc(page)).toBe(currentSrc);
  });
});
