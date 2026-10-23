// @vitest-environment jsdom
import React from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { CopyPaymentValue } from "@/components/checkout/copy-payment-value";
import { PurchaseProgress } from "@/components/checkout/purchase-progress";
import { ReservationNotice } from "@/components/checkout/reservation-notice";
import { PdpSizeGuide } from "@/components/product-detail/pdp-size-guide";
import { pdpSizeSchema } from "@/lib/catalog/product-pdp-config";
import { useVisiblePolling } from "@/lib/hooks/use-visible-polling";
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it("marca la verificación terminada únicamente después de confirmar el pago", () => {
  const { rerender, container } = render(<PurchaseProgress current={4} />);
  expect(screen.getByText("Verificación").closest("li")?.getAttribute("aria-current")).toBe("step");
  rerender(<PurchaseProgress current={4} completed />);
  expect(container.querySelector("[aria-current]")).toBeNull();
  expect(container.querySelectorAll('[data-done="true"]')).toHaveLength(4);
});
it("copia el valor y confirma el resultado sin confundirlo con un pago", async () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal("navigator", { clipboard: { writeText } });
  render(<CopyPaymentValue value="125.50" label="monto" />);
  fireEvent.click(screen.getByRole("button", { name: "Copiar monto" }));
  await waitFor(() => expect(writeText).toHaveBeenCalledWith("125.50"));
  expect(screen.getByRole("status").textContent).toBe("monto copiado");
});
it("deja de prometer una reserva al llegar al vencimiento del servidor", () => {
  vi.useFakeTimers();
  render(<ReservationNotice expiresAt="2026-10-22T20:00:02Z" serverNow="2026-10-22T20:00:00Z" />);
  expect(screen.getByText(/Quedan 0 min 2 s/)).toBeTruthy();
  act(() => {
    vi.advanceTimersByTime(3000);
  });
  expect(screen.getByText(/La reserva venció/)).toBeTruthy();
});
it("compara medidas parciales sin inventar un rango de mano", () => {
  render(
    <PdpSizeGuide sizes={[pdpSizeSchema.parse({ name: "Mini", lengthMm: 110, weight: "45 g" })]} />
  );
  expect(screen.queryByRole("slider")).toBeNull();
  expect(screen.getByText("110 mm")).toBeTruthy();
  expect(screen.getByText(/no tiene rangos de mano documentados/)).toBeTruthy();
});
it("reduce consultas cuando nada cambia y cancela el temporizador al salir", async () => {
  vi.useFakeTimers();
  const poll = vi.fn().mockResolvedValue(false);
  const { unmount } = renderHook(() => useVisiblePolling("order", true, poll, 1000, 4000));
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1000);
  });
  expect(poll).toHaveBeenCalledTimes(1);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1000);
  });
  expect(poll).toHaveBeenCalledTimes(1);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1000);
  });
  expect(poll).toHaveBeenCalledTimes(2);
  unmount();
  await vi.advanceTimersByTimeAsync(10000);
  expect(poll).toHaveBeenCalledTimes(2);
});
