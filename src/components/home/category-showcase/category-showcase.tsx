import { Container } from "@/components/ui";
import type { HomeCategoryItem } from "../types";
import { CategoryCard } from "./category-card";
import styles from "./category-showcase.module.css";

interface CategoryShowcaseProps {
  categories: HomeCategoryItem[];
}

/**
 * CategoryShowcase — Server Component for Homepage Category Visual Doors
 *
 * Visual Role: MAJOR (Light / Neutral Section Surface)
 * - Section anchor `id="categorias"` targeted by Hero secondary CTA.
 * - Responsive 3+2 density on desktop, balanced 2-column on tablet, 1-column on mobile.
 * - Direct semantic category route intents (/categorias/[slug]).
 */
export function CategoryShowcase({ categories }: CategoryShowcaseProps) {
  return (
    <section
      id="categorias"
      className={styles.section}
      aria-label="Categorías principales de periféricos"
    >
      <Container size="default">
        <div className={styles.header}>
          <p className={styles.eyebrow}>Explorar Catálogo</p>
          <h2 className={styles.title}>Líneas de Periféricos</h2>
        </div>

        <div className={styles.grid}>
          {categories.map((category, index) => {
            const isWide = index >= 3;
            return (
              <div key={category.id} className={isWide ? styles.cardColWide : styles.cardColLarge}>
                <CategoryCard category={category} isWide={isWide} />
              </div>
            );
          })}
        </div>
      </Container>
    </section>
  );
}
