// @vitest-environment jsdom

import React from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { StoryBuilder } from "@/app/admin/(protected)/products/[productId]/story/story-builder";
import {
  adaptPersistedValidationIssueToAuthoring,
  classifyStoryActionResult,
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
  publishStory: vi.fn(),
  unpublishStory: vi.fn(),
  detachMedia: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh, push: mocks.push }),
}));

vi.mock("@/lib/admin/catalog/actions", () => ({
  detachProductMediaAction: (...args: unknown[]) => mocks.detachMedia(...args),
}));

vi.mock("@/lib/admin/catalog/story-actions", () => ({
  saveProductStoryDraftAction: (...args: unknown[]) => mocks.saveDraft(...args),
  discardProductStoryDraftAction: (...args: unknown[]) => mocks.discardDraft(...args),
  publishProductStoryAction: (...args: unknown[]) => mocks.publishStory(...args),
  unpublishProductStoryAction: (...args: unknown[]) => mocks.unpublishStory(...args),
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
    initialRelatedProducts: [],
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

function successfulPublish(
  revisionNumber = 5,
  publishedRevisionId = "018f0026-0000-7000-8000-000000000099"
) {
  return {
    success: true,
    data: {
      productId: PRODUCT_ID,
      productSlug: "mouse-gamer-e2e",
      revisionId: publishedRevisionId,
      revisionNumber,
      draftRevisionId: null,
      publishedRevisionId,
      publishedAt: "2026-09-16T10:00:00.000Z",
      replayed: false,
    },
  };
}

function successfulUnpublish(revisionNumber = 3) {
  return {
    success: true,
    data: {
      productId: PRODUCT_ID,
      productSlug: "mouse-gamer-e2e",
      revisionId: "018f0026-0000-7000-8000-000000000088",
      revisionNumber,
      draftRevisionId: null,
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

  it("classifies structured responses deterministically into SUCCESS, DEFINITIVE_FAILURE, and AMBIGUOUS_FAILURE", () => {
    expect(classifyStoryActionResult({ success: true, data: { ok: true } })).toBe("SUCCESS");
    expect(classifyStoryActionResult({ success: true, data: null })).toBe("AMBIGUOUS_FAILURE");
    expect(classifyStoryActionResult({ success: true })).toBe("AMBIGUOUS_FAILURE");

    expect(
      classifyStoryActionResult({
        success: false,
        code: "STORY_VALIDATION_ERROR",
        error: "Validation error",
      })
    ).toBe("DEFINITIVE_FAILURE");
    expect(
      classifyStoryActionResult({
        success: false,
        code: "STORY_STALE_WRITE",
        error: "Stale write",
      })
    ).toBe("DEFINITIVE_FAILURE");
    expect(
      classifyStoryActionResult({
        success: false,
        code: "FORBIDDEN",
        error: "Forbidden",
      })
    ).toBe("DEFINITIVE_FAILURE");

    expect(
      classifyStoryActionResult({
        success: false,
        code: "UNKNOWN_ERROR",
        error: "Unexpected error",
      })
    ).toBe("AMBIGUOUS_FAILURE");
    expect(
      classifyStoryActionResult({
        success: false,
        code: "UNRECOGNIZED_CODE",
      })
    ).toBe("AMBIGUOUS_FAILURE");
    expect(classifyStoryActionResult(null)).toBe("AMBIGUOUS_FAILURE");
    expect(classifyStoryActionResult(undefined)).toBe("AMBIGUOUS_FAILURE");
    expect(classifyStoryActionResult("error")).toBe("AMBIGUOUS_FAILURE");
  });
});

beforeEach(() => {
  mocks.refresh.mockReset();
  mocks.push.mockReset();
  mocks.saveDraft.mockReset();
  mocks.discardDraft.mockReset();
  mocks.publishStory.mockReset();
  mocks.unpublishStory.mockReset();
  mocks.detachMedia.mockReset();
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
  mocks.publishStory.mockResolvedValue(successfulPublish());
  mocks.unpublishStory.mockResolvedValue(successfulUnpublish());
});

describe("GP-026 CHK2 Story Builder component", () => {
  it.each([
    ["NO_STORY", "Sin historia"],
    ["DRAFT_ONLY", "Borrador r2"],
    ["PUBLISHED_ONLY", "Publicada r3"],
    ["DRAFT_OVER_PUBLISHED", "Borrador r4 sobre Publicada r3"],
  ] as const)("renders %s lifecycle truthfully", (lifecycle, expected) => {
    render(<StoryBuilder initialStory={makeStory(lifecycle)} />);
    expect(screen.getByTestId("story-lifecycle-status").textContent).toBe(expected);
  });

  it("adds an incomplete shell, marks dirty, keeps save operable, and focuses the new card", async () => {
    render(<StoryBuilder initialStory={makeStory("NO_STORY")} />);
    await addIncompleteBlock();

    const card = screen.getAllByTestId(/^story-block-(?!list$)/)[0]!;
    expect(card.getAttribute("data-block-id")).toMatch(/^[0-9a-f-]{36}$/i);
    expect(document.activeElement).toBe(card);
    expect(screen.getByText("Configuración pendiente")).toBeTruthy();
    expect(screen.getByTestId("story-dirty-state").textContent).toBe("Cambios sin guardar");
    expect(screen.getByTestId("story-save-draft").hasAttribute("disabled")).toBe(false);
  });

  it("A. INVALID NEW BLOCK: keeps Save operable, performs local validation without Server Action, shows ValidationSummary and inline error, and focuses the first invalid field", async () => {
    const user = userEvent.setup();
    render(<StoryBuilder initialStory={makeStory("NO_STORY")} />);
    await addIncompleteBlock("Portada multimedia");

    // Save button remains operable
    const saveBtn = screen.getByTestId("story-save-draft");
    expect(saveBtn.hasAttribute("disabled")).toBe(false);

    // Clicking Save calls ZERO Server Actions
    await user.click(saveBtn);
    expect(mocks.saveDraft).not.toHaveBeenCalled();

    // ValidationSummary appears
    expect(screen.getByTestId("story-validation-summary")).toBeTruthy();

    // Inline field error appears
    expect(screen.getByText("El texto no puede quedar vacío.")).toBeTruthy();

    // First invalid field receives focus
    const headlineInput = screen.getByLabelText(/Encabezado/i);
    await waitFor(() => {
      expect(document.activeElement).toBe(headlineInput);
    });
  });

  it("B. CORRECTING THE BLOCK: clears errors live and allows valid normalized submission", async () => {
    const user = userEvent.setup();
    render(<StoryBuilder initialStory={makeStory("NO_STORY")} />);
    await addIncompleteBlock("Portada multimedia");

    // Click save while invalid -> validation issues activated
    await user.click(screen.getByTestId("story-save-draft"));
    expect(screen.getByTestId("story-validation-summary")).toBeTruthy();
    expect(screen.getByText("El texto no puede quedar vacío.")).toBeTruthy();

    // Correct the invalid field
    const headlineInput = screen.getByLabelText(/Encabezado/i);
    fireEvent.change(headlineInput, { target: { value: "Pro Wireless Precision" } });

    // Errors update/clear live
    expect(screen.queryByTestId("story-validation-summary")).toBeNull();
    expect(screen.queryByText("El texto no puede quedar vacío.")).toBeNull();

    // Save becomes capable of submitting
    await user.click(screen.getByTestId("story-save-draft"));
    await waitFor(() => expect(mocks.saveDraft).toHaveBeenCalledTimes(1));

    // Normalized valid document reaches saveProductStoryDraftAction
    const saveCall = mocks.saveDraft.mock.calls[0]?.[0];
    expect(saveCall.document[0].type).toBe("hero_media");
    expect(saveCall.document[0].payload.headline).toBe("Pro Wireless Precision");
  });

  it("C. INVALID EXISTING BLOCK: marks dirty, retains invalid value, blocks save until valid value restored", async () => {
    const user = userEvent.setup();
    render(<StoryBuilder initialStory={makeStory("DRAFT_ONLY", validDocument)} />);

    // Initially clean
    expect(screen.getByTestId("story-save-draft").hasAttribute("disabled")).toBe(true);

    // Make one required field invalid: clear stat value
    const statValueInput = screen.getByDisplayValue("26K");
    fireEvent.change(statValueInput, { target: { value: "" } });

    // Dirty true
    expect(screen.getByTestId("story-dirty-state").textContent).toBe("Cambios sin guardar");

    // Raw invalid local value remains visible
    expect((statValueInput as HTMLInputElement).value).toBe("");

    // Save button is operable (not disabled merely because invalid)
    expect(screen.getByTestId("story-save-draft").hasAttribute("disabled")).toBe(false);

    // Save performs local validation only, durable action is not called
    await user.click(screen.getByTestId("story-save-draft"));
    expect(mocks.saveDraft).not.toHaveBeenCalled();
    expect(screen.getByTestId("story-validation-summary")).toBeTruthy();

    // Restoring a valid value clears error and allows Save
    fireEvent.change(statValueInput, { target: { value: "32K" } });
    expect(screen.queryByTestId("story-validation-summary")).toBeNull();

    await user.click(screen.getByTestId("story-save-draft"));
    await waitFor(() => expect(mocks.saveDraft).toHaveBeenCalledTimes(1));
    expect(mocks.saveDraft.mock.calls[0]?.[0].document[0].payload.stats[0].value).toBe("32K");
  });

  it("D. COLLAPSED INVALID BLOCK: expanding from ValidationSummary entry focuses the exact invalid field", async () => {
    const user = userEvent.setup();
    render(<StoryBuilder initialStory={makeStory("NO_STORY")} />);
    await addIncompleteBlock("Portada multimedia");

    // Block is currently expanded; collapse it
    const collapseBtn = screen.getByRole("button", { name: /Colapsar bloque 1/i });
    await user.click(collapseBtn);
    expect(collapseBtn.getAttribute("aria-expanded")).toBe("false");

    // Activate Save to trigger validation
    await user.click(screen.getByTestId("story-save-draft"));
    expect(screen.getByTestId("story-validation-summary")).toBeTruthy();

    // Activating the ValidationSummary entry expands the block and focuses the field
    const issueBtn = screen.getByTestId("validation-issue-0");
    await user.click(issueBtn);

    await waitFor(() => {
      expect(collapseBtn.getAttribute("aria-expanded")).toBe("true");
    });

    const headlineInput = screen.getByLabelText(/Encabezado/i);
    await waitFor(() => {
      expect(document.activeElement).toBe(headlineInput);
    });
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
        .getByRole("button", { name: /Mover Datos destacados hacia arriba/i })
        .hasAttribute("disabled")
    ).toBe(true);
    expect(
      within(cards[2]!)
        .getByRole("button", { name: /Mover Preguntas frecuentes hacia abajo/i })
        .hasAttribute("disabled")
    ).toBe(true);

    await user.click(
      within(cards[1]!).getByRole("button", { name: /Mover Datos destacados hacia arriba/i })
    );
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
    const cardsAfterAmbiguous = screen.getAllByTestId(/^story-block-(?!list$)/);
    await user.click(
      within(cardsAfterAmbiguous[1]!).getByRole("button", {
        name: /Mover Datos destacados hacia arriba/i,
      })
    );
    await user.click(screen.getByTestId("story-save-draft"));
    await waitFor(() => expect(mocks.saveDraft).toHaveBeenCalledTimes(2));

    expect(mocks.saveDraft.mock.calls[0]?.[0].mutationRequestId).not.toBe(
      mocks.saveDraft.mock.calls[1]?.[0].mutationRequestId
    );
  });

  it("reuses mutationRequestId for an exact unchanged retry after structured UNKNOWN_ERROR", async () => {
    const user = userEvent.setup();
    mocks.saveDraft
      .mockResolvedValueOnce({
        success: false,
        code: "UNKNOWN_ERROR",
        error: "Ocurrió un error inesperado al procesar la historia.",
      })
      .mockResolvedValueOnce({
        ...successfulSave(3, DRAFT_ID),
        data: {
          ...successfulSave(3, DRAFT_ID).data,
          replayed: true,
        },
      });

    render(<StoryBuilder initialStory={makeStory()} />);
    await user.click(screen.getAllByRole("button", { name: /Duplicar/i })[0]!);
    expect(screen.getAllByTestId(/^story-block-(?!list$)/)).toHaveLength(3);

    await user.click(screen.getByTestId("story-save-draft"));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Reintentar guardado" })).toBeTruthy()
    );

    expect(screen.getAllByTestId(/^story-block-(?!list$)/)).toHaveLength(3);
    expect(screen.getByTestId("story-dirty-state").textContent).toBe("Cambios sin guardar");
    expect(screen.getByTestId("story-error").textContent).toContain(
      "No se pudo confirmar el resultado en el servidor"
    );

    await user.click(screen.getByRole("button", { name: "Reintentar guardado" }));
    await waitFor(() => expect(mocks.saveDraft).toHaveBeenCalledTimes(2));

    expect(mocks.saveDraft.mock.calls[0]?.[0].mutationRequestId).toBe(
      mocks.saveDraft.mock.calls[1]?.[0].mutationRequestId
    );
    expect(screen.getByTestId("story-dirty-state").textContent).toBe(
      "Todos los cambios están guardados"
    );
    expect(screen.getByTestId("story-success").textContent).toContain(
      "confirmado sin crear otra revisión"
    );
  });

  it("generates a new mutationRequestId when payload changes after structured UNKNOWN_ERROR", async () => {
    const user = userEvent.setup();
    mocks.saveDraft
      .mockResolvedValueOnce({
        success: false,
        code: "UNKNOWN_ERROR",
        error: "Ocurrió un error inesperado al procesar la historia.",
      })
      .mockResolvedValueOnce(successfulSave());

    render(<StoryBuilder initialStory={makeStory()} />);
    await user.click(screen.getAllByRole("button", { name: /Duplicar/i })[0]!);
    await user.click(screen.getByTestId("story-save-draft"));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Reintentar guardado" })).toBeTruthy()
    );

    const cardsAfterUnknown = screen.getAllByTestId(/^story-block-(?!list$)/);
    await user.click(
      within(cardsAfterUnknown[1]!).getByRole("button", {
        name: /Mover Datos destacados hacia arriba/i,
      })
    );
    await user.click(screen.getByTestId("story-save-draft"));
    await waitFor(() => expect(mocks.saveDraft).toHaveBeenCalledTimes(2));

    expect(mocks.saveDraft.mock.calls[0]?.[0].mutationRequestId).not.toBe(
      mocks.saveDraft.mock.calls[1]?.[0].mutationRequestId
    );
  });

  it("treats definitive domain rejection as completed and does not mark save ambiguous", async () => {
    const user = userEvent.setup();
    mocks.saveDraft
      .mockResolvedValueOnce({
        success: false,
        code: "STORY_VALIDATION_ERROR",
        error: "Revisa los campos señalados antes de continuar.",
        fieldErrors: [{ code: "INVALID", path: "blocks[0]", message: "Contenido inválido." }],
      })
      .mockResolvedValueOnce(successfulSave());

    render(<StoryBuilder initialStory={makeStory()} />);
    await user.click(screen.getAllByRole("button", { name: /Duplicar/i })[0]!);
    await user.click(screen.getByTestId("story-save-draft"));

    await waitFor(() => expect(screen.getByTestId("story-error")).toBeTruthy());
    expect(screen.getByTestId("story-save-draft").textContent).toBe("Guardar borrador");
    expect(screen.queryByRole("button", { name: "Reintentar guardado" })).toBeNull();
    expect(screen.getAllByTestId(/^story-block-(?!list$)/)).toHaveLength(3);
    expect(screen.getByTestId("story-dirty-state").textContent).toBe("Cambios sin guardar");

    await user.click(screen.getByTestId("story-save-draft"));
    await waitFor(() => expect(mocks.saveDraft).toHaveBeenCalledTimes(2));

    expect(mocks.saveDraft.mock.calls[0]?.[0].mutationRequestId).not.toBe(
      mocks.saveDraft.mock.calls[1]?.[0].mutationRequestId
    );
  });

  it("reuses mutationRequestId for an exact unchanged retry after structured UNKNOWN_ERROR discard", async () => {
    const user = userEvent.setup();
    mocks.discardDraft
      .mockResolvedValueOnce({
        success: false,
        code: "UNKNOWN_ERROR",
        error: "Ocurrió un error inesperado al procesar la historia.",
      })
      .mockResolvedValueOnce({
        success: true,
        data: {
          productId: PRODUCT_ID,
          productSlug: "mouse-gamer-e2e",
          revisionId: DRAFT_ID,
          revisionNumber: 2,
          draftRevisionId: null,
          publishedRevisionId: null,
          publishedAt: null,
          replayed: true,
        },
      });

    render(<StoryBuilder initialStory={makeStory()} />);
    await user.click(screen.getByTestId("story-discard-draft"));
    await user.click(screen.getByRole("button", { name: "Descartar borrador" }));
    await waitFor(() =>
      expect(screen.getByTestId("story-error").textContent).toContain(
        "No se pudo confirmar si el descarte concluyó en el servidor"
      )
    );

    await user.click(screen.getByTestId("story-discard-draft"));
    await user.click(screen.getByRole("button", { name: "Descartar borrador" }));
    await waitFor(() => expect(mocks.discardDraft).toHaveBeenCalledTimes(2));

    expect(mocks.discardDraft.mock.calls[0]?.[0].mutationRequestId).toBe(
      mocks.discardDraft.mock.calls[1]?.[0].mutationRequestId
    );
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
  });

  it("confirms durable discard, completes tracker, and resets after authoritative props refresh", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<StoryBuilder initialStory={makeStory()} />);
    await user.click(screen.getByTestId("story-discard-draft"));
    await user.click(screen.getByRole("button", { name: "Descartar borrador" }));
    await waitFor(() => expect(mocks.discardDraft).toHaveBeenCalledTimes(1));
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("story-success").textContent).toContain(
      "Borrador descartado. Recargando la versión autorizada del servidor."
    );

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
        .getByRole("button", { name: /Mover Datos destacados hacia arriba/i })
        .hasAttribute("disabled")
    ).toBe(true);
    expect(
      within(cards[1]!)
        .getByRole("button", { name: /Mover Preguntas frecuentes hacia abajo/i })
        .hasAttribute("disabled")
    ).toBe(true);
    fireEvent.keyDown(
      within(cards[0]!).getByRole("button", { name: /Mover Datos destacados hacia arriba/i }),
      {
        key: "Enter",
      }
    );
    expect(screen.getAllByTestId(/^story-block-(?!list$)/)[0]!.getAttribute("data-block-id")).toBe(
      FIRST_BLOCK_ID
    );
  });
});

