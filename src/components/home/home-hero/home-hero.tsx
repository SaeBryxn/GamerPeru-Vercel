import Link from "next/link";
import { Container } from "@/components/ui";
import type { HomeHeroData } from "../types";
import { HeroMedia } from "./hero-media";
import styles from "./home-hero.module.css";

interface HomeHeroProps {
  hero: HomeHeroData;
}

/**
 * HomeHero — Server Component for Homepage Cinematic Flagship Hero
 *
 * Visual Role: DOMINANT (Dark Canvas #09090B)
 * - Full-bleed outer viewport with bounded inner typography aligned to Container.
 * - Single H1 for the page with fluid responsive typography scale.
 * - Primary and secondary multi-brand CTAs with touch targets >= 44x44px.
 * - Abstract ambient stage fallback when no production render is configured.
 */
export function HomeHero({ hero }: HomeHeroProps) {
  return (
    <section className={styles.heroSection} aria-label="Portada principal de Gamer Perú">
      <HeroMedia media={hero.media} />

      <div className={styles.heroContentWrapper}>
        <Container size="default">
          <div className={styles.heroContent}>
            <p className={styles.eyebrow}>{hero.eyebrow}</p>
            <h1 className={styles.title}>{hero.title}</h1>
            <p className={styles.description}>{hero.description}</p>

            <div className={styles.actions}>
              <Link href={hero.primaryCta.href} className={styles.primaryCta}>
                {hero.primaryCta.label}
              </Link>
              <Link href={hero.secondaryCta.href} className={styles.secondaryCta}>
                {hero.secondaryCta.label}
              </Link>
            </div>
          </div>
        </Container>
      </div>
    </section>
  );
}
