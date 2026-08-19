"use client";

import React, { useEffect, useRef, useState } from "react";
import Image from "next/image";
import styles from "./story-video-player.module.css";

export interface StoryVideoPlayerProps {
  videoUrl: string;
  posterUrl?: string | null;
  title?: string;
}

export function StoryVideoPlayer({
  videoUrl,
  posterUrl,
  title,
}: StoryVideoPlayerProps): React.JSX.Element {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [hasError, setHasError] = useState<boolean>(false);
  const [isReducedMotion, setIsReducedMotion] = useState<boolean>(false);

  useEffect(() => {
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
            video
              .play()
              .then(() => setIsPlaying(true))
              .catch(() => setIsPlaying(false));
          } else {
            video.pause();
            setIsPlaying(false);
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

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;

    if (video.paused) {
      video
        .play()
        .then(() => setIsPlaying(true))
        .catch(() => setIsPlaying(false));
    } else {
      video.pause();
      setIsPlaying(false);
    }
  };

  if (hasError) {
    return (
      <div className={styles.playerContainer} data-testid="story-video-player-fallback">
        {posterUrl && (
          <Image
            src={posterUrl}
            alt={title ?? "Demostración de hardware"}
            fill
            sizes="(max-width: 768px) 100vw, 1200px"
            className={styles.posterFallback}
          />
        )}
      </div>
    );
  }

  return (
    <div className={styles.playerContainer} data-testid="story-video-player">
      <video
        ref={videoRef}
        src={videoUrl}
        poster={posterUrl ?? undefined}
        muted
        playsInline
        loop
        preload="metadata"
        className={styles.video}
        onError={() => setHasError(true)}
      />

      <div className={styles.controlsOverlay}>
        <button
          type="button"
          onClick={togglePlay}
          className={styles.playToggle}
          aria-label={isPlaying ? "Pausar video" : "Reproducir video"}
          data-testid="story-video-toggle"
        >
          {isPlaying ? "Pausar" : "Reproducir"}
        </button>
      </div>
    </div>
  );
}
