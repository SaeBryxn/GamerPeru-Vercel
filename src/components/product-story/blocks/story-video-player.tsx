"use client";

import React, { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { shouldAutoplayStoryVideo } from "../helpers/should-autoplay-story-video";
import {
  type MotionPreference,
  shouldPauseForReducedMotionTransition,
} from "../helpers/should-pause-for-reduced-motion-transition";
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
  const [motionPreference, setMotionPreference] = useState<MotionPreference>("unknown");
  const previousMotionPreferenceRef = useRef<MotionPreference>("unknown");
  const isManualInteractingRef = useRef<boolean>(false);

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

  // 2. React to runtime reduced-motion transition: pause active playback immediately
  useEffect(() => {
    const previous = previousMotionPreferenceRef.current;
    previousMotionPreferenceRef.current = motionPreference;

    if (shouldPauseForReducedMotionTransition(previous, motionPreference)) {
      const video = videoRef.current;
      if (video && !video.paused) {
        video.pause();
        setIsPlaying(false);
      }
      isManualInteractingRef.current = false;
    }
  }, [motionPreference]);

  // 3. Synchronize native HTML5 media play/pause events to React state
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);

    video.addEventListener("play", onPlay);
    video.addEventListener("pause", onPause);

    return () => {
      video.removeEventListener("play", onPlay);
      video.removeEventListener("pause", onPause);
    };
  }, []);

  // 4. Viewport-gated autoplay observer with meaningful visibility threshold
  useEffect(() => {
    const video = videoRef.current;
    const isReduced = motionPreference === "reduce";
    const isUnknown = motionPreference === "unknown";

    // Under unknown, reduced motion, or error: do NOT autoplay via observer
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
            void video.play().catch(() => {
              // Playback rejection handled safely; native media events remain canonical state authority
            });
          } else {
            video.pause();
            setIsPlaying(false);
          }
        }
      },
      { threshold: [0, 0.5] }
    );

    observer.observe(video);

    return () => {
      observer.disconnect();
      if (!isManualInteractingRef.current) {
        video.pause();
        setIsPlaying(false);
      }
    };
  }, [motionPreference, hasError]);

  // 5. Manual play/pause toggle (remains fully operable even under prefers-reduced-motion)
  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;

    isManualInteractingRef.current = true;

    if (video.paused) {
      void video.play().catch(() => {
        // Playback rejection handled safely; native media events remain canonical state authority
      });
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
