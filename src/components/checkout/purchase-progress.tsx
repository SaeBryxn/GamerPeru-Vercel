"use client";
import React from "react";
import styles from "./purchase-progress.module.css";

const STEPS = ["Datos", "Revisar pedido", "Pagar", "Verificación"];
export function PurchaseProgress({
  current,
  completed = false,
}: {
  current: 1 | 2 | 3 | 4;
  completed?: boolean;
}) {
  return (
    <nav aria-label="Pasos de compra">
      <ol className={styles.steps}>
        {STEPS.map((label, index) => (
          <li
            key={label}
            aria-current={!completed && index + 1 === current ? "step" : undefined}
            data-done={completed || index + 1 < current}
          >
            <span aria-hidden="true">{index + 1}</span>
            <span>{label}</span>
          </li>
        ))}
      </ol>
    </nav>
  );
}
