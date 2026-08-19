"use client";

import React, { useEffect, useRef, useState } from "react";
import styles from "./story-ambient-video.module.css";

export interface StoryAmbientVideoProps {
  videoUrl: string;
  posterUrl?: string | null;
}

export function StoryAmbientVideo({
  videoUrl,
  posterUrl,
}: StoryAmbientVideoProps): React.JSX.Element {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [hasError, setHasError] = useState<boolean>(false);
  const [isReducedMotion, setIsReducedMotion] = useState<boolean>(false);

  useEffect(() => {
    // Check initial reduced motion preference
    if (typeof window !== "undefined" && window.matchMedia) {
      const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
      setIsReducedMotion(mediaQuery.matches);

      const handler = (e: MediaQueryListEvent) => setIsReducedMotion(e.matches);
      mediaQuery.addEventListener("change", handler);
      return () => mediaQuery.removeEventListener("change", handler);
    }
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || isReducedMotion || hasError) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            video.play().catch(() => {
              // Ignore standard browser autoplay denial
            });
          } else {
            video.pause();
          }
        }
      },
      { threshold: 0.5 }
    );

    observer.observe(video);

    return () => {
      observer.disconnect();
    };
  }, [isReducedMotion, hasError]);

  const shouldHide = hasError || isReducedMotion;

  return (
    <div
      className={`${styles.ambientVideoContainer} ${shouldHide ? styles.hiddenVideo : ""}`}
      aria-hidden="true"
    >
      <video
        ref={videoRef}
        src={videoUrl}
        poster={posterUrl ?? undefined}
        muted
        playsInline
        loop
        preload="metadata"
        className={styles.ambientVideo}
        onError={() => setHasError(true)}
        tabIndex={-1}
      />
    </div>
  );
}
