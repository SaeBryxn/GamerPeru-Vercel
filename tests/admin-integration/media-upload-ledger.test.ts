import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { mediaStorageBudget, mediaUploads } from "@/db/schema";
import { generateUuidV7 } from "@/db/utils/uuid";
import { assertLocalDatabaseTarget } from "@/lib/admin/test-target-guard";
import { reserveUpload, completeUpload, abortUpload } from "@/lib/admin/media/upload-ledger";
import { InMemoryCatalogStorageAdapter } from "@/lib/admin/catalog/media-storage";

assertLocalDatabaseTarget(process.env.DATABASE_URL);
const actor = "018f0059-0000-7000-8000-000000000001";
let original: typeof mediaStorageBudget.$inferSelect;
let ids: string[];
async function reserve(sizeBytes: number) {
  const upload = await db.transaction((tx) =>
    reserveUpload(tx, {
      actorId: actor,
      purpose: "home_image",
      subjectId: null,
      objectKey: `home/images/ledger-${generateUuidV7()}.webp`,
      mimeType: "image/webp",
      sizeBytes,
      expiresAt: new Date(Date.now() + 900_000),
    })
  );
  ids.push(upload.id);
  return upload;
}
beforeEach(async () => {
  const [budget] = await db.select().from(mediaStorageBudget).where(eq(mediaStorageBudget.id, 1));
  if (!budget || budget.reservedBytes !== 0)
    throw new Error("La prueba requiere presupuesto local sin reservas activas.");
  original = budget;
  ids = [];
  await db
    .update(mediaStorageBudget)
    .set({ budgetBytes: budget.usedBytes + 300 })
    .where(eq(mediaStorageBudget.id, 1));
});
afterEach(async () => {
  if (ids?.length) await db.delete(mediaUploads).where(inArray(mediaUploads.id, ids));
  if (original)
    await db.update(mediaStorageBudget).set(original).where(eq(mediaStorageBudget.id, 1));
});
describe("presupuesto de medios en Postgres local", () => {
  it("reserva exactamente en el límite y rechaza un byte adicional", async () => {
    await reserve(300);
    await expect(reserve(1)).rejects.toMatchObject({
      code: "MEDIA_BUDGET_EXCEEDED",
      httpStatus: 409,
    });
  });
  it("dos reservas concurrentes que exceden juntas el límite permiten solo una", async () => {
    const results = await Promise.allSettled([reserve(200), reserve(200)]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((r) => r.status === "rejected");
    expect(rejected?.status === "rejected" ? rejected.reason : null).toMatchObject({
      code: "MEDIA_BUDGET_EXCEEDED",
    });
    const [budget] = await db.select().from(mediaStorageBudget).where(eq(mediaStorageBudget.id, 1));
    expect(budget?.reservedBytes).toBe(200);
  });
  it("double complete consume una vez y abort libera la reserva sin borrar READY", async () => {
    const upload = await reserve(100);
    await db.transaction((tx) => completeUpload(tx, upload.id, actor));
    expect((await db.transaction((tx) => completeUpload(tx, upload.id, actor))).alreadyReady).toBe(
      true
    );
    const pending = await reserve(100);
    await db.transaction((tx) =>
      abortUpload(tx, pending.id, actor, "USER_ABORTED", new InMemoryCatalogStorageAdapter())
    );
    await db.transaction((tx) =>
      abortUpload(tx, upload.id, actor, "USER_ABORTED", new InMemoryCatalogStorageAdapter())
    );
    const [budget] = await db.select().from(mediaStorageBudget).where(eq(mediaStorageBudget.id, 1));
    expect(budget?.reservedBytes).toBe(0);
    expect(budget?.usedBytes).toBe(original.usedBytes + 100);
    const [ready] = await db.select().from(mediaUploads).where(eq(mediaUploads.id, upload.id));
    expect(ready?.status).toBe("READY");
  });
});
