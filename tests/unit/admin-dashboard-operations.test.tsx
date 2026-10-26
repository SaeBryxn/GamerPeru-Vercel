// @vitest-environment jsdom

import React from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
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
import { CatalogHealthSection } from "@/components/admin/dashboard/catalog-health-section";
import { HomeStatusSection } from "@/components/admin/dashboard/home-status-section";
import { OrderQueueSection } from "@/components/admin/dashboard/order-queue-section";
import AdminDashboardPage from "@/app/admin/(protected)/page";
import { getAdminDashboardData } from "@/lib/admin/dashboard-reader";

const routerMocks = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: routerMocks.refresh }) }));

vi.mock("@/db", () => ({ db: {} }));
vi.mock("@/lib/admin/dashboard-reader", () => ({ getAdminDashboardData: vi.fn() }));

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
    expect(links.inventory).toBeNull();
    expect(links.products?.({ pending: "stock" })).toBe("/admin/products?pending=stock");
  });

  it("send stock work to the inventory screen with its filter", () => {
    const links = buildDashboardLinks(["inventory:manage"], period);
    expect(links.inventory?.({ stock: "low" })).toBe("/admin/inventario?stock=low");
    expect(links.inventory?.()).toBe("/admin/inventario");
  });
});

function attentionPayload(
  overrides: Partial<
    Pick<AdminDashboardPayload, "paymentVerification" | "orderQueue" | "inventoryOverview">
  > = {}
) {
  return {
    period,
    paymentVerification: {
      status: "READY",
      data: {
        snapshotQueue: { queueCount: 2, queueAmount: { status: "READY", amountCents: 10000n } },
        periodActivity: {
          submissionAttemptsCount: 0,
          distinctPaymentsSubmittedCount: 0,
          rejectedDecisionsCount: 0,
        },
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
        restockItems: [],
      },
    },
    ...overrides,
  } as Pick<
    AdminDashboardPayload,
    "paymentVerification" | "orderQueue" | "inventoryOverview" | "period"
  >;
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
      payload.paymentVerification.data.snapshotQueue.oldestPendingAt = "2026-08-01T12:00:00Z";
    const { container } = render(<AttentionSection payload={payload} links={links} />);
    const next = container.querySelector('[data-priority="next"]');
    expect(next?.textContent).toContain("Pedidos por preparar");
    expect(next?.getAttribute("href")).toBe(
      "/admin/orders?orderStatus=CONFIRMED&paymentStatus=PAID&shipmentStatus=UNFULFILLED"
    );
    expect(container.querySelectorAll('[data-priority="next"]')).toHaveLength(1);
  });

  it("dice cuánto lleva esperando el pendiente más antiguo", () => {
    const links = buildDashboardLinks(["orders:manage"], period);
    const payload = attentionPayload({
      orderQueue: {
        status: "READY",
        data: {
          awaitingPayment: 0,
          toPrepare: 1,
          inProgress: 0,
          oldestToPrepareAt: "2026-08-31T12:00:00Z",
        },
      },
    });
    render(<AttentionSection payload={payload} links={links} />);
    const row = screen.getByTestId("attention-orders-to-prepare");
    expect(row.textContent).toContain("hace 2 días");
    expect(row.querySelector("time")?.getAttribute("dateTime")).toBe("2026-08-31T12:00:00Z");
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
    ).toBe("/admin/inventario?stock=out");
    // Queues at zero are still named, so "nothing to do" is explicit.
    expect(screen.getByTestId("attention-clear-queues").textContent).toContain("Pedidos sin pagar");
  });

  it("sin acceso a inventario, los agotados llevan al catálogo filtrado", () => {
    const links = buildDashboardLinks(["catalog:manage"], period);
    render(<AttentionSection payload={attentionPayload()} links={links} />);
    expect(
      within(screen.getByTestId("attention-out-of-stock")).getByRole("link").getAttribute("href")
    ).toBe("/admin/products?pending=stock");
  });

  it("muestra los pagos rechazados del período como trabajo pendiente", () => {
    const payload = attentionPayload();
    if (payload.paymentVerification.status === "READY")
      payload.paymentVerification.data.periodActivity.rejectedDecisionsCount = 2;
    render(
      <AttentionSection payload={payload} links={buildDashboardLinks(["orders:verify"], period)} />
    );
    expect(screen.getByTestId("attention-payments-rejected").textContent).toContain("2");
  });

  it("muestra importes por verificar sin presentarlos como cobrados", () => {
    render(
      <AttentionSection
        payload={attentionPayload()}
        links={buildDashboardLinks(["orders:verify"], period)}
      />
    );
    expect(screen.getByText(/S\/ 100\.00 por confirmar/)).toBeTruthy();
  });

  it("un importe no disponible sigue sin convertirse en cero", () => {
    const payload = attentionPayload();
    if (payload.paymentVerification.status === "READY")
      payload.paymentVerification.data.snapshotQueue.queueAmount = {
        status: "UNAVAILABLE",
        error: "CURRENCY_INTEGRITY_ERROR",
        message: "No disponible",
      };
    render(
      <AttentionSection payload={payload} links={buildDashboardLinks(["orders:verify"], period)} />
    );
    expect(screen.getByText(/Importe no disponible/)).toBeTruthy();
    expect(screen.queryByText(/S\/ 0\.00 por confirmar/)).toBeNull();
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
    expect(
      screen.getByRole("region", { name: "Productos con pendientes" }).getAttribute("tabindex")
    ).toBe("0");
    expect(link.getAttribute("href")).toBe("/admin/products/p1#imagenes");
    expect(screen.getByText("Sube al menos una foto")).toBeTruthy();
    expect(screen.getByText(/Ver los 9 productos/)).toBeTruthy();
  });

  it("explain when the home sections cannot be read", () => {
    render(<HomeStatusSection homeStatus={{ status: "UNAVAILABLE" }} href="/admin/home" />);
    expect(screen.getByTestId("home-status-unavailable")).toBeTruthy();
  });

  it("la cola de pedidos enlaza cada etapa con su filtro y no inventa una vista para en preparación", () => {
    render(
      <OrderQueueSection
        orderQueue={{
          status: "READY",
          data: {
            awaitingPayment: 2,
            toPrepare: 1,
            inProgress: 4,
            oldestAwaitingPaymentAt: "2026-09-02T09:00:00Z",
          },
        }}
        links={buildDashboardLinks(["orders:manage"], period)}
        now={period.referenceNow}
      />
    );
    expect(screen.getByTestId("queue-awaiting-payment").closest("a")?.getAttribute("href")).toBe(
      "/admin/orders?orderStatus=PENDING&paymentStatus=UNPAID"
    );
    expect(screen.getByText("hace 3 h")).toBeTruthy();
    expect(screen.getByTestId("queue-in-progress").closest("a")).toBeNull();
    expect(screen.getByRole("link", { name: /Ir a Pedidos/ }).getAttribute("href")).toBe(
      "/admin/orders"
    );
  });
});

