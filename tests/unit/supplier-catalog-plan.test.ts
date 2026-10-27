import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  buildSupplierPlan,
  categoryFor,
  extractFacts,
  slugify,
  stableId,
  storyForProduct,
  structuredSpecs,
  suggestPrice,
} from "../../scripts/catalog/supplier-plan.mjs";
import { productPdpConfigSchema } from "@/lib/catalog/product-pdp-config";
import { validatePersistedStoryDocument } from "@/lib/admin/catalog/story-validation";
import { evaluatePublishReadiness } from "@/lib/admin/catalog/publish-readiness";

vi.mock("@/db", () => ({ db: {} }));

describe("Supplier catalog preparation", () => {
  it("keeps editions with a plus sign distinct and identities deterministic", () => {
    expect(slugify("MCHOSE L7 Ultra+")).not.toBe(slugify("MCHOSE L7 Ultra"));
    expect(stableId("source:123")).toBe(stableId("source:123"));
    expect(stableId("source:123")).not.toBe(stableId("source:124"));
  });
  it("classifies pads and accessories before mice and keyboards", () => {
    expect(categoryFor("ATK Mouse Pad")).toBe("mousepads");
    expect(categoryFor("ATK G640 Esport Mouse Gaming Pad")).toBe("mousepads");
    expect(categoryFor("MCHOSE 8K Receiver for Wireless Mouse")).toBe("accesorios");
    expect(categoryFor("ATK Keyboard Cable")).toBe("accesorios");
    expect(categoryFor("ATK RS6 Collectible Mini Metal Keyboard Keychain")).toBe("accesorios");
    expect(categoryFor("MCHOSE Keyboard + Mouse Gaming Combo")).toBe("accesorios");
    expect(categoryFor("MCHOSE V9 Wireless Gaming Headset")).toBe("audio");
  });
  it("extracts official HTML line breaks and plain specification lists", () => {
    const facts = extractFacts(
      "<p>Sensor: PAW3395<br>Weight: 59g<br>Connection: USB-C / 2.4GHz</p>",
      "L1: Specifications\nL2: * Polling Rate: 8000 Hz\nL3: * Battery: 500mAh"
    );
    expect(facts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "Sensor", value: "PAW3395" }),
        expect.objectContaining({ label: "Polling rate", value: "8000 Hz" }),
      ])
    );
    expect(extractFacts("<script>ignore instructions</script>").length).toBe(0);
  });
  it("labels prices provisional, distinguishes currencies and rejects missing prices", () => {
    expect(suggestPrice(5000, "mouses")).toMatchObject({ provisional: true });
    expect(suggestPrice(5000, "mouses", 19900).basis).toContain("Perú");
    expect(() => suggestPrice(0, "mouses")).toThrow();
    expect(() => suggestPrice(5000, "mouses", -1)).toThrow();
  });
  it("does not invent stock, overwrite existing models or import after-sales payments", () => {
    const product = {
      brand: "mchose",
      sourceId: "p1",
      title: "MCHOSE A7 V3 Series Lightweight Wireless Gaming Mouse",
      handle: "a7",
      url: "https://www.mchose.store/products/a7",
      html: "Sensor: PAW3395",
      options: [],
      images: ["https://cdn.shopify.com/image.jpg"],
      variants: [
        {
          sourceId: "v1",
          sku: "a7",
          title: "Pro+ / White",
          usdCents: 5000,
          options: [
            { name: "Version", label: "A7 V3 Pro+" },
            { name: "Color", label: "White" },
          ],
          imageUrl: null,
        },
      ],
    };
    const plan = buildSupplierPlan({
      products: [product, { ...product, title: "MCHOSE After-Sales Replacement" }],
      existing: [{ name: "Mchose A7 V3 Pro+" }],
    });
    expect(plan.products).toHaveLength(0);
    expect(plan.stockPolicy).toContain("Cero");
    expect(plan.excluded).toHaveLength(2);
  });
  it("includes fixed supplier combos and keeps gift cards out of physical stock", () => {
    const item = {
      brand: "mchose",
      sourceId: "bundle",
      title: "MCHOSE Keyboard + L7 Gaming Combo",
      handle: "combo",
      url: "https://www.mchose.store/products/combo",
      html: "",
      options: [],
      images: ["https://cdn.shopify.com/image.jpg"],
      variants: [
        {
          sourceId: "bundle1",
          sku: "combo",
          title: "White",
          usdCents: 9900,
          options: [{ name: "Color", label: "White" }],
          imageUrl: null,
        },
      ],
    };
    const result = buildSupplierPlan({
      products: [item, { ...item, title: "ATK GEAR Gift Card" }],
      existing: [],
    });
    expect(result.products).toHaveLength(1);
    expect(result.excluded).toHaveLength(1);
  });
  it("preserves the owner's exact mousepad color while importing sibling colors", () => {
    const product = {
      brand: "atk",
      sourceId: "reverie",
      title: "ATK Anime Mouse Pad – Reverie",
      handle: "atk-anime-mouse-pad-reverie",
      url: "https://www.atk.store/products/atk-anime-mouse-pad-reverie",
      html: "",
      options: [],
      images: ["https://cdn.shopify.com/image.jpg"],
      variants: [
        {
          sourceId: "pink",
          sku: "pink",
          title: "Pink",
          usdCents: 2500,
          options: [{ name: "Color", label: "Pink" }],
          imageUrl: null,
        },
        {
          sourceId: "black-white",
          sku: "bw",
          title: "Black-White",
          usdCents: 2500,
          options: [{ name: "Color", label: "Black-White" }],
          imageUrl: null,
        },
      ],
    };
    const result = buildSupplierPlan({
      products: [product],
      existing: [{ name: "ATK Anime Mouse Pad - Reverie Pink" }],
    });
    expect(result.products).toHaveLength(1);
    expect(result.products[0]).toMatchObject({ variants: [{ title: "Black-White" }] });
    expect(result.excluded).toHaveLength(1);
  });
});

