export type SniffedMedia =
  | { format: "webp" | "jpeg" | "png"; width: number; height: number }
  | { format: "mp4" | "webm"; width: null; height: null };

export function sniffImage(bytes: Uint8Array): SniffedMedia | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const text = (start: number, length: number) =>
    String.fromCharCode(...bytes.subarray(start, start + length));
  const image = (
    format: "webp" | "jpeg" | "png",
    width: number,
    height: number
  ): SniffedMedia | null =>
    width > 0 && height > 0 && width <= 20000 && height <= 20000 ? { format, width, height } : null;
  if (
    bytes.length >= 24 &&
    bytes[0] === 137 &&
    text(1, 3) === "PNG" &&
    bytes[4] === 13 &&
    bytes[5] === 10 &&
    bytes[6] === 26 &&
    bytes[7] === 10 &&
    view.getUint32(8) === 13 &&
    text(12, 4) === "IHDR"
  ) {
    return image("png", view.getUint32(16), view.getUint32(20));
  }
  if (bytes.length >= 20 && text(0, 4) === "RIFF" && text(8, 4) === "WEBP") {
    for (let offset = 12; offset + 8 <= bytes.length;) {
      const chunk = text(offset, 4),
        size = view.getUint32(offset + 4, true),
        data = offset + 8;
      if (chunk === "VP8X" && size >= 10 && data + 10 <= bytes.length) {
        const width = bytes[data + 4]! | (bytes[data + 5]! << 8) | (bytes[data + 6]! << 16);
        const height = bytes[data + 7]! | (bytes[data + 8]! << 8) | (bytes[data + 9]! << 16);
        return image("webp", width + 1, height + 1);
      }
      if (chunk === "VP8L" && size >= 5 && data + 5 <= bytes.length && bytes[data] === 47) {
        const bits = view.getUint32(data + 1, true);
        return image("webp", (bits & 0x3fff) + 1, ((bits >>> 14) & 0x3fff) + 1);
      }
      if (
        chunk === "VP8 " &&
        size >= 10 &&
        data + 10 <= bytes.length &&
        bytes[data + 3] === 157 &&
        bytes[data + 4] === 1 &&
        bytes[data + 5] === 42
      ) {
        return image(
          "webp",
          view.getUint16(data + 6, true) & 0x3fff,
          view.getUint16(data + 8, true) & 0x3fff
        );
      }
      offset = data + size + (size % 2);
    }
  }
  if (bytes.length >= 4 && bytes[0] === 255 && bytes[1] === 216) {
    let offset = 2;
    while (offset + 3 < bytes.length) {
      if (bytes[offset++] !== 255) return null;
      while (bytes[offset] === 255) offset++;
      const marker = bytes[offset++];
      if (marker === undefined || marker === 217 || marker === 218) return null;
      if (marker === 1 || (marker >= 208 && marker <= 215)) continue;
      if (offset + 2 > bytes.length) return null;
      const length = view.getUint16(offset);
      if (length < 2 || offset + length > bytes.length) return null;
      if ((marker === 192 || marker === 194) && length >= 8)
        return image("jpeg", view.getUint16(offset + 5), view.getUint16(offset + 3));
      offset += length;
    }
  }
  if (
    bytes.length >= 12 &&
    text(4, 4) === "ftyp" &&
    ["isom", "iso2", "mp41", "mp42", "avc1", "dash", "M4V ", "M4A "].includes(text(8, 4))
  )
    return { format: "mp4", width: null, height: null };
  if (bytes.length >= 4 && view.getUint32(0) === 0x1a45dfa3)
    return { format: "webm", width: null, height: null };
  return null;
}
