import React from "react";
import styles from "./product-editor.module.css";

export default function ProductEditorLoading() {
  return (
    <div className={styles.container}>
      <div className={styles.topBar}>
        <div
          style={{
            width: 120,
            height: 16,
            background: "var(--color-surface-hover, #f4f4f5)",
            borderRadius: 4,
          }}
        />
      </div>
      <div className={styles.header}>
        <div
          style={{
            width: 240,
            height: 32,
            background: "var(--color-surface-hover, #f4f4f5)",
            borderRadius: 6,
          }}
        />
      </div>
      <div className={styles.card} style={{ height: 120 }} />
      <div className={styles.card} style={{ height: 280 }} />
      <div className={styles.card} style={{ height: 240 }} />
    </div>
  );
}
