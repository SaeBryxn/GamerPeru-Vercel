import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test.describe("GP-008 Design System — Primitives, Accessibility & Visual Contracts", () => {
  test("A: verifies zero runtime network requests to Google Fonts", async ({ page }) => {
    const googleFontRequests: string[] = [];

    page.on("request", (request) => {
      const url = request.url();
      if (url.includes("fonts.googleapis.com") || url.includes("fonts.gstatic.com")) {
        googleFontRequests.push(url);
      }
    });

    const response = await page.goto("/");
    expect(response?.status()).toBe(200);

    // Ensure no runtime Google Fonts CSS or font files were fetched over the network
    expect(googleFontRequests).toEqual([]);
  });

  test("B: loads root design system demonstration with valid typography and metadata", async ({
    page,
  }) => {
    await page.goto("/");

    // Page title and main heading
    await expect(page).toHaveTitle(/Gamer Perú/);
    const mainHeading = page.locator("h1");
    await expect(mainHeading).toHaveText("Gamer Perú");
    await expect(mainHeading).toHaveClass(/type-display/);

    // GP-008 status badge
    const badge = page.locator("#gp008-badge");
    await expect(badge).toHaveText("Design System Initialized (GP-008)");
  });

  test("C: verifies Button variants, interactive touch targets, and disabled states", async ({
    page,
  }) => {
    await page.goto("/");

    const primaryBtn = page.getByRole("button", { name: "Comprar Ahora" });
    await expect(primaryBtn).toBeVisible();

    // Verify touch target height (minimum 44px)
    const box = await primaryBtn.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.height).toBeGreaterThanOrEqual(44);

    const disabledBtn = page.getByRole("button", { name: "Deshabilitado" });
    await expect(disabledBtn).toBeDisabled();
    await expect(disabledBtn).toHaveAttribute("aria-disabled", "true");
  });

  test("D: verifies IconButton accessible name and minimum 44x44px hit bounding box", async ({
    page,
  }) => {
    await page.goto("/");

    const iconBtn = page.getByRole("button", { name: "Buscar periféricos" });
    await expect(iconBtn).toBeVisible();

    const box = await iconBtn.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeGreaterThanOrEqual(44);
    expect(box!.height).toBeGreaterThanOrEqual(44);
  });

  test("E: verifies TextField label association, description, and aria-invalid error state", async ({
    page,
  }) => {
    await page.goto("/");

    // Email field with label and description
    const emailInput = page.getByLabel("Correo Electrónico");
    await expect(emailInput).toBeVisible();
    await expect(emailInput).toHaveAttribute("required", "");
    await expect(emailInput).toHaveAttribute(
      "aria-describedby",
      expect.stringContaining("demo-email-description")
    );

    // Error field with error message and aria-invalid
    const couponInput = page.getByLabel("Código de Cupón");
    await expect(couponInput).toBeVisible();
    await expect(couponInput).toHaveAttribute("aria-invalid", "true");
    await expect(couponInput).toHaveAttribute(
      "aria-describedby",
      expect.stringContaining("demo-error-error")
    );

    const errorAlert = page.locator("#demo-error-error");
    await expect(errorAlert).toHaveText("El código ingresado no es válido o ha expirado.");
  });

  test("F: verifies StatusBadge color-independent visible text labels", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByText("En Stock (Lima)")).toBeVisible();
    await expect(page.getByText("Últimas 2 Unidades")).toBeVisible();
    await expect(page.getByText("Agotado")).toBeVisible();
    await expect(page.getByText("Preventa Confirmada")).toBeVisible();
    await expect(page.getByText("Procesando")).toBeVisible();
  });

  test("G: verifies reduced-motion collapses transition durations", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");

    const primaryBtn = page.getByRole("button", { name: "Comprar Ahora" });
    const computedTransition = await primaryBtn.evaluate((el) => {
      return window.getComputedStyle(el).transitionDuration;
    });

    // In reduced motion, transition duration is effectively 0.01ms / 0s / 1e-05s
    expect(["0s", "0.00001s", "0.01ms", "1e-05s"]).toContain(computedTransition);
  });

  test("H: verifies responsive viewports with zero horizontal overflow", async ({ page }) => {
    const viewports = [
      { width: 360, height: 640 }, // Compact Mobile
      { width: 768, height: 1024 }, // Tablet
      { width: 1280, height: 800 }, // Desktop
      { width: 1536, height: 900 }, // Wide Desktop
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

  test("I: passes baseline automated accessibility audit on design system surface", async ({
    page,
  }) => {
    await page.goto("/");

    const accessibilityScanResults = await new AxeBuilder({ page }).analyze();
    expect(accessibilityScanResults.violations).toEqual([]);
  });
});
