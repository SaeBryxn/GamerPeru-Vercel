import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test.describe("GP-009 Global Navigation — Shell, Header, MegaMenu, Drawer & Accessibility", () => {
  test("A: verifies SkipLink visibility on keyboard Tab and navigation to #main-content", async ({
    page,
  }) => {
    await page.goto("/");

    // Tab once to focus the skip link
    await page.keyboard.press("Tab");

    const skipLink = page.getByRole("link", { name: "Saltar al contenido principal" });
    await expect(skipLink).toBeFocused();

    // Trigger skip link
    await page.keyboard.press("Enter");

    // Main content target must receive focus or be active in viewport
    const mainContent = page.locator("#main-content");
    await expect(mainContent).toBeVisible();
  });

  test("B: verifies AnnouncementBar dimensions, typography (13px Inter 500), and colors", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/");

    const announcement = page.locator("aside[aria-label='Anuncio']");
    await expect(announcement).toBeVisible();

    const box = await announcement.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.height).toBe(36);

    const styles = await announcement.evaluate((el) => {
      const computed = window.getComputedStyle(el);
      return {
        fontSize: computed.fontSize,
        fontWeight: computed.fontWeight,
        color: computed.color,
        backgroundColor: computed.backgroundColor,
      };
    });

    expect(styles.fontSize).toBe("13px");
    expect(styles.fontWeight).toBe("500");
    // #F4F4F5 -> rgb(244, 244, 245)
    expect(styles.color).toBe("rgb(244, 244, 245)");
    // #09090B -> rgb(9, 9, 11)
    expect(styles.backgroundColor).toBe("rgb(9, 9, 11)");
  });

  test("C: verifies Desktop Header 64px height, sticky positioning, and BrandMark link", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/");

    const header = page.locator("header");
    await expect(header).toBeVisible();

    const box = await header.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.height).toBe(64);

    const position = await header.evaluate((el) => window.getComputedStyle(el).position);
    expect(position).toBe("sticky");

    const brandMark = header.getByRole("link", { name: /Gamer Perú/ });
    await expect(brandMark).toBeVisible();
    await expect(brandMark).toHaveAttribute("href", "/");
  });

  test("D: verifies desktop utility links have minimum 44x44px target and 24x24 / 1.5 SVG geometry", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/");

    const searchLink = page.getByRole("link", { name: "Buscar productos" });
    const wishlistLink = page.getByRole("link", { name: "Lista de favoritos" });
    const accountLink = page.getByRole("link", { name: "Mi cuenta" });
    const cartLink = page.getByRole("link", { name: "Carrito de compras" });

    const links = [searchLink, wishlistLink, accountLink, cartLink];

    for (const link of links) {
      await expect(link).toBeVisible();
      const box = await link.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.width).toBeGreaterThanOrEqual(44);
      expect(box!.height).toBeGreaterThanOrEqual(44);

      const svg = link.locator("svg");
      await expect(svg).toBeVisible();
      const svgAttrs = await svg.evaluate((el) => ({
        width: el.getAttribute("width"),
        height: el.getAttribute("height"),
        strokeWidth: el.getAttribute("stroke-width"),
      }));

      expect(svgAttrs.width).toBe("24");
      expect(svgAttrs.height).toBe("24");
      expect(svgAttrs.strokeWidth).toBe("1.5");
    }
  });

  test("E: verifies Desktop MegaMenu disclosure, keyboard Escape close, and focus restoration", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/");

    const mousesBtn = page.getByRole("button", { name: "Mouses" });
    await expect(mousesBtn).toBeVisible();
    await expect(mousesBtn).toHaveAttribute("aria-expanded", "false");

    // Click to open mega menu
    await mousesBtn.click();
    await expect(mousesBtn).toHaveAttribute("aria-expanded", "true");

    const panel = page.locator("#mega-menu-mouses");
    await expect(panel).toBeVisible();
    await expect(panel.getByText("Ultraligeros (< 45g)")).toBeVisible();
    await expect(panel.getByText("WLMOUSE")).toBeVisible();

    // Press Escape to close mega menu
    await page.keyboard.press("Escape");
    await expect(mousesBtn).toHaveAttribute("aria-expanded", "false");
    await expect(mousesBtn).toBeFocused();
  });

  test("F: verifies Mobile Header, Menu opener target (>=44x44, 24px icon), and Drawer interaction", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto("/");

    // Desktop nav must be hidden
    const desktopNav = page.locator("nav[aria-label='Navegación principal']");
    await expect(desktopNav).toBeHidden();

    // Menu opener button
    const menuBtn = page.getByRole("button", { name: "Abrir menú de navegación" });
    await expect(menuBtn).toBeVisible();

    const menuBox = await menuBtn.boundingBox();
    expect(menuBox).not.toBeNull();
    expect(menuBox!.width).toBeGreaterThanOrEqual(44);
    expect(menuBox!.height).toBeGreaterThanOrEqual(44);

    const menuSvg = menuBtn.locator("svg");
    const menuSvgAttrs = await menuSvg.evaluate((el) => ({
      width: el.getAttribute("width"),
      height: el.getAttribute("height"),
      strokeWidth: el.getAttribute("stroke-width"),
    }));
    expect(menuSvgAttrs.width).toBe("24");
    expect(menuSvgAttrs.height).toBe("24");
    expect(menuSvgAttrs.strokeWidth).toBe("1.5");

    // Open drawer
    await menuBtn.click();

    const dialog = page.locator("dialog[aria-label='Menú de navegación móvil']");
    await expect(dialog).toBeVisible();

    // Close button (IconButton size="md" -> 20x20 / 1.5 inside >=44x44 target)
    const closeBtn = dialog.getByRole("button", { name: "Cerrar navegación" });
    await expect(closeBtn).toBeVisible();
    const closeBox = await closeBtn.boundingBox();
    expect(closeBox).not.toBeNull();
    expect(closeBox!.width).toBeGreaterThanOrEqual(44);
    expect(closeBox!.height).toBeGreaterThanOrEqual(44);

    const closeSvg = closeBtn.locator("svg");
    const closeSvgAttrs = await closeSvg.evaluate((el) => ({
      width: el.getAttribute("width"),
      height: el.getAttribute("height"),
      strokeWidth: el.getAttribute("stroke-width"),
    }));
    expect(closeSvgAttrs.width).toBe("20");
    expect(closeSvgAttrs.height).toBe("20");
    expect(closeSvgAttrs.strokeWidth).toBe("1.5");

    // Close drawer via Escape key
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
  });

  test("G: verifies exact breakpoint boundary behavior (1023px mobile vs 1024px desktop)", async ({
    page,
  }) => {
    // 1023px: Mobile composition
    await page.setViewportSize({ width: 1023, height: 800 });
    await page.goto("/");

    const mobileMenuBtn = page.getByRole("button", { name: "Abrir menú de navegación" });
    await expect(mobileMenuBtn).toBeVisible();
    const desktopNav = page.locator("nav[aria-label='Navegación principal']");
    await expect(desktopNav).toBeHidden();

    // 1024px: Desktop composition
    await page.setViewportSize({ width: 1024, height: 800 });
    await expect(mobileMenuBtn).toBeHidden();
    await expect(desktopNav).toBeVisible();
  });

  test("H: verifies responsive viewports with zero horizontal overflow", async ({ page }) => {
    const viewports = [
      { width: 360, height: 640 }, // Compact Mobile
      { width: 768, height: 1024 }, // Tablet
      { width: 1023, height: 800 }, // Max Mobile/Tablet Breakpoint
      { width: 1024, height: 800 }, // Min Desktop Breakpoint
      { width: 1280, height: 800 }, // Desktop Standard
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

  test("I: verifies SiteFooter 4-column structure, Yape/Plin payment representation, and landmarks", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/");

    const footer = page.locator("footer[aria-label='Pie de página']");
    await expect(footer).toBeVisible();

    await expect(footer.getByText("Explorar Catálogo")).toBeVisible();
    await expect(footer.getByText("Marcas Oficiales")).toBeVisible();
    await expect(footer.getByText("Atención al Cliente")).toBeVisible();
    await expect(footer.getByText("Métodos de Pago")).toBeVisible();

    await expect(footer.getByText("YAPE")).toBeVisible();
    await expect(footer.getByText("PLIN")).toBeVisible();
    await expect(footer.getByText("TRANSFERENCIA")).toBeVisible();

    await expect(
      footer.getByText("© 2026 Gamer Perú. Todos los derechos reservados.")
    ).toBeVisible();
  });

  test("J: passes automated Axe accessibility audit on storefront shell", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/");

    const accessibilityScanResults = await new AxeBuilder({ page }).analyze();
    expect(accessibilityScanResults.violations).toEqual([]);
  });

  test("K: passes automated Axe accessibility audit on open mobile drawer", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto("/");

    const menuBtn = page.getByRole("button", { name: "Abrir menú de navegación" });
    await menuBtn.click();

    const dialog = page.locator("dialog[aria-label='Menú de navegación móvil']");
    await expect(dialog).toBeVisible();

    const accessibilityScanResults = await new AxeBuilder({ page }).analyze();
    expect(accessibilityScanResults.violations).toEqual([]);
  });
});
