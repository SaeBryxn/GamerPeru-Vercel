import fs from "node:fs";
import path from "node:path";
import { expect, type Locator, type Page, test } from "@playwright/test";
import { installGp014MediaFixtures } from "./helpers/gp014-media-fixtures";

const SCRATCH_QA_DIR = path.resolve("scratch/visual-qa/gp014");

const EXPECTED_SCREENSHOT_BASENAMES = [
  "ss-01-desktop-hero-default.png",
  "ss-02-desktop-hero-variant-selected.png",
  "ss-03-desktop-hardware-specs.png",
  "ss-04-desktop-story-hero-media.png",
  "ss-05-desktop-story-faq-expanded.png",
  "ss-06-desktop-story-related-products.png",
  "ss-07-mobile-hero-360px.png",
  "ss-08-mobile-story-blocks-360px.png",
  "ss-09-tablet-hero-768px.png",
  "ss-10-desktop-reduced-motion-video.png",
] as const;

function cleanScratchQaDirectory(): void {
  if (!fs.existsSync(SCRATCH_QA_DIR)) {
    fs.mkdirSync(SCRATCH_QA_DIR, { recursive: true });
    return;
  }
  const files = fs.readdirSync(SCRATCH_QA_DIR);
  for (const file of files) {
    if (file.endsWith(".png")) {
      fs.unlinkSync(path.join(SCRATCH_QA_DIR, file));
    }
  }
}

async function waitForImagesReady(locator: Locator): Promise<void> {
  const images = locator.locator("img");
  const count = await images.count();
  for (let i = 0; i < count; i++) {
    const img = images.nth(i);
    await expect
      .poll(
        async () => {
          return await img.evaluate((element: HTMLImageElement) => {
            return element.complete && element.naturalWidth > 0;
          });
        },
        {
          message: "Image failed to load or has 0 naturalWidth",
          timeout: 5000,
        }
      )
      .toBe(true);
  }
}

async function getUnionBoundingBox(
  page: Page,
  locators: Locator[]
): Promise<{ x: number; y: number; width: number; height: number }> {
  const boxes = await Promise.all(
    locators.map(async (l) => {
      await expect(l).toBeVisible();
      const b = await l.boundingBox();
      if (!b) throw new Error("Locator bounding box not found");
      return b;
    })
  );

  const minX = Math.min(...boxes.map((b) => b.x));
  const minY = Math.min(...boxes.map((b) => b.y));
  const maxX = Math.max(...boxes.map((b) => b.x + b.width));
  const maxY = Math.max(...boxes.map((b) => b.y + b.height));

  return {
    x: Math.max(0, Math.floor(minX)),
    y: Math.max(0, Math.floor(minY)),
    width: Math.ceil(maxX - minX),
    height: Math.ceil(maxY - minY),
  };
}

