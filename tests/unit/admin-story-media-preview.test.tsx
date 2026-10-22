// @vitest-environment jsdom

import React from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createInitialEditorBlock,
  type EditorStoryBlock,
} from "@/lib/admin/catalog/story-builder-model";
import type { AdminStorySelectableMedia } from "@/lib/admin/catalog/story-reader";
import { MediaField } from "@/app/admin/(protected)/products/[productId]/story/block-editors/editor-field";
import { VideoEditor } from "@/app/admin/(protected)/products/[productId]/story/block-editors/video-editor";
import { MediaPickerDialog } from "@/app/admin/(protected)/products/[productId]/story/media-picker-dialog";
import {
  clearStoryMediaReferences,
  getDefaultExpandedBlockIds,
} from "@/app/admin/(protected)/products/[productId]/story/story-builder-state";

const PRODUCT_ID = "018f0026-0000-7000-8000-000000000001";
const GALLERY_VIDEO_ID = "018f0026-1000-7000-8000-000000000002";
const STORY_VIDEO_ID = "018f0026-1000-7000-8000-000000000003";

const galleryVideo: AdminStorySelectableMedia = {
  productMediaId: GALLERY_VIDEO_ID,
  mediaAssetId: "018f0026-9000-7000-8000-000000000002",
  variantId: null,
  variantTitle: null,
  displayOrder: 1,
  placement: "GALLERY",
  mediaType: "VIDEO",
  mimeType: "video/mp4",
  publicUrl: "https://example.com/trailer.mp4",
  width: 1920,
  height: 1080,
  altText: "Trailer oficial",
};

const storyVideo: AdminStorySelectableMedia = {
  ...galleryVideo,
  productMediaId: STORY_VIDEO_ID,
  mediaAssetId: "018f0026-9000-7000-8000-000000000003",
  displayOrder: 0,
  placement: "STORY",
  publicUrl: "https://example.com/story-clip.mp4",
  altText: null,
};

