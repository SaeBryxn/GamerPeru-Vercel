import React from "react";
import Image from "next/image";
import type { GalleryPayload } from "@/lib/catalog/story-validation";
import { resolvePublicMediaUrl } from "@/lib/media/resolve-public-media-url";
import { resolveStoryAlt } from "../helpers/resolve-story-alt";
import styles from "./gallery-block.module.css";

export interface GalleryBlockProps {
  payload: GalleryPayload;
  productName: string;
}

export function GalleryBlock({
  payload,
  productName,
}: GalleryBlockProps): React.JSX.Element | null {
  // Resolve all item media URLs and filter out nulls
  const validItems = payload.items
    .map((item) => ({
      item,
      url: resolvePublicMediaUrl(item.mediaKey),
    }))
    .filter((entry): entry is { item: typeof entry.item; url: string } => entry.url !== null);

  // Deterministic minimum check: If resolved count < 3 -> omit entire Gallery block
  if (validItems.length < 3) {
    return null;
  }

  return (
    <section className={styles.section} data-testid="story-gallery-block">
      {payload.title && (
        <h2 className={styles.title} data-testid="gallery-title">
          {payload.title}
        </h2>
      )}

      <div className={styles.grid}>
        {validItems.map(({ item, url }, index) => {
          const alt = resolveStoryAlt(
            item.altText,
            productName,
            `Galería de hardware — Perspectiva ${index + 1}`
          );

          return (
            <div
              key={`gallery-item-${index}`}
              className={styles.itemCard}
              data-testid={`gallery-item-${index}`}
            >
              <div className={styles.imageStage}>
                <Image
                  src={url}
                  alt={alt}
                  fill
                  sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                  className={styles.image}
                />
              </div>
              {item.caption && (
                <span className={styles.caption} data-testid="gallery-caption">
                  {item.caption}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
