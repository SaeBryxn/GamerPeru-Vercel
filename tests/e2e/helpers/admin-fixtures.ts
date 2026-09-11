export const ADMIN_E2E_USERS = {
  superadmin: {
    id: "018f0000-0000-7000-8000-00000000ae01",
    email: "superadmin.e2e@gamerperu.pe",
    role: "SUPER_ADMIN" as const,
  },
  catalog: {
    id: "018f0000-0000-7000-8000-00000000ae02",
    email: "catalog.e2e@gamerperu.pe",
    role: "ADMIN_CATALOG" as const,
  },
  orders: {
    id: "018f0000-0000-7000-8000-00000000ae03",
    email: "orders.e2e@gamerperu.pe",
    role: "ADMIN_ORDERS" as const,
  },
  support: {
    id: "018f0000-0000-7000-8000-00000000ae04",
    email: "support.e2e@gamerperu.pe",
    role: "ADMIN_SUPPORT" as const,
  },
  customer: {
    id: "018f0000-0000-7000-8000-00000000ae05",
    email: "customer.e2e@gamerperu.pe",
    role: "CUSTOMER" as const,
  },
  norole: {
    id: "018f0000-0000-7000-8000-00000000ae06",
    email: "norole.e2e@gamerperu.pe",
    role: null,
  },
};

export const ADMIN_E2E_PASSWORD = "AdminSecretPass2026!";

export const ADMIN_E2E_PRODUCT_FIXTURES = {
  brand: {
    id: "018f0000-0000-7000-8000-00000000ba01",
    name: "Marca E2E",
    slug: "test-brand-e2e",
  },
  categoryA: {
    id: "018f0000-0000-7000-8000-00000000ca01",
    name: "Categoría E2E A (Mouses)",
    slug: "test-cat-e2e-a",
    schemaId: "018f0000-0000-7000-8000-000000005a01",
  },
  categoryB: {
    id: "018f0000-0000-7000-8000-00000000ca02",
    name: "Categoría E2E B (Teclados)",
    slug: "test-cat-e2e-b",
    schemaId: "018f0000-0000-7000-8000-000000005b01",
  },
  publishableProduct: {
    id: "018f0000-0000-7000-8000-000000001a01",
    name: "Producto E2E Listo Publicar",
    slug: "prod-e2e-ready-publish",
    sku: "E2E-PUB-SKU-001",
    mediaAssetId: "018f0000-0000-7000-8000-000000006a01",
  },
  sentinelProduct: {
    id: "018f0000-0000-7000-8000-000000001a02",
    name: "Producto E2E Sentinel Privado",
    slug: "prod-e2e-private-sentinel",
    sku: "E2E-SENT-SKU-002",
    sentinelKey: "sentinel_private_key_do_not_expose_987654321",
    mediaAssetId: "018f0000-0000-7000-8000-000000006a02",
  },
  immutableProduct: {
    id: "018f0000-0000-7000-8000-000000001a03",
    name: "Producto E2E SKU Inmutable",
    slug: "prod-e2e-sku-immutable",
    sku: "E2E-IMMUTABLE-SKU-003",
    inventoryItemId: "018f0000-0000-7000-8000-000000004a03",
  },
  catChangeProduct: {
    id: "018f0000-0000-7000-8000-000000001a04",
    name: "Producto E2E Cambio Categoria",
    slug: "prod-e2e-cat-change",
    sku: "E2E-CAT-CHANGE-SKU",
  },
};