describe("Historia — densidad y videos del producto", () => {
  const VIDEO_BLOCK_ID = "018f0026-0000-7000-8000-000000000103";
  const STORY_VIDEO_ID = "018f0026-1000-7000-8000-000000000003";
  const storyVideo = {
    productMediaId: STORY_VIDEO_ID,
    mediaAssetId: "018f0026-9000-7000-8000-000000000003",
    variantId: null,
    variantTitle: null,
    displayOrder: 0,
    placement: "STORY" as const,
    mediaType: "VIDEO" as const,
    mimeType: "video/mp4",
    publicUrl: "https://example.com/story-clip.mp4",
    width: 1920,
    height: 1080,
    altText: "Clip de la historia",
  };

  function storyWithVideo(): AdminProductStoryDto {
    return {
      ...makeStory("DRAFT_ONLY", [
        ...validDocument,
        { blockId: VIDEO_BLOCK_ID, type: "video", payload: { videoMediaId: STORY_VIDEO_ID } },
      ]),
      selectableMedia: [storyVideo],
    };
  }

  it("despliega solo el primer bloque y los incompletos al abrir", () => {
    render(
      <StoryBuilder
        initialStory={makeStory("DRAFT_ONLY", [
          ...validDocument,
          { blockId: VIDEO_BLOCK_ID, type: "video", payload: {} } as AuthoringStoryDocument[number],
        ])}
      />
    );
    const expanded = (position: number) =>
      screen
        .getByRole("button", { name: new RegExp(`(Colapsar|Expandir) bloque ${position}$`) })
        .getAttribute("aria-expanded");
    expect(expanded(1)).toBe("true");
    expect(expanded(2)).toBe("false");
    expect(expanded(3)).toBe("true");
  });

  it("elimina un video de historia del producto y deja pendiente el bloque que lo usaba", async () => {
    const user = userEvent.setup();
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
    mocks.detachMedia.mockResolvedValue({
      success: true,
      data: { success: true, replayed: false },
    });
    render(<StoryBuilder initialStory={storyWithVideo()} />);

    await user.click(screen.getByRole("button", { name: "Expandir bloque 3" }));
    const videoCard = screen.getByTestId(`story-block-${VIDEO_BLOCK_ID}`);
    expect(within(videoCard).getByText("Bloque completo")).toBeTruthy();
    expect(within(videoCard).getByTestId("video-thumb")).toBeTruthy();

    await user.click(
      within(videoCard).getByRole("button", { name: /Cambiar video mp4 del producto/i })
    );
    const dialog = screen.getByRole("dialog", { name: "Seleccionar video del producto" });
    await user.click(
      within(dialog).getByRole("button", { name: "Eliminar del producto: Clip de la historia" })
    );
    await user.click(within(dialog).getByRole("button", { name: /Sí, eliminar/ }));

    await waitFor(() => expect(mocks.detachMedia).toHaveBeenCalledTimes(1));
    expect(mocks.detachMedia.mock.calls[0]?.[0]).toEqual({
      productId: PRODUCT_ID,
      productMediaId: STORY_VIDEO_ID,
      mutationRequestId: expect.stringMatching(/^[0-9a-f-]{36}$/i),
    });
    await waitFor(() => expect(within(dialog).queryAllByRole("option")).toHaveLength(0));
    expect(within(videoCard).getByText("Configuración pendiente")).toBeTruthy();
    expect(within(videoCard).queryByTestId("video-thumb")).toBeNull();
    expect(screen.getByTestId("story-dirty-state").textContent).toBe("Cambios sin guardar");
    vi.restoreAllMocks();
  });

  it("conserva el video y reutiliza el mutationRequestId si la eliminación pierde la conexión", async () => {
    const user = userEvent.setup();
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
    mocks.detachMedia.mockRejectedValueOnce(new Error("network")).mockResolvedValueOnce({
      success: false,
      error: "No puedes quitar la imagen principal.",
      code: "PRIMARY_MEDIA_CANNOT_BE_DETACHED",
    });
    render(<StoryBuilder initialStory={storyWithVideo()} />);

    await user.click(screen.getByRole("button", { name: "Expandir bloque 3" }));
    await user.click(screen.getByRole("button", { name: /Cambiar video mp4 del producto/i }));
    const dialog = screen.getByRole("dialog", { name: "Seleccionar video del producto" });

    const deleteOnce = async () => {
      await user.click(
        within(dialog).getByRole("button", { name: "Eliminar del producto: Clip de la historia" })
      );
      await user.click(within(dialog).getByRole("button", { name: /Sí, eliminar/ }));
    };

    await deleteOnce();
    await waitFor(() =>
      expect(within(dialog).getByRole("status").textContent).toMatch(/Se perdió la conexión/)
    );
    await deleteOnce();
    await waitFor(() =>
      expect(within(dialog).getByRole("status").textContent).toBe(
        "No puedes quitar la imagen principal."
      )
    );

    const [first, second] = mocks.detachMedia.mock.calls.map((call) => call[0]);
    expect(second.mutationRequestId).toBe(first.mutationRequestId);
    expect(within(dialog).getAllByRole("option")).toHaveLength(1);
    expect(screen.getByTestId("story-dirty-state").textContent).not.toBe("Cambios sin guardar");
    vi.restoreAllMocks();
  });
});

