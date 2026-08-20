import { pgEnum } from "drizzle-orm/pg-core";

/**
 * Gamer Perú — Canonical Identity PostgreSQL Enums
 *
 * Enums required by CustomerProfile and identity aggregates.
 */
export const documentTypeEnum = pgEnum("document_type", ["DNI", "CE", "RUC", "PASSPORT"]);