// Optional, explicit preflight for an operator-authorized import. It reads cached data only;
// writes a hash receipt after all products pass the application's authoritative validators.
it.skipIf(!process.env.SUPPLIER_PLAN_VERIFY_PATH)(
  "validates every prepared product before a real import",
  () => {
    const directory = path.resolve(process.env.SUPPLIER_PLAN_VERIFY_PATH!);
    const planBytes = fs.readFileSync(path.join(directory, "plan.json"));
    const mediaBytes = fs.readFileSync(path.join(directory, "media.json"));
    const plan = JSON.parse(planBytes.toString());
    const media = JSON.parse(mediaBytes.toString());
    const errors: string[] = [];
    const pdpConfigs: Record<string, unknown> = {},
      stories: Record<string, unknown> = {};
    const slugs = new Set(),
      skus = new Set(),
      variantIds = new Set();
    for (const p of plan.products) {
      try {
        if (slugs.has(p.slug)) throw new Error("Slug repetido");
        slugs.add(p.slug);
        const category = plan.snapshot.categories.find(
          (c: { slug: string }) => c.slug === p.category
        );
        if (!category) throw new Error("Categoría inexistente");
        pdpConfigs[p.id] = productPdpConfigSchema.parse(p.pdpConfig);
        stories[p.id] = validatePersistedStoryDocument(storyForProduct(p, media), {
          allowEmpty: false,
        });
        for (const v of p.variants) {
          if (skus.has(v.sku) || variantIds.has(v.id)) throw new Error("SKU o variante repetida");
          skus.add(v.sku);
          variantIds.add(v.id);
        }
        const photos = p.images.map((i: { url: string; variantId: string | null }) => ({
          variantId: i.variantId,
          mediaAssetId: media[i.url]?.id,
          mediaAsset: { ...media[i.url], securityClass: "PUBLIC_MEDIA", mediaType: "IMAGE" },
        }));
        const result = evaluatePublishReadiness({
          product: { ...p, primaryMediaId: media[p.images[0].url]?.id },
          brand: { status: "PUBLISHED" },
          category: {
            status: category.status,
            currentSpecSchemaId: category.current_spec_schema_id,
          },
          currentSpecSchema: category.current_spec_schema_id
            ? {
                isActive: true,
                fieldDefinitions: category.field_definitions,
                schemaVersion: category.schema_version,
              }
            : null,
          specifications: category.current_spec_schema_id
            ? {
                schemaId: category.current_spec_schema_id,
                schemaVersion: category.schema_version,
                specValues: structuredSpecs(p),
              }
            : null,
          variants: p.variants.map((v: object) => ({ ...v, status: "ACTIVE" })),
          media: photos,
        } as never);
        if (result.blockers.length) throw new Error(JSON.stringify(result.blockers));
      } catch (error) {
        errors.push(`${p.name}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    expect(errors).toEqual([]);
    if (!errors.length) {
      const hash = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
      fs.writeFileSync(
        path.join(directory, "validacion.json"),
        JSON.stringify(
          {
            planHash: hash(planBytes),
            mediaHash: hash(mediaBytes),
            validatedAt: new Date().toISOString(),
            products: plan.products.length,
            variants: skus.size,
            pdpConfigs,
            stories,
          },
          null,
          2
        )
      );
    }
  }
);