describe("GP-026 CHK4 Story Builder model & path adapter", () => {
  it("translates token-exact canonical persisted leaves without loose substring matches (Amendment 12)", () => {
    expect(
      adaptPersistedValidationIssueToAuthoring({
        path: "blocks.0.mediaKey",
        code: "invalid_string",
        message: "Media key invalid",
      })
    ).toEqual({
      path: "blocks.0.mediaId",
      code: "invalid_string",
      message: "Media key invalid",
    });

    expect(
      adaptPersistedValidationIssueToAuthoring({
        path: "blocks.1.posterKey",
        code: "invalid_string",
        message: "Poster invalid",
      })
    ).toEqual({
      path: "blocks.1.posterMediaId",
      code: "invalid_string",
      message: "Poster invalid",
    });

    expect(
      adaptPersistedValidationIssueToAuthoring({
        path: "blocks.2.videoKey",
        code: "invalid_string",
        message: "Video invalid",
      })
    ).toEqual({
      path: "blocks.2.videoMediaId",
      code: "invalid_string",
      message: "Video invalid",
    });

    expect(
      adaptPersistedValidationIssueToAuthoring({
        path: "blocks.3.blueprintMediaKey",
        code: "invalid_string",
        message: "Blueprint invalid",
      })
    ).toEqual({
      path: "blocks.3.blueprintMediaId",
      code: "invalid_string",
      message: "Blueprint invalid",
    });

    expect(
      adaptPersistedValidationIssueToAuthoring({
        path: "blocks.4.productSlugs",
        code: "too_small",
        message: "Product slugs invalid",
      })
    ).toEqual({
      path: "blocks.4.productIds",
      code: "too_small",
      message: "Product slugs invalid",
    });

    expect(
      adaptPersistedValidationIssueToAuthoring({
        path: "blocks.0.items.1.mediaKey",
        code: "invalid_string",
        message: "Item media key invalid",
      })
    ).toEqual({
      path: "blocks.0.items.1.mediaId",
      code: "invalid_string",
      message: "Item media key invalid",
    });

    expect(
      adaptPersistedValidationIssueToAuthoring({
        path: "blocks.0.multimediaKey",
        code: "custom",
        message: "Custom issue",
      })
    ).toEqual({
      path: "blocks.0.multimediaKey",
      code: "custom",
      message: "Custom issue",
    });

    expect(
      adaptPersistedValidationIssueToAuthoring({
        path: "blocks.0.mediaKeyDescription",
        code: "custom",
        message: "Custom issue",
      })
    ).toEqual({
      path: "blocks.0.mediaKeyDescription",
      code: "custom",
      message: "Custom issue",
    });
  });
});

