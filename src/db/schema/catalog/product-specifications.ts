import { sql } from "drizzle-orm";
import { check, index, integer, jsonb, pgTable, timestamp, uuid } from "drizzle-orm/pg-core";
import { categorySpecificationSchemas } from "./category-specification-schemas";
import { products } from "./products";

export type SpecificationPrimitiveValue = string | number | boolean | null;
export type ProductSpecificationValues = Record<string, SpecificationPrimitiveValue>;

/**
 * Product Specifications Entity
 *
 * Stores structured hardware specifications for a Product, versioned against
 * an active CategorySpecificationSchema.
 */
export const productSpecifications = pgTable(
  "product_specifications",
  {
    productId: uuid("product_id")
      .primaryKey()
      .references(() => products.id, { onDelete: "cascade" }),
    schemaId: uuid("schema_id")
      .notNull()
      .references(() => categorySpecificationSchemas.id, { onDelete: "restrict" }),
    schemaVersion: integer("schema_version").notNull(),
    specValues: jsonb("spec_values").$type<ProductSpecificationValues>().notNull().default({}),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
  },
  (table) => [
    index("product_specifications_schema_id_idx").on(table.schemaId),
    index("product_specifications_spec_values_gin_idx").using(
      "gin",
      table.specValues.op("jsonb_path_ops")
    ),
    check("product_specifications_version_positive", sql`${table.schemaVersion} > 0`),
    check(
      "product_specifications_spec_values_object",
      sql`jsonb_typeof(${table.specValues}) = 'object'`
    ),
  ]
);

export type ProductSpecification = typeof productSpecifications.$inferSelect;
export type NewProductSpecification = typeof productSpecifications.$inferInsert;
