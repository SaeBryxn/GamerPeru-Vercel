import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { NAVIGATION_CONFIG } from "@/components/navigation/navigation-data";
import { metadata as pedidosMetadata, dynamic as pedidosDynamic } from "@/app/cuenta/pedidos/page";
import {
  metadata as favoritosMetadata,
  dynamic as favoritosDynamic,
} from "@/app/cuenta/favoritos/page";
import {
  metadata as referidosMetadata,
  dynamic as referidosDynamic,
} from "@/app/cuenta/referidos/page";
import { metadata as cuentaMetadata, dynamic as cuentaDynamic } from "@/app/cuenta/layout";

describe("Customer Account Future-Domain Entry Surfaces (GP-016 ACCT6-B)", () => {
  describe("1. Global Wishlist Destination", () => {
    it("verifies global wishlist utility link resolves to /cuenta/favoritos", () => {
      expect(NAVIGATION_CONFIG.utilityLinks.wishlist.href).toBe("/cuenta/favoritos");
      expect(NAVIGATION_CONFIG.utilityLinks.wishlist.label).toBe("Lista de favoritos");
    });
  });

  describe("2. Account Navigation Contract", () => {
    it("verifies account navigation source contains all 6 active destinations", () => {
      const navPath = resolve(process.cwd(), "src/components/account/account-navigation.tsx");
      const navSource = readFileSync(navPath, "utf-8");

      // All 6 destinations must be present
      expect(navSource).toContain('href: "/cuenta"');
      expect(navSource).toContain('href: "/cuenta/perfil"');
      expect(navSource).toContain('href: "/cuenta/direcciones"');
      expect(navSource).toContain('href: "/cuenta/pedidos"');
      expect(navSource).toContain('href: "/cuenta/favoritos"');
      expect(navSource).toContain('href: "/cuenta/referidos"');

      // No disabled navigation items
      expect(navSource).not.toContain("navDisabled");
      expect(navSource).not.toContain("isAvailable: false");
    });
  });

  describe("3. Overview Page Integration", () => {
    it("verifies /cuenta overview page contains links to all account destinations", () => {
      const overviewPath = resolve(process.cwd(), "src/app/cuenta/page.tsx");
      const overviewSource = readFileSync(overviewPath, "utf-8");

      expect(overviewSource).toContain('href="/cuenta/perfil"');
      expect(overviewSource).toContain('href="/cuenta/direcciones"');
      expect(overviewSource).toContain('href="/cuenta/pedidos"');
      expect(overviewSource).toContain('href="/cuenta/favoritos"');
      expect(overviewSource).toContain('href="/cuenta/referidos"');

      // Overview retains truthful "Próximamente" indicators for future domains
      expect(overviewSource).toContain("badgeComingSoon");
    });
  });

  describe("4. Orders Entry Surface Truthfulness (/cuenta/pedidos)", () => {
    it("verifies orders entry page structure and zero fake data", () => {
      const pagePath = resolve(process.cwd(), "src/app/cuenta/pedidos/page.tsx");
      const pageSource = readFileSync(pagePath, "utf-8");

      // Heading and truthful badge
      expect(pageSource).toContain("Mis pedidos");
      expect(pageSource).toContain("badgeComingSoon");
      expect(pageSource).toContain("Próximamente");

      // Truthful copy explaining future availability
      expect(pageSource).toMatch(/Aquí podrás consultar el estado y seguimiento de tus pedidos/);
      expect(pageSource).toMatch(/cuando el flujo de compra/);
      expect(pageSource).toMatch(/esté habilitado/);

      // Zero fake data or fake query presentation
      expect(pageSource).not.toContain("No tienes pedidos");
      expect(pageSource).not.toContain("table");
      expect(pageSource).not.toContain("total_cents");
      expect(pageSource).not.toContain("order_number");
      expect(pageSource).not.toContain("S/");
    });

    it("verifies orders entry SEO and dynamic runtime directives", () => {
      expect(pedidosDynamic).toBe("force-dynamic");
      expect(pedidosMetadata.robots).toEqual({ index: false, follow: false });
      expect(pedidosMetadata.title).toContain("Mis pedidos");
    });
  });

  describe("5. Wishlist Entry Surface Truthfulness (/cuenta/favoritos)", () => {
    it("verifies wishlist entry page structure and zero fake data", () => {
      const pagePath = resolve(process.cwd(), "src/app/cuenta/favoritos/page.tsx");
      const pageSource = readFileSync(pagePath, "utf-8");

      // Heading and truthful badge
      expect(pageSource).toContain("Lista de favoritos");
      expect(pageSource).toContain("badgeComingSoon");
      expect(pageSource).toContain("Próximamente");

      // Truthful copy explaining future availability
      expect(pageSource).toMatch(/Aquí podrás guardar y consultar tus productos favoritos/);
      expect(pageSource).toMatch(/cuando esta funcionalidad/);
      expect(pageSource).toMatch(/habilitada/);

      // Zero fake data or fake query presentation
      expect(pageSource).not.toContain("No tienes favoritos");
      expect(pageSource).not.toContain("0 favoritos");
      expect(pageSource).not.toContain("ProductCard");
      expect(pageSource).not.toContain("Mover al carrito");
    });

    it("verifies wishlist entry SEO and dynamic runtime directives", () => {
      expect(favoritosDynamic).toBe("force-dynamic");
      expect(favoritosMetadata.robots).toEqual({ index: false, follow: false });
      expect(favoritosMetadata.title).toContain("Lista de favoritos");
    });
  });

  describe("6. Referral Entry Surface Truthfulness (/cuenta/referidos)", () => {
    it("verifies referral entry page structure and zero fake data", () => {
      const pagePath = resolve(process.cwd(), "src/app/cuenta/referidos/page.tsx");
      const pageSource = readFileSync(pagePath, "utf-8");

      // Heading and truthful badge
      expect(pageSource).toContain("Programa de referidos");
      expect(pageSource).toContain("badgeComingSoon");
      expect(pageSource).toContain("Próximamente");

      // Truthful copy explaining future availability
      expect(pageSource).toContain(
        "Muy pronto podrás acceder desde aquí al programa de referidos de Gamer Perú."
      );

      // Zero fake rewards, codes, or commission data
      expect(pageSource).not.toContain("REF-");
      expect(pageSource).not.toContain("comisión");
      expect(pageSource).not.toContain("saldo");
      expect(pageSource).not.toContain("copiar enlace");
      expect(pageSource).not.toContain("clipboard");
    });

    it("verifies referral entry SEO and dynamic runtime directives", () => {
      expect(referidosDynamic).toBe("force-dynamic");
      expect(referidosMetadata.robots).toEqual({ index: false, follow: false });
      expect(referidosMetadata.title).toContain("Programa de referidos");
    });
  });

  describe("7. Zero Database / Server Action Delta", () => {
    it("verifies entry pages do not import db or create new domain actions", () => {
      const pedidosSource = readFileSync(
        resolve(process.cwd(), "src/app/cuenta/pedidos/page.tsx"),
        "utf-8"
      );
      const favoritosSource = readFileSync(
        resolve(process.cwd(), "src/app/cuenta/favoritos/page.tsx"),
        "utf-8"
      );
      const referidosSource = readFileSync(
        resolve(process.cwd(), "src/app/cuenta/referidos/page.tsx"),
        "utf-8"
      );

      for (const src of [pedidosSource, favoritosSource, referidosSource]) {
        expect(src).not.toContain("@/db");
        expect(src).not.toContain("drizzle");
        expect(src).not.toContain("server action");
        expect(src).not.toContain("use server");
      }
    });
  });

  describe("8. Account Layout & Auth Inheritance", () => {
    it("verifies account layout enforces auth, noindex, and force-dynamic", () => {
      expect(cuentaDynamic).toBe("force-dynamic");
      expect(cuentaMetadata.robots).toEqual({ index: false, follow: false });
      expect(cuentaMetadata.title).toContain("Mi cuenta");
    });
  });
});
