import React from "react";
import Image from "next/image";
import type { DimensionsPayload } from "@/lib/catalog/story-validation";
import { resolvePublicMediaUrl } from "@/lib/media/resolve-public-media-url";
import { resolveStoryAlt } from "../helpers/resolve-story-alt";
import styles from "./dimensions-block.module.css";

export interface DimensionsBlockProps {
  payload: DimensionsPayload;
  productName: string;
}

export function DimensionsBlock({ payload, productName }: DimensionsBlockProps): React.JSX.Element {
  const blueprintUrl = resolvePublicMediaUrl(payload.blueprintMediaKey);
  const alt = resolveStoryAlt(
    null,
    productName,
    "Esquema dimensional ortográfico y ergonomía de agarre"
  );

  const hasMeasurements =
    payload.lengthMm !== undefined ||
    payload.widthMm !== undefined ||
    payload.heightMm !== undefined;

  const hasGrips = Boolean(payload.gripTypes && payload.gripTypes.length > 0);

  const containerClass = `${styles.section} ${blueprintUrl ? styles.withBlueprint : ""}`;

  return (
    <section className={containerClass} data-testid="story-dimensions-block">
      <h2 className={styles.title} data-testid="dimensions-title">
        Dimensiones y Ergonomía
      </h2>

      {blueprintUrl && (
        <div className={styles.blueprintStage}>
          <Image
            src={blueprintUrl}
            alt={alt}
            fill
            sizes="(max-width: 768px) 100vw, 50vw"
            className={styles.blueprintImage}
          />
        </div>
      )}

      <div className={styles.metricsContainer}>
        {hasMeasurements && (
          <div className={styles.measurementsGrid}>
            {payload.lengthMm !== undefined && (
              <div className={styles.measurementCard} data-testid="dim-length">
                <span className={styles.measurementLabel}>Largo</span>
                <span className={styles.measurementValue}>{payload.lengthMm} mm</span>
              </div>
            )}
            {payload.widthMm !== undefined && (
              <div className={styles.measurementCard} data-testid="dim-width">
                <span className={styles.measurementLabel}>Ancho</span>
                <span className={styles.measurementValue}>{payload.widthMm} mm</span>
              </div>
            )}
            {payload.heightMm !== undefined && (
              <div className={styles.measurementCard} data-testid="dim-height">
                <span className={styles.measurementLabel}>Alto</span>
                <span className={styles.measurementValue}>{payload.heightMm} mm</span>
              </div>
            )}
          </div>
        )}

        {hasGrips && (
          <div className={styles.gripSection}>
            <span className={styles.gripTitle}>Tipos de Agarre Recomendados</span>
            <div className={styles.gripList}>
              {payload.gripTypes?.map((grip, idx) => (
                <span
                  key={`grip-${idx}`}
                  className={styles.gripPill}
                  data-testid={`grip-pill-${idx}`}
                >
                  {grip}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
