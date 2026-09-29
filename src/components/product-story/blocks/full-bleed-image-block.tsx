import React from "react";
import Image from "next/image";
import type { FullBleedImagePayload } from "@/lib/catalog/story-validation";
import { resolvePublicMediaUrl } from "@/lib/media/resolve-public-media-url";
import { resolveStoryAlt } from "../helpers/resolve-story-alt";
import styles from "./full-bleed-image-block.module.css";

export interface FullBleedImageBlockProps {
  payload: FullBleedImagePayload;
  productName: string;
}

export function FullBleedImageBlock({
  payload,
  productName,
}: FullBleedImageBlockProps): React.JSX.Element | null {
  const mediaUrl = resolvePublicMediaUrl(payload.mediaKey);

  // Deterministic fail-closed policy: required mediaUrl null -> omit block
  if (!mediaUrl) {
    return null;
  }

  const alt = resolveStoryAlt(
    payload.altText,
    productName,
    "Detalle de ingeniería en primer plano"
  );

  return (
    <figure className={styles.figureContainer} data-testid="story-full-bleed-image-block">
      <div className={styles.imageStage}>
        <Image src={mediaUrl} alt={alt} fill sizes="100vw" className={styles.image} />
      </div>
      {payload.caption && (
        <figcaption className={styles.caption} data-testid="full-bleed-caption">
          {payload.caption}
        </figcaption>
      )}
    </figure>
  );
}
