import React from "react";
import styles from "./products.module.css";

export default function ProductsLoading() {
  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.titleArea}>
          <div
            style={{
              width: 160,
              height: 28,
              background: "var(--color-surface-hover, #f4f4f5)",
              borderRadius: 4,
            }}
          />
          <div
            style={{
              width: 280,
              height: 16,
              background: "var(--color-surface-hover, #f4f4f5)",
              borderRadius: 4,
              marginTop: 6,
            }}
          />
        </div>
      </div>
      <div className={styles.filterCard} style={{ height: 72 }} />
      <div
        className={styles.tableContainer}
        style={{
          minHeight: 320,
          padding: "2rem",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <span style={{ color: "var(--color-text-secondary, #71717a)", fontSize: "0.875rem" }}>
          Cargando catálogo de productos...
        </span>
      </div>
    </div>
  );
}
