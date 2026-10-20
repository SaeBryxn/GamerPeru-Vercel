import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  index,
  integer,
  pgEnum,
  pgTable,
  smallint,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { generateUuidV7 } from "@/db/utils/uuid";
import { mediaAssets } from "./media-assets";

export const mediaUploadStatus = pgEnum("media_upload_status", [
  "PENDING",
  "READY",
  "ABORTED",
  "EXPIRED",
  "REJECTED",
]);
export const mediaUploads = pgTable(
  "media_uploads",
  {
    id: uuid("id").primaryKey().$defaultFn(generateUuidV7),
    actorAuthUserId: uuid("actor_auth_user_id").notNull(),
    purpose: varchar("purpose", { length: 32 }).notNull(),
    subjectId: uuid("subject_id"),
    variantId: uuid("variant_id"),
    objectKey: varchar("object_key", { length: 500 }).notNull().unique(),
    mimeType: varchar("mime_type", { length: 100 }).notNull(),
    declaredSizeBytes: integer("declared_size_bytes").notNull(),
    status: mediaUploadStatus("status").notNull().default("PENDING"),
    mediaAssetId: uuid("media_asset_id").references(() => mediaAssets.id, { onDelete: "set null" }),
    width: integer("width"),
    height: integer("height"),
    failureCode: varchar("failure_code", { length: 64 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => [
    check("media_upload_size_positive", sql`${t.declaredSizeBytes} > 0`),
    index("media_uploads_expiration_idx").on(t.status, t.expiresAt),
    index("media_uploads_actor_created_idx").on(t.actorAuthUserId, t.createdAt),
  ]
).enableRLS();

export const mediaStorageBudget = pgTable(
  "media_storage_budget",
  {
    id: smallint("id").primaryKey(),
    budgetBytes: bigint("budget_bytes", { mode: "number" }).notNull(),
    usedBytes: bigint("used_bytes", { mode: "number" }).notNull(),
    reservedBytes: bigint("reserved_bytes", { mode: "number" }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("media_storage_budget_singleton", sql`${t.id} = 1`),
    check(
      "media_storage_budget_nonnegative",
      sql`${t.budgetBytes} >= 0 AND ${t.usedBytes} >= 0 AND ${t.reservedBytes} >= 0`
    ),
  ]
).enableRLS();
export type MediaUpload = typeof mediaUploads.$inferSelect;
