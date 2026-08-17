import Image, { getImageProps } from "next/image";
import type { HomeMedia } from "../types";
import styles from "./home-hero.module.css";

interface HeroMediaProps {
  media: HomeMedia;
}

/**
 * HeroMedia — Server Component for Homepage Hero Media Stage
 *
 * Art-Direction & Performance Architecture:
 * 1. Supports independent desktop and mobile image sources via Next.js getImageProps() + <picture>.
 * 2. When an image is configured, uses fetchPriority="high" and loading="eager" without redundant preload flags.
 * 3. When kind === "abstract" (current default), renders a pure CSS token-driven ambient stage
 *    with zero network image requests and zero image preloads.
 * 4. 100% Server Component emitting zero client JavaScript runtime.
 */
export function HeroMedia({ media }: HeroMediaProps) {
  if (media.kind === "image") {
    const { src, mobileSrc, altText, decorative = false } = media;
    const resolvedAlt = decorative ? "" : altText;

    if (mobileSrc) {
      const common = { alt: resolvedAlt, fill: true };
      const {
        props: { srcSet: mobileSrcSet },
      } = getImageProps({
        ...common,
        src: mobileSrc,
        sizes: "100vw",
      });
      const {
        props: { srcSet: desktopSrcSet, ...restDesktop },
      } = getImageProps({
        ...common,
        src,
        sizes: "100vw",
      });

      return (
        <div className={styles.mediaContainer} {...(decorative ? { "aria-hidden": "true" } : {})}>
          <picture className={styles.picture}>
            <source media="(max-width: 767px)" srcSet={mobileSrcSet} />
            <source media="(min-width: 768px)" srcSet={desktopSrcSet} />
            <img
              {...restDesktop}
              className={styles.mediaImage}
              alt={resolvedAlt}
              fetchPriority="high"
              loading="eager"
            />
          </picture>
          <div className={styles.mediaOverlay} aria-hidden="true" />
        </div>
      );
    }

    return (
      <div className={styles.mediaContainer} {...(decorative ? { "aria-hidden": "true" } : {})}>
        <Image
          src={src}
          alt={resolvedAlt}
          fill
          fetchPriority="high"
          loading="eager"
          sizes="100vw"
          className={styles.mediaImage}
        />
        <div className={styles.mediaOverlay} aria-hidden="true" />
      </div>
    );
  }

  // Abstract ambient stage fallback (default for GP-010 until owner renders are supplied)
  return (
    <div className={styles.abstractStage} aria-hidden="true">
      <div className={styles.ambientGlow} />
      <div className={styles.machiningGrid} />
      <div className={styles.mediaOverlay} />
    </div>
  );
}
