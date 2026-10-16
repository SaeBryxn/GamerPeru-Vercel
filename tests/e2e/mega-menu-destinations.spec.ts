import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const DESTINATIONS = [
  { path: "/guia-de-compra/mouses", heading: "Guía de compra: mouses gaming" },
  { path: "/guia-de-compra/teclados", heading: "Guía de compra: teclados gaming" },
  { path: "/guia-de-compra/mousepads", heading: "Guía de compra: mousepads" },
  { path: "/software", heading: "Software y drivers" },
  { path: "/software/mouse", heading: "Software para mouses" },
  { path: "/software/teclado", heading: "Software para teclados" },
  { path: "/software/dongle", heading: "Receptores 8K" },
  { path: "/software/firmware", heading: "Actualizaciones de firmware" },
  { path: "/soporte", heading: "Soporte" },
  { path: "/soporte/tienda-oficial", heading: "Tienda oficial" },
];

test.describe("GP-056 Mega-menu destinations", () => {
  // Entrance animations would leave content mid-fade while Axe samples contrast.
  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
  });

  for (const destination of DESTINATIONS) {
    test(`${destination.path} renders with one heading, a canonical and no Axe violations`, async ({
      page,
    }) => {
      const response = await page.goto(destination.path);
      expect(response?.status()).toBe(200);

      await expect(page.getByRole("heading", { level: 1 })).toHaveText(destination.heading);
      await expect(page.locator("h1")).toHaveCount(1);
      await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
        "href",
        new RegExp(`${destination.path.replace(/\//g, "\\/")}$`)
      );

      const scan = await new AxeBuilder({ page }).analyze();
      expect(scan.violations).toEqual([]);
    });
  }

  test("destinations fit a 375 px viewport without horizontal scroll", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    for (const destination of DESTINATIONS) {
      await page.goto(destination.path);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth
      );
      expect(overflow, destination.path).toBeLessThanOrEqual(1);
    }
  });

  test("unknown guide and software slugs return 404", async ({ request }) => {
    expect((await request.get("/guia-de-compra/audifonos")).status()).toBe(404);
    expect((await request.get("/software/monitor")).status()).toBe(404);
  });

  test("the mouse guide links its options to the filtered catalog with live counts", async ({
    page,
  }) => {
    await page.goto("/guia-de-compra/mouses");

    const options = page.locator('a[href^="/categorias/mouses?"]');
    expect(await options.count()).toBeGreaterThan(0);
    await expect(options.first()).toContainText(/Ver \d+ modelos?/);

    const href = await options.first().getAttribute("href");
    const response = await page.goto(href!);
    expect(response?.status()).toBe(200);
    expect(page.url()).toContain(href!);
  });

  test("the guide publishes Article, BreadcrumbList and FAQPage structured data", async ({
    page,
  }) => {
    await page.goto("/guia-de-compra/mousepads");
    const raw = await page.locator('script[type="application/ld+json"]').first().textContent();
    const types = (JSON.parse(raw!)["@graph"] as { "@type": string }[]).map((n) => n["@type"]);
    expect(types).toEqual(["Article", "BreadcrumbList", "FAQPage"]);
  });

  test("software links leave for the brand's site in a new tab", async ({ page }) => {
    await page.goto("/software/mouse");
    const official = page.getByRole("link", { name: /Ir al sitio oficial de ATK/ });
    await expect(official).toHaveAttribute("href", /^https:\/\/www\.atk\.store\//);
    await expect(official).toHaveAttribute("target", "_blank");
    await expect(official).toHaveAttribute("rel", "noopener noreferrer");
    await expect(
      page.getByRole("link", { name: /Pídenos el enlace oficial de MCHOSE/ })
    ).toHaveAttribute("href", "/soporte/contacto");
  });

  test("the support hub reaches every support destination", async ({ page }) => {
    await page.goto("/soporte");
    for (const href of [
      "/soporte/preguntas-frecuentes",
      "/soporte/contacto",
      "/cuenta/pedidos",
      "/soporte/tienda-oficial",
      "/software",
      "/soporte/distribuidores",
      "/guia-de-compra/mouses",
    ]) {
      await expect(page.locator(`main a[href="${href}"]`).first()).toBeVisible();
    }
    await expect(
      page.getByRole("heading", { name: "Garantía por defecto de fábrica" })
    ).toBeVisible();
  });

  test("serves robots.txt and sitemap.xml with the new pages", async ({ request }) => {
    const robots = await request.get("/robots.txt");
    expect(robots.status()).toBe(200);
    const robotsText = await robots.text();
    expect(robotsText).toContain("Disallow: /admin");
    expect(robotsText).toContain("Sitemap: https://gamerperu.com/sitemap.xml");

    const sitemap = await request.get("/sitemap.xml");
    expect(sitemap.status()).toBe(200);
    const xml = await sitemap.text();
    for (const destination of DESTINATIONS) {
      expect(xml).toContain(`<loc>https://gamerperu.com${destination.path}</loc>`);
    }
  });
});