describe("GP-026 CHK4 Preview button eligibility", () => {
  it("disables preview button when no durable draft exists", () => {
    render(<StoryBuilder initialStory={makeStory("NO_STORY")} />);
    const previewBtn = screen.getByTestId("story-preview-button");
    expect(previewBtn.hasAttribute("disabled")).toBe(true);
    expect(screen.getByText("Guarda un borrador antes de previsualizar.")).toBeTruthy();
  });

  it("disables preview button in PUBLISHED_ONLY when no separate draft exists", () => {
    render(<StoryBuilder initialStory={makeStory("PUBLISHED_ONLY")} />);
    const previewBtn = screen.getByTestId("story-preview-button");
    expect(previewBtn.hasAttribute("disabled")).toBe(true);
    expect(screen.getByText("Guarda un borrador antes de previsualizar.")).toBeTruthy();
  });

  it("disables preview button when durable draft exists but local editor is dirty", async () => {
    const user = userEvent.setup();
    render(<StoryBuilder initialStory={makeStory("DRAFT_ONLY")} />);
    const previewBtn = screen.getByTestId("story-preview-button");
    expect(previewBtn.hasAttribute("disabled")).toBe(false);

    await user.click(screen.getAllByRole("button", { name: /Duplicar/i })[0]!);
    expect(previewBtn.hasAttribute("disabled")).toBe(true);
    expect(screen.getByText("Guarda los cambios antes de previsualizar.")).toBeTruthy();
  });

  it("opens preview in a new window when clean durable draft exists", async () => {
    const user = userEvent.setup();
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
    render(<StoryBuilder initialStory={makeStory("DRAFT_ONLY")} />);
    const previewBtn = screen.getByTestId("story-preview-button");
    expect(previewBtn.hasAttribute("disabled")).toBe(false);

    await user.click(previewBtn);
    expect(openSpy).toHaveBeenCalledWith(
      `/admin/products/${PRODUCT_ID}/story/preview?revision=${DRAFT_ID}`,
      "_blank",
      "noopener,noreferrer"
    );
    openSpy.mockRestore();
  });
});

