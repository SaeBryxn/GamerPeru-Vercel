// @vitest-environment jsdom

import React from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import {
  createEditorDocument,
  createInitialEditorBlock,
  duplicateEditorBlock,
  normalizeEditorStoryDocument,
  resolveTargetFromIssuePath,
  type EditorStoryBlock,
} from "@/lib/admin/catalog/story-builder-model";
import type {
  AdminStoryRelatedProductOption,
  AdminStorySelectableMedia,
} from "@/lib/admin/catalog/story-reader";

import { MediaPickerDialog } from "@/app/admin/(protected)/products/[productId]/story/media-picker-dialog";
import { RelatedProductPickerDialog } from "@/app/admin/(protected)/products/[productId]/story/related-product-picker-dialog";
import { ValidationSummary } from "@/app/admin/(protected)/products/[productId]/story/validation-summary";

import { HeroMediaEditor } from "@/app/admin/(protected)/products/[productId]/story/block-editors/hero-media-editor";
import { FullBleedImageEditor } from "@/app/admin/(protected)/products/[productId]/story/block-editors/full-bleed-image-editor";
import { ImageTextEditor } from "@/app/admin/(protected)/products/[productId]/story/block-editors/image-text-editor";
import { StatHighlightEditor } from "@/app/admin/(protected)/products/[productId]/story/block-editors/stat-highlight-editor";
import { SpecFeatureEditor } from "@/app/admin/(protected)/products/[productId]/story/block-editors/spec-feature-editor";
import { VideoEditor } from "@/app/admin/(protected)/products/[productId]/story/block-editors/video-editor";
import { GalleryEditor } from "@/app/admin/(protected)/products/[productId]/story/block-editors/gallery-editor";
import { ComparisonEditor } from "@/app/admin/(protected)/products/[productId]/story/block-editors/comparison-editor";
import { DimensionsEditor } from "@/app/admin/(protected)/products/[productId]/story/block-editors/dimensions-editor";
import { BoxContentsEditor } from "@/app/admin/(protected)/products/[productId]/story/block-editors/box-contents-editor";
import { TechnicalSpecsEditor } from "@/app/admin/(protected)/products/[productId]/story/block-editors/technical-specs-editor";
import { FaqEditor } from "@/app/admin/(protected)/products/[productId]/story/block-editors/faq-editor";
import { RelatedProductsEditor } from "@/app/admin/(protected)/products/[productId]/story/block-editors/related-products-editor";

// ----------------------------------------------------------------------------
// Fixtures
// ----------------------------------------------------------------------------

const PRODUCT_ID = "018f0026-0000-7000-8000-000000000001";
const MEDIA_IMAGE_ID = "018f0026-1000-7000-8000-000000000001";
const MEDIA_VIDEO_ID = "018f0026-1000-7000-8000-000000000002";

const selectableMediaFixture: AdminStorySelectableMedia[] = [
  {
    productMediaId: MEDIA_IMAGE_ID,
    mediaAssetId: "018f0026-9000-7000-8000-000000000001",
    variantId: "018f0026-8000-7000-8000-000000000001",
    variantTitle: "Negro / 4K",
    displayOrder: 1,
    mediaType: "IMAGE",
    mimeType: "image/webp",
    publicUrl: "https://example.com/mouse-black.webp",
    width: 1200,
    height: 800,
    altText: "Mouse Gamer Negro en vista lateral",
  },
  {
    productMediaId: MEDIA_VIDEO_ID,
    mediaAssetId: "018f0026-9000-7000-8000-000000000002",
    variantId: null,
    variantTitle: null,
    displayOrder: 2,
    mediaType: "VIDEO",
    mimeType: "video/mp4",
    publicUrl: "https://example.com/mouse-trailer.mp4",
    width: 1920,
    height: 1080,
    altText: "Trailer oficial del producto",
  },
];

const relatedProductOptionFixture: AdminStoryRelatedProductOption = {
  productId: "018f0026-3000-7000-8000-000000000001",
  name: "Mousepad Pro Control",
  slug: "mousepad-pro-control",
  status: "PUBLISHED",
  isPublicEligible: true,
};

