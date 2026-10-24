import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { uploadDirect } from "@/lib/media/direct-upload-client";
import { completeUpload } from "@/lib/media/upload-api-client";
vi.mock("@/lib/media/compress-image", () => ({
  compressImageForUpload: async (file: File) =>
    file.name === "20mb.png" ? new File(["prepared"], "out.webp", { type: "image/webp" }) : file,
  ImagePreparationError: class extends Error {},
}));
let statuses: number[];
let calls: number;
let onSend: (() => void) | undefined;
class FakeXhr {
  status = 0;
  upload = {
    onprogress: null as
      ((event: { lengthComputable: boolean; loaded: number; total: number }) => void) | null,
  };
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onabort: (() => void) | null = null;
  open() {}
  setRequestHeader() {}
  send() {
    calls++;
    onSend?.();
    if (onSend) return;
    queueMicrotask(() => {
      this.upload.onprogress?.({ lengthComputable: true, loaded: 8, total: 10 });
      this.upload.onprogress?.({ lengthComputable: true, loaded: 3, total: 10 });
      this.status = statuses.shift() ?? 200;
      if (this.status === 0) this.onerror?.();
      else this.onload?.();
    });
  }
  abort() {
    this.onabort?.();
  }
}
beforeEach(() => {
  vi.useFakeTimers();
  calls = 0;
  statuses = [];
  onSend = undefined;
  vi.stubGlobal("XMLHttpRequest", FakeXhr);
  vi.stubGlobal(
    "createImageBitmap",
    vi.fn(async () => ({ width: 10, height: 10, close() {} }))
  );
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
function options() {
  return {
    purpose: "home_image" as const,
    file: new File(["x"], "x.webp", { type: "image/webp" }),
    request: vi.fn(async () => ({
      success: true,
      data: { uploadId: "id", putUrl: "https://r2.test/x", requiredHeaders: {} },
    })),
    confirm: vi.fn(async () => ({ success: true, data: { id: "asset" }, status: 200 })),
  };
}
describe("reintentos de subida directa", () => {
  it("admite el original de 20 MiB y autoriza únicamente la salida preparada", async () => {
    const opts = options();
    const promise = uploadDirect({
      ...opts,
      purpose: "gallery_image",
      file: new File([new Uint8Array(20 * 1024 * 1024)], "20mb.png", { type: "image/png" }),
    });
    await vi.runAllTimersAsync();
    expect((await promise).ok).toBe(true);
    expect(opts.request).toHaveBeenCalledWith({ mimeType: "image/webp", fileSizeBytes: 8 });
  });
  it("HEIC se rechaza antes de autorizar con un mensaje claro", async () => {
    const opts = options();
    const result = await uploadDirect({
      ...opts,
      purpose: "gallery_image",
      file: new File(["heic"], "foto.heic", { type: "image/heic" }),
    });
    expect(result).toMatchObject({ ok: false, error: expect.stringContaining("HEIC") });
    expect(opts.request).not.toHaveBeenCalled();
  });

  it("un 403 HTML en complete conserva el estado y no se reintenta", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("<html>Forbidden</html>", { status: 403 }))
    );
    const confirm = vi.fn((input: { uploadId: string }) =>
      completeUpload({ purpose: "home_image", ...input })
    );
    const promise = uploadDirect({ ...options(), confirm });
    await vi.runAllTimersAsync();
    expect((await promise).ok).toBe(false);
    expect(confirm).toHaveBeenCalledOnce();
  });
  it.each([503, 408, 429, 0])("PUT %s tiene dos reintentos adicionales", async (status) => {
    statuses = [status, status, 200];
    const opts = options();
    const promise = uploadDirect(opts);
    await vi.runAllTimersAsync();
    expect((await promise).ok).toBe(true);
    expect(calls).toBe(3);
    expect(opts.confirm).toHaveBeenCalledOnce();
  });
  it.each([400, 401, 403, 409, 422])("PUT %s no se reintenta ni confirma", async (status) => {
    statuses = [status];
    const opts = options();
    const result = await uploadDirect(opts);
    expect(result.ok).toBe(false);
    expect(calls).toBe(1);
    expect(opts.confirm).not.toHaveBeenCalled();
  });
  it("cancelar aborta XHR y no confirma", async () => {
    const controller = new AbortController();
    onSend = () => controller.abort();
    const opts = options();
    expect((await uploadDirect({ ...opts, signal: controller.signal })).ok).toBe(false);
    expect(opts.confirm).not.toHaveBeenCalled();
    expect(calls).toBe(1);
  });
  it("el progreso nunca retrocede tras un reintento", async () => {
    statuses = [503, 200];
    const values: number[] = [];
    const promise = uploadDirect({ ...options(), onProgress: (value) => values.push(value) });
    await vi.runAllTimersAsync();
    await promise;
    expect(values.at(-1)).toBe(100);
    expect(values).toEqual([...values].sort((a, b) => a - b));
  });
  it("complete espera la ventana de corte de Workers antes de rendirse (5 intentos)", async () => {
    const opts = options();
    for (let i = 0; i < 4; i++)
      opts.confirm.mockResolvedValueOnce({ success: false, status: 503, data: { id: "" } });
    const promise = uploadDirect(opts);
    await vi.runAllTimersAsync();
    expect((await promise).ok).toBe(true);
    expect(opts.confirm).toHaveBeenCalledTimes(5);
  });
  it("complete reintenta solo red o 5xx", async () => {
    const opts = options();
    opts.confirm
      .mockResolvedValueOnce({ success: false, status: 503, data: { id: "" } })
      .mockResolvedValueOnce({ success: false, status: 503, data: { id: "" } });
    const promise = uploadDirect(opts);
    await vi.runAllTimersAsync();
    expect((await promise).ok).toBe(true);
    expect(opts.confirm).toHaveBeenCalledTimes(3);
  });
});
