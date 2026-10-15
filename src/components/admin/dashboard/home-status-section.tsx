import React from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { HomeStatusResult } from "@/lib/admin/dashboard-types";
import { formatInteger } from "@/lib/admin/dashboard-format";
import { AdminCard, AdminSection, MetricRow, MetricWidget } from "../ui";
import styles from "./operations.module.css";

interface HomeStatusSectionProps {
  homeStatus: HomeStatusResult;
  href: string | null;
}

export function HomeStatusSection({ homeStatus, href }: HomeStatusSectionProps) {
  if (homeStatus.status === "UNAUTHORIZED") return null;

  const action = href ? (
    <Link href={href} className={styles.sectionLink}>
      Editar el home <ArrowRight size={14} aria-hidden="true" />
    </Link>
  ) : null;

  if (homeStatus.status === "UNAVAILABLE") {
    return (
      <AdminSection id="home-status-heading" title="Home de la tienda" caption={action}>
        <p className={styles.notice} data-testid="home-status-unavailable">
          No se pudieron leer las secciones del home. La tienda muestra el home predeterminado.
        </p>
      </AdminSection>
    );
  }

  const { total, visible, hidden, neverEdited, emptyImageSlots, invalid } = homeStatus.data;
  return (
    <AdminSection id="home-status-heading" title="Home de la tienda" caption={action}>
      <AdminCard>
        <MetricRow minCellWidth={150}>
          <MetricWidget
            label="Secciones visibles"
            value={`${formatInteger(visible)} de ${formatInteger(total)}`}
            size="small"
            footnote={
              hidden > 0
                ? `${formatInteger(hidden)} oculta${hidden === 1 ? "" : "s"}`
                : "Ninguna oculta"
            }
            testId="home-status-visible"
            href={href ?? undefined}
          />
          <MetricWidget
            label="Imágenes por subir"
            value={formatInteger(emptyImageSlots)}
            size="small"
            dot={emptyImageSlots > 0 ? "attention" : "ok"}
            footnote={
              emptyImageSlots > 0
                ? "Espacios vacíos en secciones visibles"
                : "Todas las secciones visibles tienen imagen"
            }
            testId="home-status-empty-images"
            href={href ?? undefined}
          />
          <MetricWidget
            label="Sin editar desde el inicio"
            value={formatInteger(neverEdited)}
            size="small"
            footnote="Conservan el contenido con el que se creó el home"
            testId="home-status-never-edited"
            href={href ?? undefined}
          />
          {invalid > 0 && (
            <MetricWidget
              label="Contenido por revisar"
              value={formatInteger(invalid)}
              size="small"
              dot="critical"
              footnote="La tienda no muestra estas secciones"
              testId="home-status-invalid"
              href={href ?? undefined}
            />
          )}
        </MetricRow>
      </AdminCard>
    </AdminSection>
  );
}
