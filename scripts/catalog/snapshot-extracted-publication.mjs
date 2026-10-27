import fs from "node:fs";
import path from "node:path";
import postgres from "postgres";
const directory = path.resolve(process.argv[2]);
const file = path.join(directory, "publication-before.json");
if (fs.existsSync(file))
  throw Error("La copia inicial ya existe; conserva la referencia original.");
fs.mkdirSync(directory, { recursive: true });
process.loadEnvFile(".env.local");
const sql = postgres(process.env.DATABASE_URL, { prepare: false, max: 1 });
try {
  const snapshot = await sql.begin("isolation level repeatable read read only", async (tx) => ({
    categories:
      await tx`select c.id,c.name,c.slug,c.status,c.current_spec_schema_id,s.schema_version,s.field_definitions,s.is_active from categories c left join category_specification_schemas s on s.id=c.current_spec_schema_id`,
    brands: await tx`select id,name,slug,status from brands`,
    catalog:
      await tx`select id,name,slug,status,pdp_config,primary_media_id,brand_id,category_id from products`,
    variants:
      await tx`select v.id,v.product_id,v.title,v.sku,v.attributes,v.price_cents,i.quantity_on_hand,i.quantity_reserved,i.quantity_allocated from product_variants v left join inventory_items i on i.variant_id=v.id`,
  }));
  fs.writeFileSync(file, JSON.stringify(snapshot, null, 2));
  console.log(
    JSON.stringify({ products: snapshot.catalog.length, variants: snapshot.variants.length, file })
  );
} finally {
  await sql.end();
}
