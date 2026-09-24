// @vitest-environment jsdom

import fs from "node:fs";
import path from "node:path";
import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { AdminThemeToggle } from "@/components/admin/admin-theme-toggle";
import {
  ADMIN_THEME_ATTRIBUTE,
  ADMIN_THEME_BOOTSTRAP_SCRIPT,
  ADMIN_THEME_STORAGE_KEY,
} from "@/components/admin/use-admin-theme";
import { resolveActiveNavId } from "@/components/admin/admin-sidebar";
import type { AdminNavItem } from "@/lib/admin/types";

describe("Admin theme", () => {
  it("applies the stored theme before paint, falling back to the system one", () => {
    expect(ADMIN_THEME_BOOTSTRAP_SCRIPT).toContain(ADMIN_THEME_STORAGE_KEY);
    expect(ADMIN_THEME_BOOTSTRAP_SCRIPT).toContain(ADMIN_THEME_ATTRIBUTE);
    expect(ADMIN_THEME_BOOTSTRAP_SCRIPT).toContain("prefers-color-scheme: dark");
    // It must never throw where storage is blocked (private windows).
    expect(ADMIN_THEME_BOOTSTRAP_SCRIPT).toContain("catch");
  });

  it("exposes the toggle as a pressed-state control", async () => {
    const user = userEvent.setup();
    let toggled = 0;
    render(<AdminThemeToggle theme="dark" onToggle={() => (toggled += 1)} />);

    const button = screen.getByRole("button", { name: "Cambiar a tema claro" });
    expect(button.getAttribute("aria-pressed")).toBe("true");

    await user.click(button);
    expect(toggled).toBe(1);
  });

  it("defines every themed token in both light and dark", () => {
    const css = fs.readFileSync(
      path.resolve(__dirname, "../../src/styles/admin-theme.css"),
      "utf8"
    );
    const scope = (selector: string) => {
      const start = css.indexOf(selector);
      return css.slice(start, css.indexOf("}", start));
    };
    const light = scope('[data-admin-theme="light"]');
    const dark = scope('[data-admin-theme="dark"]');

    for (const token of [
      "--color-surface-canvas",
      "--color-surface-card",
      "--color-text-primary",
      "--color-text-secondary",
      "--color-border-subtle",
      "--admin-sidebar-surface",
      "--admin-header-surface",
      "--admin-shadow",
    ]) {
      expect(light, `falta ${token} en claro`).toContain(token);
      expect(dark, `falta ${token} en oscuro`).toContain(token);
    }
  });
});

describe("Admin sidebar", () => {
  const items = [
    { id: "overview", label: "Inicio", href: "/admin", iconName: "LayoutDashboard" },
    { id: "products", label: "Productos", href: "/admin/products", iconName: "Package" },
    {
      id: "ai",
      label: "Asistente IA",
      href: "/admin/products/ai-import",
      iconName: "Bot",
    },
  ] as AdminNavItem[];

  it("keeps the deepest matching entry active", () => {
    expect(resolveActiveNavId(items, "/admin")).toBe("overview");
    expect(resolveActiveNavId(items, "/admin/products")).toBe("products");
    expect(resolveActiveNavId(items, "/admin/products/123/story")).toBe("products");
    expect(resolveActiveNavId(items, "/admin/products/ai-import")).toBe("ai");
    // No entry owns settings here, so the admin root stays active.
    expect(resolveActiveNavId(items, "/admin/settings/ai")).toBe("overview");
    expect(resolveActiveNavId(items, "/cuenta")).toBeNull();
  });
});
