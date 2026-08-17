import Image from "next/image";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { Container, Icon } from "@/components/ui";
import type { HomeTechnicalEditorialData } from "../types";
import styles from "./technical-editorial.module.css";

interface TechnicalEditorialProps {
  data: HomeTechnicalEditorialData;
}

/**
 * TechnicalEditorial — Server Component for Homepage Technical Deep-Dive
 *
 * Visual Role: DOMINANT (Dark Canvas #09090B)
 * - Major contrast event between light sections.
 * - Oversized typography using canonical .type-stat-giant (Plus Jakarta Sans 800).
 * - Explains competitive peripheral technology benchmarks without fake SKU claims.
 * - 100% Server Component emitting zero client JavaScript runtime.
 */
export function TechnicalEditorial({ data }: TechnicalEditorialProps) {
  const { media } = data;

  return (
    <section className={styles.section} aria-label="Ingeniería y especificaciones técnicas">
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

          <div className={styles.statsColumn}>
            {media && media.kind === "image" && (
              <div className={styles.schematicMedia} aria-hidden="true">
                <Image
                  src={media.src}
                  alt={media.altText}
                  fill
                  sizes="(max-width: 1023px) 100vw, 50vw"
                  className={styles.schematicImage}
                />
              </div>
            )}
            {data.stats.map((stat, index) => (
              <div key={stat.value}>
                {index > 0 && <div className={styles.statDivider} />}
                <div className={styles.statItem}>
                  <p className={`type-stat-giant ${styles.statValue}`}>{stat.value}</p>
                  <p className={styles.statLabel}>{stat.label}</p>
                  <p className={styles.statDescription}>{stat.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </Container>
    </section>
  );
}
