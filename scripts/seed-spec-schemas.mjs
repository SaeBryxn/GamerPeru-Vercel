import postgres from "postgres";
import crypto from "node:crypto";

/**
 * Seeds the technical specification schema for catalog categories.
 *
 * The schema declares the shape of a product's spec sheet and which fields the storefront can
 * filter by. Field values are never seeded here: the operator fills those per product, so the
 * catalog never carries invented technical claims.
 *
 * Public params match the filters the storefront navigation already links to
 * (peso_max, polling_min, forma), so those links resolve instead of returning everything.
 *
 * Run with --apply to write. Without it, prints what would change.
 */

const MOUSE_FIELDS = [
  {
    key: "sensor",
    label: "Sensor",
    dataType: "string",
    filterable: false,
    displayOrder: 0,
  },
  {
    key: "polling",
    label: "Polling rate",
    dataType: "number",
    unit: "Hz",
    filterable: true,
    filterKind: "NUMBER_RANGE",
    publicParam: "polling",
    displayOrder: 1,
    min: 125,
    max: 8000,
    step: 1,
  },
  {
    key: "mcu",
    label: "MCU",
    dataType: "string",
    filterable: false,
    displayOrder: 2,
  },
  {
    key: "switches",
    label: "Switches",
    dataType: "string",
    filterable: false,
    displayOrder: 3,
  },
  {
    key: "peso",
    label: "Peso",
    dataType: "number",
    unit: "g",
    filterable: true,
    filterKind: "NUMBER_RANGE",
    publicParam: "peso",
    displayOrder: 4,
    min: 20,
    max: 200,
    step: 0.1,
  },
  {
    key: "bateria",
    label: "Batería",
    dataType: "number",
    unit: "h",
    filterable: true,
    filterKind: "NUMBER_RANGE",
    publicParam: "bateria",
    displayOrder: 5,
    min: 0,
    max: 300,
    step: 1,
  },
  {
    key: "forma",
    label: "Forma",
    dataType: "enum",
    filterable: true,
    filterKind: "ENUM_MULTI",
    publicParam: "forma",
    displayOrder: 6,
    options: [
      { value: "simetrico", label: "Simétrico (ambidiestro)" },
      { value: "ergonomico", label: "Ergonómico" },
    ],
  },
];

const MOUSEPAD_FIELDS = [
  {
    key: "superficie",
    label: "Superficie",
    dataType: "enum",
    filterable: true,
    filterKind: "ENUM_MULTI",
    publicParam: "superficie",
    displayOrder: 0,
    options: [
      { value: "vidrio", label: "Vidrio" },
      { value: "control", label: "Control" },
      { value: "speed", label: "Speed" },
      { value: "hibrido", label: "Híbrido" },
    ],
  },
  {
    key: "base",
    label: "Base",
    dataType: "string",
    filterable: false,
    displayOrder: 1,
  },
  {
    key: "largo",
    label: "Largo",
    dataType: "number",
    unit: "mm",
    filterable: true,
    filterKind: "NUMBER_RANGE",
    publicParam: "largo",
    displayOrder: 2,
    min: 100,
    max: 1200,
    step: 1,
  },
  {
    key: "ancho",
    label: "Ancho",
    dataType: "number",
    unit: "mm",
    filterable: true,
    filterKind: "NUMBER_RANGE",
    publicParam: "ancho",
    displayOrder: 3,
    min: 100,
    max: 800,
    step: 1,
  },
  {
    key: "grosor",
    label: "Grosor",
    dataType: "number",
    unit: "mm",
    filterable: true,
    filterKind: "NUMBER_RANGE",
    publicParam: "grosor",
    displayOrder: 4,
    min: 0.1,
    max: 10,
    step: 0.1,
  },
];

const SCHEMAS = [
  { categorySlug: "mouses", fields: MOUSE_FIELDS },
  { categorySlug: "mousepads", fields: MOUSEPAD_FIELDS },
];

const apply = process.argv.includes("--apply");
const sql = postgres(process.env.DATABASE_URL, { prepare: false, max: 2 });

try {
  for (const { categorySlug, fields } of SCHEMAS) {
    const [category] = await sql`
      select id, name, current_spec_schema_id from categories where slug = ${categorySlug}`;
    if (!category) {
      console.log(`  OMITIDO ${categorySlug}: la categoría no existe`);
      continue;
    }

    const [existing] = await sql`
      select id, schema_version, is_active from category_specification_schemas
      where category_id = ${category.id} order by schema_version desc limit 1`;

    // The category has to point at its schema: readers resolve the spec sheet through
    // current_spec_schema_id, so a schema row alone leaves the category looking unconfigured.
    if (existing?.is_active) {
      if (category.current_spec_schema_id === existing.id) {
        console.log(`  OK      ${categorySlug}: ya tiene el esquema v${existing.schema_version}`);
        continue;
      }
      console.log(
        `  ${apply ? "ENLAZANDO" : "PENDIENTE"} ${categorySlug}: apuntar la categoría al esquema v${existing.schema_version}`
      );
      if (apply) {
        await sql`update categories set current_spec_schema_id = ${existing.id} where id = ${category.id}`;
      }
      continue;
    }

    const nextVersion = (existing?.schema_version ?? 0) + 1;
    console.log(
      `  ${apply ? "CREANDO" : "PENDIENTE"} ${categorySlug}: esquema v${nextVersion} con ${fields.length} campos`
    );

    if (!apply) continue;

    const schemaId = crypto.randomUUID();
    await sql`
      insert into category_specification_schemas (id, category_id, schema_version, field_definitions, is_active)
      values (${schemaId}, ${category.id}, ${nextVersion}, ${sql.json(fields)}, true)`;
    await sql`update categories set current_spec_schema_id = ${schemaId} where id = ${category.id}`;
  }
} finally {
  await sql.end({ timeout: 5 });
}

console.log(apply ? "\nEsquemas aplicados." : "\nSimulación. Ejecuta con --apply para escribir.");
