import { Container } from "@/components/ui";
import type { HomeGearPreviewItem } from "../types";
import { HomeGearPreview } from "./home-gear-preview";
import styles from "./curated-gear.module.css";

interface CuratedGearProps {
  eyebrow: string;
  title: string;
  items: HomeGearPreviewItem[];
}

/**
 * CuratedGear — Server Component for Homepage Curated Gear Shelf
 *
 * Visual Role: MEDIUM (Light Surface #FFFFFF)
 * - 4-column desktop shelf adapting cleanly to 3-column tablet and 1-column mobile.
 * - Represents category and hardware doors without fake product SKU records or fake prices.
 */
export function CuratedGear({ eyebrow, title, items }: CuratedGearProps) {
  return (
    <section className={styles.section} aria-label="Selección de gear destacado">
      <Container size="default">
        <div className={styles.header}>
          <div>
            <p className={styles.eyebrow}>{eyebrow}</p>
            <h2 className={styles.title}>{title}</h2>
          </div>
        </div>

        <div className={styles.grid}>
          {items.map((item) => (
            <HomeGearPreview key={item.id} item={item} />
          ))}
        </div>
      </Container>
    </section>
  );
}
