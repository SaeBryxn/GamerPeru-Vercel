import React from "react";
import Image from "next/image";
import type { ImageTextPayload } from "@/lib/catalog/story-validation";
import { resolvePublicMediaUrl } from "@/lib/media/resolve-public-media-url";
import { resolveStoryAlt } from "../helpers/resolve-story-alt";
import styles from "./image-text-block.module.css";

export interface ImageTextBlockProps {
  payload: ImageTextPayload;
  productName: string;
}

export function ImageTextBlock({ payload, productName }: ImageTextBlockProps): React.JSX.Element {
  const mediaUrl = resolvePublicMediaUrl(payload.mediaKey);
  const isRight = payload.imagePosition === "right";
  const alt = resolveStoryAlt(null, productName, payload.headline);

  const containerClass = `${styles.splitSection} ${
    isRight && mediaUrl ? styles.reverseLayout : ""
  }`;

  return (
    <section className={containerClass} data-testid="story-image-text-block">
      {mediaUrl && (
        <div className={styles.imageContainer}>
          <Image
            src={mediaUrl}
            alt={alt}
            fill
            sizes="(max-width: 768px) 100vw, 50vw"
            className={styles.image}
          />
        </div>
      )}

      <div className={`${styles.textContainer} ${!mediaUrl ? styles.fullWidthText : ""}`}>
        <h2 className={styles.headline} data-testid="image-text-headline">
          {payload.headline}
        </h2>
        <p className={styles.body} data-testid="image-text-body">
          {payload.body}
        </p>
      </div>
    </section>
  );
}
