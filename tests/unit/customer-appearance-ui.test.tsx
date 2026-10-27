// @vitest-environment jsdom
import React from "react";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AppearanceEditor } from "@/components/account/appearance-editor";
import { defaultCustomerAppearance } from "@/lib/account/appearance";
const save = vi.hoisted(() => vi.fn());
const refresh = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("@/lib/account/appearance-actions", () => ({ updateCustomerAppearanceAction: save }));
vi.mock("@blobatar/react", () => ({
  Blobatar: ({ name, alt }: { name: string; alt: string }) => (
    <svg aria-label={alt} data-seed={name} />
  ),
}));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

it("personaliza con vista previa y guarda solo al pulsar Guardar", async () => {
  save.mockImplementation(async (appearance) => ({ success: true, appearance }));
  const user = userEvent.setup();
  render(
    <AppearanceEditor
      initialAppearance={defaultCustomerAppearance()}
      firstName="Bryan"
      fallbackSeed="private-email"
    />
  );
  await user.type(screen.getByLabelText("Nombre visible"), "Max");
  expect(screen.getByText("Max")).toBeDefined();
  expect(save).not.toHaveBeenCalled();
  await user.click(
    within(screen.getByRole("group", { name: "Elige tu avatar" })).getByRole("button", {
      name: "Avatar 2",
    })
  );
  await user.click(screen.getByRole("button", { name: "Negro" }));
  await user.click(screen.getByRole("button", { name: "Guardar mi estilo" }));
  expect(save).toHaveBeenCalledWith({
    displayName: "Max",
    avatarSeed: "gamerperu-2",
    accent: "neutral",
  });
  expect(refresh).toHaveBeenCalledOnce();
  expect(screen.getByRole("status").textContent).toContain("Tu perfil ya tiene tu estilo");
});
it("un fallo conserva el borrador para volver a guardar", async () => {
  save.mockResolvedValue({ success: false, error: "No se pudo guardar." });
  const user = userEvent.setup();
  render(
    <AppearanceEditor
      initialAppearance={defaultCustomerAppearance()}
      firstName="Bryan"
      fallbackSeed="customer"
    />
  );
  await user.type(screen.getByLabelText("Nombre visible"), "Mi alias");
  await user.click(screen.getByRole("button", { name: "Guardar mi estilo" }));
  expect(screen.getByLabelText<HTMLInputElement>("Nombre visible").value).toBe("Mi alias");
  expect(screen.getByRole("alert").textContent).toBe("No se pudo guardar.");
  expect(refresh).not.toHaveBeenCalled();
});
it("no sobrescribe preferencias si no se pudieron cargar", () => {
  render(
    <AppearanceEditor
      initialAppearance={defaultCustomerAppearance()}
      firstName="Bryan"
      fallbackSeed="customer"
      available={false}
    />
  );
  expect(
    screen.getByRole<HTMLButtonElement>("button", { name: "Guardar mi estilo" }).disabled
  ).toBe(true);
  expect(screen.getByRole("alert").textContent).toContain("Recarga la página");
});
