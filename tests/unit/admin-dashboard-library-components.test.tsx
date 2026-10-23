// @vitest-environment jsdom
import React from "react";
import { fireEvent, render, screen, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type * as FramerMotion from "framer-motion";
import { AnimatedCounter } from "@/components/admin/dashboard/animated-counter";
import { SpotlightLink } from "@/components/admin/dashboard/spotlight-link";

const preferences = vi.hoisted(() => ({ reduced: false, fine: true }));
vi.mock("framer-motion", async (importOriginal) => ({
  ...(await importOriginal<typeof FramerMotion>()),
  useReducedMotion: () => preferences.reduced,
}));

afterEach(() => {
  cleanup();
  preferences.reduced = false;
  preferences.fine = true;
  vi.unstubAllGlobals();
});

describe("Animated Counter del dashboard", () => {
  it("entrega el valor real en el HTML inicial y mantiene las ruedas fuera del nombre accesible", () => {
    const markup = renderToStaticMarkup(<AnimatedCounter value={7} valueTestId="count" />);
    expect(markup).toContain('data-testid="count">7</span>');
    expect(markup).toContain('aria-hidden="true"');
    // El servidor ya coloca la rueda en el 7: no hay una cuenta inicial desde cero.
    expect(markup).toMatch(/transform:translateY\(-63\.63/);
  });

  it("actualiza el texto accesible al aumentar, disminuir y cambiar de cantidad de dígitos", () => {
    const { rerender } = render(<AnimatedCounter value={999} valueTestId="count" />);
    expect(screen.getByTestId("count").textContent).toBe("999");
    rerender(<AnimatedCounter value={1000} valueTestId="count" />);
    expect(screen.getByTestId("count").textContent).toBe("1,000");
    rerender(<AnimatedCounter value={0} valueTestId="count" />);
    expect(screen.getByTestId("count").textContent).toBe("0");
  });

  it("con movimiento reducido cambia el valor y la posición de la rueda inmediatamente", () => {
    preferences.reduced = true;
    const { rerender, container } = render(<AnimatedCounter value={2} valueTestId="count" />);
    rerender(<AnimatedCounter value={5} valueTestId="count" />);
    expect(screen.getByTestId("count").textContent).toBe("5");
    const wheel = container.querySelector('[data-slot="animated-counter-digit"]')
      ?.lastElementChild as HTMLElement;
    expect(wheel.style.transform).toContain("translateY(-45.45");
  });
});

describe("Spotlight Card adaptada a navegación", () => {
  function setPointerPreferences() {
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: query.includes("prefers-reduced-motion") ? preferences.reduced : preferences.fine,
    }));
    // JSDOM no implementa PointerEvent. El navegador sí; conservamos pointerType en la prueba.
    vi.stubGlobal(
      "PointerEvent",
      class extends MouseEvent {
        pointerType: string;
        constructor(type: string, init: PointerEventInit) {
          super(type, init);
          this.pointerType = init.pointerType ?? "mouse";
        }
      }
    );
  }

  it("conserva el enlace y responde al puntero sin transformar su contenido", () => {
    setPointerPreferences();
    render(<SpotlightLink href="/admin/products">Gestionar productos</SpotlightLink>);
    const link = screen.getByRole("link", { name: "Gestionar productos" });
    expect(link.getAttribute("href")).toBe("/admin/products");
    const light = link.querySelector('[aria-hidden="true"]')?.firstElementChild as HTMLElement;
    fireEvent.pointerMove(link, { pointerType: "mouse", clientX: 160, clientY: 180 });
    expect(light.style.opacity).toBe("1");
    expect(light.style.transform).toBe("translate(40px, 60px)");
    expect(link.style.transform).toBe("");
    fireEvent.pointerLeave(link);
    expect(light.style.opacity).toBe("0");
  });

  it.each(["movimiento reducido", "puntero táctil"])("no sigue el cursor con %s", (preference) => {
    setPointerPreferences();
    preferences.reduced = preference === "movimiento reducido";
    preferences.fine = preference !== "puntero táctil";
    render(<SpotlightLink href="/admin/orders">Ver pedidos</SpotlightLink>);
    const link = screen.getByRole("link", { name: "Ver pedidos" });
    const light = link.querySelector('[aria-hidden="true"]')?.firstElementChild as HTMLElement;
    fireEvent.pointerMove(link, { pointerType: "mouse", clientX: 100 });
    expect(light.style.transform).toBe("");
    link.focus();
    expect(document.activeElement).toBe(link);
  });
});
