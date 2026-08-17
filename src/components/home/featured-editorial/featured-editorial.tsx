import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { Container, Icon } from "@/components/ui";
import type { HomeFeaturedEditorialData } from "../types";
import styles from "./featured-editorial.module.css";

interface FeaturedEditorialProps {
  data: HomeFeaturedEditorialData;
}

/**
 * FeaturedEditorial — Server Component for Homepage Featured Hardware Feature
 *
 * Visual Role: MAJOR (Light Surface #FFFFFF)
 * - Asymmetric 2-column open composition with minimal container chrome.
 * - Editorial focus on material craftsmanship and structural engineering.
 * - Zero fabricated product SKU specifications, fake prices, or fake stock claims.
 */
export function FeaturedEditorial({ data }: FeaturedEditorialProps) {
  return (
    <section className={styles.section} aria-label="Ingeniería y diseño destacado">
      <Container size="default">
        <div className={styles.grid}>
          <div className={styles.copyColumn}>
            <p className={styles.eyebrow}>{data.eyebrow}</p>
            <h2 className={styles.title}>{data.title}</h2>
            <p className={styles.description}>{data.description}</p>
            <Link href={data.cta.href} className={styles.link}>
              {data.cta.label}
              <Icon icon={ArrowRight} size="sm" aria-hidden="true" />
            </Link>
          </div>

          <div className={styles.mediaColumn} aria-hidden="true">
            <div className={styles.abstractVisual}>
              <div className={styles.schematicRing} />
              <div className={styles.schematicAxis} />
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}
