import React from "react";
import Image from "next/image";
import type { VideoPayload } from "@/lib/catalog/story-validation";
import { resolvePublicMediaUrl } from "@/lib/media/resolve-public-media-url";
import { StoryVideoPlayer } from "./story-video-player";
import styles from "./video-block.module.css";

export interface VideoBlockProps {
  payload: VideoPayload;
  productName: string;
}

export function VideoBlock({ payload, productName }: VideoBlockProps): React.JSX.Element | null {
  const videoUrl = resolvePublicMediaUrl(payload.videoKey);
  const posterUrl = resolvePublicMediaUrl(payload.posterKey);

  // Deterministic resolver failure policy:
  // 1. If videoUrl null + valid poster: render static poster + optional text
  // 2. If videoUrl null + no poster + textual content: render textual container
  // 3. If videoUrl null + no presentable content: omit block
  if (!videoUrl) {
    if (posterUrl) {
      return (
        <section className={styles.section} data-testid="story-video-block">
          {payload.title && (
            <h2 className={styles.title} data-testid="video-title">
              {payload.title}
            </h2>
          )}
          <div className={styles.staticPosterStage}>
            <Image
              src={posterUrl}
              alt={payload.title ?? `${productName} — Demostración de hardware`}
              fill
              sizes="(max-width: 768px) 100vw, 1200px"
              className={styles.posterImage}
            />
          </div>
          {payload.caption && (
            <p className={styles.caption} data-testid="video-caption">
              {payload.caption}
            </p>
          )}
        </section>
      );
    }

    if (payload.title || payload.caption) {
      return (
        <section className={styles.section} data-testid="story-video-block">
          <div className={styles.textFallbackCard}>
            {payload.title && (
              <h2 className={styles.title} data-testid="video-title">
                {payload.title}
              </h2>
            )}
            {payload.caption && (
              <p className={styles.caption} data-testid="video-caption">
                {payload.caption}
              </p>
            )}
          </div>
        </section>
      );
    }

    return null;
  }

  return (
    <section className={styles.section} data-testid="story-video-block">
      {payload.title && (
        <h2 className={styles.title} data-testid="video-title">
          {payload.title}
        </h2>
      )}

      <StoryVideoPlayer videoUrl={videoUrl} posterUrl={posterUrl} title={payload.title} />

      {payload.caption && (
        <p className={styles.caption} data-testid="video-caption">
          {payload.caption}
        </p>
      )}
    </section>
  );
}
