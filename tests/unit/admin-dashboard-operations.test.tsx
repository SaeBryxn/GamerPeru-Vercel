// @vitest-environment jsdom

import React from "react";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type {
  Brand,
  Category,
  CategorySpecificationSchema,
  MediaAsset,
  Product,
  ProductMedia,
  ProductSpecification,
  ProductVariant,
} from "@/db/schema";
import { evaluatePublishReadiness } from "@/lib/admin/catalog/publish-readiness";
import {
  buildCatalogHealth,
  summarizeHomeSections,
  type CatalogHealthInputs,
} from "@/lib/admin/dashboard-operations";
import { resolveDashboardPeriod } from "@/lib/admin/dashboard-period";
import type { AdminDashboardPayload } from "@/lib/admin/dashboard-types";
import { DEFAULT_HOME_SECTIONS } from "@/lib/home/default-sections";
import { buildDashboardLinks } from "@/components/admin/dashboard/dashboard-links";
import { AttentionSection } from "@/components/admin/dashboard/attention-section";
import { QuickActions, buildQuickActions } from "@/components/admin/dashboard/quick-actions";
import { CatalogHealthSection } from "@/components/admin/dashboard/catalog-health-section";
import { HomeStatusSection } from "@/components/admin/dashboard/home-status-section";

vi.mock("@/db", () => ({ db: {} }));

const now = new Date();
const product = (id: string, overrides: Partial<Product> = {}): Product => ({
  id,
  brandId: "brand-1",
  categoryId: "category-1",
  name: `Producto ${id}`,
  slug: `producto-${id}`,
  subtitle: "Mouse gamer ultraligero de magnesio",
  description:
    "Este es un mouse gamer de alto rendimiento con chasis de aleación de magnesio y tasa de sondeo 8K.",
  status: "PUBLISHED",
  isFeatured: false,
  pdpConfig: {},
  primaryMediaId: `asset-${id}`,
  createdAt: now,
  updatedAt: now,
  ...overrides,
});

const brand: Brand = {
  id: "brand-1",
  name: "ATK",
  slug: "atk",
  description: null,
  websiteUrl: null,
  logoMediaId: null,
  status: "PUBLISHED",
  createdAt: now,
  updatedAt: now,
};

const category: Category = {
  id: "category-1",
  name: "Mouses",
  slug: "mouses",
  parentId: null,
  currentSpecSchemaId: "schema-1",
  description: null,
  displayOrder: 0,
  status: "PUBLISHED",
  createdAt: now,
  updatedAt: now,
};

function schema(withWeight: boolean): CategorySpecificationSchema {
  return {
    id: "schema-1",
    categoryId: category.id,
    schemaVersion: 1,
    fieldDefinitions: [
      {
        key: "sensor",
        label: "Sensor",
        dataType: "enum",
        filterable: false,
        displayOrder: 1,
        options: [{ value: "paw3395", label: "PAW3395" }],
      },
      ...(withWeight
        ? [
            {
              key: "peso",
              label: "Peso",
              dataType: "number",
              unit: "g",
              filterable: false,
              displayOrder: 2,
            },
          ]
        : []),
    ] as CategorySpecificationSchema["fieldDefinitions"],
    isActive: true,
    createdAt: now,
  };
}

const specs = (productId: string, values: Record<string, unknown>): ProductSpecification => ({
  productId,
  schemaId: "schema-1",
  schemaVersion: 1,
  specValues: values as ProductSpecification["specValues"],
  updatedAt: now,
});

const variant = (productId: string, overrides: Partial<ProductVariant> = {}): ProductVariant => ({
  id: `variant-${productId}`,
  productId,
  sku: `SKU-${productId}`.toUpperCase(),
  title: "Negro",
  priceCents: 54900,
  compareAtPriceCents: 59900,
  costCents: null,
  weightGrams: 34,
  attributes: { color: "Negro" },
  status: "ACTIVE",
  displayOrder: 0,
  createdAt: now,
  updatedAt: now,
  ...overrides,
});