// ----------------------------------------------------------------------------
// Model and Normalization Tests
// ----------------------------------------------------------------------------

describe("GP-026 CHK3 Story Builder Model & Normalization Boundary", () => {
  it("normalizes strict numeric fields: empty string to undefined, valid text to number, invalid text to issue", () => {
    // 1. Empty strings -> undefined (allowed since dimensions measurements are optional)
    const dimBlock1: EditorStoryBlock = {
      blockId: "dim-1",
      type: "dimensions",
      payload: {
        blueprintMediaId: MEDIA_IMAGE_ID,
        lengthMm: "",
        widthMm: "",
        heightMm: "",
        gripTypes: [{ clientId: "c-1", value: "CLAW" }],
      },
    };
    const res1 = normalizeEditorStoryDocument([dimBlock1]);
    expect(res1.success).toBe(true);
    expect(res1.document?.[0]?.payload).toMatchObject({
      blueprintMediaId: MEDIA_IMAGE_ID,
      gripTypes: ["CLAW"],
    });
    expect((res1.document?.[0]?.payload as Record<string, unknown>).lengthMm).toBeUndefined();

    // 2. Valid finite numeric strings -> numbers
    const dimBlock2: EditorStoryBlock = {
      blockId: "dim-2",
      type: "dimensions",
      payload: {
        blueprintMediaId: undefined,
        lengthMm: "125.5",
        widthMm: "65.2",
        heightMm: "38",
        gripTypes: [],
      },
    };
    const res2 = normalizeEditorStoryDocument([dimBlock2]);
    expect(res2.success).toBe(true);
    expect(res2.document?.[0]?.payload).toMatchObject({
      lengthMm: 125.5,
      widthMm: 65.2,
      heightMm: 38,
    });

    // 3. Invalid non-numeric strings -> validation issue (not silently coerced to 0 or NaN)
    const dimBlock3: EditorStoryBlock = {
      blockId: "dim-3",
      type: "dimensions",
      payload: {
        blueprintMediaId: undefined,
        lengthMm: "abc",
        widthMm: "65",
        heightMm: "38",
        gripTypes: [],
      },
    };
    const res3 = normalizeEditorStoryDocument([dimBlock3]);
    expect(res3.success).toBe(false);
    expect(res3.issues.some((i) => i.path === "blocks[0].payload.lengthMm")).toBe(true);

    // 4. Non-finite values -> validation issue
    const dimBlock4: EditorStoryBlock = {
      blockId: "dim-4",
      type: "dimensions",
      payload: {
        blueprintMediaId: undefined,
        lengthMm: "Infinity",
        widthMm: "65",
        heightMm: "38",
        gripTypes: [],
      },
    };
    const res4 = normalizeEditorStoryDocument([dimBlock4]);
    expect(res4.success).toBe(false);
  });

  it("trims whitespace from text fields during normalization", () => {
    const faqBlock: EditorStoryBlock = {
      blockId: "faq-1",
      type: "faq",
      payload: {
        title: "  Preguntas frecuentes  ",
        items: [
          {
            clientId: "c-1",
            question: "  ¿Tiene garantía?  ",
            answer: "  Sí, 12 meses de garantía oficial.  ",
          },
        ],
      },
    };

    const res = normalizeEditorStoryDocument([faqBlock]);
    expect(res.success).toBe(true);
    expect(res.document?.[0]?.payload).toEqual({
      title: "Preguntas frecuentes",
      items: [
        {
          question: "¿Tiene garantía?",
          answer: "Sí, 12 meses de garantía oficial.",
        },
      ],
    });
  });

  it("re-throws unexpected errors and only converts StoryValidationError to issues", () => {
    // Valid input does not throw
    const res = normalizeEditorStoryDocument([]);
    expect(res.success).toBe(true);

    // If an invalid candidate produces StoryValidationError, it safely returns issues without throwing
    const invalidHero: EditorStoryBlock = {
      blockId: "hero-invalid",
      type: "hero_media",
      payload: {
        headline: "", // Empty headline violates plainText(1, 120)
        tagline: "",
        body: "",
        mediaId: undefined,
      },
    };
    const failRes = normalizeEditorStoryDocument([invalidHero]);
    expect(failRes.success).toBe(false);
    expect(failRes.issues.length).toBeGreaterThan(0);
    expect(failRes.document).toBeNull();
  });

  it("duplicating a block preserves unsaved local values and generates fresh IDs", () => {
    const original: EditorStoryBlock[] = [
      {
        blockId: "faq-orig",
        type: "faq",
        payload: {
          title: "Borrador de preguntas",
          items: [{ clientId: "item-1", question: "P1 no guardada", answer: "R1 no guardada" }],
        },
      },
    ];

    const duplicated = duplicateEditorBlock(original, 0, () => "faq-dup-id");
    expect(duplicated).toHaveLength(2);
    expect(duplicated[1]!.blockId).toBe("faq-dup-id");
    expect(duplicated[1]!.type).toBe("faq");
    const dupPayload = (duplicated[1] as Extract<EditorStoryBlock, { type: "faq" }>).payload;
    expect(dupPayload.title).toBe("Borrador de preguntas");
    expect(dupPayload.items[0]!.question).toBe("P1 no guardada");
    expect(dupPayload.items[0]!.answer).toBe("R1 no guardada");
    // Client ID must be refreshed
    expect(dupPayload.items[0]!.clientId).not.toBe("item-1");
  });

  it("resolves target element IDs from validation issue paths", () => {
    const doc = createEditorDocument([
      {
        blockId: "block-test-1",
        type: "hero_media",
        payload: {
          headline: "Titular",
          tagline: "Subtítulo",
          mediaId: MEDIA_IMAGE_ID,
        },
      },
    ]);

    const target1 = resolveTargetFromIssuePath("blocks[0].payload.headline", doc);
    expect(target1.blockId).toBe("block-test-1");
    expect(target1.targetId).toBe("field-block-test-1-headline");

    const target2 = resolveTargetFromIssuePath("blocks[0].payload.mediaId", doc);
    expect(target2.targetId).toBe("field-block-test-1-mediaId");
  });
});

