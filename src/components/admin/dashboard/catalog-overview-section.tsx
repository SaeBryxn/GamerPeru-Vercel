import React from "react";
import type { CatalogOverviewResult } from "@/lib/admin/dashboard-types";
import { formatInteger } from "@/lib/admin/dashboard-format";
import { Package, AlertCircle, CheckCircle2 } from "lucide-react";
import styles from "./catalog-overview-section.module.css";

interface CatalogOverviewSectionProps {
  catalogOverview: CatalogOverviewResult;
}

export function CatalogOverviewSection({ catalogOverview }: CatalogOverviewSectionProps) {
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

  return (
    <section className={styles.section} aria-labelledby="catalog-heading">
      <div className={styles.sectionHeader}>
        <div className={styles.titleWrapper}>
          <Package className={styles.sectionIcon} aria-hidden="true" />
          <h2 id="catalog-heading" className={styles.sectionTitle}>
            Resumen de Catálogo
          </h2>
        </div>
      </div>

      <div className={styles.grid}>
        {/* Metric 1: Publicados */}
        <div className={styles.card} data-testid="catalog-published-products">
          <span className={styles.metricLabel}>Productos publicados</span>
          <span className={styles.metricValue}>{formatInteger(publishedProducts)}</span>
          <span className={styles.metricFooter}>Visibles en tienda pública</span>
        </div>

        {/* Metric 2: Borradores */}
        <div className={styles.card} data-testid="catalog-draft-products">
          <span className={styles.metricLabel}>Productos en borrador</span>
          <span className={styles.metricValue}>{formatInteger(draftProducts)}</span>
          <span className={styles.metricFooter}>En preparación interna</span>
        </div>

        {/* Metric 3: SKUs vendibles activos */}
        <div className={styles.card} data-testid="catalog-active-skus">
          <span className={styles.metricLabel}>SKUs vendibles activos</span>
          <span className={styles.metricValue}>{formatInteger(activeSellableSkus)}</span>
          <span className={styles.metricFooter}>
            De {formatInteger(totalActiveVariants)} variantes activas
          </span>
        </div>

        {/* Metric 4: Publicados sin SKU activo */}
        <div
          className={`${styles.card} ${publishedProductsWithoutSkus > 0 ? styles.cardWarning : ""}`}
          data-testid="catalog-published-no-skus"
        >
          <span className={styles.metricLabel}>Publicados sin SKU activo</span>
          <span className={styles.metricValue}>{formatInteger(publishedProductsWithoutSkus)}</span>
          <span className={styles.metricFooter}>
            {publishedProductsWithoutSkus === 0 ? (
              <span className={styles.cleanStatus}>
                <CheckCircle2 className={styles.cleanIcon} aria-hidden="true" />
                Todos los productos tienen variantes
              </span>
            ) : (
              <span className={styles.warningStatus}>
                <AlertCircle className={styles.cleanIcon} aria-hidden="true" />
                Requiere asociar variantes activas
              </span>
            )}
          </span>
        </div>
      </div>
    </section>
  );
}
