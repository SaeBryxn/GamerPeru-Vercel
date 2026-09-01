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
        pageTitle="Inicio"
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
        pageTitle="Inicio"
      />
    );

    expect(html).toContain('aria-label="Abrir menú de navegación"');
    expect(html).toContain('aria-expanded="true"');
    expect(html).toContain('aria-controls="admin-mobile-nav"');
  });

  it("renders breadcrumb title and navigation landmark properly", () => {
    const html = renderToString(
      <AdminHeader onOpenMobileNav={() => {}} isMobileNavOpen={false} pageTitle="Catálogo" />
    );

    expect(html).toContain('aria-label="Ruta de navegación"');
    expect(html).toContain("Administración");
    expect(html).toContain("Catálogo");
  });
});
