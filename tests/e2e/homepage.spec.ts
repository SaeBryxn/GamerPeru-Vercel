import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test.describe("GP-010 Homepage — Sections, Hierarchy, Responsiveness & Accessibility", () => {
  test("A: verifies exactly one <h1> exists with canonical editorial headline and metadata", async ({
    page,
  }) => {
    await page.goto("/");

    // Page title and meta description
    await expect(page).toHaveTitle(/Gamer Perú \| Periféricos Gaming de Alto Rendimiento/);

    // Exactly one h1 element
    const h1Elements = page.locator("h1");
    await expect(h1Elements).toHaveCount(1);
    await expect(h1Elements).toHaveText("Periféricos gaming de alto rendimiento");
  });

  test("B: verifies the video hero fills the viewport and reveals the store on click", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/");

    const hero = page.locator("section[aria-label='Portada principal de Gamer Perú']");
    await expect(hero).toBeVisible();

    const box = await hero.boundingBox();
    expect(box).not.toBeNull();
    // Full viewport minus the header.
    expect(box!.height).toBeGreaterThanOrEqual(600);

    // The embed is a muted, chromeless, looping background on the privacy host.
    const frame = hero.locator("[data-testid='video-hero-frame']");
    const src = await frame.getAttribute("src");
    expect(src).toContain("youtube-nocookie.com/embed/2gX-vyQwHsA");
    for (const param of ["autoplay=1", "mute=1", "loop=1", "controls=0"]) {
      expect(src).toContain(param);
    }

    // The hint scrolls the store into view.
    await hero.getByTestId("video-hero-scroll-hint").click();
    await expect(page.locator("#coleccion")).toBeInViewport();
  });

  test("C: verifies the split showcase lists its features beside the stage", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");

    const showcase = page.getByTestId("split-showcase");
    await showcase.scrollIntoViewIfNeeded();
    await expect(showcase.getByRole("heading", { name: "Armado para competir" })).toBeVisible();
    await expect(showcase.getByText("Precios en soles", { exact: true })).toBeVisible();
    await expect(showcase.locator("dt")).toHaveCount(4);
  });

  test("D: verifies the comparison curtain moves with the keyboard", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");

    const handle = page.getByTestId("compare-slider-handle");
    await handle.scrollIntoViewIfNeeded();
    await expect(handle).toHaveAttribute("aria-valuenow", "50");

    await handle.focus();
    await page.keyboard.press("ArrowRight");
    const value = Number(await handle.getAttribute("aria-valuenow"));
    expect(value).toBeGreaterThan(50);
  });

  test("E: verifies both catalog rails render cards and step with their arrows", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");

    for (const rail of ["mouses", "mousepads"]) {
      const track = page.getByTestId(`${rail}-track`);
      await track.scrollIntoViewIfNeeded();
      expect(await track.locator("[data-testid='product-card']").count()).toBeGreaterThan(0);
    }

    const track = page.getByTestId("mouses-track");
    const before = await track.evaluate((el) => el.getBoundingClientRect().left);
    await page.getByTestId("mouses-next").click();
    await page.waitForTimeout(600);
    const after = await track.evaluate((el) => el.getBoundingClientRect().left);
    expect(after).toBeLessThan(before);
  });

  test("F: verifies the mousepad bento and the community banner render", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");

    const bento = page.getByTestId("bento-showcase");
    await bento.scrollIntoViewIfNeeded();
    await expect(bento.getByRole("heading", { name: /Explora nuestros mousepads/ })).toBeVisible();

    const banner = page.getByTestId("community-banner");
    await banner.scrollIntoViewIfNeeded();
    await expect(banner.getByRole("heading", { level: 2 })).toBeVisible();
  });

  test("G: verifies the trust strip states only claims the store can back", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");

    const strip = page.locator("section[aria-label='Cómo compras en Gamer Perú']");
    await strip.scrollIntoViewIfNeeded();
    await expect(strip.locator("li")).toHaveCount(4);
    await expect(strip.getByText("Pago con Yape o Plin")).toBeVisible();

    // Claims the store cannot honour today must not appear anywhere on the page.
    const body = page.locator("body");
    await expect(body).not.toContainText("garantía");
    await expect(body).not.toContainText("AfterPay");
  });

  test("I: verifies responsive matrix with zero horizontal overflow across 8 viewports", async ({
    page,
  }) => {
    const viewports = [
      { width: 360, height: 640 }, // Compact Mobile
      { width: 480, height: 800 }, // Large Mobile
      { width: 768, height: 1024 }, // Tablet
      { width: 1023, height: 800 }, // Max Mobile/Tablet
      { width: 1024, height: 800 }, // Min Desktop
      { width: 1280, height: 800 }, // Standard Desktop
      { width: 1536, height: 900 }, // Wide Desktop
      { width: 1920, height: 1080 }, // Ultra-Wide Desktop
    ];

    for (const vp of viewports) {
      await page.setViewportSize(vp);
      await page.goto("/");

      const hasHorizontalOverflow = await page.evaluate(() => {
        return document.documentElement.scrollWidth > document.documentElement.clientWidth;
      });

      expect(hasHorizontalOverflow).toBe(false);
    }
  });

  test("K: verifies MegaMenu geometry, preview zone width, and zero overflow at 1920px", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto("/");

    const productTrigger = page.getByRole("button", { name: "Productos", exact: true });
    await expect(productTrigger).toBeVisible();
    await productTrigger.click();
    await expect(productTrigger).toHaveAttribute("aria-expanded", "true");

    const panel = page.locator("#mega-menu-productos");
    await expect(panel).toBeVisible();

    // Verify left collection links exist
    await expect(panel.getByRole("heading", { name: "Colecciones" })).toBeVisible();
    const mouseTab = panel.getByRole("tab", { name: "Mouses gaming" });
    await expect(mouseTab).toHaveAttribute("aria-selected", "true");

    // Switching tabs swaps the shelf and the "Ver todo en …" link without closing the panel
    await panel.getByRole("tab", { name: "Mousepads" }).click();
    await expect(panel.getByRole("tab", { name: "Mousepads" })).toHaveAttribute(
      "aria-selected",
      "true"
    );
    await expect(panel.getByRole("link", { name: /Ver todo en Mousepads/ })).toHaveAttribute(
      "href",
      "/categorias/mousepads"
    );
    // Hidden categories drop out of the collection tabs
    await expect(panel.getByRole("tab", { name: "Teclados" })).toHaveCount(0);
    await expect(productTrigger).toHaveAttribute("aria-expanded", "true");
    await mouseTab.click();

    // Fixture runs expose no navigation catalog: the shelf states it is empty instead of
    // rendering placeholder products
    const shelf = panel.getByRole("tabpanel", { name: "Mouses gaming" });
    await expect(shelf.getByText("Muy pronto.")).toBeVisible();
    await expect(panel.locator("article")).toHaveCount(0);

    // Verify "Ver todos los productos" semantic link
    const viewAllLink = panel.getByRole("link", { name: /Ver todos los productos/i });
    await expect(viewAllLink).toBeVisible();
    await expect(viewAllLink).toHaveAttribute("href", "/productos");

    // Verify zero horizontal overflow with MegaMenu open
    const hasHorizontalOverflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth > document.documentElement.clientWidth;
    });
    expect(hasHorizontalOverflow).toBe(false);
  });

  test("L2: requests no hardcoded home images, so empty slots never produce 400s", async ({
    page,
  }) => {
    const homeImageRequests: string[] = [];
    page.on("request", (request) => {
      const url = new URL(request.url());
      const imageParam = url.searchParams.get("url") ?? "";
      if (url.pathname.startsWith("/images/home/") || imageParam.startsWith("/images/home/")) {
        homeImageRequests.push(request.url());
      }
    });

    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/");
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForLoadState("networkidle");

    expect(homeImageRequests).toEqual([]);
  });

  test("L: verifies zero runtime network requests to WLMOUSE or external media CDNs", async ({
    page,
  }) => {
    const externalRequests: string[] = [];

    page.on("request", (request) => {
      const url = request.url();
      if (
        url.includes("wlmouse.com") ||
        url.includes("raw.githubusercontent.com") ||
        url.includes("unsplash.com")
      ) {
        externalRequests.push(url);
      }
    });

    await page.goto("/");
    expect(externalRequests).toEqual([]);
  });

  test("M: passes automated Axe accessibility audit on full Homepage surface", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/");

    const accessibilityScanResults = await new AxeBuilder({ page }).analyze();
    expect(accessibilityScanResults.violations).toEqual([]);
  });
});