const asset = (id: string): MediaAsset => ({
  id,
  objectKey: `products/atk/${id}.webp`,
  securityClass: "PUBLIC_MEDIA",
  mediaType: "IMAGE",
  mimeType: "image/webp",
  fileSizeBytes: 1000,
  width: 1200,
  height: 1200,
  altText: "Foto",
  checksumSha256: null,
  createdAt: now,
});

const gallery = (productId: string): ProductMedia & { mediaAsset: MediaAsset } => ({
  id: `media-${productId}`,
  productId,
  mediaAssetId: `asset-${productId}`,
  variantId: null,
  displayOrder: 0,
  placement: "GALLERY",
  createdAt: now,
  mediaAsset: asset(`asset-${productId}`),
});

function inputs(overrides: Partial<CatalogHealthInputs> = {}): CatalogHealthInputs {
  return {
    products: [],
    brands: [brand],
    categories: [category],
    schemas: [schema(false)],
    specifications: [],
    variants: [],
    galleryMedia: [],
    primaryAssets: [],
    publishedStoryProductIds: new Set(),
    ...overrides,
  };
}

/** A product that passes every publish check and has a published story. */
function readyProduct(id: string) {
  return {
    products: [product(id)],
    specifications: [specs(id, { sensor: "paw3395" })],
    variants: [variant(id)],
    galleryMedia: [gallery(id)],
    primaryAssets: [asset(`asset-${id}`)],
    publishedStoryProductIds: new Set([id]),
  };
}

describe("Publish readiness weight guidance", () => {
  it("asks for the technical-sheet weight when the category declares one", () => {
    const result = evaluatePublishReadiness({
      product: product("p1"),
      brand,
      category,
      currentSpecSchema: schema(true),
      specifications: specs("p1", { sensor: "paw3395" }),
      variants: [variant("p1", { weightGrams: null })],
      media: [gallery("p1")],
      primaryMediaAsset: asset("asset-p1"),
    });
    const codes = result.warnings.map((warning) => warning.code);
    expect(codes).toContain("MISSING_SPEC_WEIGHT");
    expect(codes).not.toContain("MISSING_WEIGHT");
  });

  it("is satisfied by the technical-sheet weight alone", () => {
    const result = evaluatePublishReadiness({
      product: product("p1"),
      brand,
      category,
      currentSpecSchema: schema(true),
      specifications: specs("p1", { sensor: "paw3395", peso: 54 }),
      variants: [variant("p1", { weightGrams: null })],
      media: [gallery("p1")],
      primaryMediaAsset: asset("asset-p1"),
    });
    const codes = result.warnings.map((warning) => warning.code);
    expect(codes).not.toContain("MISSING_SPEC_WEIGHT");
    expect(codes).not.toContain("MISSING_WEIGHT");
  });
});

describe("Catalog health", () => {
  it("leaves out products that are ready and have a published story", () => {
    const health = buildCatalogHealth(inputs(readyProduct("p1")));
    expect(health).toMatchObject({ evaluatedProducts: 1, productsWithIssues: 0, items: [] });
  });

  it("suggests publishing the story and links to the story tab", () => {
    const ready = readyProduct("p1");
    const health = buildCatalogHealth(inputs({ ...ready, publishedStoryProductIds: new Set() }));
    expect(health.items[0]).toMatchObject({
      blockers: 0,
      storyPublished: false,
      href: "/admin/products/p1#historia",
      issues: [{ code: "STORY_NOT_PUBLISHED", severity: "suggestion" }],
    });
  });

  it("links a missing technical-sheet weight to the technical sheet", () => {
    const ready = readyProduct("p1");
    const health = buildCatalogHealth(
      inputs({
        ...ready,
        schemas: [schema(true)],
        variants: [variant("p1", { weightGrams: null })],
      })
    );
    expect(health.items[0]?.issues[0]).toMatchObject({
      code: "MISSING_SPEC_WEIGHT",
      section: "especificaciones",
    });
    expect(health.items[0]?.href).toBe("/admin/products/p1#especificaciones");
  });

  it("puts live products with blockers first and opens the tab of the worst issue", () => {
    const live = readyProduct("live");
    const health = buildCatalogHealth(
      inputs({
        products: [product("draft", { status: "DRAFT", name: "A borrador" }), ...live.products],
        specifications: [specs("draft", { sensor: "paw3395" }), ...live.specifications],
        variants: [variant("draft"), ...live.variants],
        // The live product lost its photos; the draft never had any.
        galleryMedia: [],
        primaryAssets: [],
        publishedStoryProductIds: new Set(["draft", "live"]),
      })
    );
    expect(health.items.map((item) => item.productId)).toEqual(["live", "draft"]);
    expect(health.productsWithBlockers).toBe(2);
    expect(health.items[0]?.issues[0]?.severity).toBe("blocker");
    expect(health.items[0]?.href).toBe("/admin/products/live#imagenes");
  });

  it("limits the list but keeps the totals", () => {
    const many = Array.from({ length: 12 }, (_, index) => product(`p${index}`));
    const health = buildCatalogHealth(inputs({ products: many }), 8);
    expect(health.items).toHaveLength(8);
    expect(health.productsWithIssues).toBe(12);
  });
});

