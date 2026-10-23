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
  const hasRanges = sizes.some((size) => size.handMin !== null || size.handMax !== null);
  const suggestedIndex = hasRanges ? resolveSuggestedSize(sizes, cm) : -1;
  return (
    <section className={styles.guide}>
      <h4>Compara tallas y medidas</h4>
      <p>
        {hasRanges
          ? "Las sugerencias usan los rangos de mano registrados para este producto. Mide desde la punta del dedo medio hasta el pliegue de la muñeca."
          : "Este producto no tiene rangos de mano documentados. Compara las medidas y el peso; no asignamos una talla recomendada sin esos datos."}
      </p>
      {hasRanges && (
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
      )}
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
            {formatDimensions(size) ? (
              <p>{formatDimensions(size)}</p>
            ) : (
              <dl>
                {(
                  [
                    ["Largo", size.lengthMm],
                    ["Ancho", size.widthMm],
                    ["Alto", size.heightMm],
                  ] as const
                )
                  .filter(([, value]) => value !== null)
                  .map(([label, value]) => (
                    <div key={label}>
                      <dt>{label}</dt>
                      <dd>{value} mm</dd>
                    </div>
                  ))}
              </dl>
            )}
            {(size.handMin !== null || size.handMax !== null) && (
              <p className={styles.handRange}>
                Rango de mano registrado<strong>{formatHandRange(size)}</strong>
              </p>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}
