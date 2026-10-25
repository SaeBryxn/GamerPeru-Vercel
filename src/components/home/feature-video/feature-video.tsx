"use client";

import React, { useEffect, useRef, useState } from "react";
import { m, type Variants } from "framer-motion";
import { Pause, Play } from "lucide-react";
import { DomeLink, Icon, usePrefersReducedMotion } from "@/components/ui";
import { useAutoplayAllowed, type HomeVideoSource } from "../home-video";
import styles from "./feature-video.module.css";

const YOUTUBE_ORIGIN = "https://www.youtube-nocookie.com";

/** Chromeless background playback, with the JS API on for the play control. */
export function buildFeatureEmbedSrc(videoId: string): string {
  const params = new URLSearchParams({
    autoplay: "1",
    mute: "1",
    loop: "1",
    playlist: videoId,
    controls: "0",
    playsinline: "1",
    rel: "0",
    modestbranding: "1",
    disablekb: "1",
    iv_load_policy: "3",
    fs: "0",
    enablejsapi: "1",
  });
  return `${YOUTUBE_ORIGIN}/embed/${videoId}?${params.toString()}`;
}

const EASE_OUT_EXPO = [0.22, 1, 0.36, 1] as const;

// The block rises into place the first time it is scrolled into view.
const SECTION_VARIANTS: Variants = {
  hidden: { opacity: 0, y: 50 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.7, ease: EASE_OUT_EXPO, staggerChildren: 0.12, delayChildren: 0.15 },
  },
};

const OVERLAY_VARIANTS: Variants = {
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: EASE_OUT_EXPO } },
};

export interface FeatureVideoProps {
  video: HomeVideoSource;
  eyebrow: string;
  /** Rendered as outlined display type. */
  title: string;
  subtitle: string;
  cta: { label: string; href: string };
}

/**
 * Full-bleed product film with an outlined headline over the bottom-left
 * corner and its own play control.
 */
export function FeatureVideo({ video, eyebrow, title, subtitle, cta }: FeatureVideoProps) {
  const autoStart = usePrefersReducedMotion() === false;
  const autoplayAllowed = useAutoplayAllowed();
  const frameRef = useRef<HTMLIFrameElement>(null);
  const fileRef = useRef<HTMLVideoElement>(null);
  // Until the visitor uses the control, playback follows the motion preference. It is unknown on
  // the server and during hydration, so the embed is never part of the server HTML and
  // reduced-motion visitors get a still stage until they start it themselves.
  const [choice, setChoice] = useState<{ mounted: boolean; playing: boolean } | null>(null);
  const isMounted = choice?.mounted ?? autoStart;
  const isPlaying =
    choice?.playing ?? (video.kind === "upload" ? autoStart && autoplayAllowed : autoStart);

  // The file follows the state instead of the autoplay attribute, which only applies on load.
  useEffect(() => {
    const file = fileRef.current;
    if (video.kind !== "upload" || !file) return;
    if (isPlaying) {
      Promise.resolve(file.play()).catch(() => setChoice({ mounted: true, playing: false }));
    } else {
      file.pause();
    }
  }, [isPlaying, video.kind]);

  const togglePlayback = () => {
    if (!isMounted) {
      setChoice({ mounted: true, playing: true });
      return;
    }
    if (video.kind === "upload") {
      setChoice({ mounted: true, playing: !isPlaying });
      return;
    }
    const command = isPlaying ? "pauseVideo" : "playVideo";
    frameRef.current?.contentWindow?.postMessage(
      JSON.stringify({ event: "command", func: command, args: [] }),
      YOUTUBE_ORIGIN
    );
    setChoice({ mounted: true, playing: !isPlaying });
  };

  return (
    <m.section
      className={styles.section}
      aria-label={title}
      variants={SECTION_VARIANTS}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, amount: 0.2 }}
      data-testid="feature-video"
    >
      <div className={styles.stage}>
        <div className={styles.videoFrame} aria-hidden="true">
          {video.kind === "upload" && (
            <video
              ref={fileRef}
              className={styles.videoFile}
              src={video.src ?? undefined}
              poster={video.posterSrc ?? undefined}
              muted
              loop
              playsInline
              preload="metadata"
              tabIndex={-1}
              data-testid="feature-video-file"
            />
          )}
          {video.kind === "youtube" && isMounted && (
            <iframe
              ref={frameRef}
              className={styles.video}
              src={buildFeatureEmbedSrc(video.videoId)}
              title={title}
              allow="autoplay; encrypted-media"
              referrerPolicy="strict-origin-when-cross-origin"
              tabIndex={-1}
              data-testid="feature-video-frame"
            />
          )}
        </div>
        <div className={styles.scrim} aria-hidden="true" />

        <m.div className={styles.overlay} variants={OVERLAY_VARIANTS}>
          <p className={styles.eyebrow}>{eyebrow}</p>
          <h2 className={styles.title}>{title}</h2>
          <p className={styles.subtitle}>{subtitle}</p>
          <DomeLink href={cta.href} tone="light" className={styles.cta}>
            {cta.label}
          </DomeLink>
        </m.div>

        <m.button
          type="button"
          className={styles.playToggle}
          onClick={togglePlayback}
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.92 }}
          transition={{ type: "spring", stiffness: 420, damping: 24 }}
          aria-label={isPlaying ? "Pausar el video" : "Reproducir el video"}
          aria-pressed={isPlaying}
          data-testid="feature-video-toggle"
        >
          <Icon icon={isPlaying ? Pause : Play} size="sm" aria-hidden="true" />
        </m.button>
      </div>
    </m.section>
  );
}
