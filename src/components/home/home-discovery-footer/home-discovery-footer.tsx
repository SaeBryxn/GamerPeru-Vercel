import Link from "next/link";
import { Container } from "@/components/ui";
import type { HomeDiscoveryLinkColumn, HomeTrustFact } from "../types";
import styles from "./home-discovery-footer.module.css";

interface HomeDiscoveryFooterProps {
  trustFacts: HomeTrustFact[];
  directoryColumns: HomeDiscoveryLinkColumn[];
}

/**
 * HomeDiscoveryFooter — Server Component for Compact Trust Strip & SEO Discovery Directory
 *
 * Visual Role: COMPACT (Subtle Neutral Surface #F4F4F5)
 * - Rhythmic transition from light content sections into the dark SiteFooter.
 * - 4 strictly grounded local commerce trust facts.
 * - Semantic, accessible internal link directory.
 */
export function HomeDiscoveryFooter({ trustFacts, directoryColumns }: HomeDiscoveryFooterProps) {
  return (
    <section className={styles.section} aria-label="Información de confianza y directorio">
      <Container size="default">
        {/* Trust Facts */}
        <div className={styles.trustGrid}>
          {trustFacts.map((fact) => (
            <div key={fact.title} className={styles.trustItem}>
              <h3 className={styles.trustTitle}>{fact.title}</h3>
              <p className={styles.trustDescription}>{fact.description}</p>
            </div>
          ))}
        </div>

        {/* SEO Directory Columns */}
        <div className={styles.directoryGrid}>
          {directoryColumns.map((col) => (
            <div key={col.title} className={styles.directoryColumn}>
              <h4 className={styles.columnHeading}>{col.title}</h4>
              <ul className={styles.linkList}>
                {col.links.map((link) => (
                  <li key={link.href}>
                    <Link href={link.href} className={styles.dirLink}>
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Container>
    </section>
  );
}
