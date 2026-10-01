// @vitest-environment jsdom
import React, { useRef } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StickyBuyBar } from "@/components/product-detail/sticky-buy-bar";

type ObserverCallback = (entries: Partial<IntersectionObserverEntry>[]) => void;
let notify: ObserverCallback = () => {};

class FakeIntersectionObserver {
  constructor(callback: ObserverCallback) {
    notify = callback;
  }
  observe() {}
  disconnect() {}
}

function Harness({ onAdd }: { onAdd: (button: HTMLElement) => void }) {
  const anchorRef = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button ref={anchorRef}>Añadir al carrito</button>
      <StickyBuyBar
        anchorRef={anchorRef}
        productName="ATK A9 Plus"
        variantTitle="Negro"
        thumbnailKey={null}
        priceCents={35900}
        label="Añadir al carrito"
        disabled={false}
        onAdd={onAdd}
      />
    </>
  );
}

function scrollAnchor(isIntersecting: boolean, top: number) {
  act(() => notify([{ isIntersecting, boundingClientRect: { top } as DOMRectReadOnly }]));
}

describe("StickyBuyBar", () => {
  beforeEach(() => {
    vi.stubGlobal("IntersectionObserver", FakeIntersectionObserver);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    document.documentElement.style.removeProperty("--floating-stack-offset");
  });

  it("stays hidden while the main button is visible or still below the fold", () => {
    render(<Harness onAdd={vi.fn()} />);
    expect(screen.queryByTestId("sticky-buy-bar")).toBeNull();

    scrollAnchor(false, 1200);
    expect(screen.queryByTestId("sticky-buy-bar")).toBeNull();
  });

  it("appears once the main button scrolls up out of view and lifts floating widgets", () => {
    render(<Harness onAdd={vi.fn()} />);
    scrollAnchor(false, -80);

    expect(screen.getByTestId("sticky-buy-bar").textContent).toContain("ATK A9 Plus");
    expect(screen.getByTestId("sticky-buy-bar").textContent).toContain("S/ 359.00");
    expect(document.documentElement.style.getPropertyValue("--floating-stack-offset")).toBe("88px");
  });

  it("adds to cart from the bar, handing over its own button for focus", () => {
    const onAdd = vi.fn();
    render(<Harness onAdd={onAdd} />);
    scrollAnchor(false, -80);

    const button = screen.getByTestId("sticky-buy-bar-add");
    fireEvent.click(button);
    expect(onAdd).toHaveBeenCalledWith(button);
  });
});
