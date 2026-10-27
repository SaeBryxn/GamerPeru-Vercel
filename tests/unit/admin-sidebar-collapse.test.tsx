// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { AdminSidebar } from "@/components/admin/admin-sidebar";
import { CANONICAL_ADMIN_NAV_ITEMS } from "@/lib/admin/navigation";

describe("Admin sidebar collapse", () => {
  it("shows the four section titles while expanded", () => {
    const onToggle = vi.fn();
    render(
      <AdminSidebar
        navItems={CANONICAL_ADMIN_NAV_ITEMS}
        currentPath="/admin/orders"
        collapsed={false}
        onToggleCollapsed={onToggle}
      />
    );

    expect(
      screen.getAllByRole("heading", { level: 2 }).map((heading) => heading.textContent)
    ).toEqual(["Operaciones", "Catálogo", "Tienda online", "Administración"]);
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
      screen.getByRole("link", { name: "Página de inicio" }).getAttribute("aria-current")
    ).toBe("page");
  });

  it("shows pending counts next to their destination and a dot on the rail", () => {
    const badges = { ordersToPrepare: 3, paymentsToReview: 0, pendingReviews: 120 };
    const { rerender } = render(
      <AdminSidebar
        navItems={CANONICAL_ADMIN_NAV_ITEMS}
        currentPath="/admin"
        collapsed={false}
        onToggleCollapsed={() => undefined}
        badges={badges}
      />
    );

    expect(screen.getByRole("link", { name: "Pedidos, 3 pendientes" })).toBeDefined();
    expect(screen.getByRole("link", { name: "Reseñas, 120 pendientes" })).toBeDefined();
    // A zero count says nothing.
    expect(screen.getByRole("link", { name: "Pagos" })).toBeDefined();

    rerender(
      <AdminSidebar
        navItems={CANONICAL_ADMIN_NAV_ITEMS}
        currentPath="/admin"
        collapsed
        onToggleCollapsed={() => undefined}
        badges={badges}
      />
    );
    expect(screen.getByRole("link", { name: "Pedidos, 3 pendientes" })).toBeDefined();
  });
});
