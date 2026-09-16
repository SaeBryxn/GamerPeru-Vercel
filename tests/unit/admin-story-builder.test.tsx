// @vitest-environment jsdom

import React from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { StoryBuilder } from "@/app/admin/(protected)/products/[productId]/story/story-builder";
import {
  createBuilderDocument,
  createIncompleteBuilderBlock,
  duplicateBuilderBlock,
  getBuilderBlockId,
  isStoryBuilderDirty,
  moveBuilderBlock,
  STORY_BUILDER_MAX_BLOCKS,
  toCompleteStoryDocument,
} from "@/lib/admin/catalog/story-builder-model";
import type { AdminProductStoryDto } from "@/lib/admin/catalog/story-reader";
import type { AuthoringStoryDocument } from "@/lib/admin/catalog/story-validation";

const mocks = vi.hoisted(() => ({
  refresh: vi.fn(),
  push: vi.fn(),
  saveDraft: vi.fn(),
  discardDraft: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh, push: mocks.push }),
}));

vi.mock("@/lib/admin/catalog/story-actions", () => ({
  saveProductStoryDraftAction: (...args: unknown[]) => mocks.saveDraft(...args),
  discardProductStoryDraftAction: (...args: unknown[]) => mocks.discardDraft(...args),
}));

const PRODUCT_ID = "018f0026-0000-7000-8000-000000000001";
const DRAFT_ID = "018f0026-0000-7000-8000-000000000010";
const PUBLISHED_ID = "018f0026-0000-7000-8000-000000000020";
const FIRST_BLOCK_ID = "018f0026-0000-7000-8000-000000000101";
const SECOND_BLOCK_ID = "018f0026-0000-7000-8000-000000000102";

const validDocument: AuthoringStoryDocument = [
  {
    blockId: FIRST_BLOCK_ID,
    type: "stat_highlight",
    payload: {
      title: "Rendimiento",
      stats: [{ value: "26K", label: "DPI" }],
    },
  },
  {
    blockId: SECOND_BLOCK_ID,
    type: "faq",
    payload: {
      title: "Preguntas frecuentes",
      items: [{ question: "¿Incluye cable?", answer: "Sí, incluye un cable desmontable." }],
    },
  },
];

function revision(
  id: string,
  revisionNumber: number,
  status: "DRAFT" | "PUBLISHED",
  publishedAt: string | null = null
) {
  return {
    id,
    revisionNumber,
    status,
    publishedAt,
    createdAt: "2026-09-15T12:00:00.000Z",
  };
}

function makeStory(
  lifecycle: AdminProductStoryDto["lifecycle"] = "DRAFT_ONLY",
  document: AuthoringStoryDocument = validDocument
): AdminProductStoryDto {
  const hasDraft = lifecycle === "DRAFT_ONLY" || lifecycle === "DRAFT_OVER_PUBLISHED";
  const hasPublished = lifecycle === "PUBLISHED_ONLY" || lifecycle === "DRAFT_OVER_PUBLISHED";
  return {
    product: { id: PRODUCT_ID, name: "Mouse Gamer E2E", slug: "mouse-gamer-e2e" },
    lifecycle,
    draft: hasDraft ? revision(DRAFT_ID, hasPublished ? 4 : 2, "DRAFT") : null,
    published: hasPublished
      ? revision(PUBLISHED_ID, 3, "PUBLISHED", "2026-09-15T12:30:00.000Z")
      : null,
    savedDraftDocument: hasDraft ? structuredClone(document) : null,
    initialDocument: lifecycle === "NO_STORY" ? [] : structuredClone(document),
    initialDocumentSource: hasDraft ? "DRAFT" : hasPublished ? "PUBLISHED" : "EMPTY",
    selectableMedia: [],
    concurrency: {
      expectedDraftRevisionId: hasDraft ? DRAFT_ID : null,
      expectedPublishedRevisionId: hasPublished ? PUBLISHED_ID : null,
    },
  };
}

