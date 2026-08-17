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

  test("B: verifies Hero section renders with minimum 590px height and semantic multi-brand CTAs", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/");

    const heroSection = page.locator("section[aria-label='Portada principal de Gamer Perú']");
    await expect(heroSection).toBeVisible();

    const box = await heroSection.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.height).toBeGreaterThanOrEqual(590);

    // Primary CTA
    const primaryCta = heroSection.getByRole("link", { name: "Ver mouses" });
    await expect(primaryCta).toBeVisible();
    await expect(primaryCta).toHaveAttribute("href", "/categorias/mouses");

    // Secondary CTA
    const secondaryCta = heroSection.getByRole("link", { name: "Explorar categorías" });
    await expect(secondaryCta).toBeVisible();
    await expect(secondaryCta).toHaveAttribute("href", "#categorias");
  });

  test("C: verifies Featured Editorial renders and links to mouses category", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/");

    const featuredSection = page.locator("section[aria-label='Ingeniería y diseño destacado']");
    await expect(featuredSection).toBeVisible();

    await expect(
      featuredSection.getByRole("heading", { name: "Ingeniería ultraligera en magnesio" })
    ).toBeVisible();

    const link = featuredSection.getByRole("link", { name: /Explorar mouses/ });
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute("href", "/categorias/mouses");
  });

  test("D: verifies CategoryShowcase has id='categorias' and renders all 5 category entry links", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/");

    const categorySection = page.locator("#categorias");
    await expect(categorySection).toBeVisible();

    const expectedCategories = [
      { name: "Mouses", href: "/categorias/mouses" },
      { name: "Teclados", href: "/categorias/teclados" },
      { name: "Mousepads", href: "/categorias/mousepads" },
      { name: "Audio", href: "/categorias/audio" },
      { name: "Accesorios", href: "/categorias/accesorios" },
    ];

    for (const cat of expectedCategories) {
      const card = categorySection.locator(`a[href='${cat.href}']`);
      await expect(card).toBeVisible();
      await expect(card).toContainText(cat.name);
    }
  });

  test("E: verifies CuratedGear renders 4 category doors without fake commercial data", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/");

    const gearSection = page.locator("section[aria-label='Selección de gear destacado']");
    await expect(gearSection).toBeVisible();

    await expect(gearSection.getByRole("heading", { name: "Selección Gamer Perú" })).toBeVisible();

    // Verify all 4 curated items exist
    await expect(gearSection.getByText("Mouses ultraligeros")).toBeVisible();
    await expect(gearSection.getByText("Teclados magnéticos")).toBeVisible();
    await expect(gearSection.getByText("Mousepads de control")).toBeVisible();
    await expect(gearSection.getByText("Dongles y accesorios")).toBeVisible();
  });

  test("F: verifies TechnicalEditorial renders giant typography stats and technology concepts", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/");

    const techSection = page.locator(
      "section[aria-label='Ingeniería y especificaciones técnicas']"
    );
    await expect(techSection).toBeVisible();

    await expect(
      techSection.getByRole("heading", { name: "Tecnología para respuesta instantánea" })
    ).toBeVisible();

    // Giant stats
    await expect(techSection.getByText("8000Hz", { exact: true })).toBeVisible();
    await expect(techSection.getByText("0.125ms", { exact: true })).toBeVisible();
  });

  test("G: verifies BrandDiscovery has id='marcas' and renders 5 multi-brand links", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/");

    const brandSection = page.locator("#marcas");
    await expect(brandSection).toBeVisible();

    const expectedBrands = [
      { name: "WLMOUSE", href: "/marcas/wlmouse" },
      { name: "Pulsar", href: "/marcas/pulsar" },
      { name: "Lamzu", href: "/marcas/lamzu" },
      { name: "ATK", href: "/marcas/atk" },
      { name: "Ninjutso", href: "/marcas/ninjutso" },
    ];

    for (const brand of expectedBrands) {
      const link = brandSection.locator(`a[href='${brand.href}']`);
      await expect(link).toBeVisible();
      await expect(link).toContainText(brand.name);
    }
  });

  test("H: verifies HomeDiscoveryFooter renders 4 trust facts and SEO directory columns", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/");

    const trustSection = page.locator(
      "section[aria-label='Información de confianza y directorio']"
    );
    await expect(trustSection).toBeVisible();

    // 4 Grounded trust facts
    await expect(trustSection.getByText("Selección multimarca")).toBeVisible();
    await expect(trustSection.getByText("Precios y pagos en PEN / S/")).toBeVisible();
    await expect(trustSection.getByText("Verificación manual de pagos")).toBeVisible();
    await expect(trustSection.getByText("Plataforma enfocada en Perú")).toBeVisible();

    // SEO Directory
    await expect(trustSection.getByRole("heading", { name: "Categorías" })).toBeVisible();
    await expect(trustSection.getByRole("heading", { name: "Marcas" })).toBeVisible();
    await expect(trustSection.getByRole("heading", { name: "Atención" })).toBeVisible();
    await expect(trustSection.getByRole("heading", { name: "Legal" })).toBeVisible();
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

  test("J: verifies responsive grid geometry for Category Showcase and Curated Gear", async ({
    page,
  }) => {
    // 1. Desktop 1280px: Category 3+2, Gear 4 columns
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/");

    const categoryCards = page.locator("#categorias a");
    await expect(categoryCards).toHaveCount(5);

    const card0 = await categoryCards.nth(0).boundingBox();
    const card1 = await categoryCards.nth(1).boundingBox();
    const card2 = await categoryCards.nth(2).boundingBox();
    const card3 = await categoryCards.nth(3).boundingBox();
    const card4 = await categoryCards.nth(4).boundingBox();

    // Top 3 cards in row 1
    expect(Math.abs(card0!.y - card1!.y)).toBeLessThanOrEqual(2);
    expect(Math.abs(card1!.y - card2!.y)).toBeLessThanOrEqual(2);
    // Bottom 2 cards in row 2
    expect(card3!.y).toBeGreaterThan(card0!.y + 50);
    expect(Math.abs(card3!.y - card4!.y)).toBeLessThanOrEqual(2);

    // Curated Gear: 4 columns
    const gearCards = page.locator("section[aria-label='Selección de gear destacado'] a");
    await expect(gearCards).toHaveCount(4);
    const gear0 = await gearCards.nth(0).boundingBox();
    const gear1 = await gearCards.nth(1).boundingBox();
    const gear2 = await gearCards.nth(2).boundingBox();
    const gear3 = await gearCards.nth(3).boundingBox();
    expect(Math.abs(gear0!.y - gear1!.y)).toBeLessThanOrEqual(2);
    expect(Math.abs(gear1!.y - gear2!.y)).toBeLessThanOrEqual(2);
    expect(Math.abs(gear2!.y - gear3!.y)).toBeLessThanOrEqual(2);

    // 2. Tablet 768px: Category 2 cols, Gear 2 cols
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto("/");
    const catTab0 = await categoryCards.nth(0).boundingBox();
    const catTab1 = await categoryCards.nth(1).boundingBox();
    const catTab2 = await categoryCards.nth(2).boundingBox();
    expect(Math.abs(catTab0!.y - catTab1!.y)).toBeLessThanOrEqual(2);
    expect(catTab2!.y).toBeGreaterThan(catTab0!.y + 50);

    const gearTab0 = await gearCards.nth(0).boundingBox();
    const gearTab1 = await gearCards.nth(1).boundingBox();
    const gearTab2 = await gearCards.nth(2).boundingBox();
    expect(Math.abs(gearTab0!.y - gearTab1!.y)).toBeLessThanOrEqual(2);
    expect(gearTab2!.y).toBeGreaterThan(gearTab0!.y + 50);

    // 3. Mobile 360px: 1 col vertical stack
    await page.setViewportSize({ width: 360, height: 640 });
    await page.goto("/");
    const catMob0 = await categoryCards.nth(0).boundingBox();
    const catMob1 = await categoryCards.nth(1).boundingBox();
    expect(catMob1!.y).toBeGreaterThan(catMob0!.y + 50);
  });

  test("K: verifies MegaMenu geometry, preview zone width, and zero overflow at 1920px", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto("/");

    const mousesDisclosureBtn = page.getByRole("button", {
      name: "Abrir menú desplegable de Mouses",
    });
    await expect(mousesDisclosureBtn).toBeVisible();
    await mousesDisclosureBtn.click();
    await expect(mousesDisclosureBtn).toHaveAttribute("aria-expanded", "true");

    const panel = page.locator("#mega-menu-mouses");
    await expect(panel).toBeVisible();

    // Verify left collection links exist
    await expect(panel.getByText("Colecciones")).toBeVisible();
    await expect(panel.getByRole("link", { name: "Ultraligeros (< 45g)" })).toBeVisible();

    // Verify right preview zone exists with 4 tiles
    const previewTiles = panel.locator("a:has(h3)");
    await expect(previewTiles).toHaveCount(4);

    // Verify "Ver todos los mouses" semantic link
    const viewAllLink = panel.getByRole("link", { name: /Ver todos los mouses/i });
    await expect(viewAllLink).toBeVisible();
    await expect(viewAllLink).toHaveAttribute("href", "/categorias/mouses");

    // Verify zero horizontal overflow with MegaMenu open
    const hasHorizontalOverflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth > document.documentElement.clientWidth;
    });
    expect(hasHorizontalOverflow).toBe(false);
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
