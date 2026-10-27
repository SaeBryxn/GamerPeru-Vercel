import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import postgres from "postgres";
import { stableId, structuredSpecs } from "./supplier-plan.mjs";

const directory = path.resolve(process.argv[2] ?? "scratch/catalogo-20261026");
const apply = process.argv.includes("--apply");
const planBytes = fs.readFileSync(path.join(directory, "plan.json"));
const mediaBytes = fs.readFileSync(path.join(directory, "media.json"));
const plan = JSON.parse(planBytes),
  media = JSON.parse(mediaBytes);
const receiptPath = path.join(directory, "validacion.json");
if (!fs.existsSync(receiptPath))
  throw new Error(
    "Primero valida el plan con los validadores de catálogo e historias de la aplicación."
  );
const receipt = JSON.parse(fs.readFileSync(receiptPath));
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
if (receipt.planHash !== hash(planBytes) || receipt.mediaHash !== hash(mediaBytes))
  throw new Error("El plan o las imágenes cambiaron después de validarse.");
for (const product of plan.products)
  for (const photo of product.images)
    if (!media[photo.url]?.uploaded) throw new Error(`Falta subir una foto de ${product.name}`);
if (!apply) {
  console.log(
    JSON.stringify({
      mode: "dry-run",
      products: plan.products.length,
      variants: plan.products.reduce((n, p) => n + p.variants.length, 0),
      validated: true,
    })
  );
  process.exit(0);
}
process.loadEnvFile(".env.local");
const sql = postgres(process.env.DATABASE_URL, { prepare: false, max: 1, connect_timeout: 15 });
const result = { batch: plan.batch, created: [], appended: [], skipped: [], failed: [] };
try {
  const categories =
    await sql`select c.id,c.slug,c.status,c.current_spec_schema_id,s.schema_version,s.field_definitions,s.is_active from categories c left join category_specification_schemas s on s.id=c.current_spec_schema_id`;
  const brands = await sql`select id,slug,status from brands`;
  const location = (
    await sql`select id from inventory_locations where code='LOC-LIM-01' and is_active=true`
  )[0];
  if (!location) throw new Error("No se encontró el almacén principal activo.");
  for (const p of process.argv.includes("--finalize") ? [] : plan.products) {
    const category = categories.find((c) => c.slug === p.category && c.status === "PUBLISHED");
    const brand = brands.find((b) => b.slug === p.brand && b.status === "PUBLISHED");
    const expected = plan.snapshot.categories.find((c) => c.slug === p.category);
    if (
      !category ||
      !brand ||
      category.current_spec_schema_id !== expected.current_spec_schema_id ||
      category.schema_version !== expected.schema_version ||
      JSON.stringify(category.field_definitions) !== JSON.stringify(expected.field_definitions) ||
      (category.current_spec_schema_id && !category.is_active)
    )
      throw new Error(`Cambió la categoría o marca de ${p.name}; vuelve a validar.`);
    try {
      const written = await sql.begin(async (tx) => {
        await tx`select pg_advisory_xact_lock(hashtextextended(${`supplier-import:${p.id}`},0))`;
        const existing = await tx`select id from products where id=${p.id}::uuid or slug=${p.slug}`;
        if (existing.length && existing[0].id !== p.id) return "skipped";
        let variantsToInsert = p.variants,
          orderOffset = 0,
          mediaOffset = 0;
        if (existing.length) {
          const audit =
            await tx`select id from audit_events where target_id=${p.id} and action='CATALOG_SUPPLIER_IMPORT' and metadata->>'batch'=${plan.batch} limit 1`;
          if (!audit.length) return "skipped"; // Never modify a manually managed record.
          const current =
            await tx`select id,display_order from product_variants where product_id=${p.id}::uuid`;
          variantsToInsert = p.variants.filter((v) => !current.some((row) => row.id === v.id));
          if (!variantsToInsert.length) return "skipped";
          orderOffset = Math.max(-1, ...current.map((v) => v.display_order)) + 1;
          mediaOffset = Number(
            (
              await tx`select coalesce(max(display_order),-1)+1 as next_order from product_media where product_id=${p.id}::uuid`
            )[0].next_order
          );
        }
        const photos = p.images.map((photo, i) => ({
          ...photo,
          asset: media[photo.url],
          order: mediaOffset + i,
        }));
        const assets = [
          ...new Map(
            photos.map((photo) => [
              photo.asset.id,
              {
                id: photo.asset.id,
                object_key: photo.asset.objectKey,
                mime_type: photo.asset.mimeType,
                file_size_bytes: photo.asset.fileSizeBytes,
                width: photo.asset.width,
                height: photo.asset.height,
                alt_text: photo.alt.slice(0, 255),
                checksum_sha256: photo.asset.checksumSha256,
              },
            ])
          ).values(),
        ];
        await tx`insert into media_assets (id,object_key,security_class,media_type,mime_type,file_size_bytes,width,height,alt_text,checksum_sha256)
          select id,object_key,'PUBLIC_MEDIA','IMAGE',mime_type,file_size_bytes,width,height,alt_text,checksum_sha256
          from jsonb_to_recordset(${tx.json(assets)}::jsonb) as a(id uuid,object_key text,mime_type text,file_size_bytes int,width int,height int,alt_text text,checksum_sha256 text)
          on conflict (object_key) do nothing`;
        const primary = photos[0].asset.id;
        if (!existing.length)
          await tx`insert into products (id,brand_id,category_id,name,slug,description,pdp_config,status,is_featured,primary_media_id) values (${p.id}::uuid,${brand.id}::uuid,${category.id}::uuid,${p.name},${p.slug},${p.description},${tx.json(receipt.pdpConfigs[p.id])},'DRAFT',false,${primary}::uuid)`;
        const variants = variantsToInsert.map((v, i) => ({
          id: v.id,
          sku: v.sku,
          title: v.title,
          price_cents: v.priceCents,
          // Provenance stays in the local import manifest. Public variant attributes are
          // selectable dimensions, so supplier identifiers must never become shop options.
          attributes: Object.fromEntries(
            Object.entries(v.attributes).filter(([key]) => !key.startsWith("supplier_"))
          ),
          display_order: orderOffset + i,
          inventory_id: stableId(`inventory:${v.id}:${location.id}`),
        }));
        await tx`insert into product_variants (id,product_id,sku,title,price_cents,compare_at_price_cents,cost_cents,weight_grams,attributes,status,display_order)
          select id,${p.id}::uuid,sku,title,price_cents,null,null,null,attributes,'ACTIVE',display_order
          from jsonb_to_recordset(${tx.json(variants)}::jsonb) as v(id uuid,sku text,title text,price_cents int,attributes jsonb,display_order int)`;
        await tx`insert into inventory_items (id,variant_id,location_id,quantity_on_hand)
          select inventory_id,id,${location.id}::uuid,0 from jsonb_to_recordset(${tx.json(variants)}::jsonb) as v(id uuid,inventory_id uuid)
          on conflict (variant_id,location_id) do nothing`;
        const attachments = photos.map((photo) => ({
          id: stableId(`product-media:${p.id}:${photo.asset.id}:${photo.variantId ?? "general"}`),
          media_asset_id: photo.asset.id,
          variant_id: photo.variantId,
          display_order: photo.order,
          placement: photo.placement ?? "GALLERY",
        }));
        await tx`insert into product_media (id,product_id,media_asset_id,variant_id,display_order,placement)
          select id,${p.id}::uuid,media_asset_id,variant_id,display_order,placement::product_media_placement from jsonb_to_recordset(${tx.json(attachments)}::jsonb) as a(id uuid,media_asset_id uuid,variant_id uuid,display_order int,placement text)
          on conflict (id) do nothing`;
        if (existing.length) {
          await tx`insert into audit_events (id,actor_type,actor_id,action,target_type,target_id,metadata,request_id) values (${stableId(`append:${p.id}:${variantsToInsert.map((v) => v.id).join(",")}`)}::uuid,'SYSTEM','supplier-catalog-import','CATALOG_SUPPLIER_VARIANTS_APPEND','PRODUCT',${p.id},${tx.json({ batch: plan.batch, variants: variantsToInsert.map((v) => v.id), stock: 0 })},${plan.batch})`;
          return "appended";
        }
        if (category.current_spec_schema_id)
          await tx`insert into product_specifications (product_id,schema_id,schema_version,spec_values) values (${p.id}::uuid,${category.current_spec_schema_id}::uuid,${expected.schema_version},${tx.json(structuredSpecs(p))})`;
        const revisionId = stableId(`story:${p.id}:1`);
        await tx`insert into product_story_revisions (id,product_id,revision_number,status,blocks,published_at) values (${revisionId}::uuid,${p.id}::uuid,1,'PUBLISHED',${tx.json(receipt.stories[p.id])},now())`;
        await tx`insert into product_stories (product_id,published_revision_id) values (${p.id}::uuid,${revisionId}::uuid)`;
        await tx`update products set status='PUBLISHED',updated_at=now() where id=${p.id}::uuid`;
        await tx`insert into audit_events (id,actor_type,actor_id,action,target_type,target_id,metadata,request_id) values (${stableId(`audit:${p.id}:${plan.batch}`)}::uuid,'SYSTEM','supplier-catalog-import','CATALOG_SUPPLIER_IMPORT','PRODUCT',${p.id},${tx.json({ batch: plan.batch, source: p.source, variants: p.variants.length, stock: 0, pricesProvisional: true, existingProductsPreserved: true })},${plan.batch})`;
        return "created";
      });
      result[written].push({ id: p.id, name: p.name, slug: p.slug });
    } catch (error) {
      result.failed.push({ name: p.name, error: error.message });
    }
    fs.writeFileSync(path.join(directory, "resultado-carga.json"), JSON.stringify(result, null, 2));
    if (
      (result.created.length +
        result.appended.length +
        result.skipped.length +
        result.failed.length) %
        10 ===
      0
    )
      console.log(
        JSON.stringify({
          created: result.created.length,
          appended: result.appended.length,
          skipped: result.skipped.length,
          failed: result.failed.length,
        })
      );
  }
  // Normalize older runs of this importer too. Restrict the update to this exact batch's
  // audited products and variant IDs; existing manually managed products remain untouched.
  const normalized = await sql`update product_variants v
    set attributes=v.attributes-'supplier_variant_id'-'supplier_product_id'-'supplier_sku'
    where v.id in ${sql(plan.products.flatMap((p) => p.variants.map((v) => v.id)))}
      and (v.attributes ? 'supplier_variant_id' or v.attributes ? 'supplier_product_id' or v.attributes ? 'supplier_sku')
      and exists (select 1 from audit_events e where e.target_id=v.product_id::text
        and e.action='CATALOG_SUPPLIER_IMPORT' and e.metadata->>'batch'=${plan.batch})
    returning v.id`;
  if (normalized.length)
    await sql`insert into audit_events (id,actor_type,actor_id,action,target_type,target_id,metadata,request_id)
    values (${stableId(`supplier-options:${plan.batch}`)}::uuid,'SYSTEM','supplier-catalog-import','CATALOG_SUPPLIER_OPTIONS_NORMALIZED','CATALOG',${plan.batch},${sql.json({ batch: plan.batch, variants: normalized.length })},${plan.batch}) on conflict (id) do nothing`;
  result.normalizedVariantAttributes = normalized.length;
  // Direct supplier uploads also consume the existing media budget. Account the actual
  // registered objects once per batch, preserving reservations from concurrent admin uploads.
  result.storageBytesAccounted = await sql.begin(async (tx) => {
    await tx`select pg_advisory_xact_lock(hashtextextended(${`supplier-storage:${plan.batch}`},0))`;
    const keys = [
      ...new Set(
        plan.products.flatMap((p) =>
          p.images
            .filter((i) => !media[i.url].registeredBeforeImport)
            .map((i) => media[i.url].objectKey)
        )
      ),
    ];
    if (!keys.length) return 0;
    const total = Number(
      (
        await tx`select coalesce(sum(file_size_bytes),0) as bytes from media_assets where object_key in ${tx(keys)}`
      )[0].bytes
    );
    const accounted = Number(
      (
        await tx`select coalesce(sum((metadata->>'bytesAdded')::bigint),0) as bytes from audit_events where action='MEDIA_SUPPLIER_IMPORT_ACCOUNTED' and metadata->>'batch'=${plan.batch}`
      )[0].bytes
    );
    const delta = Math.max(0, total - accounted);
    if (!delta) return 0;
    const budget =
      await tx`update media_storage_budget set used_bytes=used_bytes+${delta},updated_at=now() where id=1 and used_bytes+reserved_bytes+${delta}<=budget_bytes returning id`;
    if (!budget.length)
      throw new Error("No queda presupuesto de medios para contabilizar la carga de proveedores.");
    await tx`insert into audit_events (id,actor_type,actor_id,action,target_type,target_id,metadata,request_id)
      values (${stableId(`supplier-storage:${plan.batch}:${total}`)}::uuid,'SYSTEM','supplier-catalog-import','MEDIA_SUPPLIER_IMPORT_ACCOUNTED','CATALOG',${plan.batch},${tx.json({ batch: plan.batch, bytesAdded: delta, totalBytes: total })},${plan.batch})`;
    return delta;
  });
  fs.writeFileSync(
    path.join(
      directory,
      process.argv.includes("--finalize") ? "resultado-finalizacion.json" : "resultado-carga.json"
    ),
    JSON.stringify(result, null, 2)
  );
  console.log(
    JSON.stringify({
      created: result.created.length,
      appended: result.appended.length,
      skipped: result.skipped.length,
      failed: result.failed.length,
    })
  );
} finally {
  await sql.end();
}
if (result.failed.length) process.exitCode = 1;
