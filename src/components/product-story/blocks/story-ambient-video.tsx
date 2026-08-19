"use client";

import React, { useEffect, useRef, useState } from "react";
import { shouldAutoplayStoryVideo } from "../helpers/should-autoplay-story-video";
import styles from "./story-ambient-video.module.css";

export interface StoryAmbientVideoProps {
  videoUrl: string;
  posterUrl?: string | null;
}

type MotionPreference = "unknown" | "reduce" | "no-preference";

export function StoryAmbientVideo({
  videoUrl,
  posterUrl,
}: StoryAmbientVideoProps): React.JSX.Element {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [hasError, setHasError] = useState<boolean>(false);
  const [motionPreference, setMotionPreference] = useState<MotionPreference>("unknown");

  // 1. Resolve initial reduced-motion preference and subscribe to runtime changes
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) {
      setMotionPreference("no-preference");
      return;
    }

    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    setMotionPreference(mediaQuery.matches ? "reduce" : "no-preference");

    const handler = (e: MediaQueryListEvent) => {
      setMotionPreference(e.matches ? "reduce" : "no-preference");
    };

    mediaQuery.addEventListener("change", handler);
    return () => mediaQuery.removeEventListener("change", handler);
  }, []);

  // 2. React to reduced-motion transition: pause immediately if reduced motion becomes active
  useEffect(() => {
    if (motionPreference === "reduce") {
      const video = videoRef.current;
      if (video && !video.paused) {
        video.pause();
      }
    }
  }, [motionPreference]);

  // 3. Viewport-gated autoplay observer with meaningful visibility threshold
  useEffect(() => {
    const video = videoRef.current;
    const isReduced = motionPreference === "reduce";
    const isUnknown = motionPreference === "unknown";

    // Stay paused and do not observe while unknown, reduced, or in error state
    if (!video || isUnknown || isReduced || hasError) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const eligible = shouldAutoplayStoryVideo({
            isIntersecting: entry.isIntersecting,
            intersectionRatio: entry.intersectionRatio,
            prefersReducedMotion: false,
            hasError,
          });

          if (eligible) {
            video.play().catch(() => {
              // Ignore standard browser autoplay denial
            });
          } else {
            video.pause();
          }
        }
      },
      { threshold: [0, 0.5] }
    );

    observer.observe(video);

    return () => {
      observer.disconnect();
      video.pause();
    };
  }, [motionPreference, hasError]);

  const shouldHide = hasError || motionPreference === "reduce" || motionPreference === "unknown";

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
