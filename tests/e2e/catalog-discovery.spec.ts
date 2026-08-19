import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test.describe("GP-011 — Category & Brand Discovery E2E Suite", () => {
  test.describe("Category Discovery (/categorias/[slug])", () => {
    test("A: renders populated category with H1, canonical metadata, and 12-card grid", async ({
      page,
    }) => {
      const response = await page.goto("/categorias/mouses");
      expect(response?.status()).toBe(200);

      // Title and H1
      await expect(page).toHaveTitle(/Mouses Gaming \| Gamer Perú/);
      const h1 = page.locator("h1");
      await expect(h1).toHaveCount(1);
      await expect(h1).toHaveText("Mouses Gaming");

      // Canonical link
      const canonical = page.locator('link[rel="canonical"]');
      await expect(canonical).toHaveAttribute("href", /http.*\/categorias\/mouses$/);

      // Product count badge
      const countBadge = page.getByTestId("product-count");
      await expect(countBadge).toHaveText("14 productos");

      // Product grid: 12 cards on page 1
      const cards = page.getByTestId("product-card");
      await expect(cards).toHaveCount(12);

      // Verify card content
      const firstCard = cards.first();
      await expect(firstCard).toContainText("Mouse Pro Mod 01");
      await expect(firstCard).toContainText("Marca QA");
      await expect(firstCard).toContainText("Desde");
      await expect(firstCard).toContainText("S/ 129.90");

      // Verify product card links to legitimate PDP in GP-014
      const pdpLink = firstCard.locator('a[href*="/productos/"]');
      await expect(pdpLink.first()).toHaveAttribute("href", "/productos/mouse-pro-mod-01");

      // Brand link is present on card
      const brandLink = firstCard.getByRole("link", { name: "Marca QA" });
      await expect(brandLink).toHaveAttribute("href", "/marcas/marca-qa");

      // Pagination nav is rendered
      const pagination = page.getByTestId("pagination");
      await expect(pagination).toBeVisible();
    });

    test("B: handles pagination transitions and canonical self-referencing", async ({ page }) => {
      // Navigate to page 2
      const response = await page.goto("/categorias/mouses?page=2");
      expect(response?.status()).toBe(200);

      // Page 2 canonical
      const canonical = page.locator('link[rel="canonical"]');
      await expect(canonical).toHaveAttribute("href", /http.*\/categorias\/mouses\?page=2$/);

      // 2 remaining items on page 2
      const cards = page.getByTestId("product-card");
      await expect(cards).toHaveCount(2);
      await expect(cards.first()).toContainText("Mouse Pro Mod 13");
    });

    test("C: normalizes ?page=1 and invalid pagination parameters via redirect", async ({
      page,
    }) => {
      // ?page=1 redirects to /categorias/mouses
      await page.goto("/categorias/mouses?page=1");
      await expect(page).toHaveURL(/.*\/categorias\/mouses$/);

      // ?page=0 redirects to /categorias/mouses
      await page.goto("/categorias/mouses?page=0");
      await expect(page).toHaveURL(/.*\/categorias\/mouses$/);

      // ?page=abc redirects to /categorias/mouses
      await page.goto("/categorias/mouses?page=abc");
      await expect(page).toHaveURL(/.*\/categorias\/mouses$/);
    });

    test("D: returns 404 for out-of-bounds page requests", async ({ page }) => {
      const response = await page.goto("/categorias/mouses?page=99");
      expect(response?.status()).toBe(404);
    });

    test("E: renders 200 OK empty state for published category with zero products", async ({
      page,
    }) => {
      const response = await page.goto("/categorias/categoria-vacia");
      expect(response?.status()).toBe(200);

      const emptyState = page.getByTestId("catalog-empty-state");
      await expect(emptyState).toBeVisible();
      await expect(emptyState).toContainText("Próximamente en Gamer Perú");
      await expect(emptyState).toContainText("Estamos preparando el catálogo para esta sección.");

      const cta = emptyState.getByRole("link", { name: "Ver categorías" });
      await expect(cta).toHaveAttribute("href", "/#categorias");

      // Out-of-bounds on empty category returns 404
      const p2Response = await page.goto("/categorias/categoria-vacia?page=2");
      expect(p2Response?.status()).toBe(404);
    });

    test("F: returns 404 for unknown, draft, or archived category slugs", async ({ page }) => {
      const nonexistent = await page.goto("/categorias/nonexistent-slug");
      expect(nonexistent?.status()).toBe(404);

      const draft = await page.goto("/categorias/categoria-draft");
      expect(draft?.status()).toBe(404);

      const archived = await page.goto("/categorias/categoria-archived");
      expect(archived?.status()).toBe(404);
    });

    test("G: translates legacy category aliases (?tipo=ultraligeros) via redirect to canonical filters", async ({
      page,
    }) => {
      await page.goto("/categorias/mouses?tipo=ultraligeros");

      // Redirects to canonical GP-013 URL
      await expect(page).toHaveURL(/.*\/categorias\/mouses\?peso_max=45$/);

      // Meta robots contains noindex, follow on filtered URL
      const robots = page.locator('meta[name="robots"]');
      await expect(robots).toHaveAttribute("content", /noindex/);

      // Canonical points to filtered URL
      const canonical = page.locator('link[rel="canonical"]');
      await expect(canonical).toHaveAttribute("href", /http.*\/categorias\/mouses\?peso_max=45$/);
    });
  });

  test.describe("Brand Discovery (/marcas/[slug])", () => {
    test("H: renders brand page with products and omits redundant brand links on cards", async ({
      page,
    }) => {
      const response = await page.goto("/marcas/marca-qa");
      expect(response?.status()).toBe(200);

      await expect(page).toHaveTitle(/Marca QA \| Gamer Perú/);
      const h1 = page.locator("h1");
      await expect(h1).toHaveCount(1);
      await expect(h1).toHaveText("Marca QA");

      const cards = page.getByTestId("product-card");
      await expect(cards).toHaveCount(12);

      // Cards on brand page do not contain brand links
      const brandLinksOnCard = cards.first().locator('a[href*="/marcas/"]');
      await expect(brandLinksOnCard).toHaveCount(0);
    });

    test("I: renders 200 OK empty state for published brand with zero products", async ({
      page,
    }) => {
      const response = await page.goto("/marcas/marca-vacia");
      expect(response?.status()).toBe(200);

      const emptyState = page.getByTestId("catalog-empty-state");
      await expect(emptyState).toBeVisible();
    });

    test("J: returns 404 for unknown, draft, or archived brand slugs", async ({ page }) => {
      const nonexistent = await page.goto("/marcas/marca-inexistente");
      expect(nonexistent?.status()).toBe(404);

      const draft = await page.goto("/marcas/marca-draft");
      expect(draft?.status()).toBe(404);

      const archived = await page.goto("/marcas/marca-archived");
      expect(archived?.status()).toBe(404);
    });
  });

  test.describe("Responsive Grid Matrix & Zero Horizontal Overflow", () => {
    const viewports = [
      { width: 360, height: 780, name: "360px Mobile" },
      { width: 480, height: 800, name: "480px Large Mobile" },
      { width: 768, height: 1024, name: "768px Tablet" },
      { width: 1024, height: 768, name: "1024px Small Desktop" },
      { width: 1280, height: 800, name: "1280px Standard Desktop" },
      { width: 1536, height: 900, name: "1536px Wide Desktop" },
      { width: 1920, height: 1080, name: "1920px Ultra-Wide Desktop" },
    ];

    for (const vp of viewports) {
      test(`K: verifies zero horizontal overflow on ${vp.name} (${vp.width}x${vp.height})`, async ({
        page,
      }) => {
        await page.setViewportSize({ width: vp.width, height: vp.height });
        await page.goto("/categorias/mouses");

        const hasHorizontalScrollbar = await page.evaluate(() => {
          return document.documentElement.scrollWidth > document.documentElement.clientWidth;
        });

        expect(hasHorizontalScrollbar).toBe(false);
      });
    }
  });

  test.describe("Axe Accessibility Audits (WCAG 2.1 AA)", () => {
    test("L: category page passes Axe accessibility audit", async ({ page }) => {
      await page.goto("/categorias/mouses");
      const accessibilityScanResults = await new AxeBuilder({ page }).analyze();
      expect(accessibilityScanResults.violations).toEqual([]);
    });

    test("M: brand page passes Axe accessibility audit", async ({ page }) => {
      await page.goto("/marcas/marca-qa");
      const accessibilityScanResults = await new AxeBuilder({ page }).analyze();
      expect(accessibilityScanResults.violations).toEqual([]);
    });

    test("N: empty category state passes Axe accessibility audit", async ({ page }) => {
      await page.goto("/categorias/categoria-vacia");
      const accessibilityScanResults = await new AxeBuilder({ page }).analyze();
      expect(accessibilityScanResults.violations).toEqual([]);
    });
  });

  test.describe("Security & Network Isolation", () => {
    test("O: makes no runtime network requests to WLMOUSE or unapproved domains", async ({
      page,
    }) => {
      const foreignRequests: string[] = [];

      page.on("request", (req) => {
        const url = req.url();
        if (
          url.includes("wlmouse.com") ||
          url.includes("supabase.co") ||
          url.includes("cloudflare")
        ) {
          foreignRequests.push(url);
        }
      });

      await page.goto("/categorias/mouses");
      expect(foreignRequests).toEqual([]);
    });
  });
});