function successfulSave(revisionNumber = 3, draftRevisionId = DRAFT_ID) {
  return {
    success: true,
    data: {
      productId: PRODUCT_ID,
      productSlug: "mouse-gamer-e2e",
      revisionId: draftRevisionId,
      revisionNumber,
      draftRevisionId,
      publishedRevisionId: null,
      publishedAt: null,
      replayed: false,
    },
  };
}

async function addIncompleteBlock(label = "Portada multimedia") {
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: /Agregar bloque/i }));
  const dialog = screen.getByRole("dialog", { name: "Agregar bloque" });
  await user.click(within(dialog).getByRole("button", { name: new RegExp(label, "i") }));
}

describe("GP-026 CHK2 Story Builder model", () => {
  it("tracks dirty state from document content rather than revision metadata", () => {
    const initial = createBuilderDocument(validDocument);
    expect(isStoryBuilderDirty(initial, validDocument)).toBe(false);
    expect(
      isStoryBuilderDirty([...initial, createIncompleteBuilderBlock("hero_media")], validDocument)
    ).toBe(true);
  });

  it("creates fresh IDs for add and duplicate without changing payload or source identity", () => {
    const incomplete = createIncompleteBuilderBlock("faq", () => "new-shell-id");
    const duplicated = duplicateBuilderBlock(
      createBuilderDocument(validDocument),
      0,
      () => "new-duplicate-id"
    );

    expect(incomplete.blockId).toBe("new-shell-id");
    expect(getBuilderBlockId(duplicated[0]!)).toBe(FIRST_BLOCK_ID);
    expect(getBuilderBlockId(duplicated[1]!)).toBe("new-duplicate-id");
    expect(toCompleteStoryDocument(duplicated)?.[1]?.payload).toEqual(validDocument[0]!.payload);
  });

  it("moves blocks only inside valid boundaries", () => {
    const initial = createBuilderDocument(validDocument);
    expect(getBuilderBlockId(moveBuilderBlock(initial, 0, 1)[0]!)).toBe(SECOND_BLOCK_ID);
    expect(getBuilderBlockId(moveBuilderBlock(initial, 0, -1)[0]!)).toBe(FIRST_BLOCK_ID);
  });
});

