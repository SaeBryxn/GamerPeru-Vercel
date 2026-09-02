import React from "react";
import styles from "./loading.module.css";

export default function AdminDashboardLoading() {
  return (
    <div
      className={styles.container}
      role="status"
      aria-busy="true"
      aria-label="Cargando panel de administración..."
    >
      {/* Header Skeleton */}
      <div className={styles.headerSkeleton}>
        <div className={styles.titleSkeleton} />
        <div className={styles.subtitleSkeleton} />
        <div className={styles.controlsSkeleton} />
      </div>

      {/* KPI Grid Skeleton */}
      <div className={styles.kpiGridSkeleton}>
        <div className={styles.kpiCardSkeleton} />
        <div className={styles.kpiCardSkeleton} />
        <div className={styles.kpiCardSkeleton} />
        <div className={styles.kpiCardSkeleton} />
      </div>

      {/* Section Skeleton */}
      <div className={styles.sectionSkeleton}>
        <div className={styles.sectionHeaderSkeleton} />
        <div className={styles.cardSkeleton} />
      </div>
    </div>
  );
}
