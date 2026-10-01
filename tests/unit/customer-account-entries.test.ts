import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { NAVIGATION_CONFIG } from "@/components/navigation/navigation-data";
import {
  metadata as pedidosMetadata,
  dynamic as pedidosDynamic,
} from "@/app/(storefront)/cuenta/pedidos/page";
import {
  metadata as cuentaMetadata,
  dynamic as cuentaDynamic,
} from "@/app/(storefront)/cuenta/layout";

describe("Customer Account Future-Domain Entry Surfaces (GP-016 ACCT6-B)", () => {
  describe("1. No Wishlist Utility Without A Backend", () => {
    it("keeps the header free of a wishlist entry", () => {
      expect(Object.keys(NAVIGATION_CONFIG.utilityLinks)).toEqual(["search", "account", "cart"]);
      const footerHrefs = NAVIGATION_CONFIG.footerColumns.flatMap((column) =>
        column.links.map((link) => link.href)
      );
      expect(footerHrefs).not.toContain("/cuenta/favoritos");
      expect(footerHrefs).not.toContain("/cuenta/referidos");
    });
  });

  describe("2. Account Navigation Contract", () => {
    it("lists only destinations that exist", () => {
      const navPath = resolve(process.cwd(), "src/components/account/account-navigation.tsx");
      const navSource = readFileSync(navPath, "utf-8");

      for (const href of [
        "/cuenta",
        "/cuenta/perfil",
        "/cuenta/direcciones",
        "/cuenta/pedidos",
        "/cuenta/favoritos",
      ]) {
        expect(navSource).toContain(`href: "${href}"`);
      }
      expect(navSource).not.toContain("/cuenta/referidos");
      expect(navSource).not.toContain("comingSoon");
      expect(navSource).not.toContain("navDisabled");
    });
  });

  describe("3. Overview Page Integration", () => {
    it("links every existing account destination and nothing that is not built", () => {
      const overviewPath = resolve(process.cwd(), "src/app/(storefront)/cuenta/page.tsx");
      const overviewSource = readFileSync(overviewPath, "utf-8");

      for (const href of ["/cuenta/perfil", "/cuenta/direcciones", "/cuenta/pedidos"]) {
        expect(overviewSource).toContain(`href: "${href}"`);
      }
      expect(overviewSource).not.toContain("/cuenta/favoritos");
      expect(overviewSource).not.toContain("/cuenta/referidos");
      expect(overviewSource).not.toContain("comingSoon");
    });
  });

  describe("4. Orders History (/cuenta/pedidos)", () => {
    it("reads the signed-in customer's orders through the account reader, never fake data", () => {
      const pagePath = resolve(process.cwd(), "src/app/(storefront)/cuenta/pedidos/page.tsx");
      const pageSource = readFileSync(pagePath, "utf-8");

      expect(pageSource).toContain("Mis pedidos");
      expect(pageSource).toContain("getCurrentCustomerOrders");
      expect(pageSource).toContain('redirect("/auth/login")');
      // Rendering stays in components; the page holds no order literals of its own.
      expect(pageSource).not.toContain("total_cents");
      expect(pageSource).not.toContain("order_number");
      expect(pageSource).not.toContain("S/");
    });

    it("links each order only to the owner-authorized confirmation page", () => {
      const cardSource = readFileSync(
        resolve(process.cwd(), "src/components/account/order-card.tsx"),
        "utf-8"
      );
      expect(cardSource).toContain("/checkout/confirmacion/");
      expect(cardSource).toContain("encodeURIComponent(order.orderNumber)");
    });

    it("verifies orders entry SEO and dynamic runtime directives", () => {
      expect(pedidosDynamic).toBe("force-dynamic");
      expect(pedidosMetadata.robots).toEqual({ index: false, follow: false });
      expect(pedidosMetadata.title).toContain("Mis pedidos");
    });
  });

  describe("5. Unbuilt Domains Have No Routes", () => {
    it("serves no placeholder page for referrals", () => {
      const pagePath = resolve(process.cwd(), "src/app/(storefront)/cuenta/referidos/page.tsx");
      expect(existsSync(pagePath)).toBe(false);
    });

    it("backs the favorites page with the customer's real wishlist", () => {
      const pagePath = resolve(process.cwd(), "src/app/(storefront)/cuenta/favoritos/page.tsx");
      const source = readFileSync(pagePath, "utf-8");
      expect(source).toContain("getCurrentWishlistProducts");
      expect(source).toContain('redirect("/auth/login")');
    });
  });

  describe("7. Zero Database / Server Action Delta", () => {
    it("verifies entry pages do not import db or create new domain actions", () => {
      const pedidosSource = readFileSync(
        resolve(process.cwd(), "src/app/(storefront)/cuenta/pedidos/page.tsx"),
        "utf-8"
      );
      for (const src of [pedidosSource]) {
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
