"use client";

import React, { useId, useState } from "react";
import {
  formatDimensions,
  formatHandRange,
  resolveSuggestedSize,
  type PdpSize,
} from "@/lib/catalog/product-pdp-config";
import styles from "./pdp-technical-details.module.css";

export function PdpSizeGuide({ sizes }: { sizes: PdpSize[] }) {
  const [cm, setCm] = useState(18.8);
  const id = useId();
  const suggestedIndex = resolveSuggestedSize(sizes, cm);
  return (
    <section className={styles.guide}>
      <h4>Encuentra tu talla ideal.</h4>
      <p>
        Mide desde la punta de tu dedo medio hasta el pliegue de la muñeca y mueve el deslizador.
      </p>
      <div className={styles.measure}>
        <label htmlFor={id}>Longitud de tu mano</label>
        <output htmlFor={id}>
          <strong>{cm.toFixed(1)} cm</strong>
          <small>≈ {(cm / 2.54).toFixed(2)} in</small>
        </output>
        <input
          id={id}
          type="range"
          min="15"
          max="22"
          step="0.1"
          value={cm}
          onChange={(event) => setCm(Number(event.target.value))}
          aria-valuetext={`${cm.toFixed(1)} centímetros`}
        />
        <div className={styles.rangeLabels}>
          <span>15 cm</span>
          <span>22 cm</span>
        </div>
      </div>
      <div className={styles.sizeCards}>
        {sizes.map((size, index) => (
          <article
            key={`${size.name}-${index}`}
            className={`${styles.sizeCard} ${suggestedIndex === index ? styles.suggested : ""}`}
            data-suggested={suggestedIndex === index}
          >
            <span className={styles.sizeBadge}>
              {suggestedIndex === index ? "TALLA SUGERIDA" : "COMPARAR"}
            </span>
            <h4>{size.name}</h4>
            {size.weight && <strong>{size.weight}</strong>}
            {formatDimensions(size) && <p>{formatDimensions(size)}</p>}
            <p className={styles.handRange}>
              Longitud de mano sugerida<strong>{formatHandRange(size)}</strong>
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}
