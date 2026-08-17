import { sql } from "drizzle-orm";
import {
  check,
  integer,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { generateUuidV7 } from "../../utils/uuid";
import { mediaTypeEnum, securityClassEnum } from "../enums";

/**
 * Media Assets Entity
 *
 * Encapsulates metadata for binary objects stored in Cloudflare R2.
 * Zero binary storage occurs in PostgreSQL.
 */
export const mediaAssets = pgTable(
  "media_assets",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => generateUuidV7()),
    objectKey: varchar("object_key", { length: 500 }).notNull(),
    securityClass: securityClassEnum("security_class").notNull().default("PUBLIC_MEDIA"),
    mediaType: mediaTypeEnum("media_type").notNull().default("IMAGE"),
    mimeType: varchar("mime_type", { length: 100 }).notNull(),
    fileSizeBytes: integer("file_size_bytes").notNull(),
    width: integer("width"),
    height: integer("height"),
    altText: varchar("alt_text", { length: 255 }),
    checksumSha256: varchar("checksum_sha256", { length: 64 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("media_assets_object_key_idx").on(table.objectKey),
    check("media_assets_file_size_positive", sql`${table.fileSizeBytes} > 0`),
    check("media_assets_width_positive", sql`${table.width} IS NULL OR ${table.width} > 0`),
    check("media_assets_height_positive", sql`${table.height} IS NULL OR ${table.height} > 0`),
    check(
      "media_assets_checksum_sha256_format",
      sql`${table.checksumSha256} IS NULL OR ${table.checksumSha256} ~ '^[0-9a-f]{64}$'`
    ),
  ]
);

export type MediaAsset = typeof mediaAssets.$inferSelect;
export type NewMediaAsset = typeof mediaAssets.$inferInsert;
