// @vitest-environment jsdom
import React, { useState } from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AdminAccountMenu } from "@/components/admin/admin-account-menu";
import { EditorSafetyProvider, useEditorDirty } from "@/components/admin/products/editor-safety";

const mocks = vi.hoisted(() => ({ signOut: vi.fn() }));
vi.mock("@/lib/auth/actions", () => ({ signOutAction: mocks.signOut }));
vi.mock("@/lib/admin/catalog/version-actions", () => ({ getProductEditorVersionAction: vi.fn() }));
vi.mock("@/lib/hooks/use-visible-polling", () => ({ useVisiblePolling: vi.fn() }));

beforeEach(() => {
  mocks.signOut.mockResolvedValue({
    success: false,
    error: "No pudimos cerrar la sesión. Inténtalo nuevamente.",
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

function Account() {
  const [theme, setTheme] = useState<"light" | "dark">("light");
  return (
    <AdminAccountMenu
      email="catalogo@example.test"
      roles={["ADMIN_CATALOG"]}
      theme={theme}
      onToggleTheme={() => setTheme((value) => (value === "light" ? "dark" : "light"))}
    />
  );
}
function DirtyField() {
  const [value, setValue] = useState("");
  useEditorDirty("test", !!value);
  return (
    <input
      aria-label="Nombre del producto"
      value={value}
      onChange={(event) => setValue(event.target.value)}
    />
  );
}
function Editor() {
  return (
    <>
      <Account />
      <EditorSafetyProvider productId="p" version="v1">
        <DirtyField />
      </EditorSafetyProvider>
    </>
  );
}

it("agrupa la identidad verificada y los destinos existentes sin inventar un nombre", () => {
  render(<Account />);
  expect(screen.queryByRole("dialog")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Abrir menú de cuenta" }));
  const dialog = screen.getByRole("dialog", { name: "Mi cuenta" });
  // Without a profile name the email is the name, written once.
  expect(within(dialog).getByRole("heading", { name: "catalogo@example.test" })).toBeTruthy();
  expect(within(dialog).getAllByText("catalogo@example.test")).toHaveLength(1);
  expect(within(dialog).getByText("Catálogo")).toBeTruthy();
  expect(screen.getByRole("link", { name: "Datos de mi cuenta" }).getAttribute("href")).toBe(
    "/cuenta/perfil"
  );
  const store = screen.getByRole("link", { name: "Ir a la tienda (abre una pestaña nueva)" });
  expect(store.getAttribute("target")).toBe("_blank");
  expect(store.getAttribute("rel")).toContain("noopener");
});

it("permite recorrer las acciones con flechas y devuelve el foco al cerrar con Escape", async () => {
  const user = userEvent.setup();
  render(<Account />);
  const trigger = screen.getByRole("button", { name: "Abrir menú de cuenta" });
  trigger.focus();
  await user.keyboard("{ArrowDown}");
  expect(document.activeElement).toBe(screen.getByRole("link", { name: "Datos de mi cuenta" }));
  await user.keyboard("{End}");
  expect(document.activeElement).toBe(screen.getByRole("button", { name: "Cerrar sesión" }));
  await user.keyboard("{ArrowUp}");
  expect(document.activeElement).toBe(screen.getByRole("switch", { name: "Modo oscuro" }));
  await user.keyboard("{Home}{ArrowDown}");
  expect(document.activeElement).toBe(screen.getByRole("link", { name: /Ir a la tienda/ }));
  await user.keyboard("{Escape}");
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(document.activeElement).toBe(trigger);
});

it("cambia la apariencia y mantiene el menú abierto", () => {
  render(<Account />);
  fireEvent.click(screen.getByRole("button", { name: "Abrir menú de cuenta" }));
  const toggle = screen.getByRole("switch", { name: "Modo oscuro" });
  expect(toggle.getAttribute("aria-checked")).toBe("false");
  fireEvent.click(toggle);
  expect(toggle.getAttribute("aria-checked")).toBe("true");
  expect(screen.getByText("Oscuro")).toBeTruthy();
  expect(screen.getByRole("dialog")).toBeTruthy();
});

it("se cierra con clic exterior y al continuar con Tab fuera del desplegable", async () => {
  const user = userEvent.setup();
  render(
    <>
      <Account />
      <button>Otra acción</button>
    </>
  );
  await user.click(screen.getByRole("button", { name: "Abrir menú de cuenta" }));
  await user.click(screen.getByRole("button", { name: "Otra acción" }));
  expect(screen.queryByRole("dialog")).toBeNull();
  await user.click(screen.getByRole("button", { name: "Abrir menú de cuenta" }));
  await user.keyboard("{End}");
  await user.tab();
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(document.activeElement).toBe(screen.getByRole("button", { name: "Otra acción" }));
});

it("conserva el producto y la sesión si se cancela la salida con cambios pendientes", async () => {
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
  render(<Editor />);
  fireEvent.change(screen.getByLabelText("Nombre del producto"), {
    target: { value: "Borrador pendiente" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Abrir menú de cuenta" }));
  fireEvent.click(screen.getByRole("button", { name: "Cerrar sesión" }));
  await waitFor(() => expect(confirm).toHaveBeenCalledOnce());
  expect(mocks.signOut).not.toHaveBeenCalled();
  expect(screen.getByDisplayValue("Borrador pendiente")).toBeTruthy();
  expect(screen.getByRole("dialog")).toBeTruthy();
});

it("usa la acción existente al confirmar y muestra su error sin cerrar el menú", async () => {
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
  render(<Editor />);
  fireEvent.change(screen.getByLabelText("Nombre del producto"), {
    target: { value: "Borrador pendiente" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Abrir menú de cuenta" }));
  fireEvent.click(screen.getByRole("button", { name: "Cerrar sesión" }));
  await waitFor(() => expect(mocks.signOut).toHaveBeenCalledOnce());
  expect(confirm).toHaveBeenCalledOnce();
  expect((await screen.findByRole("alert")).textContent).toContain("No pudimos cerrar la sesión");
  expect(screen.getByDisplayValue("Borrador pendiente")).toBeTruthy();
});

it("los enlaces de perfil también respetan la protección del editor", () => {
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
  render(<Editor />);
  fireEvent.change(screen.getByLabelText("Nombre del producto"), {
    target: { value: "Sin guardar" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Abrir menú de cuenta" }));
  fireEvent.click(screen.getByRole("link", { name: "Datos de mi cuenta" }));
  expect(confirm).toHaveBeenCalledOnce();
  expect(screen.getByRole("dialog")).toBeTruthy();
  expect(screen.getByDisplayValue("Sin guardar")).toBeTruthy();
});

it("mantiene el acceso de cuenta cuando no hay correo disponible", () => {
  render(
    <AdminAccountMenu email={null} roles={["SUPER_ADMIN"]} theme="dark" onToggleTheme={() => {}} />
  );
  fireEvent.click(screen.getByRole("button", { name: "Abrir menú de cuenta" }));
  const dialog = screen.getByRole("dialog", { name: "Mi cuenta" });
  expect(within(dialog).getByRole("heading", { name: "Sesión administrativa" })).toBeTruthy();
  expect(within(dialog).getByText("Superadministrador")).toBeTruthy();
});

it("muestra el nombre del perfil con su avatar y cae a su blobatar si Gravatar no tiene foto", () => {
  const { container } = render(
    <AdminAccountMenu
      email="ana@example.test"
      displayName="Ana Torres"
      avatarUrl="https://gravatar.com/avatar/abc?s=80&d=404"
      roles={["SUPER_ADMIN"]}
      theme="light"
      onToggleTheme={() => undefined}
    />
  );
  const trigger = screen.getByRole("button", { name: "Abrir menú de cuenta" });
  expect(trigger.textContent).toContain("Ana Torres");
  const image = trigger.querySelector("img")!;
  expect(image.getAttribute("src")).toContain("gravatar.com/avatar/abc");
  fireEvent.error(image);
  // Without a Gravatar photo the blobatar generated from the email takes its place.
  const blob = trigger.querySelector("img")!;
  expect(blob.getAttribute("src")).toMatch(/^data:image\/svg\+xml/);
  expect(trigger.textContent).not.toContain("AT");
  fireEvent.click(trigger);
  const dialog = screen.getByRole("dialog", { name: "Mi cuenta" });
  expect(within(dialog).getByText("ana@example.test")).toBeTruthy();
  expect(within(dialog).getByText("Superadministrador")).toBeTruthy();
  expect(container.querySelectorAll("img[alt='']").length).toBeGreaterThan(0);
});
