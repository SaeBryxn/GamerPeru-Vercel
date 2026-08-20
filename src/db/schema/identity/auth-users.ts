import { pgSchema, uuid } from "drizzle-orm/pg-core";

/**
 * Supabase Auth Users Reference Target
 *
 * Scoped reference to auth.users for customer and staff identity relationships
 * without owning or altering Supabase internal auth schema.
 */
export const authSchema = pgSchema("auth");
export const authUsers = authSchema.table("users", {
  id: uuid("id").primaryKey(),
});
