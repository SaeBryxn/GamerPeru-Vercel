import { expect, it } from "vitest";
import {
  formatDelta,
  formatUnits,
  stockStatus,
} from "@/app/admin/(protected)/inventario/inventory-display";

it("mantiene el cero y diferencia un dato ausente de un stock negativo", () => {
  expect(formatUnits(0)).toBe("0");
  expect(formatUnits(null)).toBe("Sin dato");
  expect(formatUnits(Number.NaN)).toBe("Sin dato");
  expect(stockStatus(-1, 5).key).toBe("review");
  expect(stockStatus(0, 5).key).toBe("out");
  expect(stockStatus(3, 3).key).toBe("low");
  expect(stockStatus(3, 2).key).toBe("available");
  expect(stockStatus(Number.NaN, 2).key).toBe("unknown");
});

it("muestra entradas, salidas y ausencia de cambio de forma explícita", () => {
  expect(formatDelta(3)).toBe("+3");
  expect(formatDelta(-2)).toBe("−2");
  expect(formatDelta(0)).toBe("0");
  expect(formatDelta(Number.NaN)).toBe("Sin dato");
});
