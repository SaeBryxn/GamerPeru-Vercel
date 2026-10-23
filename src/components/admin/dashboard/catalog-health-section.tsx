import React from "react";
import Link from "next/link";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import type { CatalogHealthIssue, CatalogHealthResult } from "@/lib/admin/dashboard-types";
import { formatInteger } from "@/lib/admin/dashboard-format";
import { SECTION_LABEL } from "@/lib/admin/catalog/readiness-guidance";
import { AdminSection } from "../ui";
import styles from "./operations.module.css";

const SEVERITY_LABEL: Record<CatalogHealthIssue["severity"], string> = {
  blocker: "Bloquea",
  warning: "Aviso",
  suggestion: "Sugerido",
};

const STATUS_LABEL = { PUBLISHED: "En la tienda", DRAFT: "Oculto", ARCHIVED: "Archivado" } as const;

interface CatalogHealthSectionProps {
  catalogHealth: CatalogHealthResult;
  /** Product list filtered to products with any pending item. */
  productsHref: string | null;
}

export function CatalogHealthSection({ catalogHealth, productsHref }: CatalogHealthSectionProps) {
  if (catalogHealth.status === "UNAUTHORIZED") return null;
  const { evaluatedProducts, productsWithIssues, productsWithBlockers, items } = catalogHealth.data;

  const caption =
    productsWithIssues === 0
      ? `${formatInteger(evaluatedProducts)} productos revisados`
      : `${formatInteger(productsWithIssues)} de ${formatInteger(evaluatedProducts)} con pendientes · ${formatInteger(productsWithBlockers)} con bloqueos`;

  return (
    <AdminSection
      id="catalog-health-heading"
      title="Productos que necesitan un ajuste"
      caption={caption}
    >
      {catalogHealth.data.unreferencedAssetCount !== undefined &&
        catalogHealth.data.unreferencedAssetCount > 0 && (
          <details className={styles.mediaDetails}>
            <summary>Archivos sin uso en el catálogo</summary>
            <p data-testid="media-orphans-count">
              {formatInteger(catalogHealth.data.unreferencedAssetCount)} medios sin referencias
              desde hace más de 30 días. Informe de solo lectura.
            </p>
          </details>
        )}
      {items.length === 0 ? (
        <p className={styles.allClear} data-testid="catalog-health-all-clear">
          <CheckCircle2 size={16} aria-hidden="true" />
          Todos los productos están listos y con historia publicada.
        </p>
      ) : (
        <div className={styles.healthCard}>
          <ul className={styles.healthList}>
            {items.map((item) => {
              const first = item.issues[0];
              return (
                <li
                  key={item.productId}
                  className={styles.healthRow}
                  data-testid={`catalog-health-${item.productId}`}
                >
                  <div className={styles.healthMain}>
                    <div className={styles.healthHeading}>
                      <span className={styles.healthName}>{item.name}</span>
                      <span className={styles.healthStatus}>{STATUS_LABEL[item.status]}</span>
                    </div>
                    <ul className={styles.issueList}>
                      {item.issues.map((issue) => (
                        <li key={issue.code} className={styles.issue}>
                          <span className={`${styles.severity} ${styles[issue.severity]}`}>
                            {SEVERITY_LABEL[issue.severity]}
                          </span>
                          {issue.action}
                          <span className={styles.issueSection}>
                            · {SECTION_LABEL[issue.section]}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <Link
                    href={item.href}
                    className={styles.rowAction}
                    aria-label={`Editar ${item.name}${first ? ` en ${SECTION_LABEL[first.section]}` : ""}`}
                  >
                    Editar <ArrowRight size={14} aria-hidden="true" />
                  </Link>
                </li>
              );
            })}
          </ul>
          {productsHref && productsWithIssues > items.length && (
            <Link href={productsHref} className={styles.healthFooter}>
              Ver los {formatInteger(productsWithIssues)} productos con pendientes en el catálogo
              <ArrowRight size={14} aria-hidden="true" />
            </Link>
          )}
        </div>
      )}
    </AdminSection>
  );
}
