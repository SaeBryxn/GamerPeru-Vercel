import { pgEnum } from "drizzle-orm/pg-core";

/**
 * Gamer Perú — Canonical Audit Actor Type Enum
 */
export const auditActorTypeEnum = pgEnum("audit_actor_type", ["CUSTOMER", "ADMIN", "SYSTEM"]);
