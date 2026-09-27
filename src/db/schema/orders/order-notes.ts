import { sql } from "drizzle-orm";
import {
  char,
  check,
  foreignKey,
  index,
  pgTable,
  text,
  timestamp,
  uuid,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { generateUuidV7 } from "../../utils/uuid";
import { authUsers } from "../identity/auth-users";
import { orders } from "./orders";

export const orderNotes = pgTable(
  "order_notes",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => generateUuidV7()),
    orderId: uuid("order_id")
      .notNull()
      .references((): AnyPgColumn => orders.id, { onDelete: "restrict" }),
    authorAuthUserId: uuid("author_auth_user_id"),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    mutationRequestId: uuid("mutation_request_id").notNull().unique(),
    intentFingerprint: char("intent_fingerprint", { length: 64 }).notNull(),
    actorBindingDigest: char("actor_binding_digest", { length: 64 }).notNull(),
  },
  (table) => [
    foreignKey({
      name: "order_notes_author_auth_user_id_fk",
      columns: [table.authorAuthUserId],
      foreignColumns: [authUsers.id],
    }).onDelete("set null"),
    check("order_notes_body_not_blank", sql`length(trim(${table.body})) > 0`),
    check("order_notes_body_max_length", sql`char_length(${table.body}) <= 2000`),
    index("order_notes_order_created_id_idx").on(table.orderId, table.createdAt, table.id),
  ]
);

export type OrderNote = typeof orderNotes.$inferSelect;
export type NewOrderNote = typeof orderNotes.$inferInsert;
