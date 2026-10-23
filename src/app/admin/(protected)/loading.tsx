import React from "react";
import styles from "./loading.module.css";

/** Mirrors Inicio: header, the action queue, then metrics beside orders and stock. */
export default function AdminDashboardLoading() {
  return (
    <div
      className={styles.container}
      role="status"
      aria-busy="true"
      aria-label="Cargando panel de administración..."
    >
      <div className={styles.headerSkeleton}>
        <div className={styles.titleBlock}>
          <div className={styles.titleSkeleton} />
          <div className={styles.subtitleSkeleton} />
        </div>
        <div className={styles.controlsSkeleton} />
      </div>

      <div className={styles.actionSkeleton}>
        <div className={styles.rowSkeleton} />
        <div className={styles.rowSkeleton} />
        <div className={styles.rowSkeleton} />
        <div className={styles.rowSkeleton} />
      </div>

      <div className={styles.workspaceSkeleton}>
        <div className={styles.column}>
          <div className={styles.kpiCardSkeleton} />
          <div className={styles.cardSkeleton} />
        </div>
        <div className={styles.column}>
          <div className={styles.sideCardSkeleton} />
          <div className={styles.sideCardSkeleton} />
        </div>
      </div>
    </div>
  );
}
