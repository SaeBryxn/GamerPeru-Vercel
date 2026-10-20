import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { sniffImage } from "@/lib/media/image-sniff";

describe("firma y dimensiones de medios", () => {
  it.each([
    ["opaque.webp", "webp"],
    ["alpha-lossy.webp", "webp"],
    ["baseline.jpg", "jpeg"],
    ["alpha.webp", "webp"],
    ["progressive.jpg", "jpeg"],
    ["image.png", "png"],
  ])("inspecciona el fixture real %s", (filename, format) => {
    expect(sniffImage(readFileSync(`tests/fixtures/media/${filename}`).subarray(0, 4096))).toEqual({
      format,
      width: 8,
      height: 6,
    });
  });
  it("identifica los tipos de video sin confiar en dimensiones del navegador", () => {
    expect(
      sniffImage(new Uint8Array([0, 0, 0, 24, 102, 116, 121, 112, 105, 115, 111, 109]))
    ).toEqual({ format: "mp4", width: null, height: null });
    expect(sniffImage(new Uint8Array([26, 69, 223, 163]))?.format).toBe("webm");
  });
  it("rechaza truncamientos y cabeceras ajenas", () => {
    expect(sniffImage(new Uint8Array([255, 216, 255]))).toBeNull();
    expect(sniffImage(new TextEncoder().encode("<html>fake.webp</html>"))).toBeNull();
    expect(sniffImage(readFileSync("tests/fixtures/media/image.png").subarray(0, 20))).toBeNull();
  });
});