describe("Home status", () => {
  const rows = DEFAULT_HOME_SECTIONS.map((section) => ({
    sectionType: section.type,
    isVisible: true,
    version: 1,
    content: section.content,
    contentSchemaVersion: 1,
  }));

  it("counts the seeded home: everything visible, unedited, seven images to upload", () => {
    expect(summarizeHomeSections(rows)).toEqual({
      status: "READY",
      data: { total: 10, visible: 10, hidden: 0, neverEdited: 10, emptyImageSlots: 7, invalid: 0 },
    });
  });

  it("ignores empty images of hidden sections and flags invalid content", () => {
    const edited = rows.map((row, index) =>
      index === 3
        ? { ...row, isVisible: false, version: 2 }
        : index === 9
          ? { ...row, content: {} }
          : row
    );
    expect(summarizeHomeSections(edited)).toMatchObject({
      data: { visible: 9, hidden: 1, neverEdited: 9, emptyImageSlots: 6, invalid: 1 },
    });
  });
});

const period = resolveDashboardPeriod("LAST_7_DAYS", new Date("2026-09-02T12:00:00.000Z"));

describe("Dashboard links", () => {
  it("send period metrics to the orders list with inclusive Lima dates", () => {
    const links = buildDashboardLinks(["orders:manage"], period);
    expect(links.periodOrders?.({ orderStatus: "PENDING" })).toBe(
      "/admin/orders?orderStatus=PENDING&from=2026-08-27&to=2026-09-02"
    );
  });

  it("leave out destinations the operator cannot open", () => {
    const links = buildDashboardLinks(["catalog:manage"], period);
    expect(links.orders).toBeNull();
    expect(links.payments).toBeNull();
    expect(links.products?.({ pending: "stock" })).toBe("/admin/products?pending=stock");
    expect(buildQuickActions(links).map((action) => action.id)).toEqual([
      "home",
      "catalog",
      "menu",
    ]);
  });
});

function attentionPayload(
  overrides: Partial<
    Pick<AdminDashboardPayload, "paymentVerification" | "orderQueue" | "inventoryOverview">
  > = {}
) {
  return {
    paymentVerification: {
      status: "READY",
      data: {
        snapshotQueue: { queueCount: 2, queueAmount: { status: "READY", amountCents: 10000n } },
        periodActivity: { submissionAttemptsCount: 0, distinctPaymentsSubmittedCount: 0 },
        periodRefunds: { refundCount: 0, refundOutflow: { status: "READY", outflowCents: 0n } },
      },
    },
    orderQueue: { status: "READY", data: { awaitingPayment: 0, toPrepare: 3, inProgress: 1 } },
    inventoryOverview: {
      status: "READY",
      data: {
        globalPhysicalBalances: {
          totalPositions: 1,
          onHandUnits: 1,
          reservedUnits: 0,
          allocatedUnits: 0,
          availableToSellUnits: 1,
        },
        outOfStockActiveSkus: 1,
        lowStockActivePositions: 0,
      },
    },
    ...overrides,
  } as Pick<AdminDashboardPayload, "paymentVerification" | "orderQueue" | "inventoryOverview">;
}

