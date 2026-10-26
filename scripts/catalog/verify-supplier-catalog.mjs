import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import postgres from "postgres";

const directory = path.resolve(process.argv[2] ?? "scratch/catalogo-20261026");
const plan = JSON.parse(fs.readFileSync(path.join(directory, "plan.json")));
const before = JSON.parse(fs.readFileSync(path.join(directory, "estado-inicial.json")));
const receipt = JSON.parse(fs.readFileSync(path.join(directory, "validacion.json")));
process.loadEnvFile(".env.local");
const sql = postgres(process.env.DATABASE_URL, { max: 1, prepare: false, connect_timeout: 15 });
try {
  const ids = plan.products.map((p) => p.id);
  const products =
    await sql`select id,name,slug,status,pdp_config,primary_media_id from products where id in ${sql([...ids, ...before.catalog.map((p) => p.id)])}`;
  const variants =
    await sql`select v.id,v.product_id,v.price_cents,v.attributes,v.cost_cents,v.compare_at_price_cents,v.status,i.quantity_on_hand,i.quantity_reserved,i.quantity_allocated from product_variants v join inventory_items i on i.variant_id=v.id join inventory_locations l on l.id=i.location_id where v.product_id in ${sql(ids)} and l.code='LOC-LIM-01'`;
  const stories =
    await sql`select s.product_id,r.blocks,r.status from product_stories s join product_story_revisions r on r.id=s.published_revision_id where s.product_id in ${sql(ids)}`;
  const normalize = (value) =>
    JSON.stringify(value, (_key, v) =>
      v && typeof v === "object" && !Array.isArray(v)
        ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)))
        : v
    );
  for (const old of before.catalog) {
    const actual = products.find((p) => p.id === old.id);
    assert.ok(actual, old.name);
    for (const key of ["name", "slug", "status", "pdp_config", "primary_media_id"])
      assert.equal(normalize(actual[key]), normalize(old[key]), `Cambió ${old.name}: ${key}`);
  }
  for (const expected of plan.products) {
    const actual = products.find((p) => p.id === expected.id);
    assert.equal(actual?.status, "PUBLISHED", expected.name);
    assert.equal(
      normalize(actual.pdp_config),
      normalize(receipt.pdpConfigs[expected.id]),
      expected.name
    );
    const story = stories.find((s) => s.product_id === expected.id);
    assert.equal(story?.status, "PUBLISHED", expected.name);
    assert.equal(normalize(story.blocks), normalize(receipt.stories[expected.id]), expected.name);
    for (const v of expected.variants) {
      const actual = variants.find((row) => row.id === v.id);
      assert.ok(actual, v.sku);
      assert.equal(actual.price_cents, v.priceCents, v.sku);
      assert.equal(actual.status, "ACTIVE", v.sku);
      assert.equal(actual.cost_cents, null, v.sku);
      assert.equal(actual.compare_at_price_cents, null, v.sku);
      assert.equal(actual.quantity_on_hand, 0, v.sku);
      assert.equal(actual.quantity_reserved, 0, v.sku);
      assert.equal(actual.quantity_allocated, 0, v.sku);
      assert.equal(
        Object.keys(actual.attributes).some((k) => k.startsWith("supplier_")),
        false,
        v.sku
      );
    }
  }
  const report = {
    verifiedAt: new Date().toISOString(),
    published: ids.length,
    variants: variants.length,
    stories: stories.length,
    existingProductsPreserved: before.catalog.length,
    stockNew: 0,
    pricesProvisional: true,
    byBrand: Object.fromEntries(
      ["atk", "mchose"].map((brand) => [
        brand,
        plan.products.filter((p) => p.brand === brand).length,
      ])
    ),
  };
  fs.writeFileSync(
    path.join(directory, "verificacion-publicacion.json"),
    JSON.stringify(report, null, 2)
  );
  console.log(JSON.stringify(report));
} finally {
  await sql.end();
}
