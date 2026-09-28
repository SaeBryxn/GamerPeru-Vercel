import React from "react";
import styles from "./admin-page-skeleton.module.css";

type SkeletonLayout = "list" | "detail" | "workspace";

interface AdminPageSkeletonProps {
  /** Shape of the screen being loaded, so the placeholder matches what replaces it. */
  layout: SkeletonLayout;
  /** Announced to assistive technology while the screen loads. */
  label: string;
}

function Block({ className }: { className: string | undefined }) {
  return <div className={[styles.block, className].filter(Boolean).join(" ")} />;
}

export function AdminPageSkeleton({ layout, label }: AdminPageSkeletonProps) {
  return (
    <div className={styles.container} role="status" aria-busy="true" aria-label={label}>
      <div className={styles.header}>
        <Block className={styles.title} />
        <Block className={styles.subtitle} />
      </div>

      {layout === "list" ? (
        <>
          <Block className={styles.toolbar} />
          <div className={styles.panel}>
            {Array.from({ length: 6 }, (_, index) => (
              <Block key={index} className={styles.row} />
            ))}
          </div>
        </>
      ) : null}

      {layout === "detail" ? (
        <div className={styles.detailGrid}>
          <div className={styles.column}>
            <Block className={styles.cardTall} />
            <Block className={styles.card} />
          </div>
          <div className={styles.column}>
            <Block className={styles.card} />
            <Block className={styles.card} />
          </div>
        </div>
      ) : null}

      {layout === "workspace" ? (
        <div className={styles.workspaceGrid}>
          <div className={styles.panel}>
            {Array.from({ length: 5 }, (_, index) => (
              <Block key={index} className={styles.row} />
            ))}
          </div>
          <Block className={styles.cardTall} />
        </div>
      ) : null}
    </div>
  );
}
