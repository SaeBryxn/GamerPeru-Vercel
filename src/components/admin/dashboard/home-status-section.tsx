import React from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { HomeStatusResult } from "@/lib/admin/dashboard-types";
import { formatInteger } from "@/lib/admin/dashboard-format";
import { AdminSection } from "../ui";
import styles from "./operations.module.css";

interface HomeStatusSectionProps {
  homeStatus: HomeStatusResult;
  href: string | null;
}

export function HomeStatusSection({ homeStatus, href }: HomeStatusSectionProps) {
  if (homeStatus.status === "UNAUTHORIZED") return null;

  const action = href ? (
    <Link href={href} className={styles.sectionLink}>
      Editar <ArrowRight size={14} aria-hidden="true" />
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
    <AdminSection id="home-status-heading" title="Portada" caption={action}>
      <dl className={styles.homeSummary}>
        <div>
          <dt>Secciones visibles</dt>
          <dd data-testid="home-status-visible">
            {formatInteger(visible)} de {formatInteger(total)}
          </dd>
        </div>
        <div>
          <dt>Imágenes por subir</dt>
          <dd data-testid="home-status-empty-images">{formatInteger(emptyImageSlots)}</dd>
        </div>
        <div>
          <dt>Sin editar desde el inicio</dt>
          <dd data-testid="home-status-never-edited">{formatInteger(neverEdited)}</dd>
        </div>
        {invalid > 0 && (
          <div>
            <dt>Contenido por revisar</dt>
            <dd data-testid="home-status-invalid">{formatInteger(invalid)}</dd>
          </div>
        )}
      </dl>
      {hidden > 0 && <p className={styles.homeNote}>{formatInteger(hidden)} secciones ocultas</p>}
    </AdminSection>
  );
}
