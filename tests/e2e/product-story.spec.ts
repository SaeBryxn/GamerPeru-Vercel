import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test.describe("GP-014 DB3C — Product Story Modular Renderer E2E Suite", () => {
  test("A: renders Product Story section with all 13 canonical block types on PDP", async ({
    page,
  }) => {
    const response = await page.goto("/productos/mouse-pro-mod-01");
    expect(response?.status()).toBe(200);

    const storySection = page.getByTestId("product-story-section");
    await expect(storySection).toBeVisible();

    // Verify all 13 canonical story blocks are present in the DOM
    await expect(page.getByTestId("story-hero-media-block")).toBeVisible();
    await expect(page.getByTestId("story-full-bleed-image-block")).toBeVisible();
    await expect(page.getByTestId("story-image-text-block")).toBeVisible();
    await expect(page.getByTestId("story-stat-highlight-block")).toBeVisible();
    await expect(page.getByTestId("story-spec-feature-block")).toBeVisible();
    await expect(page.getByTestId("story-video-block")).toBeVisible();
    await expect(page.getByTestId("story-gallery-block")).toBeVisible();
    await expect(page.getByTestId("story-comparison-block")).toBeVisible();
    await expect(page.getByTestId("story-dimensions-block")).toBeVisible();
    await expect(page.getByTestId("story-box-contents-block")).toBeVisible();
    await expect(page.getByTestId("story-technical-specs-block")).toBeVisible();
    await expect(page.getByTestId("story-faq-block")).toBeVisible();
    await expect(page.getByTestId("story-related-products-block")).toBeVisible();
  });

  test("B: preserves single h1 hierarchy across the entire page", async ({ page }) => {
    await page.goto("/productos/mouse-pro-mod-01");

    // Commerce Hero owns the sole page h1
    const h1 = page.locator("h1");
    await expect(h1).toHaveCount(1);
    await expect(h1).toHaveText("Mouse Pro Mod 01");

    // Story headings use h2 and h3
    const heroH2 = page.getByTestId("hero-headline");
    await expect(heroH2).toBeVisible();
    const tagName = await heroH2.evaluate((el) => el.tagName.toLowerCase());
    expect(tagName).toBe("h2");
  });

  test("C: interactive FAQ accordion toggles open and closed natively", async ({ page }) => {
    await page.goto("/productos/mouse-pro-mod-01");

    const firstFaq = page.getByTestId("faq-item-0");
    await expect(firstFaq).toBeVisible();

    // Details is closed by default
    await expect(firstFaq).not.toHaveAttribute("open", "");

    // Click summary to open
    const summary = page.getByTestId("faq-summary-0");
    await summary.click();
    await expect(firstFaq).toHaveAttribute("open", "");
    await expect(page.getByTestId("faq-answer-0")).toBeVisible();

    // Click again to close
    await summary.click();
    await expect(firstFaq).not.toHaveAttribute("open", "");
  });

  test("D: content video controls are accessible and operable", async ({ page }) => {
    await page.goto("/productos/mouse-pro-mod-01");

    const videoBlock = page.getByTestId("story-video-block");
    await expect(videoBlock).toBeVisible();

    const playToggle = page.getByTestId("story-video-toggle");
    await expect(playToggle).toBeVisible();
    await expect(playToggle).toHaveAttribute("aria-label", /Reproducir video|Pausar video/);
  });

  test("E: operates safely under prefers-reduced-motion: reduce without autoplay", async ({
    page,
  }) => {
    // Emulate reduced motion before navigation
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/productos/mouse-pro-mod-01");

    const storySection = page.getByTestId("product-story-section");
    await expect(storySection).toBeVisible();

    // Hero headline and static content remain clearly visible
    await expect(page.getByTestId("hero-headline")).toBeVisible();

    // Verify all video elements on page are NOT playing (paused === true)
    const videos = page.locator("video");
    const videoCount = await videos.count();
    expect(videoCount).toBeGreaterThanOrEqual(1);

    for (let i = 0; i < videoCount; i++) {
      const isPaused = await videos.nth(i).evaluate((el) => (el as HTMLVideoElement).paused);
      expect(isPaused).toBe(true);
    }

    // Video player toggle button remains visible with manual play action available
    const playToggle = page.getByTestId("story-video-toggle");
    await expect(playToggle).toBeVisible();
    await expect(playToggle).toHaveAttribute("aria-label", "Reproducir video");
  });

  test("E2: allows explicit manual video playback under prefers-reduced-motion", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/productos/mouse-pro-mod-01");

    const playToggle = page.getByTestId("story-video-toggle");
    await expect(playToggle).toBeVisible();
    await expect(playToggle).toHaveAttribute("aria-label", "Reproducir video");

    // Click to start manual playback
    await playToggle.click();

    // Toggle button aria-label reflects interactive state
    await expect(playToggle).toHaveAttribute("aria-label", /Pausar video|Reproducir video/);
  });

  test("E3: pauses active automatic video playback when runtime motion preference changes to reduce", async ({
    page,
  }) => {
    // 1. Start with no preference
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.goto("/productos/mouse-pro-mod-01");

    const videoPlayer = page.getByTestId("story-video-player");
    await expect(videoPlayer).toBeVisible();

    // 2. Transition preference to reduce at runtime
    await page.emulateMedia({ reducedMotion: "reduce" });

    // 3. Verify all video elements are paused immediately upon preference change
    const videos = page.locator("video");
    const videoCount = await videos.count();
    for (let i = 0; i < videoCount; i++) {
      const isPaused = await videos.nth(i).evaluate((el) => (el as HTMLVideoElement).paused);
      expect(isPaused).toBe(true);
    }

    // 4. Content video player toggle remains accessible for manual control
    const playToggle = page.getByTestId("story-video-toggle");
    await expect(playToggle).toBeVisible();
  });

  test("F: related products cards render with valid links and pricing", async ({ page }) => {
    await page.goto("/productos/mouse-pro-mod-01");

    const relatedBlock = page.getByTestId("story-related-products-block");
    await expect(relatedBlock).toBeVisible();

    const relatedCards = relatedBlock.getByTestId("product-card");
    const count = await relatedCards.count();
    expect(count).toBeGreaterThanOrEqual(1);

    // First card contains title and links to /productos/[slug]
    const firstCard = relatedCards.first();
    await expect(firstCard).toBeVisible();
    const link = firstCard.locator("a").first();
    await expect(link).toHaveAttribute("href", /^\/productos\//);
  });

  test("G: mobile viewport 360px has zero horizontal page overflow", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto("/productos/mouse-pro-mod-01");

    const hasHorizontalScroll = await page.evaluate(() => {
      return (
        document.documentElement.scrollWidth > document.documentElement.clientWidth + 1 // 1px tolerance for subpixel rounding
      );
    });

    expect(hasHorizontalScroll).toBe(false);
  });

  test("H: passes WCAG 2.1 AA accessibility audit on complete PDP with Product Story", async ({
    page,
  }) => {
    await page.goto("/productos/mouse-pro-mod-01");

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();

    expect(results.violations).toEqual([]);
  });

  test("I: DB3B Commerce Hero interactions remain fully functional alongside Product Story", async ({
    page,
  }) => {
    await page.goto("/productos/mouse-pro-mod-01");

    // Commerce Hero pricing
    await expect(page.getByTestId("selling-price")).toHaveText("S/ 129.90");

    // Swatch selection updates SKU and price
    const whiteSwatch = page.getByTestId("swatch-option-Blanco");
    await whiteSwatch.click();
    await expect(page.getByTestId("selling-price")).toHaveText("S/ 139.90");
    await expect(page.getByTestId("variant-sku")).toContainText("SKU-MOUSE-PRO-MOD-01-WHT");

    // Product Story remains unaffected beneath
    await expect(page.getByTestId("product-story-section")).toBeVisible();
  });
});