describe("Attention section", () => {
  it("prioriza el pedido pagado más antiguo dentro de los pendientes críticos", () => {
    const links = buildDashboardLinks(["orders:manage", "orders:verify"], period);
    const payload = attentionPayload({
      orderQueue: {
        status: "READY",
        data: {
          awaitingPayment: 0,
          toPrepare: 1,
          inProgress: 0,
          oldestToPrepareAt: "2026-01-01T12:00:00Z",
        },
      },
    });
    if (payload.paymentVerification.status === "READY")
      payload.paymentVerification.data.snapshotQueue.oldestPendingAt = "2026-10-01T12:00:00Z";
    const { container } = render(<AttentionSection payload={payload} links={links} />);
    expect(container.querySelector("a")?.textContent).toBe("Pedidos por preparar");
  });
  it("shows only pending work, each linked to its filtered view", () => {
    const links = buildDashboardLinks(
      ["orders:manage", "orders:verify", "catalog:manage", "inventory:manage"],
      period
    );
    render(<AttentionSection payload={attentionPayload()} links={links} />);
    expect(screen.queryByTestId("attention-orders-awaiting-payment")).toBeNull();
    expect(
      within(screen.getByTestId("attention-payments-to-verify"))
        .getByRole("link")
        .getAttribute("href")
    ).toBe("/admin/pagos");
    expect(
      within(screen.getByTestId("attention-orders-to-prepare"))
        .getByRole("link")
        .getAttribute("href")
    ).toBe("/admin/orders?orderStatus=CONFIRMED&paymentStatus=PAID&shipmentStatus=UNFULFILLED");
    expect(
      within(screen.getByTestId("attention-out-of-stock")).getByRole("link").getAttribute("href")
    ).toBe("/admin/products?pending=stock");
  });

  it("says everything is up to date when nothing is pending", () => {
    const links = buildDashboardLinks(["orders:manage", "orders:verify"], period);
    const payload = attentionPayload({
      orderQueue: { status: "READY", data: { awaitingPayment: 0, toPrepare: 0, inProgress: 0 } },
      inventoryOverview: { status: "UNAUTHORIZED" },
    });
    const ready = payload.paymentVerification;
    if (ready.status === "READY") ready.data.snapshotQueue.queueCount = 0;
    render(<AttentionSection payload={payload} links={links} />);
    expect(screen.getByTestId("attention-all-clear")).toBeTruthy();
  });
});

describe("Operational sections", () => {
  it("render quick actions as links with wireframes", () => {
    const links = buildDashboardLinks(["catalog:manage", "orders:manage"], period);
    render(<QuickActions links={links} />);
    expect(screen.getByTestId("quick-action-home").getAttribute("href")).toBe("/admin/home");
    expect(screen.getByTestId("quick-action-orders").querySelector("svg")).toBeTruthy();
  });

  it("render catalog health rows with a direct edit link", () => {
    render(
      <CatalogHealthSection
        productsHref="/admin/products"
        catalogHealth={{
          status: "READY",
          data: {
            evaluatedProducts: 14,
            productsWithIssues: 9,
            productsWithBlockers: 1,
            items: [
              {
                productId: "p1",
                name: "JINMS X7 Ultra Black",
                status: "DRAFT",
                blockers: 1,
                warnings: 0,
                storyPublished: false,
                issues: [
                  {
                    code: "NO_VALID_PUBLIC_MEDIA",
                    severity: "blocker",
                    section: "imagenes",
                    action: "Sube al menos una foto",
                  },
                ],
                href: "/admin/products/p1#imagenes",
              },
            ],
          },
        }}
      />
    );
    const link = screen.getByRole("link", { name: "Editar JINMS X7 Ultra Black en Fotos" });
    expect(link.getAttribute("href")).toBe("/admin/products/p1#imagenes");
    expect(screen.getByText("Sube al menos una foto")).toBeTruthy();
    expect(screen.getByText(/Ver los 9 productos/)).toBeTruthy();
  });

  it("explain when the home sections cannot be read", () => {
    render(<HomeStatusSection homeStatus={{ status: "UNAVAILABLE" }} href="/admin/home" />);
    expect(screen.getByTestId("home-status-unavailable")).toBeTruthy();
  });
});
