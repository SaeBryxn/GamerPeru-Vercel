import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test.describe("GP-013 — Faceted Discovery & Filtering E2E Suite", () => {
  test.describe("Category Surface Filtering & Drawer Interaction", () => {
    test("A: opens filter drawer, selects filters, applies and verifies canonical URL & products", async ({
      page,
    }) => {
      await page.goto("/categorias/mouses");

      const launcherBtn = page.getByTestId("filter-launcher-button");
      await expect(launcherBtn).toBeVisible();
      await expect(launcherBtn).toContainText("Filtros");

      await launcherBtn.click();
      const drawer = page.getByTestId("filter-drawer");
      await expect(drawer).toBeVisible();

      const brandCheckbox = page.getByTestId("filter-brand-marca-qa");
      await expect(brandCheckbox).toBeVisible();
      await brandCheckbox.check();

      const priceMin = page.getByTestId("price-min-input");
      await priceMin.fill("130");

      const shapeCheckbox = page.getByTestId("filter-tech-shape-ergonomico");
      if (await shapeCheckbox.isVisible()) {
        await shapeCheckbox.check();
      }

      const applyBtn = page.getByTestId("apply-filters-button");
      await applyBtn.click();

      await expect(drawer).toBeHidden();

      await expect(page).toHaveURL(/.*\/categorias\/mouses\?.*marca=marca-qa.*/);
      await expect(page).toHaveURL(/.*precio_min=130.*/);

      const brandChip = page.getByText("Marca: Marca QA");
      await expect(brandChip).toBeVisible();
      const priceChip = page.getByText("Precio: Desde S/ 130");
      await expect(priceChip).toBeVisible();

      await expect(launcherBtn).toContainText("Filtros");
      await expect(launcherBtn).toContainText("3");
    });

    test("B: removes applied filter chip and verifies URL updates", async ({ page }) => {
      await page.goto("/categorias/mouses?marca=marca-qa&precio_min=130");

      const brandChip = page.getByText("Marca: Marca QA");
      await expect(brandChip).toBeVisible();

      const removeBrandBtn = page.getByTestId("remove-filter-brand-marca-qa");
      await removeBrandBtn.click();

      await expect(page).toHaveURL(/.*\/categorias\/mouses\?precio_min=130$/);
      await expect(page.getByText("Marca: Marca QA")).toHaveCount(0);
      await expect(page.getByText("Precio: Desde S/ 130")).toBeVisible();
    });

    test("C: clicking 'Limpiar todos' resets to clean canonical category URL", async ({ page }) => {
      await page.goto("/categorias/mouses?marca=marca-qa&precio_min=130");

      const clearAllLink = page.getByTestId("clear-all-filters-link");
      await expect(clearAllLink).toBeVisible();
      await clearAllLink.click();

      await expect(page).toHaveURL(/.*\/categorias\/mouses$/);
      await expect(page.getByTestId("clear-all-filters-link")).toHaveCount(0);
    });

    test("D: sort dropdown changes ordering and canonical URL", async ({ page }) => {
      await page.goto("/categorias/mouses");

      const sortSelect = page.getByTestId("catalog-sort-select");
      await expect(sortSelect).toBeVisible();

      await sortSelect.selectOption("precio-menor");
      await expect(page).toHaveURL(/.*\/categorias\/mouses\?sort=precio-menor$/);

      await sortSelect.selectOption("nombre-asc");
      await expect(page).toHaveURL(/.*\/categorias\/mouses\?sort=nombre-asc$/);
    });

    test("E: renders filtered zero state when no products match filters", async ({ page }) => {
      await page.goto("/categorias/mouses?precio_max=10");

      const emptyState = page.getByTestId("filtered-empty-state");
      await expect(emptyState).toBeVisible();
      await expect(emptyState).toContainText("No encontramos productos con estos filtros.");

      const clearBtn = page.getByTestId("filtered-empty-clear-button");
      await expect(clearBtn).toBeVisible();
      await clearBtn.click();

      await expect(page).toHaveURL(/.*\/categorias\/mouses$/);
      const cards = page.getByTestId("product-card");
      await expect(cards).toHaveCount(12);
    });

    test("F: drawer keyboard Escape closes drawer and restores focus", async ({ page }) => {
      await page.goto("/categorias/mouses");

      const launcherBtn = page.getByTestId("filter-launcher-button");
      await launcherBtn.click();

      const drawer = page.getByTestId("filter-drawer");
      await expect(drawer).toBeVisible();

      await page.keyboard.press("Escape");
      await expect(drawer).toBeHidden();
      await expect(launcherBtn).toBeFocused();
    });

    test("F2: drawer close button closes drawer and restores focus", async ({ page }) => {
      await page.goto("/categorias/mouses");

      const launcherBtn = page.getByTestId("filter-launcher-button");
      await launcherBtn.click();

      const drawer = page.getByTestId("filter-drawer");
      await expect(drawer).toBeVisible();

      const closeBtn = page.getByTestId("close-filter-drawer-button");
      await closeBtn.click();
      await expect(drawer).toBeHidden();
      await expect(launcherBtn).toBeFocused();
    });
  });

  test.describe("Legacy Aliases & Exact HTTP 308 Permanent Redirections", () => {
    test("A: /categorias/mouses?tipo=ultraligeros returns HTTP 308 to /categorias/mouses?peso_max=45", async ({
      request,
    }) => {
      const response = await request.get("/categorias/mouses?tipo=ultraligeros", {
        maxRedirects: 0,
      });
      expect(response.status()).toBe(308);
      expect(response.headers()["location"]).toBe("/categorias/mouses?peso_max=45");
    });

    test("B: /categorias/mouses?sub=skates returns HTTP 308 to /categorias/accesorios?tipo_accesorio=skates", async ({
      request,
    }) => {
      const response = await request.get("/categorias/mouses?sub=skates", {
        maxRedirects: 0,
      });
      expect(response.status()).toBe(308);
      expect(response.headers()["location"]).toBe("/categorias/accesorios?tipo_accesorio=skates");
    });

    test("C: /categorias/teclados?formato=compactos returns HTTP 308 to /categorias/teclados?formato=60&formato=65", async ({
      request,
    }) => {
      const response = await request.get("/categorias/teclados?formato=compactos", {
        maxRedirects: 0,
      });
      expect(response.status()).toBe(308);
      expect(response.headers()["location"]).toBe("/categorias/teclados?formato=60&formato=65");
    });

    test("D: /categorias/teclados?formato=tkl-75 returns HTTP 308 to /categorias/teclados?formato=75&formato=tkl", async ({
      request,
    }) => {
      const response = await request.get("/categorias/teclados?formato=tkl-75", {
        maxRedirects: 0,
      });
      expect(response.status()).toBe(308);
      expect(response.headers()["location"]).toBe("/categorias/teclados?formato=75&formato=tkl");
    });

    test("E: /categorias/teclados?formato=magneticos returns HTTP 308 to /categorias/teclados?tipo_switch=magnetico", async ({
      request,
    }) => {
      const response = await request.get("/categorias/teclados?formato=magneticos", {
        maxRedirects: 0,
      });
      expect(response.status()).toBe(308);
      expect(response.headers()["location"]).toBe("/categorias/teclados?tipo_switch=magnetico");
    });

    test("F: /categorias/audio?tipo=iems returns HTTP 308 to /categorias/audio?tipo_audio=iem", async ({
      request,
    }) => {
      const response = await request.get("/categorias/audio?tipo=iems", {
        maxRedirects: 0,
      });
      expect(response.status()).toBe(308);
      expect(response.headers()["location"]).toBe("/categorias/audio?tipo_audio=iem");
    });

    test("G: /categorias/accesorios?tipo=skates returns HTTP 308 to /categorias/accesorios?tipo_accesorio=skates", async ({
      request,
    }) => {
      const response = await request.get("/categorias/accesorios?tipo=skates", {
        maxRedirects: 0,
      });
      expect(response.status()).toBe(308);
      expect(response.headers()["location"]).toBe("/categorias/accesorios?tipo_accesorio=skates");
    });

    test("Non-legacy mousepad canonical parameters resolve directly with 200 without redirect", async ({
      request,
    }) => {
      const response = await request.get("/categorias/mousepads?superficie=vidrio&tamano=xl", {
        maxRedirects: 0,
      });
      expect(response.status()).toBe(200);
    });
  });

  test.describe("Brand Surface Conditional Technical Facets", () => {
    test("G1: brand without category does not show technical facets", async ({ page }) => {
      await page.goto("/marcas/marca-qa");

      const launcherBtn = page.getByTestId("filter-launcher-button");
      await launcherBtn.click();

      await expect(page.getByTestId("filter-category-mouses")).toBeVisible();
      await expect(page.locator('[data-testid^="filter-tech-"]')).toHaveCount(0);
    });

    test("G2: brand with exactly one valid category shows technical facets", async ({ page }) => {
      await page.goto("/marcas/marca-qa?categoria=mouses");

      const launcherBtn = page.getByTestId("filter-launcher-button");
      await launcherBtn.click();

      await expect(page.getByTestId("filter-tech-shape-ergonomico")).toBeVisible();
      await expect(page.getByTestId("range-min-weight_g")).toBeVisible();
    });

    test("G3: brand with two categories hides technical facets", async ({ page }) => {
      await page.goto("/marcas/marca-qa?categoria=mouses&categoria=teclados");

      const launcherBtn = page.getByTestId("filter-launcher-button");
      await launcherBtn.click();

      await expect(page.locator('[data-testid^="filter-tech-"]')).toHaveCount(0);
    });

    test("G4: brand with invalid category redirects and prunes it", async ({ page }) => {
      await page.goto("/marcas/marca-qa?categoria=categoria-no-existe");
      await expect(page).toHaveURL(/.*\/marcas\/marca-qa$/);
    });

    test("G5: brand technical ENUM and NUMBER_RANGE filter updates products truthfully", async ({
      page,
    }) => {
      await page.goto("/marcas/marca-qa?categoria=mouses&forma=ergonomico&peso_max=45");
      const cards = page.getByTestId("product-card");
      const count = await cards.count();
      expect(count).toBeGreaterThan(0);
      expect(count).toBeLessThan(14);
    });
  });

  test.describe("Search Surface Conditional Technical Facets & Sort", () => {
    test("H1: search without category does not show technical facets", async ({ page }) => {
      await page.goto("/buscar?q=mouse");

      const launcherBtn = page.getByTestId("filter-launcher-button");
      await launcherBtn.click();

      await expect(page.getByTestId("filter-category-mouses")).toBeVisible();
      await expect(page.locator('[data-testid^="filter-tech-"]')).toHaveCount(0);
    });

    test("H2: search with 1 category shows technical facets and preserves q", async ({ page }) => {
      await page.goto("/buscar?q=mouse&categoria=mouses");

      const launcherBtn = page.getByTestId("filter-launcher-button");
      await launcherBtn.click();

      await expect(page.getByTestId("filter-tech-shape-ergonomico")).toBeVisible();

      const shapeCheckbox = page.getByTestId("filter-tech-shape-ergonomico");
      await shapeCheckbox.check();
      await page.getByTestId("apply-filters-button").click();

      await expect(page).toHaveURL(/.*\/buscar\?q=mouse&categoria=mouses&forma=ergonomico$/);
    });

    test("H3: search invalid brand/category is pruned while preserving q", async ({ page }) => {
      await page.goto("/buscar?q=mouse&marca=marca-invalida&categoria=categoria-invalida");
      await expect(page).toHaveURL(/.*\/buscar\?q=mouse$/);
    });

    test("H4: search explicit sorts preserve candidate search predicate", async ({ page }) => {
      const sorts = ["precio-menor", "precio-mayor", "nombre-asc", "nombre-desc", "recientes"];
      for (const sortVal of sorts) {
        await page.goto(`/buscar?q=mouse&sort=${sortVal}`);
        await expect(page.getByTestId("product-grid")).toBeVisible();
        const cards = page.getByTestId("product-card");
        const count = await cards.count();
        expect(count).toBeGreaterThan(0);
      }
    });
  });

  test.describe("Pagination, Boundary & Browser History Behavior", () => {
    test("P1: filtered page 2 preserves filters and sort", async ({ page }) => {
      await page.goto("/categorias/mouses?marca=marca-qa&sort=precio-menor&page=2");
      await expect(page.getByText("Marca: Marca QA")).toBeVisible();
      await expect(page.getByTestId("catalog-sort-select")).toHaveValue("precio-menor");
    });

    test("P2: applying filter or changing sort resets page to 1", async ({ page }) => {
      await page.goto("/categorias/mouses?marca=marca-qa&page=2");
      const sortSelect = page.getByTestId("catalog-sort-select");
      await sortSelect.selectOption("precio-menor");
      await expect(page).toHaveURL(/.*\/categorias\/mouses\?marca=marca-qa&sort=precio-menor$/);
    });

    test("P3: browser back and forward restore previous and next committed states", async ({
      page,
    }) => {
      await page.goto("/categorias/mouses");
      await page.goto("/categorias/mouses?marca=marca-qa");
      await expect(page.getByText("Marca: Marca QA")).toBeVisible();

      await page.goBack();
      await expect(page).toHaveURL(/.*\/categorias\/mouses$/);

      await page.goForward();
      await expect(page).toHaveURL(/.*\/categorias\/mouses\?marca=marca-qa$/);
    });

    test("P4: out of range page returns 404", async ({ page }) => {
      const response = await page.goto("/categorias/mouses?page=999");
      expect(response?.status()).toBe(404);
    });
  });

  test.describe("Domain Pruning Route Tests", () => {
    test("D1: unrepresented brand on category is pruned", async ({ page }) => {
      await page.goto("/categorias/mouses?marca=marca-no-representada");
      await expect(page).toHaveURL(/.*\/categorias\/mouses$/);
    });

    test("D2: unrepresented category on brand is pruned", async ({ page }) => {
      await page.goto("/marcas/marca-qa?categoria=categoria-no-representada");
      await expect(page).toHaveURL(/.*\/marcas\/marca-qa$/);
    });
  });

  test.describe("EligibleVariant Pricing & Product Invariant Evidence", () => {
    test("V1: filtered price reflects lowest active eligible variant and excludes non-matching products", async ({
      page,
    }) => {
      await page.goto("/categorias/mouses?precio_min=140&precio_max=200");
      const cards = page.getByTestId("product-card");
      const count = await cards.count();
      expect(count).toBeGreaterThan(0);

      for (let i = 0; i < count; i++) {
        const text = await cards.nth(i).innerText();
        expect(text).not.toContain("S/ 129.90");
      }
    });

    test("V2: zero-state on page 1 returns 200 HTTP status", async ({ page }) => {
      const response = await page.goto("/categorias/mouses?precio_min=9999");
      expect(response?.status()).toBe(200);
      await expect(page.getByTestId("filtered-empty-state")).toBeVisible();
    });
  });

  test.describe("Accessibility Audits (WCAG 2.1 AA)", () => {
    test("I: open filter drawer passes Axe accessibility audit", async ({ page }) => {
      await page.goto("/categorias/mouses");
      await page.getByTestId("filter-launcher-button").click();
      await expect(page.getByTestId("filter-drawer")).toBeVisible();

      const scanResults = await new AxeBuilder({ page })
        .include('[data-testid="filter-drawer"]')
        .analyze();
      expect(scanResults.violations).toEqual([]);
    });

    test("J: filtered category page with chips passes Axe accessibility audit", async ({
      page,
    }) => {
      await page.goto("/categorias/mouses?marca=marca-qa&precio_min=130");
      const scanResults = await new AxeBuilder({ page }).analyze();
      expect(scanResults.violations).toEqual([]);
    });

    test("K: filtered empty state passes Axe accessibility audit", async ({ page }) => {
      await page.goto("/categorias/mouses?precio_max=10");
      const scanResults = await new AxeBuilder({ page }).analyze();
      expect(scanResults.violations).toEqual([]);
    });
  });
});