// jsdom no implementa la reproducción de medios.
beforeEach(() => {
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

function renderVideoField(onClear = vi.fn()) {
  render(
    <MediaField
      fieldId="field-video-1-videoMediaId"
      label="Video MP4 del producto"
      mediaType="VIDEO"
      selectedMediaId={STORY_VIDEO_ID}
      selectableMedia={[storyVideo]}
      onOpenPicker={vi.fn()}
      onClear={onClear}
    />
  );
  return onClear;
}

describe("Historia — vista previa de video en MediaField", () => {
  it("muestra un <video> silenciado con preload de metadatos en lugar del recuadro MP4", () => {
    renderVideoField();

    const video = screen.getByTestId<HTMLVideoElement>("video-thumb");
    expect(video.tagName).toBe("VIDEO");
    expect(video.getAttribute("src")).toBe("https://example.com/story-clip.mp4#t=0.1");
    expect(video.muted).toBe(true);
    expect(video.hasAttribute("playsinline")).toBe(true);
    expect(video.getAttribute("preload")).toBe("metadata");
    expect(video.hasAttribute("controls")).toBe(false);
  });

  it("reproduce al pasar el mouse o enfocar y pausa al salir", () => {
    const play = vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
    const pause = vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
    renderVideoField();

    const card = screen.getByTestId("selected-media-field-video-1-videoMediaId");
    const video = screen.getByTestId("video-thumb");
    Object.defineProperty(video, "paused", { configurable: true, get: () => false });

    fireEvent.mouseEnter(card);
    expect(play).toHaveBeenCalledTimes(1);
    fireEvent.mouseLeave(card);
    expect(pause).toHaveBeenCalledTimes(1);

    fireEvent.focus(screen.getByRole("button", { name: "Quitar video" }));
    expect(play).toHaveBeenCalledTimes(2);
    fireEvent.blur(screen.getByRole("button", { name: "Quitar video" }));
    expect(pause).toHaveBeenCalledTimes(2);
  });

  it("no falla si el navegador rechaza la reproducción", () => {
    vi.spyOn(HTMLMediaElement.prototype, "play").mockRejectedValue(new Error("NotAllowedError"));
    renderVideoField();
    expect(() =>
      fireEvent.mouseEnter(screen.getByTestId("selected-media-field-video-1-videoMediaId"))
    ).not.toThrow();
  });

  it("ofrece una papelera «Quitar video» sobre la miniatura que llama a onClear", async () => {
    const onClear = renderVideoField();

    const trash = screen.getByRole("button", { name: "Quitar video" });
    expect(trash.closest("[class*='selectedMediaPreview']")).not.toBeNull();
    await userEvent.click(trash);
    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it("explica en el bloque video que quitarlo deja el bloque pendiente", () => {
    const block = createInitialEditorBlock("video", () => "video-1") as Extract<
      EditorStoryBlock,
      { type: "video" }
    >;
    render(
      <VideoEditor
        blockId="video-1"
        payload={{ ...block.payload, videoMediaId: STORY_VIDEO_ID }}
        selectableMedia={[storyVideo]}
        onChange={vi.fn()}
        onOpenMediaPicker={vi.fn()}
      />
    );

    expect(
      screen.getByText(
        /Si quitas el video, el bloque queda pendiente; para publicar sin video, elimina el bloque\./
      )
    ).toBeTruthy();
  });
});

function renderPicker(onDeleteFromProduct = vi.fn().mockResolvedValue({ ok: true })) {
  const onSelect = vi.fn();
  const onClose = vi.fn();
  const utils = render(
    <MediaPickerDialog
      isOpen
      productId={PRODUCT_ID}
      onUploaded={vi.fn()}
      title="Seleccionar video del producto"
      mediaType="VIDEO"
      selectableMedia={[galleryVideo, storyVideo]}
      selectedMediaId={STORY_VIDEO_ID}
      triggerRef={{ current: document.createElement("button") }}
      onSelect={onSelect}
      onClose={onClose}
      onDeleteFromProduct={onDeleteFromProduct}
    />
  );
  return { ...utils, onSelect, onClose, onDeleteFromProduct };
}

describe("Historia — selector de video", () => {
  it("muestra vista previa en cada opción de video y mantiene la semántica de listbox", () => {
    renderPicker();
    const options = screen.getAllByRole("option");
    expect(options).toHaveLength(2);
    for (const option of options) {
      expect(within(option).getByTestId("video-thumb").tagName).toBe("VIDEO");
    }
    // Sin texto alternativo, el video se nombra por su orden.
    expect(within(options[1]!).getByText("Video 2")).toBeTruthy();
  });

  it("ofrece «Eliminar del producto» solo para videos subidos para la historia", () => {
    renderPicker();
    const manager = screen.getByTestId("story-media-manager");
    expect(within(manager).getAllByRole("listitem")).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Eliminar del producto: Video 2" })).toBeTruthy();
    expect(screen.queryByTestId(`delete-media-${GALLERY_VIDEO_ID}`)).toBeNull();
  });

  it("no muestra la acción para imágenes ni sin manejador", () => {
    render(
      <MediaPickerDialog
        isOpen
        productId={PRODUCT_ID}
        onUploaded={vi.fn()}
        title="Seleccionar video del producto"
        mediaType="VIDEO"
        selectableMedia={[storyVideo]}
        triggerRef={{ current: null }}
        onSelect={vi.fn()}
        onClose={vi.fn()}
      />
    );
    expect(screen.queryByTestId("story-media-manager")).toBeNull();
  });

  it("pide confirmación, enfoca Cancelar y elimina al confirmar", async () => {
    const user = userEvent.setup();
    const { onDeleteFromProduct, onSelect, onClose } = renderPicker();

    await user.click(screen.getByRole("button", { name: "Eliminar del producto: Video 2" }));
    const group = screen.getByRole("group", { name: "¿Eliminar «Video 2» del producto?" });
    await waitFor(() =>
      expect(document.activeElement).toBe(within(group).getByRole("button", { name: "Cancelar" }))
    );
    expect(onDeleteFromProduct).not.toHaveBeenCalled();

    await user.click(within(group).getByRole("button", { name: /Sí, eliminar/ }));
    expect(onDeleteFromProduct).toHaveBeenCalledWith(storyVideo);
    await waitFor(() =>
      expect(screen.getByRole("status").textContent).toBe("Video eliminado del producto.")
    );
    expect(onSelect).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("Cancelar y Escape cierran la confirmación sin cerrar el selector", async () => {
    const user = userEvent.setup();
    const { onDeleteFromProduct, onClose } = renderPicker();
    const trigger = screen.getByRole("button", { name: "Eliminar del producto: Video 2" });

    await user.click(trigger);
    await user.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(screen.queryByRole("group")).toBeNull();

    await user.click(screen.getByRole("button", { name: "Eliminar del producto: Video 2" }));
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("group")).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
    expect(onDeleteFromProduct).not.toHaveBeenCalled();
  });

  it("muestra el error del servidor y conserva el video", async () => {
    const user = userEvent.setup();
    renderPicker(
      vi.fn().mockResolvedValue({ ok: false, error: "No puedes quitar la imagen principal." })
    );

    await user.click(screen.getByRole("button", { name: "Eliminar del producto: Video 2" }));
    await user.click(screen.getByRole("button", { name: /Sí, eliminar/ }));

    await waitFor(() =>
      expect(screen.getByRole("status").textContent).toBe("No puedes quitar la imagen principal.")
    );
    expect(screen.getByRole("button", { name: "Eliminar del producto: Video 2" })).toBeTruthy();
  });
});

describe("Historia — estado del constructor", () => {
  const videoBlock = (blockId: string, videoMediaId?: string): EditorStoryBlock => ({
    blockId,
    type: "video",
    payload: { videoMediaId, posterMediaId: undefined, title: "", caption: "" },
  });

  it("quita las referencias al video eliminado y deja intactos los demás bloques", () => {
    const hero: EditorStoryBlock = {
      blockId: "hero",
      type: "hero_media",
      payload: {
        headline: "Hola",
        tagline: "",
        body: "",
        mediaId: undefined,
        posterMediaId: undefined,
        videoMediaId: STORY_VIDEO_ID,
      },
    };
    const other = videoBlock("other", GALLERY_VIDEO_ID);
    const blocks = [hero, videoBlock("uses", STORY_VIDEO_ID), other];

    const next = clearStoryMediaReferences(blocks, STORY_VIDEO_ID);
    expect(next[0]!.type === "hero_media" && next[0].payload.videoMediaId).toBeUndefined();
    expect(next[1]!.type === "video" && next[1].payload.videoMediaId).toBeUndefined();
    expect(next[2]).toBe(other);
  });

  it("devuelve el mismo arreglo si ningún bloque usa el video", () => {
    const blocks = [videoBlock("a", GALLERY_VIDEO_ID)];
    expect(clearStoryMediaReferences(blocks, STORY_VIDEO_ID)).toBe(blocks);
  });

  it("despliega por defecto solo el primer bloque y los incompletos", () => {
    const blocks = [
      videoBlock("first", GALLERY_VIDEO_ID),
      videoBlock("complete", GALLERY_VIDEO_ID),
      videoBlock("incomplete"),
    ];
    expect([...getDefaultExpandedBlockIds(blocks)].sort()).toEqual(["first", "incomplete"]);
    expect(getDefaultExpandedBlockIds([]).size).toBe(0);
  });
});