describe("GP-026 CHK4 Permission UX", () => {
  it("displays restriction banner and disables publish/unpublish when canPublish is false", () => {
    render(<StoryBuilder initialStory={makeStory("DRAFT_OVER_PUBLISHED")} canPublish={false} />);
    expect(screen.getByTestId("story-publish-permission-warning")).toBeTruthy();
    expect(screen.getByText(/catalog:publish/i)).toBeTruthy();

    const publishBtn = screen.getByTestId("story-publish-button");
    expect(publishBtn.hasAttribute("disabled")).toBe(true);

    const unpublishBtn = screen.getByTestId("story-unpublish-button");
    expect(unpublishBtn.hasAttribute("disabled")).toBe(true);
  });

  it("does not display restriction banner when canPublish is true", () => {
    render(<StoryBuilder initialStory={makeStory("DRAFT_OVER_PUBLISHED")} canPublish={true} />);
    expect(screen.queryByTestId("story-publish-permission-warning")).toBeNull();
  });
});

describe("GP-026 CHK4 Publish baseline & mutation safety", () => {
  it("publishes clean durable draft, preserves canonical baseline, sets lifecycle to PUBLISHED_ONLY, and tracks dirty on subsequent edit (Amendments 2 & 15)", async () => {
    const user = userEvent.setup();
    render(<StoryBuilder initialStory={makeStory("DRAFT_ONLY")} canPublish={true} />);

    const publishBtn = screen.getByTestId("story-publish-button");
    expect(publishBtn.hasAttribute("disabled")).toBe(false);

    await user.click(publishBtn);

    const dialog = screen.getByRole("dialog", { name: "Publicar historia" });
    expect(dialog).toBeTruthy();

    const confirmBtn = within(dialog).getByRole("button", { name: "Publicar historia" });
    await user.click(confirmBtn);

    await waitFor(() => {
      expect(mocks.publishStory).toHaveBeenCalledWith({
        productId: PRODUCT_ID,
        expectedDraftRevisionId: DRAFT_ID,
        expectedPublishedRevisionId: null,
        mutationRequestId: expect.stringMatching(
          /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
        ),
      });
    });

    await waitFor(() => {
      expect(screen.getByTestId("story-lifecycle-status").textContent).toContain("Publicada r5");
    });

    expect(screen.getAllByTestId(/^story-block-(?!list$)/)).toHaveLength(2);
    expect(screen.getByTestId("story-dirty-state").textContent).toContain(
      "Todos los cambios están guardados"
    );

    await user.click(screen.getAllByRole("button", { name: /Duplicar/i })[0]!);
    expect(screen.getByTestId("story-dirty-state").textContent).toContain("Cambios sin guardar");

    await user.click(screen.getByTestId("story-save-draft"));
    await waitFor(() => {
      expect(mocks.saveDraft).toHaveBeenCalledWith(
        expect.objectContaining({
          expectedDraftRevisionId: null,
          expectedPublishedRevisionId: "018f0026-0000-7000-8000-000000000099",
        })
      );
    });
  });

  it("persists ambiguousPublish across local edits, blocks competing durable mutations, proves reload ordering, reuses exact mutationRequestId on retry, and resolves only on authoritative reload (BR2 Sections 7 & 10)", async () => {
    const user = userEvent.setup();
    mocks.publishStory.mockResolvedValueOnce({
      success: false,
      code: "UNKNOWN_ERROR",
      error: "Timeout while publishing",
    });

    const { rerender } = render(
      <StoryBuilder initialStory={makeStory("DRAFT_OVER_PUBLISHED")} canPublish={true} />
    );

    const publishBtn = screen.getByTestId("story-publish-button");
    const saveBtn = screen.getByTestId("story-save-draft");
    const discardBtn = screen.getByTestId("story-discard-draft");
    const unpublishBtn = screen.getByTestId("story-unpublish-button");

    await user.click(publishBtn);
    const dialog = screen.getByRole("dialog", { name: "Publicar historia" });
    await user.click(within(dialog).getByRole("button", { name: "Publicar historia" }));

    // 1. Publish returns UNKNOWN_ERROR.
    // 2. Capture original mutationRequestId.
    // 3. ambiguousPublish is active.
    await waitFor(() => {
      expect(screen.getByText(/No se pudo confirmar el resultado de la publicación/i)).toBeTruthy();
    });
    const firstRequestId = mocks.publishStory.mock.calls[0]![0].mutationRequestId;
    expect(firstRequestId).toBeTruthy();

    // 3b. Save/Discard/new Unpublish remain blocked.
    expect(saveBtn.hasAttribute("disabled")).toBe(true);
    expect(discardBtn.hasAttribute("disabled")).toBe(true);
    expect(unpublishBtn.hasAttribute("disabled")).toBe(true);

    // 4. Edit a Story field.
    const titleInput = screen.getByDisplayValue("Rendimiento");
    await user.type(titleInput, " Actualizado");

    // 5. ambiguousPublish REMAINS active.
    expect(screen.getByText(/No se pudo confirmar el resultado de la publicación/i)).toBeTruthy();

    // 6. Save/Discard/new competing publication remain blocked.
    expect(saveBtn.hasAttribute("disabled")).toBe(true);
    expect(discardBtn.hasAttribute("disabled")).toBe(true);
    expect(unpublishBtn.hasAttribute("disabled")).toBe(true);

    // 4 & 5. Operator clicks "Recargar desde servidor" and confirms reload.
    await user.click(screen.getByRole("button", { name: /Recargar desde servidor/i }));
    const reloadDialog = screen.getByRole("dialog", { name: "Recargar versión del servidor" });
    await user.click(within(reloadDialog).getByRole("button", { name: "Recargar servidor" }));

    // 6. Assert router.refresh() was requested.
    expect(mocks.refresh).toHaveBeenCalled();

    // 7. BEFORE rerendering with authoritative initialStory, assert:
    // - ambiguity is STILL visible/active;
    // - Save is blocked;
    // - Discard is blocked;
    // - competing Unpublish is blocked;
    // - Publish retry remains available;
    // - original publish MutationRequestTracker has NOT been completed/reset.
    expect(screen.getByText(/No se pudo confirmar el resultado de la publicación/i)).toBeTruthy();
    expect(saveBtn.hasAttribute("disabled")).toBe(true);
    expect(discardBtn.hasAttribute("disabled")).toBe(true);
    expect(unpublishBtn.hasAttribute("disabled")).toBe(true);
    expect(publishBtn.hasAttribute("disabled")).toBe(false);
    expect(publishBtn.textContent).toContain("Reintentar publicación");

    // 8. Retry Publish BEFORE authoritative props arrive.
    mocks.publishStory.mockResolvedValueOnce({
      success: false,
      code: "UNKNOWN_ERROR",
      error: "Second timeout before reload props arrive",
    });
    await user.click(publishBtn);

    // 9. Assert retry still uses the SAME original mutationRequestId.
    await waitFor(() => {
      expect(mocks.publishStory).toHaveBeenCalledTimes(2);
    });
    expect(mocks.publishStory.mock.calls[1]![0].mutationRequestId).toBe(firstRequestId);

    // 10. Then rerender with authoritative refreshed initialStory.
    rerender(<StoryBuilder initialStory={makeStory("DRAFT_OVER_PUBLISHED")} canPublish={true} />);

    // 11. Assert:
    // - ambiguity clears;
    // - tracker identity is now reset;
    // - subsequent new Publish uses a NEW mutationRequestId.
    expect(screen.queryByText(/No se pudo confirmar el resultado de la publicación/i)).toBeNull();

    mocks.publishStory.mockResolvedValueOnce(successfulPublish());
    await user.click(screen.getByTestId("story-publish-button"));
    const nextDialog = screen.getByRole("dialog", { name: "Publicar historia" });
    await user.click(within(nextDialog).getByRole("button", { name: "Publicar historia" }));

    await waitFor(() => {
      expect(mocks.publishStory).toHaveBeenCalledTimes(3);
    });
    expect(mocks.publishStory.mock.calls[2]![0].mutationRequestId).not.toBe(firstRequestId);
  });

  it("persists ambiguousUnpublish across local edits, blocks competing durable mutations, proves reload ordering, reuses exact mutationRequestId on retry, and resolves only on authoritative reload (BR2 Section 8)", async () => {
    const user = userEvent.setup();
    mocks.unpublishStory.mockResolvedValueOnce({
      success: false,
      code: "UNKNOWN_ERROR",
      error: "Timeout while unpublishing",
    });

    const { rerender } = render(
      <StoryBuilder initialStory={makeStory("DRAFT_OVER_PUBLISHED")} canPublish={true} />
    );

    const publishBtn = screen.getByTestId("story-publish-button");
    const saveBtn = screen.getByTestId("story-save-draft");
    const discardBtn = screen.getByTestId("story-discard-draft");
    const unpublishBtn = screen.getByTestId("story-unpublish-button");

    await user.click(unpublishBtn);
    const dialog = screen.getByRole("dialog", { name: "Despublicar historia" });
    await user.click(within(dialog).getByRole("button", { name: "Despublicar historia" }));

    // 1. Unpublish returns UNKNOWN_ERROR.
    // 2. Capture original mutationRequestId.
    // 3. ambiguousUnpublish becomes active.
    await waitFor(() => {
      expect(
        screen.getByText(/No se pudo confirmar el resultado de la despublicación/i)
      ).toBeTruthy();
    });
    const firstRequestId = mocks.unpublishStory.mock.calls[0]![0].mutationRequestId;
    expect(firstRequestId).toBeTruthy();

    // 3b. Save/Discard/new Publish remain blocked.
    expect(saveBtn.hasAttribute("disabled")).toBe(true);
    expect(discardBtn.hasAttribute("disabled")).toBe(true);
    expect(publishBtn.hasAttribute("disabled")).toBe(true);

    // 4. Edit a Story field.
    const titleInput = screen.getByDisplayValue("Rendimiento");
    await user.type(titleInput, " Actualizado");

    // 5. ambiguousUnpublish REMAINS active.
    expect(
      screen.getByText(/No se pudo confirmar el resultado de la despublicación/i)
    ).toBeTruthy();

    // 6. Save/Discard/new competing publication remain blocked.
    expect(saveBtn.hasAttribute("disabled")).toBe(true);
    expect(discardBtn.hasAttribute("disabled")).toBe(true);
    expect(publishBtn.hasAttribute("disabled")).toBe(true);

    // Request authoritative reload and confirm.
    await user.click(screen.getByRole("button", { name: /Recargar desde servidor/i }));
    const reloadDialog = screen.getByRole("dialog", { name: "Recargar versión del servidor" });
    await user.click(within(reloadDialog).getByRole("button", { name: "Recargar servidor" }));

    // Assert router.refresh() called.
    expect(mocks.refresh).toHaveBeenCalled();

    // 7. BEFORE refreshed props arrive:
    // - ambiguity remains active;
    // - Save/Discard/Publish remain blocked;
    // - exact Unpublish retry remains available;
    // - original unpublish tracker has not been completed.
    expect(
      screen.getByText(/No se pudo confirmar el resultado de la despublicación/i)
    ).toBeTruthy();
    expect(saveBtn.hasAttribute("disabled")).toBe(true);
    expect(discardBtn.hasAttribute("disabled")).toBe(true);
    expect(publishBtn.hasAttribute("disabled")).toBe(true);
    expect(unpublishBtn.hasAttribute("disabled")).toBe(false);
    expect(unpublishBtn.textContent).toContain("Reintentar despublicación");

    // 8. Retry Unpublish BEFORE authoritative props arrive.
    mocks.unpublishStory.mockResolvedValueOnce({
      success: false,
      code: "UNKNOWN_ERROR",
      error: "Second timeout",
    });
    await user.click(unpublishBtn);

    // 9. Assert retry still uses the SAME original mutationRequestId.
    await waitFor(() => {
      expect(mocks.unpublishStory).toHaveBeenCalledTimes(2);
    });
    expect(mocks.unpublishStory.mock.calls[1]![0].mutationRequestId).toBe(firstRequestId);

    // 10. Then rerender with authoritative refreshed initialStory.
    rerender(<StoryBuilder initialStory={makeStory("DRAFT_OVER_PUBLISHED")} canPublish={true} />);

    // 11. Assert:
    // - ambiguity clears;
    // - tracker resets;
    // - later new Unpublish receives fresh mutationRequestId.
    expect(
      screen.queryByText(/No se pudo confirmar el resultado de la despublicación/i)
    ).toBeNull();

    mocks.unpublishStory.mockResolvedValueOnce(successfulUnpublish());
    await user.click(screen.getByTestId("story-unpublish-button"));
    const nextDialog = screen.getByRole("dialog", { name: "Despublicar historia" });
    await user.click(within(nextDialog).getByRole("button", { name: "Despublicar historia" }));

    await waitFor(() => {
      expect(mocks.unpublishStory).toHaveBeenCalledTimes(3);
    });
    expect(mocks.unpublishStory.mock.calls[2]![0].mutationRequestId).not.toBe(firstRequestId);
  });

  it("keeps ambiguity active and preserves original mutationRequestId when router.refresh throws or does not arrive (BR2 Section 9)", async () => {
    const user = userEvent.setup();
    mocks.publishStory.mockResolvedValueOnce({
      success: false,
      code: "UNKNOWN_ERROR",
      error: "Initial timeout",
    });

    // Make router.refresh throw synchronously to test failure path
    mocks.refresh.mockImplementationOnce(() => {
      throw new Error("Network disconnection during refresh");
    });

    render(<StoryBuilder initialStory={makeStory("DRAFT_OVER_PUBLISHED")} canPublish={true} />);

    const publishBtn = screen.getByTestId("story-publish-button");
    const saveBtn = screen.getByTestId("story-save-draft");
    const discardBtn = screen.getByTestId("story-discard-draft");

    await user.click(publishBtn);
    const dialog = screen.getByRole("dialog", { name: "Publicar historia" });
    await user.click(within(dialog).getByRole("button", { name: "Publicar historia" }));

    await waitFor(() => {
      expect(screen.getByText(/No se pudo confirmar el resultado de la publicación/i)).toBeTruthy();
    });
    const originalRequestId = mocks.publishStory.mock.calls[0]![0].mutationRequestId;

    // Operator requests authoritative reload
    await user.click(screen.getByRole("button", { name: /Recargar desde servidor/i }));
    const reloadDialog = screen.getByRole("dialog", { name: "Recargar versión del servidor" });
    await user.click(within(reloadDialog).getByRole("button", { name: "Recargar servidor" }));

    // router.refresh was called (and threw safely handled error)
    expect(mocks.refresh).toHaveBeenCalled();

    // No new authoritative props arrived:
    // Ambiguity MUST NOT be cleared
    expect(screen.getByText(/No se pudo confirmar el resultado de la publicación/i)).toBeTruthy();
    expect(saveBtn.hasAttribute("disabled")).toBe(true);
    expect(discardBtn.hasAttribute("disabled")).toBe(true);
    expect(publishBtn.hasAttribute("disabled")).toBe(false);

    // Operator retries exact ambiguous operation
    mocks.publishStory.mockResolvedValueOnce({
      success: false,
      code: "UNKNOWN_ERROR",
      error: "Still timeout",
    });
    await user.click(publishBtn);

    await waitFor(() => {
      expect(mocks.publishStory).toHaveBeenCalledTimes(2);
    });
    // Still uses the original mutationRequestId!
    expect(mocks.publishStory.mock.calls[1]![0].mutationRequestId).toBe(originalRequestId);

    // Operator can also retry authoritative reload
    await user.click(screen.getByRole("button", { name: /Recargar desde servidor/i }));
    expect(screen.getByRole("dialog", { name: "Recargar versión del servidor" })).toBeTruthy();
  });

  it("enforces authoritative reload ordering for ambiguousSave, keeping tracker and ambiguity until server state is accepted (BR2 Section 10)", async () => {
    const user = userEvent.setup();
    mocks.saveDraft.mockResolvedValueOnce({
      success: false,
      code: "UNKNOWN_ERROR",
      error: "Save timeout",
    });

    const { rerender } = render(
      <StoryBuilder initialStory={makeStory("DRAFT_ONLY")} canPublish={true} />
    );

    const titleInput = screen.getByDisplayValue("Rendimiento");
    await user.type(titleInput, " Modificado");

    const saveBtn = screen.getByTestId("story-save-draft");
    await user.click(saveBtn);

    await waitFor(() => {
      expect(screen.getByText(/No se pudo confirmar el resultado en el servidor/i)).toBeTruthy();
    });
    const saveRequestId = mocks.saveDraft.mock.calls[0]![0].mutationRequestId;
    expect(saveRequestId).toBeTruthy();

    // Request reload
    await user.click(screen.getByRole("button", { name: /Recargar desde servidor/i }));
    const reloadDialog = screen.getByRole("dialog", { name: "Recargar versión del servidor" });
    await user.click(within(reloadDialog).getByRole("button", { name: "Recargar servidor" }));

    expect(mocks.refresh).toHaveBeenCalled();

    // BEFORE authoritative props arrive:
    // ambiguousSave is STILL active, retry save is available and reuses same mutationRequestId
    expect(screen.getByText(/No se pudo confirmar el resultado en el servidor/i)).toBeTruthy();
    expect(saveBtn.textContent).toContain("Reintentar guardado");

    mocks.saveDraft.mockResolvedValueOnce({
      success: false,
      code: "UNKNOWN_ERROR",
      error: "Second save timeout",
    });
    await user.click(saveBtn);

    await waitFor(() => {
      expect(mocks.saveDraft).toHaveBeenCalledTimes(2);
    });
    expect(mocks.saveDraft.mock.calls[1]![0].mutationRequestId).toBe(saveRequestId);

    // After authoritative props arrive:
    rerender(<StoryBuilder initialStory={makeStory("DRAFT_ONLY")} canPublish={true} />);

    // ambiguousSave clears and tracker resets
    expect(screen.queryByText(/No se pudo confirmar el resultado en el servidor/i)).toBeNull();

    // Next edit + save uses a NEW mutationRequestId
    const freshInput = screen.getByDisplayValue("Rendimiento");
    await user.type(freshInput, " Otra Vez");
    mocks.saveDraft.mockResolvedValueOnce(successfulSave(5));
    await user.click(screen.getByTestId("story-save-draft"));

    await waitFor(() => {
      expect(mocks.saveDraft).toHaveBeenCalledTimes(3);
    });
    expect(mocks.saveDraft.mock.calls[2]![0].mutationRequestId).not.toBe(saveRequestId);
  });
});

