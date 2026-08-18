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

  test.describe("Legacy Aliases & Cross-Category Redirection", () => {
    test("Legacy 1: /categorias/mouses?tipo=ultraligeros permanently redirects to canonical peso_max=45", async ({
      page,
    }) => {
      const response = await page.goto("/categorias/mouses?tipo=ultraligeros");
      expect(response).not.toBeNull();
      await expect(page).toHaveURL(/.*\/categorias\/mouses\?peso_max=45$/);
    });

    test("Legacy 2: /categorias/mouses?sub=skates permanently redirects to cross-category /categorias/accesorios?tipo_accesorio=skates", async ({
      page,
    }) => {
      const response = await page.goto("/categorias/mouses?sub=skates");
      expect(response).not.toBeNull();
      await expect(page).toHaveURL(/.*\/categorias\/accesorios\?tipo_accesorio=skates$/);
    });

    test("Legacy 3: mousepad canonical parameters do not loop", async ({ page }) => {
      const response = await page.goto("/categorias/mousepads?superficie=vidrio&tamano=xl");
      expect(response?.status()).toBe(200);
      await expect(page).toHaveURL(/.*\/categorias\/mousepads\?superficie=vidrio&tamano=xl$/);
    });
  });

  test.describe("Brand Surface Filtering", () => {
    test("G: brand page supports category filtering and conditional technical schema", async ({
      page,
    }) => {
      await page.goto("/marcas/marca-qa");

      const launcherBtn = page.getByTestId("filter-launcher-button");
      await launcherBtn.click();

      const catCheckbox = page.getByTestId("filter-category-mouses");
      await expect(catCheckbox).toBeVisible();
      await expect(page.locator('[data-testid^="filter-brand-"]')).toHaveCount(0);

      await catCheckbox.check();
      const applyBtn = page.getByTestId("apply-filters-button");
      await applyBtn.click();

      await expect(page).toHaveURL(/.*\/marcas\/marca-qa\?categoria=mouses$/);
      await expect(page.getByText("Categoría: Mouses Gaming")).toBeVisible();
    });
  });

  test.describe("Search Surface Filtering", () => {
    test("H: full search results page supports faceted filtering while preserving query", async ({
      page,
    }) => {
      await page.goto("/buscar?q=mouse");

      const launcherBtn = page.getByTestId("filter-launcher-button");
      await launcherBtn.click();

      const priceMin = page.getByTestId("price-min-input");
      await priceMin.fill("140");

      const applyBtn = page.getByTestId("apply-filters-button");
      await applyBtn.click();

      await expect(page).toHaveURL(/.*\/buscar\?q=mouse&precio_min=140$/);
      await expect(page.getByText("Precio: Desde S/ 140")).toBeVisible();
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