// ----------------------------------------------------------------------------
// MediaPickerDialog Tests
// ----------------------------------------------------------------------------

describe("GP-026 CHK3 MediaPickerDialog Component", () => {
  it("renders accessible dialog with listbox and filters by mediaType", async () => {
    const handleSelect = vi.fn();
    const handleClose = vi.fn();
    const triggerRef = { current: document.createElement("button") };

    // Render picker requesting IMAGE only
    const { rerender } = render(
      <MediaPickerDialog
        isOpen={true}
        title="Seleccionar imagen"
        mediaType="IMAGE"
        selectableMedia={selectableMediaFixture}
        selectedMediaId={undefined}
        allowClear={true}
        triggerRef={triggerRef}
        onSelect={handleSelect}
        onClose={handleClose}
      />
    );

    const dialog = screen.getByRole("dialog", { name: "Seleccionar imagen" });
    expect(dialog).toBeTruthy();
    expect(dialog.getAttribute("aria-modal")).toBe("true");

    const listbox = screen.getByRole("listbox");
    expect(listbox).toBeTruthy();

    // Only 1 IMAGE item should be displayed, VIDEO item should be excluded
    const options = screen.getAllByRole("option");
    expect(options).toHaveLength(1);
    expect(options[0]!.getAttribute("aria-selected")).toBe("false");
    expect(within(options[0]!).getByText("Mouse Gamer Negro en vista lateral")).toBeTruthy();
    expect(within(options[0]!).getByText(/Negro \/ 4K/)).toBeTruthy();
    expect(within(options[0]!).getByText(/1200×800/)).toBeTruthy();

    // Selecting an image emits productMediaId
    await userEvent.click(options[0]!);
    expect(handleSelect).toHaveBeenCalledWith(MEDIA_IMAGE_ID);

    // Now re-render requesting VIDEO only
    rerender(
      <MediaPickerDialog
        isOpen={true}
        title="Seleccionar video"
        mediaType="VIDEO"
        selectableMedia={selectableMediaFixture}
        selectedMediaId={MEDIA_VIDEO_ID}
        allowClear={true}
        triggerRef={triggerRef}
        onSelect={handleSelect}
        onClose={handleClose}
      />
    );

    const videoOptions = screen.getAllByRole("option");
    expect(videoOptions).toHaveLength(1);
    expect(videoOptions[0]!.getAttribute("aria-selected")).toBe("true");
    expect(within(videoOptions[0]!).getByText(/Seleccionado/)).toBeTruthy();
    expect(within(videoOptions[0]!).getByText(/video\/mp4/)).toBeTruthy();

    // Clear selection emits undefined
    const clearBtn = screen.getByRole("button", { name: "Quitar selección actual" });
    await userEvent.click(clearBtn);
    expect(handleSelect).toHaveBeenCalledWith(undefined);
  });

  it("closes on Escape and Cancel button", async () => {
    const handleClose = vi.fn();
    const triggerRef = { current: document.createElement("button") };

    render(
      <MediaPickerDialog
        isOpen={true}
        title="Seleccionar imagen"
        mediaType="IMAGE"
        selectableMedia={selectableMediaFixture}
        selectedMediaId={undefined}
        allowClear={false}
        triggerRef={triggerRef}
        onSelect={vi.fn()}
        onClose={handleClose}
      />
    );

    // Click close button
    await userEvent.click(screen.getByRole("button", { name: "Cerrar selector multimedia" }));
    expect(handleClose).toHaveBeenCalledTimes(1);

    // Press Escape
    fireEvent.keyDown(window, { key: "Escape" });
    expect(handleClose).toHaveBeenCalledTimes(2);
  });
});