describe("GP-026 CHK4 Unpublish state preservation (Amendments 1, 3, 14)", () => {
  it("CASE A: DRAFT_OVER_PUBLISHED preserves draft, baseline, local document, and dirty state exactly (Amendment 14A)", async () => {
    const user = userEvent.setup();
    render(<StoryBuilder initialStory={makeStory("DRAFT_OVER_PUBLISHED")} canPublish={true} />);

    await user.click(screen.getAllByRole("button", { name: /Duplicar/i })[0]!);
    expect(screen.getByTestId("story-dirty-state").textContent).toContain("Cambios sin guardar");
    expect(screen.getAllByTestId(/^story-block-(?!list$)/)).toHaveLength(3);

    const unpublishBtn = screen.getByTestId("story-unpublish-button");
    await user.click(unpublishBtn);

    const dialog = screen.getByRole("dialog", { name: "Despublicar historia" });
    expect(dialog).toBeTruthy();
    await user.click(within(dialog).getByRole("button", { name: "Despublicar historia" }));

    await waitFor(() => {
      expect(mocks.unpublishStory).toHaveBeenCalledWith({
        productId: PRODUCT_ID,
        expectedDraftRevisionId: DRAFT_ID,
        expectedPublishedRevisionId: PUBLISHED_ID,
        mutationRequestId: expect.any(String),
      });
    });

    expect(mocks.refresh).not.toHaveBeenCalled();

    await waitFor(() => {
      expect(screen.getByTestId("story-lifecycle-status").textContent).toContain("Borrador r4");
    });

    expect(screen.getAllByTestId(/^story-block-(?!list$)/)).toHaveLength(3);
    expect(screen.getByTestId("story-dirty-state").textContent).toContain("Cambios sin guardar");
    expect(screen.queryByTestId("story-unpublish-button")).toBeNull();
  });

  it("CASE B: PUBLISHED_ONLY preserves document, clears baseline to empty, sets dirty = true, and subsequent Save creates a new draft (Amendment 14B)", async () => {
    const user = userEvent.setup();
    render(<StoryBuilder initialStory={makeStory("PUBLISHED_ONLY")} canPublish={true} />);

    expect(screen.getByTestId("story-lifecycle-status").textContent).toContain("Publicada r3");
    expect(screen.getByTestId("story-dirty-state").textContent).toContain(
      "Todos los cambios están guardados"
    );
    expect(screen.getAllByTestId(/^story-block-(?!list$)/)).toHaveLength(2);

    await user.click(screen.getByTestId("story-unpublish-button"));
    const dialog = screen.getByRole("dialog", { name: "Despublicar historia" });
    await user.click(within(dialog).getByRole("button", { name: "Despublicar historia" }));

    await waitFor(() => {
      expect(mocks.unpublishStory).toHaveBeenCalledWith({
        productId: PRODUCT_ID,
        expectedDraftRevisionId: null,
        expectedPublishedRevisionId: PUBLISHED_ID,
        mutationRequestId: expect.any(String),
      });
    });

    expect(mocks.refresh).not.toHaveBeenCalled();

    await waitFor(() => {
      expect(screen.getByTestId("story-lifecycle-status").textContent).toContain("Sin historia");
    });

    expect(screen.getAllByTestId(/^story-block-(?!list$)/)).toHaveLength(2);
    expect(screen.getByTestId("story-dirty-state").textContent).toContain("Cambios sin guardar");

    await user.click(screen.getByTestId("story-save-draft"));

    await waitFor(() => {
      expect(mocks.saveDraft).toHaveBeenCalledWith(
        expect.objectContaining({
          expectedDraftRevisionId: null,
          expectedPublishedRevisionId: null,
        })
      );
    });
  });
});

