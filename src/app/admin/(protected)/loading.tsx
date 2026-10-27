import React from "react";
import overview from "@/components/admin/overview/overview.module.css";
import styles from "./loading.module.css";

/** Mirrors Inicio: header, four KPIs, chart beside «Por atender», three status cards, two lists. */
export default function AdminDashboardLoading() {
  const block = (className: string | undefined, height: number) => (
    <div className={`${styles.block} ${className ?? ""}`} style={{ height }} />
  );
  return (
    <div role="status" aria-busy="true" aria-label="Cargando resumen de la tienda">
      <div className={styles.headerSkeleton}>
        <div className={styles.titleBlock}>
          <div className={styles.titleSkeleton} />
          <div className={styles.subtitleSkeleton} />
        </div>
        <div className={styles.controlsSkeleton} />
      </div>
      <div className={overview.grid}>
        {[0, 1, 2, 3].map((index) => (
          <React.Fragment key={index}>{block(overview.kpi, 140)}</React.Fragment>
        ))}
        {block(overview.chart, 300)}
        {block(overview.side, 300)}
        {block(`${overview.third} ${overview.halfLg}`, 230)}
        {block(`${overview.third} ${overview.halfLg}`, 230)}
        {block(`${overview.third} ${overview.halfLg}`, 230)}
        {block(overview.top, 320)}
        {block(overview.orders, 320)}
      </div>
    </div>
  );
}
