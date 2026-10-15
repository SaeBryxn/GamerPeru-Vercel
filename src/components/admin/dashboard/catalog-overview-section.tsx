import React from "react";
import type { CatalogOverviewResult } from "@/lib/admin/dashboard-types";
import { formatInteger } from "@/lib/admin/dashboard-format";
import { AdminCard, AdminSection, MetricRow, MetricWidget, StaggerItem } from "../ui";

interface CatalogOverviewSectionProps {
  catalogOverview: CatalogOverviewResult;
  productsHref?: ((filters?: Record<string, string>) => string) | null;
}

export function CatalogOverviewSection({
  catalogOverview,
  productsHref,
}: CatalogOverviewSectionProps) {
  if (catalogOverview.status === "UNAUTHORIZED") {
    return null;
  }

  const {
    publishedProducts,
    draftProducts,
    activeSellableSkus,
    totalActiveVariants,
    publishedProductsWithoutSkus,
  } = catalogOverview.data;

  const hasOrphans = publishedProductsWithoutSkus > 0;

  return (
    <AdminSection id="catalog-heading" title="Resumen de Catálogo">
      <AdminCard>
        <MetricRow>
          <StaggerItem>
            <MetricWidget
              label="Productos publicados"
              value={formatInteger(publishedProducts)}
              footnote="Visibles en tienda pública"
              testId="catalog-published-products"
              href={productsHref?.({ status: "PUBLISHED" })}
            />
          </StaggerItem>
          <StaggerItem>
            <MetricWidget
              label="Productos en borrador"
              value={formatInteger(draftProducts)}
              footnote="En preparación interna"
              testId="catalog-draft-products"
              href={productsHref?.({ status: "DRAFT" })}
            />
          </StaggerItem>
          <StaggerItem>
            <MetricWidget
              label="SKUs vendibles activos"
              value={formatInteger(activeSellableSkus)}
              footnote={`De ${formatInteger(totalActiveVariants)} variantes activas`}
              testId="catalog-active-skus"
              href={productsHref?.()}
            />
          </StaggerItem>
          <StaggerItem>
            <MetricWidget
              label="Publicados sin SKU activo"
              value={formatInteger(publishedProductsWithoutSkus)}
              dot={hasOrphans ? "critical" : "ok"}
              footnote={
                hasOrphans
                  ? "Requiere asociar variantes activas"
                  : "Todos los productos tienen variantes"
              }
              testId="catalog-published-no-skus"
              href={productsHref?.({ status: "PUBLISHED", pending: "variants" })}
            />
          </StaggerItem>
        </MetricRow>
      </AdminCard>
    </AdminSection>
  );
}