describe("GP-026 CHK4 Confirmation dialog in-flight safety (Amendment 9)", () => {
  it("blocks Escape and Cancel while publish is in-flight", async () => {
    const user = userEvent.setup();
    let resolvePublish!: (val: unknown) => void;
    mocks.publishStory.mockReturnValueOnce(
      new Promise((res) => {
        resolvePublish = res;
      })
    );

    render(<StoryBuilder initialStory={makeStory("DRAFT_ONLY")} canPublish={true} />);
    await user.click(screen.getByTestId("story-publish-button"));
    const dialog = screen.getByRole("dialog", { name: "Publicar historia" });
    const confirmBtn = within(dialog).getByRole("button", { name: "Publicar historia" });
    const cancelBtn = within(dialog).getByRole("button", { name: "Cancelar" });

    await user.click(confirmBtn);

    expect(cancelBtn.hasAttribute("disabled")).toBe(true);

    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.getByRole("dialog", { name: "Publicar historia" })).toBeTruthy();

    resolvePublish(successfulPublish());
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Publicar historia" })).toBeNull();
    });
  });

  it("blocks Escape and Cancel while unpublish is in-flight", async () => {
    const user = userEvent.setup();
    let resolveUnpublish!: (val: unknown) => void;
    mocks.unpublishStory.mockReturnValueOnce(
      new Promise((res) => {
        resolveUnpublish = res;
      })
    );

    render(<StoryBuilder initialStory={makeStory("PUBLISHED_ONLY")} canPublish={true} />);
    await user.click(screen.getByTestId("story-unpublish-button"));
    const dialog = screen.getByRole("dialog", { name: "Despublicar historia" });
    const confirmBtn = within(dialog).getByRole("button", { name: "Despublicar historia" });
    const cancelBtn = within(dialog).getByRole("button", { name: "Cancelar" });

    await user.click(confirmBtn);

    expect(cancelBtn.hasAttribute("disabled")).toBe(true);

    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.getByRole("dialog", { name: "Despublicar historia" })).toBeTruthy();

    resolveUnpublish(successfulUnpublish());
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Despublicar historia" })).toBeNull();
    });
  });
});
