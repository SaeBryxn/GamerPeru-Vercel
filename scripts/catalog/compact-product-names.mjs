import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { planProductNames } from "./product-names.mjs";

// Preview: node scripts/catalog/compact-product-names.mjs scratch/nombres-modelos
// Apply the reviewed preview: same command with --apply. No schema migration is needed.
const directory = path.resolve(process.argv[2] ?? "scratch/nombres-modelos");
const apply = process.argv.includes("--apply");
const planPath = path.join(directory, "plan.json");
process.loadEnvFile(".env.local");
const sql = postgres(process.env.DATABASE_URL, { prepare: false, max: 1, connect_timeout: 15 });

const readProducts = (tx) => tx`
  select p.id,p.name,p.slug,p.updated_at::text as version,c.slug as category_slug,
    exists(select 1 from audit_events a where a.target_id=p.id::text
      and a.action='CATALOG_SUPPLIER_IMPORT') as imported
  from products p join categories c on c.id=p.category_id order by p.id`;

// Only hashes leave the database: no customer or review text is exported.
const fingerprint = async (tx) =>
  (
    await tx`
  select
    (select md5(coalesce(jsonb_agg(to_jsonb(p)-'name'-'updated_at' order by p.id)::text,'')) from products p) as products,
    (select md5(coalesce(jsonb_agg(to_jsonb(v) order by v.id)::text,'')) from product_variants v) as variants,
    (select md5(coalesce(jsonb_agg(to_jsonb(i) order by i.id)::text,'')) from inventory_items i) as inventory,
    (select md5(coalesce(jsonb_agg(to_jsonb(m) order by m.id)::text,'')) from product_media m) as media,
    (select md5(coalesce(jsonb_agg(to_jsonb(r) order by r.id)::text,'')) from product_reviews r) as reviews,
    (select md5(coalesce(jsonb_agg(to_jsonb(s) order by s.id)::text,'')) from product_story_revisions s) as stories
`
  )[0];

try {
  if (!apply) {
    const snapshot = await readProducts(sql);
    const changes = planProductNames(snapshot);
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(planPath, JSON.stringify({ snapshot, changes }, null, 2));
    console.log(
      JSON.stringify({ mode: "preview", total: snapshot.length, changes: changes.length, planPath })
    );
  } else {
    const plan = JSON.parse(fs.readFileSync(planPath, "utf8"));
    const expectedChanges = planProductNames(plan.snapshot);
    if (JSON.stringify(plan.changes) !== JSON.stringify(expectedChanges))
      throw new Error(
        "El plan no coincide con la limpieza de nombres; vuelve a generar la vista previa."
      );
    const batch = `model-names-${randomUUID()}`;
    const result = await sql.begin("isolation level repeatable read", async (tx) => {
      // The catalog is small; lock its product rows before comparing the reviewed snapshot.
      await tx`select id from products order by id for update`;
      const current = await readProducts(tx);
      if (JSON.stringify(current) !== JSON.stringify(plan.snapshot))
        throw new Error(
          "El catálogo cambió desde la vista previa. No se modificó ningún producto."
        );
      const before = await fingerprint(tx);
      for (const row of plan.changes) {
        await tx`update products set name=${row.nextName},updated_at=now() where id=${row.id}::uuid`;
        await tx`insert into audit_events(id,actor_type,actor_id,action,target_type,target_id,metadata,request_id)
          values(${randomUUID()}::uuid,'SYSTEM','catalog-model-names','catalog:product:rename','product',${row.id},
            ${tx.json({ before: row.name, after: row.nextName, slug: row.slug })},${batch})`;
      }
      const after = await fingerprint(tx);
      if (JSON.stringify(before) !== JSON.stringify(after))
        throw new Error("Cambió información ajena al nombre; se revierte la operación completa.");
      return { batch, renamed: plan.changes.length, preserved: after };
    });
    fs.writeFileSync(path.join(directory, "applied.json"), JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result));
  }
} finally {
  await sql.end();
}
