import { describe, expect, it, vi } from "vitest";
import "@/lib/inngest/functions/media-uploads-sweep";
const mocks = vi.hoisted(() => ({
  expire: vi.fn(async () => ({ expired: 3 })),
  create: vi.fn(
    (
      config: unknown,
      handler: (context: {
        step: { run: (name: string, fn: () => Promise<unknown>) => Promise<unknown> };
      }) => Promise<unknown>
    ) => ({ config, handler })
  ),
}));
vi.mock("@/lib/inngest/client", () => ({ inngest: { createFunction: mocks.create } }));
vi.mock("@/lib/admin/media/upload-ledger", () => ({ expireStaleUploads: mocks.expire }));
describe("cron de subidas", () => {
  it("registra el cron horario y ejecuta un paso durable acotado", async () => {
    const call = mocks.create.mock.calls[0];
    if (!call) throw new Error("Cron no registrado.");
    expect(call[0]).toMatchObject({
      concurrency: { limit: 1 },
      triggers: [{ cron: "17 * * * *" }],
    });
    expect(await call[1]({ step: { run: async (_name, fn) => fn() } })).toEqual({ expired: 3 });
    expect(mocks.expire).toHaveBeenCalledWith(expect.any(Date), 100);
  });
});