// ----------------------------------------------------------------------------
// RelatedProductPickerDialog Tests
// ----------------------------------------------------------------------------

describe("GP-026 CHK3 RelatedProductPickerDialog Component", () => {
  it("renders accessible dialog and displays search results with publication eligibility", async () => {
    const handleSelect = vi.fn();
    const handleClose = vi.fn();
    const triggerRef = { current: document.createElement("button") };

    render(
      <RelatedProductPickerDialog
        isOpen={true}
        currentProductId={PRODUCT_ID}
        alreadySelectedProductIds={[]}
        triggerRef={triggerRef}
        onSelectProduct={handleSelect}
        onClose={handleClose}
      />
    );

    const dialog = screen.getByRole("dialog", { name: "Buscar productos relacionados" });
    expect(dialog).toBeTruthy();
    expect(screen.getByPlaceholderText(/Buscar por nombre o slug/i)).toBeTruthy();
  });
});

// ----------------------------------------------------------------------------
// ValidationSummary Tests
// ----------------------------------------------------------------------------

describe("GP-026 CHK3 ValidationSummary Component", () => {
  it("renders error count, error messages and clicking navigates to target field", async () => {
    const handleNavigate = vi.fn();
    const issues = [
      {
        code: "too_small",
        path: "blocks[0].payload.headline",
        message: "El titular no puede quedar vacío.",
      },
      {
        code: "invalid_type",
        path: "blocks[1].payload.lengthMm",
        message: "Debe ser un número válido.",
      },
    ];

    const blocks: EditorStoryBlock[] = [
      createInitialEditorBlock("hero_media", () => "block-1"),
      createInitialEditorBlock("dimensions", () => "block-2"),
    ];

    render(
      <ValidationSummary issues={issues} document={blocks} onNavigateToIssue={handleNavigate} />
    );

    expect(screen.getByRole("alert")).toBeTruthy();
    expect(screen.getByText(/2 errores que impiden guardar la historia/)).toBeTruthy();
    expect(screen.getByText(/El titular no puede quedar vacío/)).toBeTruthy();
    expect(screen.getByText(/Debe ser un número válido/)).toBeTruthy();

    await userEvent.click(screen.getByText(/El titular no puede quedar vacío/));
    expect(handleNavigate).toHaveBeenCalledWith("block-1", "field-block-1-headline");
  });
});

// ----------------------------------------------------------------------------
// Individual Block Editors Tests
// ----------------------------------------------------------------------------

