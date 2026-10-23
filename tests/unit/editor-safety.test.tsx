// @vitest-environment jsdom
import React, { useState } from "react";
import Link from "next/link";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { EditorSafetyProvider, useEditorDirty } from "@/components/admin/products/editor-safety";
import { productEditorVersion } from "@/lib/admin/catalog/editor-version";
vi.mock("@/lib/admin/catalog/version-actions", () => ({ getProductEditorVersionAction: vi.fn() }));
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
function Form() {
  const [value, setValue] = useState("");
  useEditorDirty("test", Boolean(value));
  return (
    <>
      <input aria-label="Editar" value={value} onChange={(event) => setValue(event.target.value)} />
      <Link href="/admin/products">Salir</Link>
    </>
  );
}
it("avisa al salir y conserva la edición si se cancela", () => {
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
  render(
    <EditorSafetyProvider productId="p" version="v1">
      <Form />
    </EditorSafetyProvider>
  );
  fireEvent.change(screen.getByLabelText("Editar"), { target: { value: "Sin guardar" } });
  fireEvent.click(screen.getByRole("link", { name: "Salir" }));
  expect(confirm).toHaveBeenCalledTimes(1);
  const unload = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(unload);
  expect(unload.defaultPrevented).toBe(true);
  expect(screen.getByDisplayValue("Sin guardar")).toBeTruthy();
});
it("la versión detecta cambios de variante y no depende del orden de las filas", () => {
  const product = { updatedAt: "2026-10-22T00:00:00Z" };
  const a = { id: "a", updatedAt: product.updatedAt };
  const b = { id: "b", updatedAt: product.updatedAt };
  expect(productEditorVersion(product, [a, b], [])).toBe(productEditorVersion(product, [b, a], []));
  expect(productEditorVersion(product, [a], [])).not.toBe(
    productEditorVersion(product, [{ ...a, updatedAt: "2026-10-23T00:00:00Z" }], [])
  );
});
