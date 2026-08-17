import Image from "next/image";
import Link from "next/link";
import type { HomeGearPreviewItem } from "../types";
import styles from "./curated-gear.module.css";

interface HomeGearPreviewProps {
  item: HomeGearPreviewItem;
}

/**
 * HomeGearPreview — Server Component for an individual gear preview tile
 *
 * Media-First Architecture:
 * - Large near-square media field (aspect-ratio 1:1) dominating the card.
 * - Minimal text chrome below.
 * - Supports real image rendering or token-driven ambient stage.
 */
export function HomeGearPreview({ item }: HomeGearPreviewProps) {
  const { media } = item;

  return (
    <Link
      href={item.href}
      className={styles.gearCard}
      aria-label={`${item.title} — ${item.categoryLabel}`}
    >
      <div className={styles.mediaStage} aria-hidden="true">
        {media.kind === "image" ? (
          <Image
            src={media.src}
            alt={media.altText}
            fill
            sizes="(max-width: 767px) 100vw, (max-width: 1023px) 50vw, (max-width: 1279px) 33vw, 25vw"
            className={styles.gearImage}
          />
        ) : (
          <div className={styles.abstractStageGraphic} />
        )}
      </div>

      <div className={styles.info}>
        <span className={styles.categoryTag}>{item.categoryLabel}</span>
        <h3 className={styles.cardHeading}>{item.title}</h3>
        <span className={styles.actionTag} aria-hidden="true">
          Explorar →
        </span>
      </div>
    </Link>
  );
}
