import React from "react";
import { describe, it, expect } from "vitest";
import { renderToString } from "react-dom/server";
import { AdminError } from "@/components/admin/admin-error";
import { AdminForbidden } from "@/components/admin/admin-forbidden";

describe("GP-022 / BR1 — Admin Error & Security Rendering Tests", () => {
  it("proves AdminError never renders raw error.message or sensitive database strings", () => {
    const sensitiveError = new Error(
      "postgres://postgres:super_secret_password_12345@127.0.0.1:54322/postgres - Connection refused"
    );

    const html = renderToString(<AdminError error={sensitiveError} />);

    // Verify user-facing text is safe and generic
    expect(html).toContain("Servicio no disponible");
    expect(html).toContain(
      "No se pudo verificar tu autorización en este momento. Por seguridad, el acceso ha sido bloqueado."
    );

    // Verify sensitive details are strictly absent
    expect(html).not.toContain("super_secret_password_12345");
    expect(html).not.toContain("postgres://");
    expect(html).not.toContain("Connection refused");
  });

  it("proves AdminError includes safe navigation actions (retry link and storefront link)", () => {
    const html = renderToString(<AdminError />);

    expect(html).toContain('href="/admin"');
    expect(html).toContain('href="/"');
    expect(html).toContain("Reintentar");
    expect(html).toContain("Ir a la tienda");
  });

  it("proves AdminForbidden renders accessible denied state without privileged information", () => {
    const html = renderToString(<AdminForbidden email="customer@gamerperu.pe" />);

    expect(html).toContain("Acceso no autorizado");
    expect(html).toContain("customer@gamerperu.pe");
    expect(html).toContain('href="/cuenta"');
    expect(html).toContain('href="/"');
    expect(html).not.toContain("SUPER_ADMIN");
    expect(html).not.toContain("inventory:manage");
  });
});
