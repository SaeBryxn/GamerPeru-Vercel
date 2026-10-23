// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { AdminSidebar } from "@/components/admin/admin-sidebar";
import { CANONICAL_ADMIN_NAV_ITEMS } from "@/lib/admin/navigation";

describe("Admin sidebar collapse", () => {
  it("shows section titles and folders while expanded", () => {
    const onToggle = vi.fn();
    render(
      <AdminSidebar
        navItems={CANONICAL_ADMIN_NAV_ITEMS}
        currentPath="/admin/orders"
        collapsed={false}
        onToggleCollapsed={onToggle}
      />
    );

    expect(screen.getByRole("heading", { name: "Operaciones" })).toBeDefined();
    expect(screen.getByRole("button", { name: /Diseño de tienda/ })).toBeDefined();
    const toggle = screen.getByRole("button", { name: "Contraer menú lateral" });
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(toggle);
    expect(onToggle).toHaveBeenCalledOnce();
  });

  it("becomes an icon rail that keeps every destination reachable by name", () => {
    render(
      <AdminSidebar
        navItems={CANONICAL_ADMIN_NAV_ITEMS}
        currentPath="/admin/home"
        collapsed
        onToggleCollapsed={() => undefined}
      />
    );

    expect(screen.queryByRole("heading", { name: "Operaciones" })).toBeNull();
    expect(
      screen.getByRole("button", { name: "Expandir menú lateral" }).getAttribute("aria-expanded")
    ).toBe("false");
    for (const item of CANONICAL_ADMIN_NAV_ITEMS) {
      expect(screen.getByRole("link", { name: item.label })).toBeDefined();
    }
    expect(
      screen.getByRole("link", { name: "Home de la tienda" }).getAttribute("aria-current")
    ).toBe("page");
  });

  it("opens and closes folders, including the one that holds the current screen", () => {
    render(
      <AdminSidebar
        navItems={CANONICAL_ADMIN_NAV_ITEMS}
        currentPath="/admin/home"
        collapsed={false}
        onToggleCollapsed={() => undefined}
      />
    );

    const design = screen.getByRole("button", { name: /Diseño de tienda/ });
    const designList = document.getElementById(design.getAttribute("aria-controls")!)!;
    expect(design.getAttribute("aria-expanded")).toBe("true");
    expect(designList.hidden).toBe(false);
    fireEvent.click(design);
    expect(design.getAttribute("aria-expanded")).toBe("false");
    expect(designList.hidden).toBe(true);

    const engine = screen.getByRole("button", { name: /Motor IA/ });
    const engineList = document.getElementById(engine.getAttribute("aria-controls")!)!;
    expect(engineList.hidden).toBe(true);
    fireEvent.click(engine);
    expect(engineList.hidden).toBe(false);
    fireEvent.click(engine);
    expect(engineList.hidden).toBe(true);
  });
});
