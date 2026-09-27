import styles from "./verification.module.css";

export default function Loading() {
  return (
    <div className={styles.container} aria-busy="true" aria-live="polite">
      <span className={styles.srOnly}>Cargando la cola de pagos…</span>
      <div className={`${styles.skeleton} ${styles.skeletonTitle}`} />
      <div className={`${styles.skeleton} ${styles.skeletonMetrics}`} />
      <div className={`${styles.skeleton} ${styles.skeletonList}`} />
    </div>
  );
}
