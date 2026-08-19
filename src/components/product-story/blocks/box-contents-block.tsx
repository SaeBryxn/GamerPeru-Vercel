import React from "react";
import Image from "next/image";
import type { BoxContentsPayload } from "@/lib/catalog/story-validation";
import { resolvePublicMediaUrl } from "@/lib/media/resolve-public-media-url";
import { resolveStoryAlt } from "../helpers/resolve-story-alt";
import styles from "./box-contents-block.module.css";

export interface BoxContentsBlockProps {
  payload: BoxContentsPayload;
  productName: string;
}

export function BoxContentsBlock({
  payload,
  productName,
}: BoxContentsBlockProps): React.JSX.Element {
  const title = payload.title ?? "Contenido del Empaque";

  return (
    <section className={styles.section} data-testid="story-box-contents-block">
      <h2 className={styles.title} data-testid="box-contents-title">
        {title}
      </h2>

      <div className={styles.grid}>
        {payload.items.map((item, index) => {
          const mediaUrl = resolvePublicMediaUrl(item.mediaKey);
          const alt = resolveStoryAlt(null, productName, `Accesorio incluido: ${item.title}`);

          return (
            <div
              key={`box-item-${index}`}
              className={styles.itemCard}
              data-testid={`box-item-${index}`}
            >
              {item.count !== undefined && item.count > 1 && (
                <span className={styles.countBadge} data-testid="box-item-count">
                  x{item.count}
                </span>
              )}

              {mediaUrl && (
                <div className={styles.imageStage}>
                  <Image src={mediaUrl} alt={alt} fill sizes="80px" className={styles.image} />
                </div>
              )}

              <span className={styles.itemTitle} data-testid="box-item-title">
                {item.title}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