test.describe("GP-014 DB3E — Visual QA Evidence Suite", () => {
  test.beforeEach(async ({ page }) => {
    await installGp014MediaFixtures(page);
  });

  test("captures exactly 10 authorized visual evidence screenshots", async ({ page }) => {
    // 0. Clean only scratch/visual-qa/gp014/*.png
    cleanScratchQaDirectory();

    // -------------------------------------------------------------------------
    // SS-01: Desktop Default Commerce Hero (1280x800)
    // -------------------------------------------------------------------------
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/productos/mouse-pro-mod-01");
    await page.evaluate(() => document.fonts.ready);

    const hero = page.getByTestId("product-detail-hero");
    await expect(hero).toBeVisible();
    await waitForImagesReady(hero);

    // Verify default black variant state
    await expect(page.getByTestId("selling-price")).toHaveText("S/ 129.90");
    await expect(page.getByTestId("variant-sku")).toContainText("SKU-MOUSE-PRO-MOD-01-BLK");
    await expect(page.getByTestId("payment-trust-box")).toBeVisible();

    await hero.screenshot({
      path: path.join(SCRATCH_QA_DIR, "ss-01-desktop-hero-default.png"),
      animations: "disabled",
    });

    // -------------------------------------------------------------------------
    // SS-02: Desktop White Variant Selected (1280x800)
    // -------------------------------------------------------------------------
    const whiteSwatch = page.getByTestId("swatch-option-Blanco");
    await whiteSwatch.click();

    // Verify variant reactive state
    await expect(page.getByTestId("selling-price")).toHaveText("S/ 139.90");
    await expect(page.getByTestId("variant-sku")).toContainText("SKU-MOUSE-PRO-MOD-01-WHT");
    await waitForImagesReady(hero);

    await hero.screenshot({
      path: path.join(SCRATCH_QA_DIR, "ss-02-desktop-hero-variant-selected.png"),
      animations: "disabled",
    });

    // -------------------------------------------------------------------------
    // SS-03: Desktop Hardware Specifications Table (1280x800)
    // -------------------------------------------------------------------------
    const hardwareSpecs = page.getByTestId("hardware-specifications");
    await expect(hardwareSpecs).toBeVisible();
    await hardwareSpecs.scrollIntoViewIfNeeded();

    // Verify canonical fixture truth
    await expect(hardwareSpecs).toContainText("52 g");
    await expect(hardwareSpecs).toContainText("PAW3395");
    await expect(hardwareSpecs).toContainText("1000 Hz");

    await hardwareSpecs.screenshot({
      path: path.join(SCRATCH_QA_DIR, "ss-03-desktop-hardware-specs.png"),
      animations: "disabled",
    });

    // -------------------------------------------------------------------------
    // SS-04: Desktop Story Opening (Hero Media + Full Bleed Image) (1280x800)
    // -------------------------------------------------------------------------
    const storyHeroBlock = page.getByTestId("story-hero-media-block");
    const fullBleedBlock = page.getByTestId("story-full-bleed-image-block");
    await expect(storyHeroBlock).toBeVisible();
    await expect(fullBleedBlock).toBeVisible();
    await storyHeroBlock.scrollIntoViewIfNeeded();

    await waitForImagesReady(storyHeroBlock);
    await waitForImagesReady(fullBleedBlock);

    const unionStoryOpening = await getUnionBoundingBox(page, [storyHeroBlock, fullBleedBlock]);
    await page.screenshot({
      path: path.join(SCRATCH_QA_DIR, "ss-04-desktop-story-hero-media.png"),
      clip: unionStoryOpening,
      animations: "disabled",
    });

    // -------------------------------------------------------------------------
    // SS-05: Desktop Story FAQ Expanded (1280x800)
    // -------------------------------------------------------------------------
    const faqBlock = page.getByTestId("story-faq-block");
    await expect(faqBlock).toBeVisible();
    await faqBlock.scrollIntoViewIfNeeded();

    const firstFaqSummary = faqBlock.locator("summary").first();
    await firstFaqSummary.click();

    const firstDetails = faqBlock.locator("details").first();
    await expect(firstDetails).toHaveAttribute("open", "");
    const faqAnswer = firstDetails.locator("p");
    await expect(faqAnswer).toBeVisible();

    await faqBlock.screenshot({
      path: path.join(SCRATCH_QA_DIR, "ss-05-desktop-story-faq-expanded.png"),
      animations: "disabled",
    });

    // -------------------------------------------------------------------------
    // SS-06: Desktop Story Ending (Technical Specs + Related Products) (1280x800)
    // -------------------------------------------------------------------------
    const techSpecsBlock = page.getByTestId("story-technical-specs-block");
    const relatedProductsBlock = page.getByTestId("story-related-products-block");
    await expect(techSpecsBlock).toBeVisible();
    await expect(relatedProductsBlock).toBeVisible();
    await techSpecsBlock.scrollIntoViewIfNeeded();

    await waitForImagesReady(relatedProductsBlock);

    const unionStoryEnding = await getUnionBoundingBox(page, [
      techSpecsBlock,
      relatedProductsBlock,
    ]);
    await page.screenshot({
      path: path.join(SCRATCH_QA_DIR, "ss-06-desktop-story-related-products.png"),
      clip: unionStoryEnding,
      animations: "disabled",
    });

    // -------------------------------------------------------------------------
    // SS-07: Mobile Commerce Hero (360x780)
    // -------------------------------------------------------------------------
    await page.setViewportSize({ width: 360, height: 780 });
    await page.goto("/productos/mouse-pro-mod-01");
    await page.evaluate(() => document.fonts.ready);

    const mobileHero = page.getByTestId("product-detail-hero");
    await expect(mobileHero).toBeVisible();
    await waitForImagesReady(mobileHero);

    // Verify zero horizontal overflow at 360px
    const scrollWidthMobile = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidthMobile = await page.evaluate(() => document.documentElement.clientWidth);
    expect(scrollWidthMobile).toBeLessThanOrEqual(clientWidthMobile + 1);

    const heroBox = await mobileHero.boundingBox();
    if (!heroBox) throw new Error("Mobile hero bounding box not found");

    await page.screenshot({
      path: path.join(SCRATCH_QA_DIR, "ss-07-mobile-hero-360px.png"),
      clip: {
        x: Math.max(0, Math.floor(heroBox.x)),
        y: Math.max(0, Math.floor(heroBox.y)),
        width: Math.ceil(heroBox.width),
        height: Math.ceil(heroBox.height),
      },
      animations: "disabled",
    });

    // -------------------------------------------------------------------------
    // SS-08: Mobile Story Stack (Image-Text + Stat-Highlight) (360x780)
    // -------------------------------------------------------------------------
    const imageTextBlock = page.getByTestId("story-image-text-block");
    const statHighlightBlock = page.getByTestId("story-stat-highlight-block");
    await expect(imageTextBlock).toBeVisible();
    await expect(statHighlightBlock).toBeVisible();
    await imageTextBlock.scrollIntoViewIfNeeded();

    await waitForImagesReady(imageTextBlock);

    const unionMobileStory = await getUnionBoundingBox(page, [imageTextBlock, statHighlightBlock]);
    await page.screenshot({
      path: path.join(SCRATCH_QA_DIR, "ss-08-mobile-story-blocks-360px.png"),
      clip: unionMobileStory,
      animations: "disabled",
    });

    // -------------------------------------------------------------------------
    // SS-09: Tablet Commerce Hero Responsive Composition (768x1024)
    // -------------------------------------------------------------------------
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto("/productos/mouse-pro-mod-01");
    await page.evaluate(() => document.fonts.ready);

    const tabletHero = page.getByTestId("product-detail-hero");
    await expect(tabletHero).toBeVisible();
    await waitForImagesReady(tabletHero);

    await tabletHero.screenshot({
      path: path.join(SCRATCH_QA_DIR, "ss-09-tablet-hero-768px.png"),
      animations: "disabled",
    });

    // -------------------------------------------------------------------------
    // SS-10: Desktop Reduced-Motion Story Video Block (1280x800)
    // -------------------------------------------------------------------------
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/productos/mouse-pro-mod-01");
    await page.evaluate(() => document.fonts.ready);

    const storyVideoBlock = page.getByTestId("story-video-block");
    await expect(storyVideoBlock).toBeVisible();
    await storyVideoBlock.scrollIntoViewIfNeeded();

    // Verify video is paused and manual Play control is visible
    const videoElement = storyVideoBlock.locator("video");
    await expect(videoElement).toBeVisible();
    const isPaused = await videoElement.evaluate((v: HTMLMediaElement) => v.paused);
    expect(isPaused).toBe(true);

    const playButton = storyVideoBlock.getByRole("button", { name: /Reproducir/i });
    await expect(playButton).toBeVisible();

    await storyVideoBlock.screenshot({
      path: path.join(SCRATCH_QA_DIR, "ss-10-desktop-reduced-motion-video.png"),
      animations: "disabled",
    });

    // -------------------------------------------------------------------------
    // Post-Execution Invariant: Exactly 10 approved PNG files in scratch directory
    // -------------------------------------------------------------------------
    const finalFiles = fs
      .readdirSync(SCRATCH_QA_DIR)
      .filter((f) => f.endsWith(".png"))
      .sort();

    expect(finalFiles).toHaveLength(10);
    expect(finalFiles).toEqual([...EXPECTED_SCREENSHOT_BASENAMES].sort());
  });
});
