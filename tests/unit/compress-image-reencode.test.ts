// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { ImagePreparationError, compressImageForUpload } from "@/lib/media/compress-image";

interface FakeContext {
  imageSmoothingQuality: string;
  globalCompositeOperation: string;
  fillStyle: string;
  drawImage: ReturnType<typeof vi.fn>;
  fillRect: ReturnType<typeof vi.fn>;
}

/** Canvas double whose encoder supports only the given types (others answer with PNG). */
function installCanvas(supported: string[]) {
  const context: FakeContext = {
    imageSmoothingQuality: "",
    globalCompositeOperation: "source-over",
    fillStyle: "",
    drawImage: vi.fn(),
    fillRect: vi.fn(),
  };
  const createElement = document.createElement.bind(document);
  vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
    if (tag !== "canvas") return createElement(tag);
    return {
      width: 0,
      height: 0,
      getContext: () => context,
      toBlob: (resolve: (blob: Blob | null) => void, type: string) =>
        resolve(new Blob(["x"], { type: supported.includes(type) ? type : "image/png" })),
    } as unknown as HTMLCanvasElement;
  });
  return context;
}

function installBitmap(width: number, height: number) {
  const createImageBitmap = vi.fn(async () => ({ width, height, close: vi.fn() }));
  vi.stubGlobal("createImageBitmap", createImageBitmap);
  return createImageBitmap;
}

const photo = new File([new Uint8Array(10)], "foto.png", { type: "image/png" });

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("compressImageForUpload with mandatory re-encode", () => {
  it("decodes with the file's EXIF orientation and returns a WebP even when not smaller", async () => {
    installCanvas(["image/webp"]);
    const bitmap = installBitmap(1200, 800);
    const result = await compressImageForUpload(photo, {
      maxDimension: 2000,
      alwaysReencode: true,
    });
    expect(bitmap).toHaveBeenCalledWith(photo, { imageOrientation: "from-image" });
    expect(result.type).toBe("image/webp");
    expect(result.name).toBe("foto.webp");
  });

  it("falls back to JPEG over a white background when WebP cannot be encoded", async () => {
    const context = installCanvas(["image/jpeg"]);
    installBitmap(1200, 800);
    const result = await compressImageForUpload(photo, {
      maxDimension: 2000,
      alwaysReencode: true,
    });
    expect(result.type).toBe("image/jpeg");
    expect(context.globalCompositeOperation).toBe("destination-over");
    expect(context.fillStyle).toBe("#ffffff");
    expect(context.fillRect).toHaveBeenCalledWith(0, 0, 1200, 800);
  });

  it("fails instead of uploading the original when the image cannot be decoded", async () => {
    installCanvas(["image/webp"]);
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn(async () => {
        throw new Error("decode");
      })
    );
    await expect(
      compressImageForUpload(photo, { maxDimension: 2000, alwaysReencode: true })
    ).rejects.toBeInstanceOf(ImagePreparationError);
  });

  it("keeps returning the original without the option when it cannot decode", async () => {
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn(async () => {
        throw new Error("decode");
      })
    );
    expect(await compressImageForUpload(photo, { maxDimension: 2000 })).toBe(photo);
  });
});