describe("Jerarquía de Inicio", () => {
  function dashboardPayload(withCatalog: boolean): AdminDashboardPayload {
    return {
      ...attentionPayload(),
      period,
      actor: {
        authUserId: "test",
        email: "operador@example.test",
        roles: ["ADMIN_ORDERS"],
        permissions: withCatalog ? ["catalog:manage", "orders:manage"] : ["orders:manage"],
      },
      financialCohort: { status: "UNAUTHORIZED" },
      orderPipeline: { status: "UNAUTHORIZED" },
      inventoryOverview: { status: "UNAUTHORIZED" },
      catalogOverview: { status: "UNAUTHORIZED" },
      homeStatus: withCatalog
        ? {
            status: "READY",
            data: {
              total: 10,
              visible: 7,
              hidden: 3,
              neverEdited: 6,
              emptyImageSlots: 1,
              invalid: 0,
            },
          }
        : { status: "UNAUTHORIZED" },
      catalogHealth: { status: "UNAUTHORIZED" },
    };
  }

  it("pliega el mantenimiento de la tienda debajo del trabajo del día", async () => {
    vi.mocked(getAdminDashboardData).mockResolvedValue(dashboardPayload(true));
    render(await AdminDashboardPage({}));
    const summary = screen.getByText("Portada de la tienda");
    const details = summary.closest("details")!;
    expect(details.open).toBe(false);
    expect(details.textContent).toContain("7 de 10 secciones visibles");
    fireEvent.click(summary);
    expect(details.open).toBe(true);
    expect(within(details).getByTestId("home-status-visible").textContent).toContain("7");
    expect(screen.queryByText("operador@example.test")).toBeNull();
    expect(screen.queryByText("ADMIN_ORDERS")).toBeNull();
  });

  it("abre en Hoy, comparado con ayer, y cada período queda en la URL", async () => {
    vi.mocked(getAdminDashboardData).mockResolvedValue({
      ...dashboardPayload(false),
      financialCohort: readyFinancial(),
    });
    render(await AdminDashboardPage({}));
    expect(vi.mocked(getAdminDashboardData)).toHaveBeenLastCalledWith({ periodSelector: "TODAY" });
    expect(screen.getByRole("heading", { name: "Inicio" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "7 días" }).getAttribute("href")).toBe(
      "/admin?period=LAST_7_DAYS"
    );
    expect(screen.getByTestId("financial-no-sales")).toBeTruthy();
  });

  it("una cuenta de pedidos ve sus colas sin bloques de catálogo", async () => {
    vi.mocked(getAdminDashboardData).mockResolvedValue(dashboardPayload(false));
    const { container } = render(await AdminDashboardPage({}));
    expect(container.querySelector("details")?.open).toBe(false);
    expect(screen.getByText("Estado de pedidos")).toBeTruthy();
    expect(screen.getByTestId("queue-to-prepare").textContent).toBe("3");
    expect(screen.getByTestId("attention-orders-to-prepare")).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Inventario" })).toBeNull();
  });

  it("actualiza la lectura de datos con el botón de Inicio", async () => {
    routerMocks.refresh.mockClear();
    vi.mocked(getAdminDashboardData).mockResolvedValue(dashboardPayload(false));
    render(await AdminDashboardPage({}));
    fireEvent.click(screen.getByRole("button", { name: "Actualizar datos" }));
    expect(routerMocks.refresh).toHaveBeenCalledOnce();
  });

  it("sin métricas de período no muestra el selector ni la comparación", async () => {
    vi.mocked(getAdminDashboardData).mockResolvedValue(dashboardPayload(false));
    render(await AdminDashboardPage({ searchParams: Promise.resolve({ period: "LAST_7_DAYS" }) }));
    expect(screen.queryByRole("navigation", { name: "Seleccionar período de reporte" })).toBeNull();
    expect(screen.queryByText(/Comparado con/)).toBeNull();
  });
});

function readyFinancial(): AdminDashboardPayload["financialCohort"] {
  const summary = {
    cohortGrossCents: 0n,
    cohortNetCents: 0n,
    cohortPendingCents: 0n,
    cohortPaidOrders: 0,
    cohortActivePaidOrders: 0,
    aovCents: 0n,
  };
  const flat = {
    currentValue: 0n,
    previousValue: 0n,
    absoluteDelta: 0n,
    percentageNumerator: null,
    percentageDenominator: null,
    semanticState: "ZERO_BASELINE" as const,
  };
  return {
    status: "READY",
    data: {
      current: summary,
      previous: summary,
      trends: {
        gross: flat,
        net: flat,
        aov: flat,
        paidOrders: {
          currentValue: 0,
          previousValue: 0,
          absoluteDelta: 0,
          percentageDelta: null,
          semanticState: "ZERO_BASELINE",
        },
      },
    },
  };
}
