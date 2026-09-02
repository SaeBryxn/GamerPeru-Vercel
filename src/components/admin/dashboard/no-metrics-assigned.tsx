import React from "react";
import { Info } from "lucide-react";
import styles from "./no-metrics-assigned.module.css";

export function NoMetricsAssigned() {
  return (
    <section className={styles.container} aria-labelledby="no-metrics-heading">
      <div className={styles.card}>
        <div className={styles.iconWrapper}>
          <Info className={styles.icon} aria-hidden="true" />
        </div>
        <div className={styles.content}>
          <h2 id="no-metrics-heading" className={styles.title}>
            Sin Métricas Asignadas
          </h2>
          <p className={styles.text}>No hay métricas de resumen asignadas a tu rol.</p>
          <p className={styles.subtext}>
            Tus permisos administrativos te permiten operar en módulos de soporte y atención.
            Utiliza la barra de navegación lateral para acceder a las secciones autorizadas.
          </p>
        </div>
      </div>
    </section>
  );
}
