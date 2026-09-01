import React from "react";
import styles from "./page.module.css";

export default function AdminProtectedLoading() {
  return (
    <div
      className={styles.container}
      aria-busy="true"
      aria-label="Cargando panel de administración"
    >
      <div className={styles.header}>
        <div
          style={{
            height: "2rem",
            width: "250px",
            backgroundColor: "#e4e4e7",
            borderRadius: "0.375rem",
          }}
        />
        <div
          style={{
            height: "2.5rem",
            width: "200px",
            backgroundColor: "#e4e4e7",
            borderRadius: "0.375rem",
          }}
        />
      </div>
      <div className={styles.grid}>
        <div
          style={{
            height: "180px",
            backgroundColor: "#ffffff",
            borderRadius: "0.75rem",
            border: "1px solid #e4e4e7",
          }}
        />
        <div
          style={{
            height: "180px",
            backgroundColor: "#ffffff",
            borderRadius: "0.75rem",
            border: "1px solid #e4e4e7",
          }}
        />
      </div>
    </div>
  );
}
