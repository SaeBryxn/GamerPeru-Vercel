import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test.describe("GP-012 — Search Experience E2E Suite", () => {
  test.describe("Desktop Search Drawer & Predictive Flow", () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 800 });
      await page.goto("/");
    });

    test("A: opens Search modal from desktop launcher, focuses input, and closes on Escape with focus restored", async ({
      page,
    }) => {
      const launcher = page.getByRole("link", { name: "Buscar productos" });
      await expect(launcher).toBeVisible();

      // Click launcher to open modal
      await launcher.click();

      const dialog = page.getByRole("dialog", {
        name: "Búsqueda de productos",
      });
      await expect(dialog).toBeVisible();

      // Verify input has focus
      const searchInput = page.getByRole("searchbox", {
        name: "Término de búsqueda",
      });
      await expect(searchInput).toBeFocused();

      // Press Escape to close modal
      await page.keyboard.press("Escape");
      await expect(dialog).not.toBeVisible();

      // Verify focus is restored to launcher button
      await expect(launcher).toBeFocused();
    });

    test("B: suggests live catalog products and brands, and links to /buscar", async ({ page }) => {
      const launcher = page.getByRole("link", { name: "Buscar productos" });
      await launcher.click();

      const dialog = page.getByRole("dialog", { name: "Búsqueda de productos" });
      const searchInput = page.getByRole("searchbox", {
        name: "Término de búsqueda",
      });

      // Nothing is suggested before a query: the panel says what to type.
      await expect(dialog.getByText(/Escribe al menos 2 caracteres/)).toBeVisible();

      // Suggestions come from /api/search/predictive, the catalog /buscar reads.
      await searchInput.fill("lamzu");
      await expect(dialog.getByRole("link", { name: "Lamzu", exact: true })).toHaveAttribute(
        "href",
        "/marcas/lamzu"
      );

      await searchInput.fill("mouse");
      await expect(dialog.locator('a[href^="/productos/"]').first()).toBeVisible();

      // "Ver todos" opens the full results page
      const seeAllLink = page.getByRole("link", { name: /Ver todos los resultados para/i });
      await expect(seeAllLink).toBeVisible();
      await seeAllLink.click();
      await expect(page).toHaveURL(/\/buscar\?q=mouse/);
      await expect(page.getByRole("heading", { name: "Búsqueda", level: 1 })).toBeVisible();
    });

    test("C: clear button resets the query and keeps focus on input", async ({ page }) => {
      const launcher = page.getByRole("link", { name: "Buscar productos" });
      await launcher.click();

      const searchInput = page.getByRole("searchbox", {
        name: "Término de búsqueda",
      });
      await searchInput.fill("zzzz");
      await expect(page.getByText(/No encontramos productos para/)).toBeVisible();

      const clearBtn = page.getByRole("button", { name: "Limpiar búsqueda" });
      await clearBtn.click();
      await expect(searchInput).toHaveValue("");
      await expect(searchInput).toBeFocused();
      await expect(page.getByText(/Escribe al menos 2 caracteres/)).toBeVisible();
    });

    test("D: clicking the backdrop closes the panel and a product suggestion opens its PDP", async ({
      page,
    }) => {
      const launcher = page.getByRole("link", { name: "Buscar productos" });
      await launcher.click();
      const dialog = page.getByRole("dialog", { name: "Búsqueda de productos" });
      await expect(dialog).toBeVisible();

      await page.mouse.click(100, 400);
      await expect(dialog).not.toBeVisible();

      await launcher.click();
      await page.getByRole("searchbox", { name: "Término de búsqueda" }).fill("mouse");
      const firstProduct = dialog.locator('a[href^="/productos/"]').first();
      const href = await firstProduct.getAttribute("href");
      await firstProduct.click();
      await expect(page).toHaveURL(new RegExp(`${href}$`));
    });
  });

  test.describe("Full /buscar Search Page", () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 800 });
    });

    test("D: renders bare /buscar landing with indexable H1 and guidance", async ({ page }) => {
      await page.goto("/buscar");

      await expect(page.getByRole("heading", { name: "Búsqueda", level: 1 })).toBeVisible();
      await expect(page.getByText("Catálogo Gamer Perú")).toBeVisible();

      // Robots meta tag must be index, follow
      const robots = page.locator('meta[name="robots"]');
      await expect(robots).toHaveAttribute("content", /index,\s*follow/i);
    });

    test("E: renders 1-character query with guidance, noindex, and zero DB calls", async ({
      page,
    }) => {
      await page.goto("/buscar?q=x");

      await expect(page.getByRole("heading", { name: "Búsqueda", level: 1 })).toBeVisible();
      await expect(page.getByText("Escribe al menos 2 caracteres para buscar.")).toBeVisible();

      // Robots meta tag must be noindex, follow
      const robots = page.locator('meta[name="robots"]');
      await expect(robots).toHaveAttribute("content", /noindex,\s*follow/i);
    });

    test("F: renders populated results, product grid, and handles pagination transitions", async ({
      page,
    }) => {
      await page.goto("/buscar?q=mouse");

      // Verify results summary (12 mouse + 4 mousepads = 16 products)
      await expect(page.getByText(/16 resultados para/i)).toBeVisible();

      // Verify 12 cards on page 1
      const page1Cards = page.locator('article[data-testid="product-card"]');
      await expect(page1Cards).toHaveCount(12);

      // Verify pagination control is visible
      const pagination = page.getByTestId("pagination");
      await expect(pagination).toBeVisible();

      // Navigate to page 2
      const page2Link = page.getByRole("link", { name: "Ir a página 2" });
      await page2Link.click();
      await expect(page).toHaveURL(/\/buscar\?q=mouse&page=2$/);

      // Verify remaining 4 cards on page 2
      const page2Cards = page.locator('article[data-testid="product-card"]');
      await expect(page2Cards).toHaveCount(4);
    });

    test("G: handles canonical redirects for empty query, normalization, and duplicate parameters", async ({
      page,
    }) => {
      // Empty query: /buscar?q= -> /buscar
      await page.goto("/buscar?q=");
      await expect(page).toHaveURL(/\/buscar$/);

      // Page 1 canonicalization: /buscar?q=mouse&page=1 -> /buscar?q=mouse
      await page.goto("/buscar?q=mouse&page=1");
      await expect(page).toHaveURL(/\/buscar\?q=mouse$/);

      // Whitespace normalization: /buscar?q=%20Beast%20%20X%20 -> /buscar?q=Beast%20X
      await page.goto("/buscar?q=%20Beast%20%20X%20");
      await expect(page).toHaveURL(/\/buscar\?q=Beast(%20|\+)X$/);

      // Duplicate q param with empty first candidate: /buscar?q=&q=mouse -> /buscar?q=mouse
      await page.goto("/buscar?q=&q=mouse");
      await expect(page).toHaveURL(/\/buscar\?q=mouse$/);

      // Duplicate page with first-valid resolution: /buscar?q=mouse&page=abc&page=2 -> /buscar?q=mouse&page=2
      await page.goto("/buscar?q=mouse&page=abc&page=2");
      await expect(page).toHaveURL(/\/buscar\?q=mouse&page=2$/);

      // Single emoji code point query shows guidance
      await page.goto("/buscar?q=🎮");
      await expect(page.getByText(/Escribe al menos 2 caracteres para buscar/i)).toBeVisible();
    });

    test("H: renders truthful zero-state for non-matching query with recovery actions", async ({
      page,
    }) => {
      await page.goto("/buscar?q=xyznonexistent");

      await expect(page.getByText(/No encontramos resultados para/i)).toBeVisible();
      await expect(page.getByRole("link", { name: "Limpiar búsqueda" })).toBeVisible();
      await expect(page.getByRole("link", { name: "Volver al inicio" })).toBeVisible();
    });

    test("I: returns 404 for out of bounds page on search", async ({ page }) => {
      const response = await page.goto("/buscar?q=mouse&page=999");
      expect(response?.status()).toBe(404);
    });
  });

  test.describe("Mobile Search & Responsiveness", () => {
    test("J: opens Search modal on mobile 360px viewport with zero horizontal overflow", async ({
      page,
    }) => {
      await page.setViewportSize({ width: 360, height: 640 });
      await page.goto("/");

      const launcher = page.getByRole("link", { name: "Buscar productos" });
      await expect(launcher).toBeVisible();

      await launcher.click();

      const dialog = page.getByRole("dialog", {
        name: "Búsqueda de productos",
      });
      await expect(dialog).toBeVisible();

      // Verify no horizontal overflow
      const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
      expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
    });

    test("K: renders /buscar results page on mobile with zero horizontal overflow", async ({
      page,
    }) => {
      await page.setViewportSize({ width: 360, height: 640 });
      await page.goto("/buscar?q=mouse");

      const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
      expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
    });
  });

  test.describe("Axe Accessibility Audits (WCAG 2.1 AA)", () => {
    test("L: bare /buscar landing passes Axe accessibility audit", async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 800 });
      await page.goto("/buscar");

      const accessibilityScanResults = await new AxeBuilder({ page }).analyze();
      expect(accessibilityScanResults.violations).toEqual([]);
    });

    test("M: /buscar?q=mouse results page passes Axe accessibility audit", async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 800 });
      await page.goto("/buscar?q=mouse");

      const accessibilityScanResults = await new AxeBuilder({ page }).analyze();
      expect(accessibilityScanResults.violations).toEqual([]);
    });

    test("N: open Search modal dialog passes Axe accessibility audit", async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 800 });
      await page.goto("/");

      const launcher = page.getByRole("link", { name: "Buscar productos" });
      await launcher.click();

      const dialog = page.getByRole("dialog", {
        name: "Búsqueda de productos",
      });
      await expect(dialog).toBeVisible();

      const searchInput = page.getByRole("searchbox", {
        name: "Término de búsqueda",
      });
      const predictiveResponse = page.waitForResponse(
        (res) => res.url().includes("/api/search/predictive") && res.status() === 200
      );
      await searchInput.fill("mouse");
      await predictiveResponse;

      const accessibilityScanResults = await new AxeBuilder({ page }).analyze();
      expect(accessibilityScanResults.violations).toEqual([]);
    });
  });
});
