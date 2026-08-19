import React from "react";
import Image from "next/image";
import type { SpecFeaturePayload } from "@/lib/catalog/story-validation";
import { resolvePublicMediaUrl } from "@/lib/media/resolve-public-media-url";
import { resolveStoryAlt } from "../helpers/resolve-story-alt";
import styles from "./spec-feature-block.module.css";

export interface SpecFeatureBlockProps {
  payload: SpecFeaturePayload;
  productName: string;
}

export function SpecFeatureBlock({
  payload,
  productName,
}: SpecFeatureBlockProps): React.JSX.Element {
  const mediaUrl = resolvePublicMediaUrl(payload.mediaKey);
  const alt = resolveStoryAlt(null, productName, payload.title);

  const containerClass = `${styles.featureCard} ${mediaUrl ? styles.withMedia : ""}`;

  return (
    <article className={containerClass} data-testid="story-spec-feature-block">
      {mediaUrl && (
        <div className={styles.imageStage}>
          <Image
            src={mediaUrl}
            alt={alt}
            fill
            sizes="(max-width: 768px) 100vw, 50vw"
            className={styles.image}
          />
        </div>
      )}

      <div className={styles.content}>
        {payload.badge && (
          <span className={styles.badge} data-testid="spec-feature-badge">
            {payload.badge}
          </span>
        )}
        <h2 className={styles.title} data-testid="spec-feature-title">
          {payload.title}
        </h2>
        <p className={styles.description} data-testid="spec-feature-description">
          {payload.description}
        </p>
      </div>
    </article>
  );
}
