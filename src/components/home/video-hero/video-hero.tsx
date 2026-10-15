"use client";

import React, { useLayoutEffect, useRef, useState } from "react";
import {
  motion,
  useMotionValueEvent,
  useReducedMotion,
  useScroll,
  useTransform,
  type PanInfo,
  type Variants,
} from "framer-motion";
import { ChevronDown } from "lucide-react";
import { Icon, useCanHover } from "@/components/ui";
import styles from "./video-hero.module.css";

/** Background playback: muted, looping, chromeless, and privacy-enhanced host. */
export function buildHeroEmbedSrc(videoId: string): string {
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
  });
  return `https://www.youtube-nocookie.com/embed/${videoId}?${params.toString()}`;
}

// Past either threshold the curtain opens instead of springing back.
// The chevron under "Desliza" flashes brand red while the curtain is held, confirming the grab.
const HINT_TINT_VARIANTS: Variants = {
  idle: { color: "var(--color-text-dark-primary)", transition: { duration: 0.3 } },
  held: { color: "var(--color-brand-red)", transition: { duration: 0.12 } },
};

const DRAG_DISTANCE_THRESHOLD = 90;
const DRAG_VELOCITY_THRESHOLD = -450;

export interface VideoHeroProps {
  /** Heading kept for SEO and screen readers; the stage itself stays wordless. */
  heading: string;
  /** Label of the control that reveals the store. */
  scrollHintLabel: string;
  youtubeVideoId: string;
  /** Element scrolled to when the hero is swiped or the chevron is used. */
  revealTargetId: string;
}

/**
 * Full-viewport video stage. It behaves like a curtain: dragging it up (or
 * scrolling) lifts it away and reveals the store underneath.
 */
export function VideoHero({
  heading,
  scrollHintLabel,
  youtubeVideoId,
  revealTargetId,
}: VideoHeroProps) {
  const sectionRef = useRef<HTMLElement>(null);
  const prefersReducedMotion = useReducedMotion();
  // Touch screens scroll the curtain away natively: a drag gesture would fight the page scroll,
  // and a scroll-linked dim costs a paint per frame on the devices least able to afford it.
  const isTouch = !useCanHover();
  const isLite = Boolean(prefersReducedMotion) || isTouch;

  // The stage is pinned (sticky) while the store slides over it, so scroll is
  // measured against the page, not against the element's own box.
  const [heroHeight, setHeroHeight] = useState(1);
  const { scrollY } = useScroll();
  // The stage recedes by dimming, not by shrinking: no gaps around the video.
  const dim = useTransform(scrollY, [0, heroHeight], [0, 0.6]);

  // While it is fully covered the embed is unmounted: nothing decodes offscreen.
  const [isCovered, setIsCovered] = useState(false);
  useMotionValueEvent(scrollY, "change", (value) => {
    setIsCovered(value > heroHeight * 1.05);
  });

  useLayoutEffect(() => {
    const measure = () => {
      const height = sectionRef.current?.offsetHeight;
      if (height && height > 0) setHeroHeight(height);
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  const reveal = () => {
    const target = document.getElementById(revealTargetId);
    target?.scrollIntoView({
      behavior: prefersReducedMotion ? "auto" : "smooth",
      block: "start",
    });
  };

  const handleDragEnd = (_event: unknown, info: PanInfo) => {
    if (info.offset.y < -DRAG_DISTANCE_THRESHOLD || info.velocity.y < DRAG_VELOCITY_THRESHOLD) {
      reveal();
    }
  };

  return (
    <motion.section
      ref={sectionRef}
      className={styles.hero}
      aria-label="Portada principal de Gamer Perú"
      data-video-hero=""
      data-testid="video-hero"
    >
      <motion.div
        className={styles.curtain}
        drag={isLite ? false : "y"}
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={{ top: 0.4, bottom: 0 }}
        dragMomentum={false}
        onDragEnd={handleDragEnd}
        initial="idle"
        animate="idle"
        whileDrag="held"
      >
        {/*
          The stage is decorative: no audio, no controls and no pointer events,
          so a click never pauses it and the video stays out of the tab order.
          Reduced-motion visitors get the still stage instead of the loop.
        */}
        <div className={styles.videoFrame} aria-hidden="true">
          {!prefersReducedMotion && !isCovered && (
            <iframe
              className={styles.video}
              src={buildHeroEmbedSrc(youtubeVideoId)}
              title="Video de portada de Gamer Perú"
              allow="autoplay; encrypted-media"
              referrerPolicy="strict-origin-when-cross-origin"
              tabIndex={-1}
              data-testid="video-hero-frame"
            />
          )}
        </div>
        <div className={styles.scrim} aria-hidden="true" />
        <motion.div
          className={styles.dim}
          style={isLite ? undefined : { opacity: dim }}
          aria-hidden="true"
        />

        {/* The page still needs its H1; the stage itself stays wordless. */}
        <h1 className={styles.heading}>{heading}</h1>

        <motion.button
          type="button"
          className={styles.scrollHint}
          onClick={reveal}
          whileHover={{ scale: 1.08 }}
          whileTap={{ scale: 0.94 }}
          transition={{ type: "spring", stiffness: 420, damping: 26 }}
          data-testid="video-hero-scroll-hint"
        >
          <span className={styles.scrollHintLabel}>{scrollHintLabel}</span>
          <motion.span className={styles.scrollHintTint} variants={HINT_TINT_VARIANTS}>
            <motion.span
              className={styles.scrollHintIcon}
              animate={prefersReducedMotion ? undefined : { y: [0, 8, 0] }}
              transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
            >
              <Icon icon={ChevronDown} size="md" aria-hidden="true" />
            </motion.span>
          </motion.span>
        </motion.button>
      </motion.div>
    </motion.section>
  );
}
