import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  reserveUpload,
  completeUpload,
  abortUpload,
  expireStaleUploads,
  type UploadTransaction,
} from "@/lib/admin/media/upload-ledger";
import { InMemoryCatalogStorageAdapter } from "@/lib/admin/catalog/media-storage";

const input = {
  actorId: "actor",
  purpose: "home_image" as const,
  subjectId: null,
  objectKey: "home/images/test.webp",
  mimeType: "image/webp",
  sizeBytes: 100,
  expiresAt: new Date(),
};
const row = {
  id: "id",
  actorAuthUserId: "actor",
  status: "PENDING",
  declaredSizeBytes: 100,
  objectKey: input.objectKey,
};
function transaction(selected = row, reserved = true) {
  const updates: unknown[] = [];
  const builder: Record<string, unknown> = {};
  for (const method of ["from", "where", "orderBy", "limit"])
    builder[method] = vi.fn(() => builder);
  builder.for = vi.fn(async () => [selected]);
  const tx = {
    select: vi.fn(() => builder),
    update: vi.fn(() => ({
      set: (value: unknown) => {
        updates.push(value);
        return {
          where: () =>
            Object.assign(Promise.resolve(), {
              returning: async () => (reserved ? [{ id: 1 }] : []),
            }),
        };
      },
    })),
    insert: vi.fn(() => ({ values: () => ({ returning: async () => [row] }) })),
  };
  return { tx: tx as unknown as UploadTransaction, updates, builder };
}
beforeEach(() => vi.clearAllMocks());
describe("ledger de subidas", () => {
  it("reserva antes de insertar y devuelve 409 si el UPDATE condicional no encuentra capacidad", async () => {
    const success = transaction();
    expect((await reserveUpload(success.tx, input)).id).toBe("id");
    const full = transaction(row, false);
    await expect(reserveUpload(full.tx, input)).rejects.toMatchObject({
      code: "MEDIA_BUDGET_EXCEEDED",
      httpStatus: 409,
    });
    expect(full.tx.insert).not.toHaveBeenCalled();
  });
  it("READY es idempotente, incluso para una segunda confirmación", async () => {
    const { tx, updates } = transaction({ ...row, status: "READY" });
    expect((await completeUpload(tx, "id", "actor")).alreadyReady).toBe(true);
    expect(updates).toHaveLength(0);
  });
  it("otro actor y los estados terminales no consumen presupuesto", async () => {
    const { tx, updates } = transaction();
    await expect(completeUpload(tx, "id", "other")).rejects.toMatchObject({ httpStatus: 403 });
    expect(updates).toHaveLength(0);
    await expect(
      completeUpload(transaction({ ...row, status: "ABORTED" }).tx, "id", "actor")
    ).rejects.toMatchObject({ httpStatus: 409 });
  });
  it("aborta y libera solo después de borrar el objeto; un fallo conserva la reserva", async () => {
    const adapter = new InMemoryCatalogStorageAdapter();
    const { tx, updates } = transaction();
    await abortUpload(tx, "id", "actor", "USER_ABORTED", adapter);
    expect(updates).toHaveLength(2);
    expect(updates[1]).toMatchObject({ status: "ABORTED" });
    adapter.deleteFailures.add(input.objectKey);
    const failed = transaction();
    await expect(abortUpload(failed.tx, "id", "actor", "USER_ABORTED", adapter)).rejects.toThrow();
    expect(failed.updates).toHaveLength(0);
  });
  it.each([undefined, 500])(
    "sweep limita a 25 filas con límite %s, usa skipLocked y marca EXPIRED",
    async (limit) => {
      const fake = transaction();
      const database = {
        transaction: async (fn: (tx: UploadTransaction) => unknown) => fn(fake.tx),
      } as never;
      expect(
        await expireStaleUploads(new Date(), limit, {
          database,
          storageAdapter: new InMemoryCatalogStorageAdapter(),
        })
      ).toEqual({ expired: 1 });
      expect(fake.builder.limit).toHaveBeenCalledWith(25);
      expect(fake.builder.for).toHaveBeenCalledWith("update", { skipLocked: true });
      expect(fake.updates.at(-1)).toMatchObject({ status: "EXPIRED" });
    }
  );
});
