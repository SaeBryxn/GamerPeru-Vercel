import React, { createRef } from "react";
import { describe, it, expect } from "vitest";
import { renderToString } from "react-dom/server";
import { AdminHeader } from "@/components/admin/admin-header";

describe("GP-022 / BR1 — AdminHeader Mobile Trigger & ARIA Contract Tests", () => {
  it("renders menu trigger button with aria-expanded='false' when closed", () => {
    const triggerRef = createRef<HTMLButtonElement>();
    const html = renderToString(
      <AdminHeader
        onOpenMobileNav={() => {}}
        isMobileNavOpen={false}
        triggerRef={triggerRef}
        theme="light"
        onToggleTheme={() => {}}
      />
    );

    expect(html).toContain('aria-label="Abrir menú de navegación"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('aria-controls="admin-mobile-nav"');
  });

  it("renders menu trigger button with aria-expanded='true' when open", () => {
    const triggerRef = createRef<HTMLButtonElement>();
    const html = renderToString(
      <AdminHeader
        onOpenMobileNav={() => {}}
        isMobileNavOpen={true}
        triggerRef={triggerRef}
        theme="light"
        onToggleTheme={() => {}}
      />
    );

    expect(html).toContain('aria-label="Abrir menú de navegación"');
    expect(html).toContain('aria-expanded="true"');
    expect(html).toContain('aria-controls="admin-mobile-nav"');
  });

  it("renders a navigable breadcrumb trail with a back link to the level above", () => {
    const html = renderToString(
      <AdminHeader
        onOpenMobileNav={() => {}}
        isMobileNavOpen={false}
        crumbs={[
          { label: "Inicio", href: "/admin" },
          { label: "Productos", href: "/admin/products" },
          { label: "Nuevo", href: null },
        ]}
        theme="light"
        onToggleTheme={() => {}}
      />
    );

    expect(html).toContain('aria-label="Ruta de navegación"');
    // Every level above the current screen is a link back; the current one is marked.
    expect(html).toContain('href="/admin"');
    expect(html).toContain('href="/admin/products"');
    expect(html).toMatch(/aria-current="page"[^>]*>Nuevo</);
    expect(html).toContain('aria-label="Volver a Productos"');
  });
});
