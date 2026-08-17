import Link from "next/link";
import type { HomeGearPreviewItem } from "../types";
import styles from "./curated-gear.module.css";

interface HomeGearPreviewProps {
  item: HomeGearPreviewItem;
}

/**
 * HomeGearPreview — Server Component for an individual gear preview tile
 */
export function HomeGearPreview({ item }: HomeGearPreviewProps) {
  return (
    <Link
      href={item.href}
      className={styles.gearCard}
      aria-label={`${item.title} — ${item.categoryLabel}`}
    >
      <div className={styles.mediaStage} aria-hidden="true">
        <div className={styles.abstractStageGraphic} />
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
