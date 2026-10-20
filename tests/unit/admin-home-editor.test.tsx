// @vitest-environment jsdom

import React from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_HOME_SECTIONS } from "@/lib/home/default-sections";
import { HOME_SECTION_CONTENT_SCHEMAS, parseHomeSectionContent } from "@/lib/home/section-schemas";
import type { AdminHomeState } from "@/lib/home/home-sections-service";
import { getAt, setAt } from "@/app/admin/(protected)/home/content-path";
import { HOME_SECTION_FIELDS, type HomeField } from "@/app/admin/(protected)/home/section-fields";
import { HOME_SECTION_GUIDES } from "@/app/admin/(protected)/home/section-guide";
import { extractYouTubeId } from "@/app/admin/(protected)/home/media-fields";
import { HomeEditor } from "@/app/admin/(protected)/home/home-editor";

const actions = vi.hoisted(() => ({
  updateHomeSectionContentAction: vi.fn(),
  setHomeSectionVisibilityAction: vi.fn(),
  reorderHomeSectionsAction: vi.fn(),
}));
const refresh = vi.hoisted(() => vi.fn());

vi.mock("@/lib/home/home-sections-actions", () => actions);
vi.mock("@/lib/media/upload-api-client", () => ({
  requestUpload: vi.fn(),
  completeUpload: vi.fn(),
}));
vi.mock("@/lib/media/resolve-public-media-url", () => ({
  resolvePublicMediaUrl: (key: string) => `https://cdn.test/${key}`,
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

function state(): AdminHomeState {
  return {
    sections: DEFAULT_HOME_SECTIONS.map((section) => ({
      id: section.id,
      type: section.type,
      displayOrder: section.displayOrder,
      isVisible: true,
      version: 1,
      content: structuredClone(section.content),
      contentValid: true,
      updatedAt: "2026-10-15T00:00:00.000Z",
    })),
    media: {},
  };
}

const CATEGORIES = [
  { slug: "mouses", name: "Mouses" },
  { slug: "mousepads", name: "Mousepads" },
];

function fieldPaths(fields: readonly HomeField[]): (string | number)[][] {
  return fields.map((field) => [...field.path]);
}

describe("Home section forms", () => {
  it("address paths that exist in every default section", () => {
    for (const section of DEFAULT_HOME_SECTIONS) {
      for (const path of fieldPaths(HOME_SECTION_FIELDS[section.type])) {
        expect(
          getAt(section.content, path),
          `${section.type} ${path.join(".")}`
        ).not.toBeUndefined();
      }
    }
  });

  it("cover every top-level field of each schema", () => {
    for (const [type, schema] of Object.entries(HOME_SECTION_CONTENT_SCHEMAS)) {
      const covered = new Set(
        HOME_SECTION_FIELDS[type as keyof typeof HOME_SECTION_FIELDS].map((field) => field.path[0])
      );
      for (const key of Object.keys(schema.shape)) {
        expect(covered.has(key), `${type}.${key}`).toBe(true);
      }
    }
  });

  it("produce valid content for new list items once filled in", () => {
    const list = HOME_SECTION_FIELDS.trust_strip[0];
    if (list?.kind !== "list") throw new Error("expected list");
    const strip = DEFAULT_HOME_SECTIONS.find((s) => s.type === "trust_strip")!;
    const item = { ...list.newItem(), title: "Envío a todo Perú", description: "Por Olva." };
    const content = setAt(strip.content, ["items", 0], item);
    expect(parseHomeSectionContent("trust_strip", content).success).toBe(true);
  });

  it("describe every section type with a schematic inside the canvas", () => {
    for (const guide of Object.values(HOME_SECTION_GUIDES)) {
      expect(guide.label && guide.needs && guide.description).toBeTruthy();
      for (const [, x, y, width, height] of guide.wireframe) {
        expect(x + width).toBeLessThanOrEqual(120);
        expect(y + height).toBeLessThanOrEqual(80);
      }
    }
  });
});

describe("YouTube input", () => {
  it("accepts ids and common links", () => {
    expect(extractYouTubeId("2gX-vyQwHsA")).toBe("2gX-vyQwHsA");
    expect(extractYouTubeId("https://www.youtube.com/watch?v=2gX-vyQwHsA&t=3")).toBe("2gX-vyQwHsA");
    expect(extractYouTubeId("https://youtu.be/2gX-vyQwHsA")).toBe("2gX-vyQwHsA");
    expect(extractYouTubeId("https://www.youtube.com/shorts/2gX-vyQwHsA")).toBe("2gX-vyQwHsA");
    expect(extractYouTubeId("no es un video")).toBe("no es un video");
  });
});

describe("Home editor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("explains when the sections table is not available yet", () => {
    render(<HomeEditor initialState={null} categories={CATEGORIES} />);
    expect(screen.getByTestId("home-editor-unavailable").textContent).toContain("0021");
  });

  it("lists every section with its guide and pins the hero", () => {
    render(<HomeEditor initialState={state()} categories={CATEGORIES} />);
    const hero = screen.getByTestId(`home-section-${DEFAULT_HOME_SECTIONS[0]!.id}`);
    expect(within(hero).getByText("Primera")).toBeTruthy();
    expect(within(hero).queryByRole("button", { name: /^Subir/ })).toBeNull();
    expect(screen.getAllByText("Necesitas:")).toHaveLength(DEFAULT_HOME_SECTIONS.length);
    expect(screen.getByText("Nuestros mousepads")).toBeTruthy();
  });

  it("previews the resulting home before hiding a section", async () => {
    const user = userEvent.setup();
    actions.setHomeSectionVisibilityAction.mockResolvedValue({
      success: true,
      data: { version: 2 },
    });
    const target = DEFAULT_HOME_SECTIONS[4]!;
    render(<HomeEditor initialState={state()} categories={CATEGORIES} />);

    await user.click(screen.getByTestId(`home-section-toggle-${target.id}`));
    const preview = screen.getByTestId("home-visibility-preview");
    expect(preview.textContent).toContain("Elige el tuyo.");
    expect(preview.textContent).toContain("se ocultará");
    expect(actions.setHomeSectionVisibilityAction).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Ocultar sección" }));
    expect(actions.setHomeSectionVisibilityAction).toHaveBeenCalledWith({
      sectionId: target.id,
      expectedVersion: 1,
      isVisible: false,
    });
    const card = screen.getByTestId(`home-section-${target.id}`);
    expect(await within(card).findByText("Oculta")).toBeTruthy();
  });

  it("reorders with the order the operator was looking at", async () => {
    const user = userEvent.setup();
    actions.reorderHomeSectionsAction.mockResolvedValue({ success: true, data: { versions: {} } });
    render(<HomeEditor initialState={state()} categories={CATEGORIES} />);
    const ids = DEFAULT_HOME_SECTIONS.map((section) => section.id);

    await user.click(
      screen.getByRole("button", { name: "Bajar Carrusel de productos: Lo que tenemos disponible" })
    );
    const call = actions.reorderHomeSectionsAction.mock.calls[0]![0];
    expect(call.expectedOrder).toEqual(ids);
    expect(call.orderedIds.slice(0, 3)).toEqual([ids[0], ids[2], ids[1]]);
  });

  it("validates before saving and sends only valid content", async () => {
    const user = userEvent.setup();
    actions.updateHomeSectionContentAction.mockResolvedValue({
      success: true,
      data: { version: 2 },
    });
    const hero = DEFAULT_HOME_SECTIONS[0]!;
    render(<HomeEditor initialState={state()} categories={CATEGORIES} />);

    const card = screen.getByTestId(`home-section-${hero.id}`);
    await user.click(within(card).getByRole("button", { name: "Editar" }));
    const heading = within(card).getByLabelText(/Título principal/);
    await user.clear(heading);
    await user.type(heading, "<b>Hola</b>");
    await user.click(within(card).getByRole("button", { name: "Guardar y publicar" }));

    expect(within(card).getByRole("alert").textContent).toContain("Revisa los campos");
    expect(within(card).getByText("No se permiten etiquetas HTML.")).toBeTruthy();
    expect(actions.updateHomeSectionContentAction).not.toHaveBeenCalled();

    await user.clear(heading);
    await user.type(heading, "Periféricos para competir");
    await user.click(within(card).getByRole("button", { name: "Guardar y publicar" }));
    expect(actions.updateHomeSectionContentAction).toHaveBeenCalledWith({
      sectionId: hero.id,
      expectedVersion: 1,
      content: expect.objectContaining({ heading: "Periféricos para competir" }),
    });
  });

  it("requires both files when switching a video to an upload", async () => {
    const user = userEvent.setup();
    const feature = DEFAULT_HOME_SECTIONS.find((section) => section.type === "feature_video")!;
    render(<HomeEditor initialState={state()} categories={CATEGORIES} />);

    const card = screen.getByTestId(`home-section-${feature.id}`);
    await user.click(within(card).getByRole("button", { name: "Editar" }));
    await user.click(within(card).getByRole("radio", { name: "Archivo de video" }));
    expect(within(card).getByText("Subir video")).toBeTruthy();
    expect(within(card).getByText("Subir portada")).toBeTruthy();
    await user.click(within(card).getByRole("button", { name: "Guardar y publicar" }));
    expect(actions.updateHomeSectionContentAction).not.toHaveBeenCalled();
  });

  it("refreshes after a conflict and shows why", async () => {
    const user = userEvent.setup();
    actions.setHomeSectionVisibilityAction.mockResolvedValue({
      success: false,
      error: "Otra persona cambió el home mientras editabas.",
      code: "HOME_SECTION_CONFLICT",
    });
    render(<HomeEditor initialState={state()} categories={CATEGORIES} />);
    await user.click(screen.getByTestId(`home-section-toggle-${DEFAULT_HOME_SECTIONS[2]!.id}`));
    await user.click(screen.getByRole("button", { name: "Ocultar sección" }));
    expect((await screen.findByTestId("home-editor-error")).textContent).toContain("Otra persona");
    expect(refresh).toHaveBeenCalled();
  });
});
