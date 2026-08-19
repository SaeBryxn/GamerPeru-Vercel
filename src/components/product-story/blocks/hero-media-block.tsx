import React from "react";
import Image from "next/image";
import type { HeroMediaPayload } from "@/lib/catalog/story-validation";
import { resolvePublicMediaUrl } from "@/lib/media/resolve-public-media-url";
import { StoryAmbientVideo } from "./story-ambient-video";
import styles from "./hero-media-block.module.css";

export interface HeroMediaBlockProps {
  payload: HeroMediaPayload;
  productName: string;
}

export function HeroMediaBlock({ payload }: HeroMediaBlockProps): React.JSX.Element {
  const videoUrl = resolvePublicMediaUrl(payload.videoKey);
  const posterUrl = resolvePublicMediaUrl(payload.posterKey);
  const mediaUrl = resolvePublicMediaUrl(payload.mediaKey);

  // Normal Content Precedence: (1) videoUrl -> (2) mediaUrl -> (3) text-only
  const hasVideo = Boolean(videoUrl);
  const hasImage = Boolean(mediaUrl);

  // Fallback static image URL under video (poster -> media -> none)
  const staticFallbackUrl = hasVideo ? (posterUrl ?? mediaUrl) : mediaUrl;

  return (
    <div className={styles.heroContainer} data-testid="story-hero-media-block">
      {/* Static Fallback Layer (underneath ambient video or standalone image) */}
      {staticFallbackUrl && (
        <div className={styles.mediaLayer} aria-hidden="true">
          <Image src={staticFallbackUrl} alt="" fill sizes="100vw" className={styles.staticImage} />
        </div>
      )}

      {/* Ambient Video Island (mounts only when valid videoUrl exists) */}
      {videoUrl && <StoryAmbientVideo videoUrl={videoUrl} posterUrl={posterUrl} />}

      {/* Atmosphere Gradient Overlay */}
      {(hasVideo || hasImage || staticFallbackUrl) && (
        <div className={styles.overlayGradient} aria-hidden="true" />
      )}

      {/* Editorial Content */}
      <div className={styles.contentWrapper}>
        {payload.tagline && (
          <span className={styles.tagline} data-testid="hero-tagline">
            {payload.tagline}
          </span>
        )}
        <h2 className={styles.headline} data-testid="hero-headline">
          {payload.headline}
        </h2>
        {payload.body && (
          <p className={styles.body} data-testid="hero-body">
            {payload.body}
          </p>
        )}
      </div>
    </div>
  );
}
