import { pgEnum } from "drizzle-orm/pg-core";

/**
 * Gamer Perú — Canonical PostgreSQL Enums
 *
 * Enums required strictly by catalog and media tables.
 */

export const catalogStatusEnum = pgEnum("catalog_status", ["DRAFT", "PUBLISHED", "ARCHIVED"]);

export const variantStatusEnum = pgEnum("variant_status", ["ACTIVE", "INACTIVE", "ARCHIVED"]);

export const securityClassEnum = pgEnum("security_class", [
  "PUBLIC_MEDIA",
  "PRIVATE_PAYMENT_PROOF",
  "PRIVATE_PAYMENT_INSTRUCTION",
  "PRIVATE_BACKUP",
]);

export const mediaTypeEnum = pgEnum("media_type", ["IMAGE", "VIDEO", "DOCUMENT"]);
