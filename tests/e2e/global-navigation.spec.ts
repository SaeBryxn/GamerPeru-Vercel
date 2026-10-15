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

    // Main content target must be visible in viewport
    const mainContent = page.locator("#main-content");
    await expect(mainContent).toBeVisible();
  });

  test("B: renders the site header as the topmost element, with no announcement bar", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/");

    await expect(page.locator("aside[aria-label='Anuncio']")).toHaveCount(0);
    const header = await page.locator("header").first().boundingBox();
    expect(header).not.toBeNull();
    expect(header!.y).toBe(0);
  });

  test("C: verifies Desktop Header 68px height, non-sticky positioning, and BrandMark link", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/");

    const header = page.locator("header");
    await expect(header).toBeVisible();

    const box = await header.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.height).toBe(68);

    const position = await header.evaluate((el) => window.getComputedStyle(el).position);
    expect(position).toBe("relative");

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
    const accountLink = page.getByRole("link", { name: "Mi cuenta" });
    const cartLink = page.getByRole("link", { name: "Carrito de compras" });

    // No wishlist entry until favorites have a backend.
    await expect(page.getByRole("link", { name: "Lista de favoritos" })).toHaveCount(0);

    const links = [searchLink, accountLink, cartLink];

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

  test("E: verifies primary navigation semantic destination links exist and MegaMenu is full-width", async ({
    page,
  }) => {
    // 1. Check at 1280px standard desktop
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/");

    const nav = page.locator("nav[aria-label='Navegación principal']");
    await expect(nav).toBeVisible();

    // Visible category destinations must exist in the initial DOM (inside closed panels or as plain links)
    for (const href of ["/categorias/mouses", "/categorias/mousepads"]) {
      await expect(nav.locator(`a[href='${href}']`).first()).toBeAttached();
    }

    // Entries hidden by default (Teclados, IEM) must not leak links anywhere in the primary nav
    for (const href of ["/categorias/teclados", "/categorias/audio"]) {
      await expect(nav.locator(`a[href^='${href}']`)).toHaveCount(0);
    }
    await expect(nav.getByRole("button", { name: "Teclados", exact: true })).toHaveCount(0);

    // Open MegaMenu and assert full-width geometry relative to SiteHeader
    const header = page.locator("header");
    const mousesDisclosureBtn = page.getByRole("button", {
      name: "Mouses",
      exact: true,
    });
    await expect(mousesDisclosureBtn).toBeVisible();

    await mousesDisclosureBtn.click();
    await expect(mousesDisclosureBtn).toHaveAttribute("aria-expanded", "true");

    const megaMenuPanel = page.locator("#mega-menu-mouses");
    await expect(megaMenuPanel).toBeVisible();

    const headerBox = await header.boundingBox();
    const panelBox = await megaMenuPanel.boundingBox();

    expect(headerBox).not.toBeNull();
    expect(panelBox).not.toBeNull();

    // Panel width must equal header width within 1px tolerance
    expect(Math.abs(panelBox!.width - headerBox!.width)).toBeLessThanOrEqual(1);
    // Panel x must equal header x within 1px tolerance
    expect(Math.abs(panelBox!.x - headerBox!.x)).toBeLessThanOrEqual(1);

    // 2. Check at 1536px wide desktop
    await page.setViewportSize({ width: 1536, height: 900 });
    await page.goto("/");
    const mousesDisclosureBtnWide = page.getByRole("button", {
      name: "Mouses",
      exact: true,
    });
    await mousesDisclosureBtnWide.click();
    const widePanel = page.locator("#mega-menu-mouses");
    await expect(widePanel).toBeVisible();
    const wideHeader = page.locator("header");
    const wideHeaderBox = await wideHeader.boundingBox();
    const widePanelBox = await widePanel.boundingBox();
    expect(wideHeaderBox).not.toBeNull();
    expect(widePanelBox).not.toBeNull();
    expect(Math.abs(widePanelBox!.width - wideHeaderBox!.width)).toBeLessThanOrEqual(1);
    expect(Math.abs(widePanelBox!.x - wideHeaderBox!.x)).toBeLessThanOrEqual(1);
  });

  test("F: verifies real keyboard MegaMenu activation, sub-link Tab traversal, and Escape focus return", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/");

    const disclosureBtn = page.getByRole("button", {
      name: "Mouses",
      exact: true,
    });
    await expect(disclosureBtn).toBeVisible();

    // Focus the disclosure button using Tab navigation
    let isBtnFocused = false;
    for (let i = 0; i < 10; i++) {
      await page.keyboard.press("Tab");
      isBtnFocused = await disclosureBtn.evaluate((el) => document.activeElement === el);
      if (isBtnFocused) break;
    }
    expect(isBtnFocused).toBe(true);

    // Open MegaMenu using keyboard Enter
    await page.keyboard.press("Enter");
    await expect(disclosureBtn).toHaveAttribute("aria-expanded", "true");

    const panel = page.locator("#mega-menu-mouses");
    await expect(panel).toBeVisible();

    // Tab into the first MegaMenu link; the shelf is catalog-driven, so assert by position
    await page.keyboard.press("Tab");
    await expect(panel.getByRole("link").first()).toBeFocused();

    // Close MegaMenu using keyboard Escape
    await page.keyboard.press("Escape");
    await expect(disclosureBtn).toHaveAttribute("aria-expanded", "false");
    await expect(panel).toBeHidden();

    // Focus must return to the disclosure button
    await expect(disclosureBtn).toBeFocused();
  });

  test("G: verifies Mobile Header, Menu opener target, exact 320px Drawer width, and focus return", async ({
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

    // Assert exact 320px drawer panel width at 360px viewport
    const drawerPanel = dialog.locator("div[role='document']");
    const panelBox = await drawerPanel.boundingBox();
    expect(panelBox).not.toBeNull();
    expect(Math.abs(panelBox!.width - 320)).toBeLessThanOrEqual(1);

    // Assert no horizontal overflow on document
    const hasHorizontalOverflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth > document.documentElement.clientWidth;
    });
    expect(hasHorizontalOverflow).toBe(false);

    // Close button (IconButton size="md" -> 20x20 / 1.5 inside >=44x44 target)
    const closeBtn = dialog.getByRole("button", { name: "Cerrar navegación" });
    await expect(closeBtn).toBeVisible();
    const closeBox = await closeBtn.boundingBox();
    expect(closeBox).not.toBeNull();
    expect(Math.round(closeBox!.width)).toBeGreaterThanOrEqual(44);
    expect(Math.round(closeBox!.height)).toBeGreaterThanOrEqual(44);

    const closeSvg = closeBtn.locator("svg");
    const closeSvgAttrs = await closeSvg.evaluate((el) => ({
      width: el.getAttribute("width"),
      height: el.getAttribute("height"),
      strokeWidth: el.getAttribute("stroke-width"),
    }));
    expect(closeSvgAttrs.width).toBe("20");
    expect(closeSvgAttrs.height).toBe("20");
    expect(closeSvgAttrs.strokeWidth).toBe("1.5");

    // 1. Close drawer via Escape key -> assert focus returns to Menu opener
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(menuBtn).toBeFocused();

    // 2. Re-open drawer and close via explicit close button -> assert focus returns to Menu opener
    await menuBtn.click();
    await expect(dialog).toBeVisible();
    await closeBtn.click();
    await expect(dialog).toBeHidden();
    await expect(menuBtn).toBeFocused();
  });

  test("H: verifies Mobile Drawer backdrop click, inside click safety, and modal Tab containment", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto("/");

    const menuBtn = page.getByRole("button", { name: "Abrir menú de navegación" });
    await menuBtn.click();

    const dialog = page.locator("dialog[aria-label='Menú de navegación móvil']");
    await expect(dialog).toBeVisible();

    // 1. Clicking inside drawerPanel does NOT close the drawer
    await page.mouse.click(100, 200);
    await expect(dialog).toBeVisible();

    // 2. Modal Tab containment: confirm background interactive elements never receive focus
    for (let i = 0; i < 8; i++) {
      await page.keyboard.press("Tab");
      const hasBackgroundFocus = await page.evaluate(() => {
        const el = document.activeElement;
        if (!el) return false;
        const main = document.querySelector("#main-content");
        const header = document.querySelector("header");
        const inMain = main?.contains(el) ?? false;
        const drawer = document.querySelector("dialog[aria-label='Menú de navegación móvil']");
        const inHeader = (header?.contains(el) && !drawer?.contains(el)) ?? false;
        return inMain || inHeader;
      });
      expect(hasBackgroundFocus).toBe(false);
    }

    // 3. Clicking on backdrop (x: 345, y: 300 on 360px viewport) closes the drawer
    await page.mouse.click(345, 300);
    await expect(dialog).toBeHidden();
    await expect(menuBtn).toBeFocused();
  });

  test("I: verifies exact breakpoint boundary behavior (1023px mobile vs 1024px desktop)", async ({
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

  test("J: verifies responsive viewports with zero horizontal overflow", async ({ page }) => {
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

  test("K: verifies SiteFooter columns, social row, Yape/Plin note and landmarks", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");

    const footer = page.locator("footer[aria-label='Pie de página']");
    await expect(footer).toBeVisible();

    // Fixture runs expose no navigation catalog, so only the static columns remain; product and
    // brand columns must drop out rather than invent entries
    const columns = footer.locator("[class*='footerColumn']");
    await expect(columns).toHaveCount(2);

    for (const title of ["Explorar", "Tu cuenta"]) {
      await expect(footer.getByRole("heading", { name: title, level: 3 })).toBeVisible();
    }
    await expect(footer.getByRole("heading", { name: "Marcas", level: 3 })).toHaveCount(0);
    await expect(footer.locator("a[href^='/productos/']")).toHaveCount(0);

    // Social profiles row
    await expect(footer.locator("ul[aria-label='Redes sociales de Gamer Perú']")).toBeVisible();

    // Payment representation stays truthful and unauthorized methods never appear
    const payments = footer.locator("ul[aria-label='Métodos de pago aceptados']");
    await expect(payments.getByText("Yape", { exact: true })).toBeVisible();
    await expect(payments.getByText("Plin", { exact: true })).toBeVisible();
    await expect(payments.locator("li")).toHaveCount(2);
    await expect(footer.getByText("Pagos en soles")).toBeVisible();

    await expect(footer.getByText("© 2026 Experiencia Creativa SAC")).toBeVisible();
    await expect(footer.locator("ul[aria-label='Información legal']")).toBeVisible();
  });

  test("L: verifies reduced-motion collapses MobileDrawer transition duration to <= 0.01ms", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto("/");

    const menuBtn = page.getByRole("button", { name: "Abrir menú de navegación" });
    await menuBtn.click();

    const dialog = page.locator("dialog[aria-label='Menú de navegación móvil']");
    await expect(dialog).toBeVisible();

    const drawerPanel = dialog.locator("div[role='document']");
    const transitionDuration = await drawerPanel.evaluate((el) => {
      const computed = window.getComputedStyle(el);
      return computed.transitionDuration;
    });

    // In reduced motion, transition duration is 0.01ms (evaluates to 0.00001s or <= 0.001s)
    const durationSeconds = parseFloat(transitionDuration);
    expect(durationSeconds).toBeLessThanOrEqual(0.001);

    // Close via escape
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
  });

  test("M: passes automated Axe accessibility audit on storefront shell", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/");

    const accessibilityScanResults = await new AxeBuilder({ page }).analyze();
    expect(accessibilityScanResults.violations).toEqual([]);
  });

  test("N: passes automated Axe accessibility audit on open desktop MegaMenu", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/");

    const mousesDisclosureBtn = page.getByRole("button", {
      name: "Mouses",
      exact: true,
    });
    await mousesDisclosureBtn.click();

    const megaMenuPanel = page.locator("#mega-menu-mouses");
    await expect(megaMenuPanel).toBeVisible();

    const accessibilityScanResults = await new AxeBuilder({ page }).analyze();
    expect(accessibilityScanResults.violations).toEqual([]);
  });

  test("O: passes automated Axe accessibility audit on open mobile drawer", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto("/");

    const menuBtn = page.getByRole("button", { name: "Abrir menú de navegación" });
    await menuBtn.click();

    const dialog = page.locator("dialog[aria-label='Menú de navegación móvil']");
    await expect(dialog).toBeVisible();

    const accessibilityScanResults = await new AxeBuilder({ page }).analyze();
    expect(accessibilityScanResults.violations).toEqual([]);
  });

  test("P: verifies desktop navigation disclosure triggers meet minimum 44x44px bounding box at 1024px and 1280px without overflow", async ({
    page,
  }) => {
    const viewports = [
      { width: 1024, height: 800 },
      { width: 1280, height: 800 },
    ];

    const categoryNames = ["Productos", "Mouses", "Mousepads", "Soporte", "Software"];

    for (const vp of viewports) {
      await page.setViewportSize(vp);
      await page.goto("/");

      // Verify zero horizontal overflow
      const hasHorizontalOverflow = await page.evaluate(() => {
        return document.documentElement.scrollWidth > document.documentElement.clientWidth;
      });
      expect(hasHorizontalOverflow).toBe(false);

      // Verify BrandMark is visible
      const brandMark = page.locator("header").getByRole("link", { name: /Gamer Perú/ });
      await expect(brandMark).toBeVisible();

      // Verify each disclosure trigger meets minimum 44x44px interactive bounding box
      for (const name of categoryNames) {
        const trigger = page.getByRole("button", {
          name,
          exact: true,
        });
        await expect(trigger).toBeVisible();

        const box = await trigger.boundingBox();
        expect(box).not.toBeNull();
        expect(box!.width).toBeGreaterThanOrEqual(44);
        expect(box!.height).toBeGreaterThanOrEqual(44);
      }

      // Verify utility links remain visible
      const searchLink = page.getByRole("link", { name: "Buscar productos" });
      const cartLink = page.getByRole("link", { name: "Carrito de compras" });
      await expect(searchLink).toBeVisible();
      await expect(cartLink).toBeVisible();
    }
  });

  test("Q: verifies computed keyboard focus outline contract (+2px offset, 2px solid #09090B) via actual Tab navigation", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/");

    // Tab through skip link and brand mark into the first primary category trigger
    const categoryLink = page
      .locator("nav[aria-label='Navegación principal']")
      .getByRole("button", { name: "Productos", exact: true });

    let isLinkFocused = false;
    for (let i = 0; i < 10; i++) {
      await page.keyboard.press("Tab");
      isLinkFocused = await categoryLink.evaluate((el) => document.activeElement === el);
      if (isLinkFocused) break;
    }
    expect(isLinkFocused).toBe(true);

    // Assert computed focus styles on category link
    const linkFocusStyles = await categoryLink.evaluate((el) => {
      const computed = window.getComputedStyle(el);
      return {
        outlineWidth: computed.outlineWidth,
        outlineStyle: computed.outlineStyle,
        outlineOffset: computed.outlineOffset,
        outlineColor: computed.outlineColor,
      };
    });

    expect(linkFocusStyles.outlineWidth).toBe("2px");
    expect(linkFocusStyles.outlineStyle).toBe("solid");
    expect(linkFocusStyles.outlineOffset).toBe("2px");
    // Canonical light focus color #09090B -> rgb(9, 9, 11)
    expect(linkFocusStyles.outlineColor).toBe("rgb(9, 9, 11)");

    // Tab into the next category trigger
    await page.keyboard.press("Tab");

    const disclosureBtn = page.getByRole("button", {
      name: "Mouses",
      exact: true,
    });
    await expect(disclosureBtn).toBeFocused();

    // Assert computed focus styles on disclosure button
    const btnFocusStyles = await disclosureBtn.evaluate((el) => {
      const computed = window.getComputedStyle(el);
      return {
        outlineWidth: computed.outlineWidth,
        outlineStyle: computed.outlineStyle,
        outlineOffset: computed.outlineOffset,
        outlineColor: computed.outlineColor,
      };
    });

    expect(btnFocusStyles.outlineWidth).toBe("2px");
    expect(btnFocusStyles.outlineStyle).toBe("solid");
    expect(btnFocusStyles.outlineOffset).toBe("2px");
    expect(btnFocusStyles.outlineColor).toBe("rgb(9, 9, 11)");
  });
});
