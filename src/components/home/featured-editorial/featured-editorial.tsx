import Image from "next/image";
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
 * - Product photography stage geometry (16:10) with generous whitespace.
 * - 100% Server Component emitting zero client JavaScript runtime.
 */
export function FeaturedEditorial({ data }: FeaturedEditorialProps) {
  const { media } = data;

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
            {media.kind === "image" ? (
              <Image
                src={media.src}
                alt={media.altText}
                fill
                sizes="(max-width: 1023px) 100vw, 50vw"
                className={styles.mediaImage}
              />
            ) : (
              <div className={styles.abstractVisual}>
                <div className={styles.ambientStageCircle} />
              </div>
            )}
          </div>
        </div>
      </Container>
    </section>
  );
}
