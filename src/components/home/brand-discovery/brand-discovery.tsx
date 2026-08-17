import Link from "next/link";
import { Container } from "@/components/ui";
import type { HomeBrandItem } from "../types";
import styles from "./brand-discovery.module.css";

interface BrandDiscoveryProps {
  eyebrow: string;
  title: string;
  items: HomeBrandItem[];
}

/**
 * BrandDiscovery — Server Component for Homepage Multi-Brand Discovery Grid
 *
 * Visual Role: MEDIUM (Light Surface #FFFFFF)
 * - Section anchor `id="marcas"`.
 * - Restrained typography-first grid linking to brand route intents (/marcas/[slug]).
 * - Zero unverified partner or official distributor claims.
 */
export function BrandDiscovery({ eyebrow, title, items }: BrandDiscoveryProps) {
  return (
    <section id="marcas" className={styles.section} aria-label="Catálogo de marcas de periféricos">
      <Container size="default">
        <div className={styles.header}>
          <p className={styles.eyebrow}>{eyebrow}</p>
          <h2 className={styles.title}>{title}</h2>
        </div>

        <div className={styles.grid}>
          {items.map((brand) => (
            <Link
              key={brand.slug}
              href={brand.href}
              className={styles.brandCard}
              aria-label={`Ver marca ${brand.name}`}
            >
              <span className={styles.brandName}>{brand.name}</span>
              <span className={styles.brandAction} aria-hidden="true">
                Ver marca →
              </span>
            </Link>
          ))}
        </div>
      </Container>
    </section>
  );
}
