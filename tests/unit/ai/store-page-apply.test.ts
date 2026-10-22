import { describe, expect, it, vi } from "vitest";
import { mergeAcceptedStorePage } from "@/lib/ai/proposals/apply-service";
import { classifyProposalFieldPath, parsePdpProposalField } from "@/lib/ai/proposals/schemas";
import {
  buildCreateDownstreamStepDefinitions,
  buildInitialApplyStepDefinitions,
  assertApplyStepFingerprint,
} from "@/lib/ai/proposals/apply-schemas";
import type { ApprovedProposalApplyProjection } from "@/lib/ai/proposals/types";
import { productPdpConfigSchema } from "@/lib/catalog/product-pdp-config";

vi.mock("@/db", () => ({ db: {} }));

const size = { name: "Mini", lengthMm: 110, widthMm: 60, heightMm: 36, weight: "45 g" };
const projection: ApprovedProposalApplyProjection = {
  proposalId: "018f0025-4000-7000-8000-000000000001",
  itemId: "018f0025-4000-7000-8000-000000000002",
  mode: "CREATE",
  targetProductId: null,
  targetProductVersionSnapshot: null,
  product: {
    name: "Mouse",
    slug: "mouse",
    brandId: "018f0025-4000-7000-8000-000000000003",
    categoryId: "018f0025-4000-7000-8000-000000000004",
  },
  specifications: {},
  variants: [],
  pdpFields: { "pdp.sizes": [size] },
};

describe("aplicación de bloques aceptados de la tienda", () => {
  it("solo reconoce los campos PDP permitidos y valida los valores manuales", () => {
    expect(classifyProposalFieldPath("pdp.sizes")).toBe("PDP");
    expect(classifyProposalFieldPath("pdp.stock")).toBe("RESERVED");
    expect(() => parsePdpProposalField("pdp.sizes", [{ ...size, lengthMm: -1 }])).toThrow();
    expect(() => parsePdpProposalField("pdp.support.manualUrl", "javascript:alert(1)")).toThrow();
    expect(() => mergeAcceptedStorePage({}, { "pdp.stock": 9 })).toThrow();
  });

  it("activa guía, dimensiones, caja y especificaciones solo con datos", () => {
    const config = mergeAcceptedStorePage(
      {},
      {
        "pdp.sizes": [size],
        "pdp.packageContents": [{ edition: "Mini", items: [{ name: "Cable", quantity: "1" }] }],
        "pdp.highlights": [{ label: "Sensor", value: "Sensor oficial de prueba" }],
        "pdp.support.manualUrl": "https://manufacturer.example/manual",
      }
    );
    expect(config.sizeGuide.enabled).toBe(true);
    expect(config.dimensionsEnabled).toBe(true);
    expect(config.packageContents.enabled).toBe(true);
    expect(config.specificationsEnabled).toBe(true);
    expect(config.sizeGuide.sizes[0]).toMatchObject({ ...size, handMin: null, handMax: null });
    expect(config.support.manualUrl).toBe("https://manufacturer.example/manual");
    expect(config.support.warranty).toBe("");
    expect(productPdpConfigSchema.safeParse(config).success).toBe(true);
  });

  it("deja desactivados los bloques nuevos sin datos y no inventa cantidades", () => {
    const empty = mergeAcceptedStorePage({}, {});
    expect([
      empty.sizeGuide.enabled,
      empty.dimensionsEnabled,
      empty.packageContents.enabled,
      empty.specificationsEnabled,
    ]).toEqual([false, false, false, false]);
    const config = mergeAcceptedStorePage(
      {},
      { "pdp.packageContents": [{ edition: "Mini", items: [{ name: "Cable" }] }] }
    );
    expect(config.packageContents.editions[0]?.items[0]?.quantity).toBe("");
    expect(config.dimensionsEnabled).toBe(false);
  });

  it("distingue rangos de mano de dimensiones y desactiva un bloque vaciado a mano", () => {
    const config = mergeAcceptedStorePage(
      {},
      { "pdp.sizes": [{ name: "Mini", handMin: 16, handMax: 18 }] }
    );
    expect(config.sizeGuide.enabled).toBe(true);
    expect(config.dimensionsEnabled).toBe(false);
    const cleared = mergeAcceptedStorePage(config, {
      "pdp.sizes": [],
      "pdp.highlights": [],
      "pdp.packageContents": [],
    });
    expect([
      cleared.sizeGuide.enabled,
      cleared.dimensionsEnabled,
      cleared.packageContents.enabled,
      cleared.specificationsEnabled,
    ]).toEqual([false, false, false, false]);
  });

  it("respeta todos los valores existentes excepto el campo aceptado", () => {
    const existing = productPdpConfigSchema.parse({
      gift: { enabled: true, title: "Regalo guardado" },
      sizeGuide: { enabled: false, sizes: [size] },
      dimensionsEnabled: false,
      specificationsEnabled: false,
      specifications: [{ label: "Dato propio", value: "Conservar" }],
      support: {
        warranty: "Garantía de la tienda",
        manualUrl: "https://shop.example/manual",
        driverUrl: "https://shop.example/software",
        shippingNote: "Envío propio",
      },
      packageContents: {
        enabled: false,
        editions: [{ name: "Original", badge: "gold", items: [{ name: "Mouse" }] }],
      },
    });
    const before = structuredClone(existing);
    const merged = mergeAcceptedStorePage(existing, {
      "pdp.support.manualUrl": "https://manufacturer.example/manual",
    });
    expect(merged).toEqual({
      ...existing,
      support: { ...existing.support, manualUrl: "https://manufacturer.example/manual" },
    });
    expect(existing).toEqual(before);
  });

  it("congela pdpConfig en el paso durable, con control de versión y huella para reintentos", () => {
    const pdp = mergeAcceptedStorePage({}, projection.pdpFields!);
    const operationId = "018f0025-4000-7000-8000-000000000009";
    const timestamp = "2026-10-22T12:00:00.000Z";
    const downstream = buildCreateDownstreamStepDefinitions(
      operationId,
      projection,
      projection.itemId,
      timestamp,
      pdp
    );
    expect(downstream).toHaveLength(1);
    expect(downstream[0]?.requestPayload).toMatchObject({
      pdpConfig: pdp,
      expectedUpdatedAt: timestamp,
      specValues: {},
    });
    const steps = buildInitialApplyStepDefinitions(
      operationId,
      {
        ...projection,
        mode: "ENRICH",
        targetProductId: projection.itemId,
        targetProductVersionSnapshot: timestamp,
      },
      pdp
    );
    expect(steps[0]?.requestPayload).toMatchObject({
      pdpConfig: pdp,
      expectedUpdatedAt: timestamp,
    });
    expect(() =>
      assertApplyStepFingerprint(steps[0]!.requestPayload, steps[0]!.requestFingerprint)
    ).not.toThrow();
  });
});
