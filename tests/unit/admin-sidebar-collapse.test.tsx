// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { AdminSidebar } from "@/components/admin/admin-sidebar";
import { CANONICAL_ADMIN_NAV_ITEMS } from "@/lib/admin/navigation";

const staff = {
  authUserId: "018f0000-0000-7000-8000-000000000001",
  email: "admin@gamerperu.pe",
  roles: ["SUPER_ADMIN" as const],
  permissions: new Set<never>(),
};

describe("Admin sidebar collapse", () => {
  it("shows section titles and folders while expanded", () => {
    const onToggle = vi.fn();
    render(
      <AdminSidebar
        navItems={CANONICAL_ADMIN_NAV_ITEMS}
        staff={staff}
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
        staff={staff}
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
});
