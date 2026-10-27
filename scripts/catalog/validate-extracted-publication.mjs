import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { stableId, structuredSpecs } from "./supplier-plan.mjs";

const target = path.resolve(process.argv[2]);
process.loadEnvFile(".env.local");
// Reuse the compiler pinned by our existing migration tooling; no runtime package is added.
const require = createRequire(import.meta.url);
const { build } = createRequire(require.resolve("drizzle-kit"))("esbuild");
const validatorPath = path.join(target, "validators.mjs");
await build({
  entryPoints: [fileURLToPath(new URL("./publication-validators.ts", import.meta.url))],
  outfile: validatorPath,
  bundle: true,
  platform: "node",
  format: "esm",
  packages: "external",
  plugins: [
    {
      name: "standalone-server-validation",
      setup(build) {
        build.onResolve({ filter: /^server-only$/ }, () => ({
          path: "server-only",
          namespace: "empty",
        }));
        build.onLoad({ filter: /.*/, namespace: "empty" }, () => ({ contents: "export {};" }));
      },
    },
  ],
});
const {
  productPdpConfigSchema,
  validatePersistedStoryDocument,
  validateStoryBlocks,
  evaluatePublishReadiness,
} = await import(pathToFileURL(validatorPath).href);
const planBytes = fs.readFileSync(path.join(target, "plan.json"));
const mediaBytes = fs.readFileSync(path.join(target, "media.json"));
const plan = JSON.parse(planBytes),
  media = JSON.parse(mediaBytes);
const receipt = {
  planHash: createHash("sha256").update(planBytes).digest("hex"),
  mediaHash: createHash("sha256").update(mediaBytes).digest("hex"),
  stories: {},
  pdpConfigs: {},
};
for (const p of plan.products) {
  const photos = p.images.map((photo, i) => ({ ...photo, asset: media[photo.url], order: i }));
  for (const photo of photos)
    if (!photo.asset?.uploaded) throw Error(`Missing uploaded photo: ${p.name}: ${photo.url}`);
  const overrides = Object.fromEntries(
    p.variants.map((v) => [
      v.id,
      {
        color: v.attributes.color ?? "",
        size: v.attributes.size ?? "",
        mediaAssetId: media[v.imageUrl]?.id ?? null,
      },
    ])
  );
  const pdp = productPdpConfigSchema.parse({ ...p.pdpConfig, variants: overrides });
  const groups = [];
  for (let i = 0; i < p.facts.length; i += 20)
    groups.push({
      groupName: i === 0 ? "Ficha técnica" : "Más características",
      specs: p.facts.slice(i, i + 20).map(({ label, value }) => ({ label, value })),
    });
  const blocks = [
    {
      block_id: stableId(`${p.id}:hero`),
      type: "hero_media",
      order: 1,
      payload: { headline: p.name, body: p.description, mediaKey: photos[0].asset.objectKey },
    },
    {
      block_id: stableId(`${p.id}:specs`),
      type: "technical_specs",
      order: 2,
      payload: { title: "Especificaciones", groups },
    },
  ];
  const storyImages = p.storyImages.length
    ? p.storyImages
    : photos
        .filter((photo) => photo.variantId === null)
        .slice(1, 2)
        .map((photo) => photo.url);
  for (const [i, url] of storyImages.slice(0, 28).entries())
    blocks.push({
      block_id: stableId(`${p.id}:story-image:${i}`),
      type: "full_bleed_image",
      order: blocks.length + 1,
      payload: { mediaKey: media[url].objectKey, altText: p.name },
    });
  let strict;
  try {
    strict = validatePersistedStoryDocument(blocks, { allowEmpty: false });
  } catch (error) {
    console.error(p.name, JSON.stringify(error.issues));
    throw error;
  }
  const projected = validateStoryBlocks(strict);
  if (!projected || projected.length !== strict.length)
    throw Error(`Public story projection mismatch: ${p.name}`);
  const category = plan.snapshot.categories.find((c) => c.slug === p.category);
  const brand = plan.brands.find((b) => b.slug === p.brand);
  const asset = (a) => ({ ...a, securityClass: "PUBLIC_MEDIA", mediaType: "IMAGE" });
  const readiness = evaluatePublishReadiness({
    product: {
      ...p,
      brandId: brand.id,
      categoryId: category.id,
      primaryMediaId: photos[0].asset.id,
    },
    brand,
    category: { ...category, currentSpecSchemaId: category.current_spec_schema_id },
    currentSpecSchema: category.current_spec_schema_id
      ? {
          id: category.current_spec_schema_id,
          isActive: category.is_active,
          schemaVersion: category.schema_version,
          fieldDefinitions: category.field_definitions,
        }
      : null,
    specifications: category.current_spec_schema_id
      ? {
          schemaId: category.current_spec_schema_id,
          schemaVersion: category.schema_version,
          specValues: structuredSpecs(p),
        }
      : null,
    variants: p.variants.map((v) => ({ ...v, status: "ACTIVE" })),
    media: photos.map((photo) => ({
      variantId: photo.variantId,
      mediaAssetId: photo.asset.id,
      mediaAsset: asset(photo.asset),
    })),
    primaryMediaAsset: asset(photos[0].asset),
  });
  if (readiness.blockers.length) throw Error(`${p.name}: ${JSON.stringify(readiness.blockers)}`);
  receipt.pdpConfigs[p.id] = pdp;
  receipt.stories[p.id] = strict;
}
fs.writeFileSync(path.join(target, "validacion.json"), JSON.stringify(receipt, null, 2));
console.log(
  JSON.stringify({
    validated: plan.products.length,
    stories: Object.keys(receipt.stories).length,
    canonicalPublishReadiness: true,
  })
);
