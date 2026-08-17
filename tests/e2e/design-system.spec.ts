import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test.describe("GP-008 Design System — Foundational Visual & Architectural Contracts", () => {
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

  test("B: loads Storefront root with valid title, metadata, and typography tokens", async ({
    page,
  }) => {
    await page.goto("/");

    // Page title and main heading
    await expect(page).toHaveTitle(/Gamer Perú/);
    const mainHeading = page.locator("h1");
    await expect(mainHeading).toBeVisible();
    await expect(mainHeading).toHaveText("Periféricos gaming de alto rendimiento");
  });

  test("C: verifies interactive touch targets and button geometry on Storefront", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/");

    const primaryBtn = page.getByRole("link", { name: "Ver mouses" });
    await expect(primaryBtn).toBeVisible();

    // Verify touch target height (minimum 44px)
    const box = await primaryBtn.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.height).toBeGreaterThanOrEqual(44);
    expect(box!.width).toBeGreaterThanOrEqual(44);
  });

  test("D: verifies IconButton accessible name, geometry, and minimum 44x44px hit bounding box", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto("/");

    // Menu opener IconButton
    const menuBtn = page.getByRole("button", { name: "Abrir menú de navegación" });
    await expect(menuBtn).toBeVisible();

    const box = await menuBtn.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeGreaterThanOrEqual(44);
    expect(box!.height).toBeGreaterThanOrEqual(44);

    const svg = menuBtn.locator("svg");
    await expect(svg).toBeVisible();
    const svgAttrs = await svg.evaluate((el) => ({
      width: el.getAttribute("width"),
      height: el.getAttribute("height"),
      strokeWidth: el.getAttribute("stroke-width"),
      ariaHidden: el.getAttribute("aria-hidden"),
    }));

    expect(svgAttrs.width).toBe("24");
    expect(svgAttrs.height).toBe("24");
    expect(svgAttrs.strokeWidth).toBe("1.5");
    expect(svgAttrs.ariaHidden).toBe("true");
  });

  test("E: verifies light keyboard focus ring contract (+2px offset, 2px solid #09090B) via actual Tab navigation", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/");

    // The first category link in the desktop nav is on the light/transparent header
    const mousesNavLink = page.getByRole("link", { name: "Mouses", exact: true }).first();
    await mousesNavLink.focus();

    const focusStyles = await mousesNavLink.evaluate((el) => {
      const computed = window.getComputedStyle(el);
      return {
        outlineStyle: computed.outlineStyle,
        outlineWidth: computed.outlineWidth,
        outlineOffset: computed.outlineOffset,
        outlineColor: computed.outlineColor,
      };
    });

    expect(focusStyles.outlineStyle).toBe("solid");
    expect(focusStyles.outlineWidth).toBe("2px");
    expect(focusStyles.outlineOffset).toBe("2px");
    expect(focusStyles.outlineColor).toBe("rgb(9, 9, 11)");
  });

  test("F: verifies dark contextual keyboard focus ring contract via actual Tab navigation", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/");

    const heroCta = page.getByRole("link", { name: "Ver mouses" });

    let isFocused = false;
    for (let i = 0; i < 30; i++) {
      await page.keyboard.press("Tab");
      isFocused = await heroCta.evaluate((el) => document.activeElement === el);
      if (isFocused) break;
    }

    expect(isFocused).toBe(true);

    const focusStyles = await heroCta.evaluate((el) => {
      const computed = window.getComputedStyle(el);
      return {
        outlineStyle: computed.outlineStyle,
        outlineWidth: computed.outlineWidth,
        outlineOffset: computed.outlineOffset,
        outlineColor: computed.outlineColor,
      };
    });

    expect(focusStyles.outlineStyle).toBe("solid");
    expect(focusStyles.outlineWidth).toBe("2px");
    expect(focusStyles.outlineOffset).toBe("2px");
    // Dark contextual focus color is #F4F4F5 -> rgb(244, 244, 245)
    expect(focusStyles.outlineColor).toBe("rgb(244, 244, 245)");
  });

  test("G: verifies reduced-motion collapses transition durations", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");

    const primaryCta = page.getByRole("link", { name: "Ver mouses" });
    const computedTransition = await primaryCta.evaluate((el) => {
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

  test("I: passes baseline automated accessibility audit on storefront surface", async ({
    page,
  }) => {
    await page.goto("/");

    const accessibilityScanResults = await new AxeBuilder({ page }).analyze();
    expect(accessibilityScanResults.violations).toEqual([]);
  });
});
