import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { generateUuidV7 } from "../../utils/uuid";
import { categories } from "./categories";

export interface SpecificationFieldOption {
  value: string;
  label: string;
}

export interface SpecificationFieldDefinition {
  key: string;
  label: string;
  dataType: "enum" | "number" | "boolean" | "string";
  unit?: string;
  filterable: boolean;
  filterKind: "ENUM_MULTI" | "NUMBER_RANGE" | "BOOLEAN";
  publicParam: string;
  displayOrder: number;
  options?: SpecificationFieldOption[];
  min?: number;
  max?: number;
  step?: number;
}

/**
 * Category Specification Schemas Entity
 *
 * Defines the versioned technical specification structure and storefront filterable
 * metadata for a specific Category (e.g., sensor, weight, polling rate for Mouses).
 */
export const categorySpecificationSchemas = pgTable(
  "category_specification_schemas",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => generateUuidV7()),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => categories.id, { onDelete: "restrict" }),
    schemaVersion: integer("schema_version").notNull(),
    fieldDefinitions: jsonb("field_definitions").$type<SpecificationFieldDefinition[]>().notNull(),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("category_spec_schemas_category_id_schema_version_key").on(
      table.categoryId,
      table.schemaVersion
    ),
    index("category_spec_schemas_category_idx").on(table.categoryId, table.isActive),
    check("category_spec_schemas_version_positive", sql`${table.schemaVersion} > 0`),
    check(
      "category_spec_schemas_field_defs_array",
      sql`jsonb_typeof(${table.fieldDefinitions}) = 'array'`
    ),
  ]
);

export type CategorySpecificationSchema = typeof categorySpecificationSchemas.$inferSelect;
export type NewCategorySpecificationSchema = typeof categorySpecificationSchemas.$inferInsert;
