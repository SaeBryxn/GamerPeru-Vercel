import fs from "node:fs";
import path from "node:path";
import postgres from "postgres";
import { stableId } from "./supplier-plan.mjs";
const directory = path.resolve(process.argv[2]);
const plan = JSON.parse(fs.readFileSync(path.join(directory, "plan.json")));
const newBrands = plan.brands.filter((b) => !plan.snapshot.brands.some((old) => old.id === b.id));
const categories = plan.snapshot.categories.filter(
  (c) => !plan.snapshot.catalog.some((p) => p.category_id === c.id) && c.slug === "monitores"
);
if (!process.argv.includes("--apply")) {
  console.log(
    JSON.stringify({
      mode: "dry-run",
      brands: newBrands.map((b) => b.name),
      categories: categories.map((c) => c.name),
    })
  );
  process.exit(0);
}
process.loadEnvFile(".env.local");
const sql = postgres(process.env.DATABASE_URL, { prepare: false, max: 1 });
try {
  await sql.begin(async (tx) => {
    for (const b of newBrands) {
      const previous =
        await tx`select id,status from brands where slug=${b.slug} or lower(name)=lower(${b.name})`;
      if (previous.length) {
        if (previous[0].id !== b.id || previous[0].status !== "PUBLISHED")
          throw Error(`Taxonomy changed: ${b.name}`);
        continue;
      }
      await tx`insert into brands (id,name,slug,status) values (${b.id}::uuid,${b.name},${b.slug},'PUBLISHED')`;
    }
    for (const c of categories) {
      const previous = await tx`select id,status from categories where slug=${c.slug}`;
      if (previous.length) {
        if (previous[0].id !== c.id || previous[0].status !== "PUBLISHED")
          throw Error(`Category changed: ${c.name}`);
        continue;
      }
      await tx`insert into categories (id,name,slug,display_order,status) values (${c.id}::uuid,${c.name},${c.slug},5,'PUBLISHED')`;
    }
    await tx`insert into audit_events (id,actor_type,actor_id,action,target_type,target_id,metadata,request_id) values (${stableId(`taxonomy:${plan.batch}`)}::uuid,'SYSTEM','supplier-catalog-import','CATALOG_IMPORT_TAXONOMY','CATALOG',${plan.batch},${tx.json({ brands: newBrands.map((b) => b.slug), categories: categories.map((c) => c.slug) })},${plan.batch}) on conflict (id) do nothing`;
  });
  console.log(
    JSON.stringify({ publishedBrands: newBrands.length, publishedCategories: categories.length })
  );
} finally {
  await sql.end();
}
