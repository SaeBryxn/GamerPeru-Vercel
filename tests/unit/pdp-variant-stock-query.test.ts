import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { buildActiveProductVariantsByProductIdQuery } from "@/lib/catalog/postgres-product-detail-queries";

describe("stock de variantes en la ficha", () => {
  it("suma el inventario de la propia variante, no por inventory_items.id", () => {
    const { sql } = buildActiveProductVariantsByProductIdQuery(
      "018f0000-0000-7000-8000-00000000d003"
    ).toSQL();

    expect(sql).toContain('ii.variant_id = "product_variants"."id"');
    expect(sql).toContain("ii.quantity_on_hand - ii.quantity_reserved - ii.quantity_allocated");
  });
});
