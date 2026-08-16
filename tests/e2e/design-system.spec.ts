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

    const primaryBtn = page.getByRole("button", { name: "Acción primaria" });
    await expect(primaryBtn).toBeVisible();

    // Verify touch target height (minimum 44px)
    const box = await primaryBtn.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.height).toBeGreaterThanOrEqual(44);

    const disabledBtn = page.getByRole("button", { name: "Deshabilitado" });
    await expect(disabledBtn).toBeDisabled();
    await expect(disabledBtn).toHaveAttribute("aria-disabled", "true");
  });

  test("D: verifies IconButton accessible name, geometry, and minimum 44x44px hit bounding box", async ({
    page,
  }) => {
    await page.goto("/");

    const iconBtn = page.getByRole("button", { name: "Buscar elementos" });
    await expect(iconBtn).toBeVisible();

    const box = await iconBtn.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeGreaterThanOrEqual(44);
    expect(box!.height).toBeGreaterThanOrEqual(44);

    const svg = iconBtn.locator("svg");
    await expect(svg).toBeVisible();
    const svgAttrs = await svg.evaluate((el) => ({
      width: el.getAttribute("width"),
      height: el.getAttribute("height"),
      strokeWidth: el.getAttribute("stroke-width"),
      ariaHidden: el.getAttribute("aria-hidden"),
    }));

    // md size is 20px with 1.5px stroke-width and aria-hidden="true"
    expect(svgAttrs.width).toBe("20");
    expect(svgAttrs.height).toBe("20");
    expect(svgAttrs.strokeWidth).toBe("1.5");
    expect(svgAttrs.ariaHidden).toBe("true");
  });

  test("E: verifies TextField label association, description, and aria-invalid error state", async ({
    page,
  }) => {
    await page.goto("/");

    // Field with label and description
    const sampleInput = page.getByLabel("Campo de ejemplo");
    await expect(sampleInput).toBeVisible();
    await expect(sampleInput).toHaveAttribute("required", "");
    await expect(sampleInput).toHaveAttribute(
      "aria-describedby",
      expect.stringContaining("demo-field-description")
    );

    // Error field with error message and aria-invalid
    const errorInput = page.getByLabel("Campo con error");
    await expect(errorInput).toBeVisible();
    await expect(errorInput).toHaveAttribute("aria-invalid", "true");
    await expect(errorInput).toHaveAttribute(
      "aria-describedby",
      expect.stringContaining("demo-error-error")
    );

    const errorAlert = page.locator("#demo-error-error");
    await expect(errorAlert).toHaveText("Mensaje de error descriptivo asociado al campo.");
  });

  test("F: verifies StatusBadge color-independent visible text labels", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByText("Estado correcto", { exact: true })).toBeVisible();
    await expect(page.getByText("Advertencia", { exact: true })).toBeVisible();
    await expect(page.getByText("Error", { exact: true })).toBeVisible();
    await expect(page.getByText("Información", { exact: true })).toBeVisible();
    await expect(page.getByText("Neutral", { exact: true })).toBeVisible();
  });

  test("G: verifies light keyboard focus ring contract via actual Tab navigation", async ({
    page,
  }) => {
    await page.goto("/");

    // Traverse into the document using keyboard Tab presses
    const primaryBtn = page.getByRole("button", { name: "Acción primaria" });

    let isFocused = false;
    for (let i = 0; i < 10; i++) {
      await page.keyboard.press("Tab");
      isFocused = await primaryBtn.evaluate((el) => document.activeElement === el);
      if (isFocused) break;
    }

    expect(isFocused).toBe(true);

    const focusStyles = await primaryBtn.evaluate((el) => {
      const computed = window.getComputedStyle(el);
      return {
        outlineStyle: computed.outlineStyle,
        outlineWidth: computed.outlineWidth,
        outlineColor: computed.outlineColor,
      };
    });

    expect(focusStyles.outlineStyle).toBe("solid");
    expect(focusStyles.outlineWidth).toBe("2px");
    // Light focus color is #09090B -> rgb(9, 9, 11)
    expect(focusStyles.outlineColor).toBe("rgb(9, 9, 11)");
  });

  test("H: verifies dark contextual keyboard focus ring contract (#F4F4F5) via actual Tab navigation", async ({
    page,
  }) => {
    await page.goto("/");

    // Continue Tab navigation to reach the button inside the dark surface card
    const darkBtn = page.locator("#dark-surface-btn");

    let isFocused = false;
    for (let i = 0; i < 25; i++) {
      await page.keyboard.press("Tab");
      isFocused = await darkBtn.evaluate((el) => document.activeElement === el);
      if (isFocused) break;
    }

    expect(isFocused).toBe(true);

    const focusStyles = await darkBtn.evaluate((el) => {
      const computed = window.getComputedStyle(el);
      return {
        outlineStyle: computed.outlineStyle,
        outlineWidth: computed.outlineWidth,
        outlineColor: computed.outlineColor,
      };
    });

    expect(focusStyles.outlineStyle).toBe("solid");
    expect(focusStyles.outlineWidth).toBe("2px");
    // Dark focus color is #F4F4F5 -> rgb(244, 244, 245)
    expect(focusStyles.outlineColor).toBe("rgb(244, 244, 245)");
  });

  test("I: verifies canonical Button icon slot geometry (20x20 / 1.5 stroke)", async ({ page }) => {
    await page.goto("/");

    const primaryBtn = page.getByRole("button", { name: "Acción primaria" });
    const svg = primaryBtn.locator("svg");
    await expect(svg).toBeVisible();

    const svgAttrs = await svg.evaluate((el) => ({
      width: el.getAttribute("width"),
      height: el.getAttribute("height"),
      strokeWidth: el.getAttribute("stroke-width"),
      ariaHidden: el.getAttribute("aria-hidden"),
    }));

    expect(svgAttrs.width).toBe("20");
    expect(svgAttrs.height).toBe("20");
    expect(svgAttrs.strokeWidth).toBe("1.5");
    expect(svgAttrs.ariaHidden).toBe("true");
  });

  test("J: verifies reduced-motion collapses transition durations", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");

    const primaryBtn = page.getByRole("button", { name: "Acción primaria" });
    const computedTransition = await primaryBtn.evaluate((el) => {
      return window.getComputedStyle(el).transitionDuration;
    });

    // In reduced motion, transition duration is effectively 0.01ms / 0s / 1e-05s
    expect(["0s", "0.00001s", "0.01ms", "1e-05s"]).toContain(computedTransition);
  });

  test("K: verifies responsive viewports with zero horizontal overflow", async ({ page }) => {
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

  test("L: passes baseline automated accessibility audit on design system surface", async ({
    page,
  }) => {
    await page.goto("/");

    const accessibilityScanResults = await new AxeBuilder({ page }).analyze();
    expect(accessibilityScanResults.violations).toEqual([]);
  });
});