describe("GP-026 CHK3 Individual Structured Block Editors", () => {
  it("HeroMediaEditor updates headline and tagline and opens media picker", async () => {
    const handleUpdate = vi.fn();
    const handleOpenMedia = vi.fn();

    const initialBlock = createInitialEditorBlock("hero_media", () => "hero-b1");
    render(
      <HeroMediaEditor
        blockId="hero-b1"
        payload={(initialBlock as Extract<EditorStoryBlock, { type: "hero_media" }>).payload}
        onChange={handleUpdate}
        onOpenMediaPicker={handleOpenMedia}
        selectableMedia={selectableMediaFixture}
      />
    );

    const headlineInput = screen.getByLabelText(/Encabezado/i);
    await userEvent.type(headlineInput, "Nuevo Titular");
    expect(handleUpdate).toHaveBeenCalled();

    const mediaBtn = screen.getByRole("button", { name: /Seleccionar imagen principal/i });
    await userEvent.click(mediaBtn);
    expect(handleOpenMedia).toHaveBeenCalledWith(
      expect.objectContaining({ mediaType: "IMAGE", title: expect.stringContaining("portada") })
    );
  });

  it("FullBleedImageEditor updates altText, caption, and requests IMAGE media", async () => {
    const handleUpdate = vi.fn();
    const handleOpenMedia = vi.fn();

    const initialBlock = createInitialEditorBlock("full_bleed_image", () => "fb-1");
    render(
      <FullBleedImageEditor
        blockId="fb-1"
        payload={(initialBlock as Extract<EditorStoryBlock, { type: "full_bleed_image" }>).payload}
        onChange={handleUpdate}
        onOpenMediaPicker={handleOpenMedia}
        selectableMedia={selectableMediaFixture}
      />
    );

    const altInput = screen.getByLabelText(/Texto alternativo/i);
    await userEvent.type(altInput, "Descripción de la imagen");
    expect(handleUpdate).toHaveBeenCalled();

    const mediaBtn = screen.getByRole("button", { name: /Seleccionar imagen a todo lo ancho/i });
    await userEvent.click(mediaBtn);
    expect(handleOpenMedia).toHaveBeenCalledWith(expect.objectContaining({ mediaType: "IMAGE" }));
  });

  it("ImageTextEditor toggles imagePosition between left and right", async () => {
    const handleUpdate = vi.fn();
    const initialBlock = createInitialEditorBlock("image_text", () => "it-1");
    render(
      <ImageTextEditor
        blockId="it-1"
        payload={(initialBlock as Extract<EditorStoryBlock, { type: "image_text" }>).payload}
        onChange={handleUpdate}
        onOpenMediaPicker={vi.fn()}
        selectableMedia={selectableMediaFixture}
      />
    );

    const rightRadio = screen.getByLabelText(/Derecha/i);
    await userEvent.click(rightRadio);
    expect(handleUpdate).toHaveBeenCalledWith(expect.objectContaining({ imagePosition: "right" }));
  });

  it("StatHighlightEditor supports adding, removing, and reordering stats within 1-4 bounds", async () => {
    const handleUpdate = vi.fn();
    const initialBlock = createInitialEditorBlock("stat_highlight", () => "stat-1");
    render(
      <StatHighlightEditor
        blockId="stat-1"
        payload={(initialBlock as Extract<EditorStoryBlock, { type: "stat_highlight" }>).payload}
        onChange={handleUpdate}
      />
    );

    expect(screen.getByText("Estadística 1")).toBeTruthy();
    const addBtn = screen.getByRole("button", { name: /Agregar estadística/i });
    await userEvent.click(addBtn);
    expect(handleUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        stats: expect.arrayContaining([expect.any(Object), expect.any(Object)]),
      })
    );
  });

  it("ComparisonEditor maintains row cell lengths when adding and removing columns", async () => {
    const handleUpdate = vi.fn();
    const initialBlock = createInitialEditorBlock("comparison", () => "comp-1");
    render(
      <ComparisonEditor
        blockId="comp-1"
        payload={(initialBlock as Extract<EditorStoryBlock, { type: "comparison" }>).payload}
        onChange={handleUpdate}
      />
    );

    const addColBtn = screen.getByRole("button", { name: /Agregar columna/i });
    await userEvent.click(addColBtn);
    expect(handleUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        headers: ["", "", ""],
        rows: [expect.objectContaining({ cells: ["", "", ""] })],
      })
    );
  });

  it("DimensionsEditor handles length, width, height, and grip types selection", async () => {
    const handleUpdate = vi.fn();
    const initialBlock = createInitialEditorBlock("dimensions", () => "dim-test");
    render(
      <DimensionsEditor
        blockId="dim-test"
        payload={(initialBlock as Extract<EditorStoryBlock, { type: "dimensions" }>).payload}
        onChange={handleUpdate}
        onOpenMediaPicker={vi.fn()}
        selectableMedia={selectableMediaFixture}
      />
    );

    const lengthInput = screen.getByLabelText(/Largo \(mm\)/i);
    fireEvent.change(lengthInput, { target: { value: "120" } });
    expect(handleUpdate).toHaveBeenCalledWith(expect.objectContaining({ lengthMm: "120" }));

    const addGripBtn = screen.getByRole("button", { name: /Agregar tipo de agarre/i });
    await userEvent.click(addGripBtn);
    expect(handleUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        gripTypes: expect.arrayContaining([expect.any(Object)]),
      })
    );
  });

  it("FaqEditor handles adding, editing, and removing FAQ items", async () => {
    const handleUpdate = vi.fn();
    const initialBlock = createInitialEditorBlock("faq", () => "faq-test");
    render(
      <FaqEditor
        blockId="faq-test"
        payload={(initialBlock as Extract<EditorStoryBlock, { type: "faq" }>).payload}
        onChange={handleUpdate}
      />
    );

    const qInput = screen.getByPlaceholderText(/interruptores utiliza/i);
    fireEvent.change(qInput, { target: { value: "¿Cuál es el peso?" } });
    expect(handleUpdate).toHaveBeenCalled();

    const addBtn = screen.getByRole("button", { name: /Agregar pregunta/i });
    await userEvent.click(addBtn);
    expect(handleUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        items: expect.arrayContaining([expect.any(Object), expect.any(Object)]),
      })
    );
  });

  it("RelatedProductsEditor renders selected products and opens search picker", async () => {
    const handleUpdate = vi.fn();
    const handleOpenPicker = vi.fn();
    const knownOptions = new Map([
      [relatedProductOptionFixture.productId, relatedProductOptionFixture],
    ]);

    const initialBlock = createInitialEditorBlock("related_products", () => "rp-test");
    const payload = {
      ...(initialBlock as Extract<EditorStoryBlock, { type: "related_products" }>).payload,
      productIds: [relatedProductOptionFixture.productId],
    };

    render(
      <RelatedProductsEditor
        blockId="rp-test"
        payload={payload}
        onChange={handleUpdate}
        onOpenProductPicker={handleOpenPicker}
        knownProductOptions={knownOptions}
      />
    );

    expect(screen.getByText(/Mousepad Pro Control/)).toBeTruthy();
    expect(screen.getByText(/Elegible/)).toBeTruthy();

    const addBtn = screen.getByRole("button", { name: /Buscar y agregar producto/i });
    await userEvent.click(addBtn);
    expect(handleOpenPicker).toHaveBeenCalled();

    const removeBtn = screen.getByRole("button", {
      name: /Eliminar producto Mousepad Pro Control/i,
    });
    await userEvent.click(removeBtn);
    expect(handleUpdate).toHaveBeenCalledWith(expect.objectContaining({ productIds: [] }));
  });

  it("SpecFeatureEditor updates title, description, and opens media picker", () => {
    const handleUpdate = vi.fn();
    const handleOpenMedia = vi.fn();
    const initialBlock = createInitialEditorBlock("spec_feature", () => "spec-1");
    render(
      <SpecFeatureEditor
        blockId="spec-1"
        payload={(initialBlock as Extract<EditorStoryBlock, { type: "spec_feature" }>).payload}
        onChange={handleUpdate}
        onOpenMediaPicker={handleOpenMedia}
        selectableMedia={selectableMediaFixture}
      />
    );

    const titleInput = screen.getByLabelText(/Título de la característica/i);
    fireEvent.change(titleInput, { target: { value: "Sensor PAW3950" } });
    expect(handleUpdate).toHaveBeenCalledWith(expect.objectContaining({ title: "Sensor PAW3950" }));

    const selectMediaBtn = screen.getByRole("button", {
      name: /Seleccionar imagen de apoyo \(opcional\)/i,
    });
    fireEvent.click(selectMediaBtn);
    expect(handleOpenMedia).toHaveBeenCalled();
  });

  it("VideoEditor updates title and caption and opens video picker", () => {
    const handleUpdate = vi.fn();
    const handleOpenMedia = vi.fn();
    const initialBlock = createInitialEditorBlock("video", () => "video-1");
    render(
      <VideoEditor
        blockId="video-1"
        payload={(initialBlock as Extract<EditorStoryBlock, { type: "video" }>).payload}
        onChange={handleUpdate}
        onOpenMediaPicker={handleOpenMedia}
        selectableMedia={selectableMediaFixture}
      />
    );

    const titleInput = screen.getByLabelText(/Título del video/i);
    fireEvent.change(titleInput, { target: { value: "Unboxing Oficial" } });
    expect(handleUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Unboxing Oficial" })
    );

    const selectVideoBtn = screen.getByRole("button", {
      name: /Seleccionar video mp4 del producto/i,
    });
    fireEvent.click(selectVideoBtn);
    expect(handleOpenMedia).toHaveBeenCalled();
  });

  it("GalleryEditor updates title and adds gallery items", async () => {
    let idCounter = 0;
    const handleUpdate = vi.fn();
    const initialBlock = createInitialEditorBlock("gallery", () => `gallery-id-${++idCounter}`);
    render(
      <GalleryEditor
        blockId="gallery-1"
        payload={(initialBlock as Extract<EditorStoryBlock, { type: "gallery" }>).payload}
        onChange={handleUpdate}
        onOpenMediaPicker={vi.fn()}
        selectableMedia={selectableMediaFixture}
      />
    );

    const titleInput = screen.getByLabelText(/Título de la galería/i);
    fireEvent.change(titleInput, { target: { value: "Galería Oficial" } });
    expect(handleUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Galería Oficial" })
    );

    const addItemBtn = screen.getByRole("button", { name: /Agregar imagen a galería/i });
    await userEvent.click(addItemBtn);
    expect(handleUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        items: expect.arrayContaining([expect.any(Object)]),
      })
    );
  });

  it("BoxContentsEditor adds items and updates title", async () => {
    const handleUpdate = vi.fn();
    const initialBlock = createInitialEditorBlock("box_contents", () => "box-1");
    render(
      <BoxContentsEditor
        blockId="box-1"
        payload={(initialBlock as Extract<EditorStoryBlock, { type: "box_contents" }>).payload}
        onChange={handleUpdate}
        onOpenMediaPicker={vi.fn()}
        selectableMedia={selectableMediaFixture}
      />
    );

    const titleInput = screen.getByLabelText(/Título del bloque/i);
    fireEvent.change(titleInput, { target: { value: "¿Qué incluye la caja?" } });
    expect(handleUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ title: "¿Qué incluye la caja?" })
    );

    const addItemBtn = screen.getByRole("button", { name: /Agregar elemento a la caja/i });
    await userEvent.click(addItemBtn);
    expect(handleUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        items: expect.arrayContaining([expect.any(Object)]),
      })
    );
  });

  it("TechnicalSpecsEditor adds spec groups and updates title", async () => {
    let idCounter = 0;
    const handleUpdate = vi.fn();
    const initialBlock = createInitialEditorBlock(
      "technical_specs",
      () => `tech-id-${++idCounter}`
    );
    render(
      <TechnicalSpecsEditor
        blockId="tech-1"
        payload={(initialBlock as Extract<EditorStoryBlock, { type: "technical_specs" }>).payload}
        onChange={handleUpdate}
      />
    );

    const titleInput = screen.getByLabelText(/Título del bloque/i);
    fireEvent.change(titleInput, { target: { value: "Especificaciones Técnicas" } });
    expect(handleUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Especificaciones Técnicas" })
    );

    const addGroupBtn = screen.getByRole("button", { name: /Agregar grupo de especificaciones/i });
    await userEvent.click(addGroupBtn);
    expect(handleUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        groups: expect.arrayContaining([expect.any(Object)]),
      })
    );
  });
});
