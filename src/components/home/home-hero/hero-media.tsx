import Image, { getImageProps } from "next/image";
import type { HomeHeroMedia } from "../types";
import styles from "./home-hero.module.css";

interface HeroMediaProps {
  media: HomeHeroMedia;
}

/**
 * HeroMedia — Server Component for Homepage Hero Media Stage
 *
 * Art-Direction & Performance Architecture:
 * 1. Supports independent desktop and mobile image sources via Next.js getImageProps() + <picture>.
 * 2. When a single image is configured, renders Next.js Image with preload.
 * 3. When mediaKind === "abstract" (current default), renders a pure CSS token-driven ambient stage
 *    with zero network image requests and zero image preloads.
 * 4. 100% Server Component emitting zero client JavaScript runtime.
 */
export function HeroMedia({ media }: HeroMediaProps) {
  const { mediaKind, desktopImageSrc, mobileImageSrc, altText } = media;

  if (mediaKind === "image" && desktopImageSrc && mobileImageSrc) {
    const common = { alt: altText, fill: true, preload: true };
    const {
      props: { srcSet: mobileSrcSet },
    } = getImageProps({
      ...common,
      src: mobileImageSrc,
      sizes: "100vw",
    });
    const {
      props: { srcSet: desktopSrcSet, ...restDesktop },
    } = getImageProps({
      ...common,
      src: desktopImageSrc,
      sizes: "100vw",
    });

    return (
      <div className={styles.mediaContainer} aria-hidden="true">
        <picture className={styles.picture}>
          <source media="(max-width: 767px)" srcSet={mobileSrcSet} />
          <source media="(min-width: 768px)" srcSet={desktopSrcSet} />
          <img {...restDesktop} className={styles.mediaImage} alt={altText} />
        </picture>
        <div className={styles.mediaOverlay} />
      </div>
    );
  }

  if (mediaKind === "image" && (desktopImageSrc || mobileImageSrc)) {
    const imageSrc = desktopImageSrc ?? mobileImageSrc;
    if (imageSrc) {
      return (
        <div className={styles.mediaContainer} aria-hidden="true">
          <Image
            src={imageSrc}
            alt={altText}
            fill
            preload
            sizes="100vw"
            className={styles.mediaImage}
          />
          <div className={styles.mediaOverlay} />
        </div>
      );
    }
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
