// @vitest-environment jsdom
import React from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { MenuContentEditor } from "@/app/admin/(protected)/menu/menu-content-editor";
import { defaultMenuContent, MenuContentSchema } from "@/lib/navigation/menu-content-schema";

const save = vi.hoisted(() => vi.fn());
vi.mock("@/lib/admin/menu/actions", () => ({ updateMenuContentAction: save }));

describe("Edición visual de los enlaces del menú", () => {
  it("edita y ordena enlaces en el panel, guardando una sola vez", async () => {
    save.mockResolvedValue({ success: true });
    const onSaved = vi.fn();
    const user = userEvent.setup();
    render(<MenuContentEditor value={defaultMenuContent("soporte")} onSaved={onSaved} />);
    await user.click(screen.getByRole("button", { name: "Editar nombre y enlaces" }));
    const dialog = screen.getByRole("dialog", { name: "Soporte" });
    await user.click(within(dialog).getByRole("button", { name: "Subir enlace Contacto" }));
    // The selected default link remains editable independently of its position.
    const label = within(dialog).getByLabelText("Texto que verá el cliente");
    await user.clear(label);
    await user.type(label, "Ayuda y consultas");
    await user.click(within(dialog).getByRole("button", { name: "Guardar menú" }));
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({
        entryId: "soporte",
        links: expect.arrayContaining([expect.objectContaining({ label: "Ayuda y consultas" })]),
      })
    );
    expect(save.mock.calls.at(-1)?.[0].links[0].label).toBe("Contacto");
    expect(onSaved).toHaveBeenCalledOnce();
  });
  it("la configuración admite un menú vacío y rechaza destinos ejecutables", () => {
    const content = defaultMenuContent("soporte");
    expect(content.links.map((link) => link.label)).toEqual([
      "Preguntas frecuentes",
      "Contacto",
      "Distribuidores",
      "Tienda oficial",
    ]);
    expect(MenuContentSchema.safeParse({ ...content, links: [] }).success).toBe(true);
    expect(MenuContentSchema.safeParse({ ...content, href: "javascript:alert(1)" }).success).toBe(
      false
    );
    expect(
      MenuContentSchema.safeParse({
        ...content,
        links: [{ ...content.links[0], href: "//malicioso.test" }],
      }).success
    ).toBe(false);
  });
  it("guarda límites y nombre corto desde la vista de catálogo", async () => {
    save.mockClear();
    save.mockResolvedValue({ success: true });
    const user = userEvent.setup();
    const onSaved = vi.fn();
    render(
      <MenuContentEditor
        value={defaultMenuContent("mouses")}
        onSaved={onSaved}
        catalogProducts={[
          {
            slug: "modelo-real",
            name: "Marca Modelo real",
            brandName: "Marca",
            categorySlug: "mouses",
          },
        ]}
      />
    );
    await user.click(screen.getByRole("button", { name: "Ajustar vista del menú" }));
    const dialog = screen.getByRole("dialog", { name: "Mouses" });
    const count = within(dialog).getByLabelText("Modelos por marca");
    await user.clear(count);
    await user.type(count, "4");
    await user.type(within(dialog).getByLabelText("Nombre corto en el menú"), "Modelo compacto");
    await user.click(within(dialog).getByRole("button", { name: "Guardar menú" }));
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({
        display: expect.objectContaining({
          itemsPerBrand: 4,
          productLabels: { "modelo-real": "Modelo compacto" },
        }),
      })
    );
    expect(onSaved).toHaveBeenCalledOnce();
  });
});