describe("GP-026 CHK2 Story Builder component", () => {
  beforeEach(() => {
    mocks.refresh.mockReset();
    mocks.push.mockReset();
    mocks.saveDraft.mockReset();
    mocks.discardDraft.mockReset();
    mocks.saveDraft.mockResolvedValue(successfulSave());
    mocks.discardDraft.mockResolvedValue({
      success: true,
      data: {
        productId: PRODUCT_ID,
        productSlug: "mouse-gamer-e2e",
        revisionId: DRAFT_ID,
        revisionNumber: 2,
        draftRevisionId: null,
        publishedRevisionId: null,
        publishedAt: null,
        replayed: false,
      },
    });
  });

  it.each([
    ["NO_STORY", "Sin historia"],
    ["DRAFT_ONLY", "Borrador r2"],
    ["PUBLISHED_ONLY", "Publicada r3"],
    ["DRAFT_OVER_PUBLISHED", "Borrador r4 sobre Publicada r3"],
  ] as const)("renders %s lifecycle truthfully", (lifecycle, expected) => {
    render(<StoryBuilder initialStory={makeStory(lifecycle)} />);
    expect(screen.getByTestId("story-lifecycle-status").textContent).toBe(expected);
  });

  it("adds an incomplete shell, marks dirty, blocks save, and focuses the new card", async () => {
    render(<StoryBuilder initialStory={makeStory("NO_STORY")} />);
    await addIncompleteBlock();

    const card = screen.getAllByTestId(/^story-block-(?!list$)/)[0]!;
    expect(card.getAttribute("data-block-id")).toMatch(/^[0-9a-f-]{36}$/i);
    expect(document.activeElement).toBe(card);
    expect(screen.getByText("Configuración pendiente")).toBeTruthy();
    expect(screen.getByTestId("story-dirty-state").textContent).toBe("Cambios sin guardar");
    expect(screen.getByTestId("story-save-draft").hasAttribute("disabled")).toBe(true);
  });

  it("enforces the 30-block shell bound", () => {
    const thirtyBlocks = Array.from({ length: STORY_BUILDER_MAX_BLOCKS }, (_, index) => ({
      ...validDocument[0]!,
      blockId: `block-${String(index).padStart(2, "0")}`,
    }));
    render(<StoryBuilder initialStory={makeStory("DRAFT_ONLY", thirtyBlocks)} />);

    expect(screen.getByTestId("story-add-block").hasAttribute("disabled")).toBe(true);
    expect(screen.getByText(/Alcanzaste el máximo de 30 bloques/)).toBeTruthy();
  });

  it("duplicates adjacent with a new ID and preserves move boundary semantics", async () => {
    const user = userEvent.setup();
    render(<StoryBuilder initialStory={makeStory()} />);
    const originalCards = screen.getAllByTestId(/^story-block-(?!list$)/);
    const originalId = originalCards[0]!.getAttribute("data-block-id");

    await user.click(within(originalCards[0]!).getByRole("button", { name: /Duplicar/i }));
    const cards = screen.getAllByTestId(/^story-block-(?!list$)/);
    expect(cards).toHaveLength(3);
    expect(cards[1]!.getAttribute("data-block-id")).not.toBe(originalId);
    expect(
      within(cards[0]!)
        .getByRole("button", { name: /hacia arriba/i })
        .hasAttribute("disabled")
    ).toBe(true);
    expect(
      within(cards[2]!)
        .getByRole("button", { name: /hacia abajo/i })
        .hasAttribute("disabled")
    ).toBe(true);

    await user.click(within(cards[1]!).getByRole("button", { name: /hacia arriba/i }));
    expect(screen.getAllByTestId(/^story-block-(?!list$)/)[0]!.getAttribute("data-block-id")).toBe(
      cards[1]!.getAttribute("data-block-id")
    );
  });

  it("requires confirmation for a complete block and can delete to an empty document", async () => {
    const user = userEvent.setup();
    render(<StoryBuilder initialStory={makeStory("DRAFT_ONLY", [validDocument[0]!])} />);
    await user.click(screen.getByRole("button", { name: /Eliminar Datos destacados/i }));
    expect(screen.getByRole("dialog", { name: "Eliminar bloque guardado" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Eliminar bloque" }));

    expect(screen.getByTestId("story-empty-state")).toBeTruthy();
    expect(screen.getByTestId("story-save-draft").hasAttribute("disabled")).toBe(false);
  });

  it("deletes an incomplete shell directly without a confirmation dialog", async () => {
    const user = userEvent.setup();
    render(<StoryBuilder initialStory={makeStory("NO_STORY")} />);
    await addIncompleteBlock("Preguntas frecuentes");
    await user.click(screen.getByRole("button", { name: /Eliminar Preguntas frecuentes/i }));
    expect(screen.queryByTestId("story-confirmation-dialog")).toBeNull();
    expect(screen.getByTestId("story-empty-state")).toBeTruthy();
  });

  it("saves an empty draft and sends the current concurrency tokens", async () => {
    const user = userEvent.setup();
    render(<StoryBuilder initialStory={makeStory("NO_STORY")} />);
    await user.click(screen.getByTestId("story-save-draft"));

    await waitFor(() => expect(mocks.saveDraft).toHaveBeenCalledTimes(1));
    expect(mocks.saveDraft.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        productId: PRODUCT_ID,
        expectedDraftRevisionId: null,
        expectedPublishedRevisionId: null,
        document: [],
      })
    );
  });

  it("saves valid changes, updates pointers, promotes the baseline, and clears dirty", async () => {
    const user = userEvent.setup();
    const nextDraftId = "018f0026-0000-7000-8000-000000000030";
    const laterDraftId = "018f0026-0000-7000-8000-000000000031";
    mocks.saveDraft
      .mockResolvedValueOnce(successfulSave(3, nextDraftId))
      .mockResolvedValueOnce(successfulSave(4, laterDraftId));
    render(<StoryBuilder initialStory={makeStory()} />);

    await user.click(screen.getAllByRole("button", { name: /Duplicar/i })[0]!);
    await user.click(screen.getByTestId("story-save-draft"));
    await waitFor(() =>
      expect(screen.getByTestId("story-dirty-state").textContent).toBe(
        "Todos los cambios están guardados"
      )
    );

    await user.click(screen.getAllByRole("button", { name: /Eliminar/i })[0]!);
    await user.click(screen.getByRole("button", { name: "Eliminar bloque" }));
    await user.click(screen.getByTestId("story-save-draft"));
    await waitFor(() => expect(mocks.saveDraft).toHaveBeenCalledTimes(2));
    expect(mocks.saveDraft.mock.calls[1]?.[0]).toEqual(
      expect.objectContaining({ expectedDraftRevisionId: nextDraftId })
    );
  });

  it("preserves local work after a structured save failure", async () => {
    const user = userEvent.setup();
    mocks.saveDraft.mockResolvedValue({
      success: false,
      code: "STORY_VALIDATION_ERROR",
      error: "Revisa los campos señalados antes de continuar.",
      fieldErrors: [{ code: "INVALID", path: "blocks[0]", message: "Contenido inválido." }],
    });
    render(<StoryBuilder initialStory={makeStory()} />);
    await user.click(screen.getAllByRole("button", { name: /Duplicar/i })[0]!);
    await user.click(screen.getByTestId("story-save-draft"));

    await waitFor(() => expect(screen.getByTestId("story-error")).toBeTruthy());
    expect(screen.getAllByTestId(/^story-block-(?!list$)/)).toHaveLength(3);
    expect(screen.getByTestId("story-dirty-state").textContent).toBe("Cambios sin guardar");
  });

  it("preserves local work on stale conflict and confirms server reload", async () => {
    const user = userEvent.setup();
    mocks.saveDraft.mockResolvedValue({
      success: false,
      code: "STORY_STALE_WRITE",
      error: "La historia cambió desde que abriste el editor.",
      currentDraftRevisionId: "018f0026-0000-7000-8000-000000000099",
      currentPublishedRevisionId: null,
    });
    render(<StoryBuilder initialStory={makeStory()} />);
    await user.click(screen.getAllByRole("button", { name: /Duplicar/i })[0]!);
    await user.click(screen.getByTestId("story-save-draft"));

    await waitFor(() => expect(screen.getByTestId("story-stale-alert")).toBeTruthy());
    expect(screen.getAllByTestId(/^story-block-(?!list$)/)).toHaveLength(3);
    await user.click(screen.getByRole("button", { name: "Recargar versión del servidor" }));
    await user.click(screen.getByRole("button", { name: "Recargar servidor" }));
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
  });

  it("reuses mutationRequestId only for an exact ambiguous retry", async () => {
    const user = userEvent.setup();
    mocks.saveDraft
      .mockRejectedValueOnce(new Error("transport"))
      .mockResolvedValueOnce(successfulSave());
    render(<StoryBuilder initialStory={makeStory()} />);
    await user.click(screen.getAllByRole("button", { name: /Duplicar/i })[0]!);
    await user.click(screen.getByTestId("story-save-draft"));
    await waitFor(() => expect(screen.getByText(/conexión se interrumpió/i)).toBeTruthy());
    await user.click(screen.getByTestId("story-save-draft"));
    await waitFor(() => expect(mocks.saveDraft).toHaveBeenCalledTimes(2));

    expect(mocks.saveDraft.mock.calls[0]?.[0].mutationRequestId).toBe(
      mocks.saveDraft.mock.calls[1]?.[0].mutationRequestId
    );
  });

  it("generates a new mutationRequestId when payload changes after an ambiguous result", async () => {
    const user = userEvent.setup();
    mocks.saveDraft
      .mockRejectedValueOnce(new Error("transport"))
      .mockResolvedValueOnce(successfulSave());
    render(<StoryBuilder initialStory={makeStory()} />);
    await user.click(screen.getAllByRole("button", { name: /Duplicar/i })[0]!);
    await user.click(screen.getByTestId("story-save-draft"));
    await waitFor(() => expect(screen.getByText(/conexión se interrumpió/i)).toBeTruthy());
    await user.click(screen.getAllByRole("button", { name: /hacia arriba/i })[1]!);
    await user.click(screen.getByTestId("story-save-draft"));
    await waitFor(() => expect(mocks.saveDraft).toHaveBeenCalledTimes(2));

    expect(mocks.saveDraft.mock.calls[0]?.[0].mutationRequestId).not.toBe(
      mocks.saveDraft.mock.calls[1]?.[0].mutationRequestId
    );
  });

  it("confirms durable discard and resets after authoritative props refresh", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<StoryBuilder initialStory={makeStory()} />);
    await user.click(screen.getByTestId("story-discard-draft"));
    await user.click(screen.getByRole("button", { name: "Descartar borrador" }));
    await waitFor(() => expect(mocks.discardDraft).toHaveBeenCalledTimes(1));
    expect(mocks.refresh).toHaveBeenCalledTimes(1);

    rerender(<StoryBuilder initialStory={makeStory("NO_STORY")} />);
    await waitFor(() => expect(screen.getByTestId("story-empty-state")).toBeTruthy());
    expect(screen.queryByTestId("story-discard-draft")).toBeNull();
  });

  it("guards builder and Admin shell navigation while dirty and leaves only after confirmation", async () => {
    const user = userEvent.setup();
    render(
      <>
        <a href="/admin">Inicio del Admin</a>
        <StoryBuilder initialStory={makeStory()} />
      </>
    );
    await user.click(screen.getAllByRole("button", { name: /Duplicar/i })[0]!);
    const shellLink = screen.getByRole("link", { name: "Inicio del Admin" });
    await user.click(shellLink);
    expect(screen.getByRole("dialog", { name: "Salir con cambios sin guardar" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Cancelar" }));
    await waitFor(() => expect(document.activeElement).toBe(shellLink));
    expect(mocks.push).not.toHaveBeenCalled();

    await user.click(screen.getByTestId("story-back-link"));
    await user.click(screen.getByRole("button", { name: "Salir sin guardar" }));
    expect(mocks.push).toHaveBeenCalledWith(`/admin/products/${PRODUCT_ID}`);
  });

  it("registers and removes the browser beforeunload guard with dirty state", async () => {
    const user = userEvent.setup();
    const addSpy = vi.spyOn(window, "addEventListener");
    const removeSpy = vi.spyOn(window, "removeEventListener");
    render(<StoryBuilder initialStory={makeStory()} />);
    await user.click(screen.getAllByRole("button", { name: /Duplicar/i })[0]!);
    expect(addSpy.mock.calls.some(([type]) => type === "beforeunload")).toBe(true);

    await user.click(screen.getByRole("button", { name: "Restablecer cambios locales" }));
    await user.click(screen.getByRole("button", { name: "Restablecer" }));
    await waitFor(() =>
      expect(removeSpy.mock.calls.some(([type]) => type === "beforeunload")).toBe(true)
    );
    addSpy.mockRestore();
    removeSpy.mockRestore();
  });

  it("uses disabled semantics for boundary movement controls", () => {
    render(<StoryBuilder initialStory={makeStory()} />);
    const cards = screen.getAllByTestId(/^story-block-(?!list$)/);
    expect(
      within(cards[0]!)
        .getByRole("button", { name: /hacia arriba/i })
        .hasAttribute("disabled")
    ).toBe(true);
    expect(
      within(cards[1]!)
        .getByRole("button", { name: /hacia abajo/i })
        .hasAttribute("disabled")
    ).toBe(true);
    fireEvent.keyDown(within(cards[0]!).getByRole("button", { name: /hacia arriba/i }), {
      key: "Enter",
    });
    expect(screen.getAllByTestId(/^story-block-(?!list$)/)[0]!.getAttribute("data-block-id")).toBe(
      FIRST_BLOCK_ID
    );
  });
});
